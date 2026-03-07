"""
One-shot test: fetch Genesys Cloud release notes and run through analysis.

Usage:
  ANTHROPIC_API_KEY=sk-... python tools/test_genesys.py

Or set the key in a .env file at the project root:
  echo "ANTHROPIC_API_KEY=sk-..." > .env
  python tools/test_genesys.py
"""
import json
import os
import sys
from pathlib import Path

# Load .env from project root if present
env_file = Path(__file__).parent.parent / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

if not os.environ.get("ANTHROPIC_API_KEY"):
    print("ERROR: ANTHROPIC_API_KEY is not set.")
    print("  Run: ANTHROPIC_API_KEY=sk-... python tools/test_genesys.py")
    print("  Or:  echo 'ANTHROPIC_API_KEY=sk-...' > .env  and retry")
    sys.exit(1)

import feedparser
sys.path.insert(0, ".")
from src.intelligence import analyze_item

# Working Genesys Cloud feeds (in priority order)
FEEDS = [
    ("Genesys Cloud Resource Center", "https://help.mypurecloud.com/feed/"),
    ("Genesys Blog", "https://www.genesys.com/blog/feed"),
]

# Keywords to prefer release-note-like entries
PREFERRED_KEYWORDS = ["release", "update", "new feature", "launch", "agent", "ai", "cloud"]


def fetch_best_item() -> dict | None:
    from datetime import datetime, UTC
    for label, url in FEEDS:
        print(f"[FETCH] {label} — {url}")
        feed = feedparser.parse(url)
        if not feed.entries:
            print(f"  -> No entries")
            continue

        entries = feed.entries
        print(f"  -> {len(entries)} entries found")

        # Prefer entries that look like release notes / product updates
        scored = []
        for e in entries[:20]:
            title = e.get("title", "").lower()
            summary = e.get("summary", e.get("description", "")).lower()
            text = title + " " + summary
            score = sum(1 for kw in PREFERRED_KEYWORDS if kw in text)
            scored.append((score, e))

        scored.sort(key=lambda x: -x[0])
        best_score, best_entry = scored[0]

        print(f"  -> Best match: \"{best_entry.get('title', '')}\" (signal score: {best_score})")

        return {
            "competitor": "Genesys",
            "title": best_entry.get("title", ""),
            "url": best_entry.get("link", url),
            "summary": best_entry.get("summary", best_entry.get("description", ""))[:3000],
            "published": best_entry.get("published", datetime.now(UTC).isoformat()),
            "tier": 1,
        }

    return None


def main():
    item = fetch_best_item()
    if not item or not item["title"]:
        print("\n[ERROR] Could not fetch any Genesys content.")
        sys.exit(1)

    print(f"\n--- Item to analyze ---")
    print(f"Title   : {item['title']}")
    print(f"URL     : {item['url']}")
    summary_preview = item["summary"][:300].replace("\n", " ").strip()
    print(f"Summary : {summary_preview}{'...' if len(item['summary']) > 300 else ''}")
    print()

    print("[...] Calling Claude Haiku...")
    result, cost = analyze_item(item)

    if not result:
        print("[ERROR] Analysis returned None — check ANTHROPIC_API_KEY and network.")
        sys.exit(1)

    print("\n--- Intelligence Result ---")
    print(json.dumps(result, indent=2))
    print(f"\nEstimated cost: ${cost:.5f}")

    score = result.get("score", 0)
    worth = result.get("worth_surfacing", False)
    threshold = 7
    print(f"\n--- Decision ---")
    print(f"Score: {score}/10  |  worth_surfacing: {worth}  |  threshold: {threshold}")
    if worth and score >= threshold:
        print("-> Would be SAVED to pending_insights")
    else:
        print("-> Would be SKIPPED (below threshold or not worth surfacing)")


if __name__ == "__main__":
    main()
