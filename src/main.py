import os
import re
import sys
import difflib
import yaml

# Load .env for local development (no-op if key already set or file absent)
def _load_dotenv():
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if os.path.exists(env_path):
        with open(env_path) as _f:
            for _line in _f:
                _line = _line.strip()
                if _line and not _line.startswith("#") and "=" in _line:
                    _k, _, _v = _line.partition("=")
                    os.environ.setdefault(_k.strip(), _v.strip())

_load_dotenv()

# Ensure stdout can handle any Unicode character on Windows terminals
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse, urlunparse
from src.database import (
    init_db, backfill_published_at_from_urls, is_seen, mark_seen, save_pending,
    get_recent_titles, get_recent_url_norms,
    get_last_fetched, mark_source_fetched, mark_source_error, get_setting, set_setting,
    get_unscored_recent_items, log_api_call,
)
from src.sources import load_sources
from src.intelligence import quick_filter, analyze_batch, BATCH_SIZE, _call_log
from src.filter import is_worth_analyzing, has_competitor_mention

INDUSTRY_SOURCES_PATH = "config/industry_sources.yaml"
SLACK_ENABLED = os.environ.get("SLACK_ENABLED", "").lower() == "true"

# Words that carry no discriminating meaning in news headlines
_NOISE_WORDS = {
    "announces", "announce", "announced", "announcement",
    "launches", "launch", "launched", "unveils", "unveil", "unveiled",
    "introduces", "introduce", "introduced", "reveals", "reveal", "revealed",
    "releases", "release", "released", "debuts", "debut", "debuted",
    "updates", "update", "updated", "upgrades", "upgrade", "upgraded",
    "new", "latest", "now", "just", "major", "next", "gen",
    "the", "and", "for", "with", "its", "their", "how", "why",
    "what", "when", "will", "can", "that", "this", "from",
}


def _normalize_title(t: str) -> str:
    """Strip punctuation, noise verbs, and short words before similarity comparison."""
    t = re.sub(r"[^a-z0-9 ]", "", t.lower()).strip()
    words = [w for w in t.split() if w not in _NOISE_WORDS and len(w) > 2]
    return " ".join(words)


def _normalize_url(url: str) -> str:
    """Strip query params, fragments, www, and trailing slash for cross-source URL dedup."""
    try:
        p = urlparse(url)
        netloc = p.netloc.lower().removeprefix("www.")
        path = p.path.rstrip("/")
        return urlunparse((p.scheme, netloc, path, "", "", ""))
    except Exception:
        return url


def _is_source_due(source: dict) -> bool:
    """Return True if the source hasn't been fetched within its refresh_hours window."""
    from datetime import datetime, UTC
    refresh_hours = source.get("refresh_hours", 2)
    last = get_last_fetched(source["name"])
    if last is None:
        return True
    age = datetime.now(UTC) - datetime.fromisoformat(last)
    return age >= timedelta(hours=refresh_hours)


def _is_duplicate_title(title: str, recent_set: set) -> bool:
    norm = _normalize_title(title)
    if not norm:
        return False
    return any(
        difflib.SequenceMatcher(None, norm, r).ratio() > 0.72 for r in recent_set
    )


def run(limit: int | None = None, dry_run: bool = False, fresh: bool = False):
    if fresh:
        import src.database as _db
        _db.DB_PATH = Path("data/dry_run.db")
    init_db()
    backfill_published_at_from_urls()

    if get_setting("ingestion_paused") == "true":
        print("[INFO] Ingestion is paused. Skipping run.")
        return


    with open("config/sources.yaml") as f:
        sources_cfg = yaml.safe_load(f)
    with open("config/strategy.yaml") as f:
        strategy_cfg = yaml.safe_load(f)

    industry_path = Path(INDUSTRY_SOURCES_PATH)
    if industry_path.exists():
        industry_data = yaml.safe_load(industry_path.read_text()) or {}
        for src in industry_data.get("industry_sources", []):
            sources_cfg["competitors"].append({
                "name": src["name"],
                "feeds": src["feeds"],
                "tier": src.get("tier", 2),
                "refresh_hours": src.get("refresh_hours", 2),
                "disabled": src.get("disabled", False),
            })

    db_threshold = get_setting("score_threshold")
    if db_threshold:
        threshold = int(db_threshold)
    else:
        threshold = strategy_cfg.get("score_threshold", 7)
        set_setting("score_threshold", str(threshold))

    all_sources = sources_cfg["competitors"]
    due_sources = [s for s in all_sources if not s.get("disabled", False) and _is_source_due(s)]
    if limit is not None:
        due_sources = due_sources[:limit]
    skipped = len(all_sources) - len(due_sources)
    if skipped:
        print(f"[INFO] Skipping {skipped} source(s) not due for refresh")

    due_cfg = {**sources_cfg, "competitors": due_sources}
    items, fetch_errors = load_sources(due_cfg)
    for src in due_sources:
        if src["name"] in fetch_errors:
            mark_source_error(src["name"], fetch_errors[src["name"]])
        else:
            mark_source_fetched(src["name"])
    if fetch_errors:
        print(f"[WARN] {len(fetch_errors)} source(s) failed to fetch: {', '.join(fetch_errors)}")
    print(f"[INFO] Fetched {len(items)} raw items from {len(due_sources)} source(s)")

    new_items = [i for i in items if not is_seen(i["id"])]
    print(f"[INFO] {len(new_items)} new (unseen) items to analyze")

    recent_titles = {_normalize_title(t) for t in get_recent_titles(days=14)}
    recent_url_norms = get_recent_url_norms(days=30)

    # ── Pre-filter pass ────────────────────────────────────────────────────────
    to_analyze: list[dict] = []
    filter_cost = 0.0

    for item in new_items:
        url_norm = _normalize_url(item["url"])
        mark_seen(item["id"], item["title"], item["url"], item["competitor"], url_norm, item.get("published", ""))

        # URL-based dedup: same article reposted by multiple sources
        if url_norm in recent_url_norms:
            print(f"[SKIP-URL]   {item['title'][:70]}")
            continue
        recent_url_norms.add(url_norm)

        if _is_duplicate_title(item["title"], recent_titles):
            print(f"[SKIP-DUP]   {item['title'][:70]}")
            recent_titles.add(_normalize_title(item["title"]))
            continue
        recent_titles.add(_normalize_title(item["title"]))

        tier = item.get("tier", 1)

        # Tier-2 only: keyword + competitor mention filters (cost control for broad industry feeds)
        if tier == 2:
            if not is_worth_analyzing(item):
                print(f"[SKIP-KW]    {item['title'][:70]}")
                continue
            if not has_competitor_mention(item):
                print(f"[SKIP-TIER2] {item['title'][:70]}")
                continue
        # Tier-1 competitor sources: bypass keyword filter — Claude decides relevance

        # Stage-1: AI title filter for tier-2 (adds smart relevance on top of keywords)
        if tier == 2:
            relevant, cost = quick_filter(item)
            filter_cost += cost
            if not relevant:
                print(f"[SKIP-AI]    {item['title'][:70]}  (cost=${cost:.5f})")
                continue
            print(f"[PASS-AI]    {item['title'][:70]}  (cost=${cost:.5f})")

        to_analyze.append(item)

    print(f"\n[INFO] {len(to_analyze)} items queued for full analysis  "
          f"(stage-1 filter cost: ${filter_cost:.4f})")

    # ── Batched analysis pass ──────────────────────────────────────────────────
    saved = 0
    analysis_cost = 0.0

    for batch_start in range(0, len(to_analyze), BATCH_SIZE):
        batch = to_analyze[batch_start: batch_start + BATCH_SIZE]
        print(f"\n[BATCH] Analyzing {len(batch)} items "
              f"(#{batch_start + 1}–{batch_start + len(batch)})…")

        results = analyze_batch(batch)

        for item, (insight, cost) in zip(batch, results):
            analysis_cost += cost
            if not insight:
                print(f"  [ERR]  {item['title'][:60]}")
                continue

            score = insight.get("score", 0)
            worth = insight.get("worth_surfacing", False)
            print(f"  [{item['competitor']}] score={score} {insight.get('classification')} "
                  f"cost=${cost:.5f} | {item['title'][:55]}")

            if worth and score >= threshold:
                if dry_run:
                    print(f"    -> [DRY-RUN] Would save (score={score})")
                else:
                    uid = save_pending(item["id"], insight, cost_usd=cost)
                    print(f"    -> Saved (id={uid})")
                    saved += 1

                    if SLACK_ENABLED:
                        from src.delivery import post_insight
                        post_insight(insight)

    total_cost = filter_cost + analysis_cost
    print(f"\n[DONE] Saved {saved} insights | "
          f"Total API cost: ${total_cost:.4f} "
          f"(filter=${filter_cost:.4f}, analysis=${analysis_cost:.4f})")

    run_auto_scoring(dry_run=dry_run)

    # Flush API call log to DB and print cache efficiency summary
    logged = list(_call_log)
    _call_log.clear()
    for entry in logged:
        log_api_call(
            stage=entry["stage"],
            batch_size=entry["batch_size"],
            input_tokens=entry["input_tokens"],
            output_tokens=entry["output_tokens"],
            cache_read_tokens=entry["cache_read_tokens"],
            cost_usd=entry["cost_usd"],
        )
    total_in = sum(e["input_tokens"] for e in logged)
    total_cr = sum(e["cache_read_tokens"] for e in logged)
    total_cw = sum(e.get("cache_creation_tokens", 0) for e in logged)
    if total_in + total_cr + total_cw > 0:
        hit_pct = 100 * total_cr / (total_in + total_cr + total_cw)
        print(f"[CACHE] read={total_cr:,} write={total_cw:,} uncached={total_in:,} "
              f"({hit_pct:.0f}% cache-hit rate)")


def _chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


def run_auto_scoring(dry_run: bool = False):
    """Second-pass scoring: score recent unseen feed items with Claude and auto-suggest/discard."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("[AUTO-SCORE] No ANTHROPIC_API_KEY — skipping.")
        return

    if get_setting("auto_scoring_enabled", default="true") == "false":
        print("[AUTO-SCORE] Disabled via settings — skipping.")
        return

    inbox_threshold = int(get_setting("auto_inbox_threshold", default="9"))
    discard_threshold = int(get_setting("auto_discard_threshold", default="4"))

    items = get_unscored_recent_items(days=7, limit=50)
    if not items:
        print("[AUTO-SCORE] No unscored items in last 7 days.")
        return

    print(f"[AUTO-SCORE] Scoring {len(items)} items "
          f"(inbox≥{inbox_threshold}, discard≤{discard_threshold})")

    suggested = discarded = skipped = 0
    for batch in _chunks(items, BATCH_SIZE):
        # Build item dicts compatible with analyze_batch
        batch_items = [
            {
                "id": r["id"],
                "title": r["title"] or "",
                "url": r["url"] or "",
                "competitor": r["competitor"] or "",
                "content": "",
            }
            for r in batch
        ]
        results = analyze_batch(batch_items)
        for item, (insight, cost) in zip(batch, results):
            if insight is None:
                skipped += 1
                continue
            score = insight.get("score", 0)
            if score >= inbox_threshold:
                if not dry_run:
                    save_pending(item["id"], insight, cost_usd=cost,
                                 status="suggested", auto_scored=True)
                suggested += 1
                print(f"  [SUGGEST] score={score} | {item['title'][:60]}")
            else:
                if not dry_run:
                    save_pending(item["id"], insight, cost_usd=cost,
                                 status="discarded", auto_scored=True)
                discarded += 1

    print(f"[AUTO-SCORE] Done — {suggested} suggested, {discarded} auto-discarded, {skipped} errors")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None,
                        help="Max number of sources to process")
    parser.add_argument("--dry-run", action="store_true",
                        help="Score articles but do not save to DB or post to Slack")
    parser.add_argument("--fresh", action="store_true",
                        help="Use a throwaway DB (data/dry_run.db) — treats all items as new")
    args = parser.parse_args()
    run(limit=args.limit, dry_run=args.dry_run, fresh=args.fresh)
