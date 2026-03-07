"""
Test ingest: run the full pipeline against 1-2 RSS feeds.
Skips is_seen() so already-seen items are re-analyzed.

Usage: python tools/test_ingest.py
"""
import os, sys
from pathlib import Path

for line in (Path(__file__).parent.parent / ".env").read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

sys.path.insert(0, ".")
from src.database import init_db, save_pending, get_recent_titles
from src.sources.rss import RSSAdapter
from src.intelligence import analyze_batch, BATCH_SIZE
from src.filter import is_worth_analyzing
import yaml, re, difflib

TEST_FEEDS = [
    {"name": "CX Today",  "url": "https://www.cxtoday.com/feed/",      "tier": 1},
    {"name": "No Jitter",  "url": "https://www.nojitter.com/rss.xml",   "tier": 2},
]
THRESHOLD = 3   # lowered for test

def _norm(t): return re.sub(r"[^a-z0-9 ]", "", t.lower()).strip()
def _dup(title, recent):
    n = _norm(title)
    return any(difflib.SequenceMatcher(None, n, r).ratio() > 0.85 for r in recent)

def main():
    init_db()
    adapter = RSSAdapter()
    with open("config/strategy.yaml") as f:
        strategy = yaml.safe_load(f)
    threshold = strategy.get("score_threshold", THRESHOLD)

    recent = {_norm(t) for t in get_recent_titles(days=7)}
    saved = 0

    for feed in TEST_FEEDS:
        items = adapter.fetch(feed["url"], feed["name"])
        print(f"\n[FEED] {feed['name']} — {len(items)} items fetched")

        batch = []
        for item in items:
            item["tier"] = feed["tier"]
            batch.append(item)

        # Analyze in batches
        for i in range(0, len(batch), BATCH_SIZE):
            chunk = batch[i:i + BATCH_SIZE]
            print(f"  [BATCH]  {len(chunk)} items…")
            results = analyze_batch(chunk)
            for item, (result, cost) in zip(chunk, results):
                if not result:
                    print(f"    [ERR]  {item['title'][:60]}")
                    continue
                score = result.get("score", 0)
                worth = result.get("worth_surfacing", False)
                print(f"    score={score} cost=${cost:.5f} {result.get('classification')} | {item['title'][:50]}")
                if score >= threshold:
                    uid = save_pending(item["id"], result, cost_usd=cost)
                    print(f"      -> SAVED (id={uid})")
                    saved += 1

    print(f"\n[DONE] Saved {saved} new insights. Open http://localhost:3000/review to see them.")

if __name__ == "__main__":
    main()
