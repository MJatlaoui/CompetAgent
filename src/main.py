import os
import re
import difflib
import yaml
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse, urlunparse
from src.database import (
    init_db, is_seen, mark_seen, save_pending,
    get_recent_titles, get_recent_url_norms,
    get_last_fetched, mark_source_fetched, get_setting,
)
from src.sources import load_sources
from src.intelligence import quick_filter, analyze_batch, BATCH_SIZE
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


def run():
    init_db()

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

    threshold = strategy_cfg.get("score_threshold", 7)

    all_sources = sources_cfg["competitors"]
    due_sources = [s for s in all_sources if not s.get("disabled", False) and _is_source_due(s)]
    skipped = len(all_sources) - len(due_sources)
    if skipped:
        print(f"[INFO] Skipping {skipped} source(s) not due for refresh")

    due_cfg = {**sources_cfg, "competitors": due_sources}
    items = load_sources(due_cfg)
    for src in due_sources:
        mark_source_fetched(src["name"])
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
        mark_seen(item["id"], item["title"], item["url"], item["competitor"], url_norm)

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

        # A2/A3: keyword + competitor filters
        if tier == 2:
            if not is_worth_analyzing(item):
                print(f"[SKIP-KW]    {item['title'][:70]}")
                continue
            if not has_competitor_mention(item):
                print(f"[SKIP-TIER2] {item['title'][:70]}")
                continue
        else:
            if not is_worth_analyzing(item):
                print(f"[SKIP-KW]    {item['title'][:70]}")
                continue

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


if __name__ == "__main__":
    run()
