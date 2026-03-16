#!/usr/bin/env python3
"""
Import sources from a CSV file into config/sources.yaml and config/industry_sources.yaml.

Usage:
    python scripts/import_sources.py path/to/sources.csv

CSV columns: type, name, feed_type, feed_url, category, tier, refresh_hours

Deduplication rules:
  - Competitor: if feed URL already exists for a competitor, skip.
                If competitor exists but URL is new, add the feed.
                If competitor is new, add it.
                Existing feeds with richer selectors/options are never overwritten.
  - Industry:   if source name already exists, skip entirely.
                Otherwise add with category/tier/refresh_hours.
"""

import sys
import csv
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).parent.parent
COMPETITOR_FILE = REPO_ROOT / "config" / "sources.yaml"
INDUSTRY_FILE = REPO_ROOT / "config" / "industry_sources.yaml"


def load_yaml(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def write_yaml(path: Path, data: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)


def import_csv(csv_path: str) -> None:
    competitors_data = load_yaml(COMPETITOR_FILE)
    industry_data = load_yaml(INDUSTRY_FILE)

    competitors: list[dict] = competitors_data.get("competitors", [])
    industry_sources: list[dict] = industry_data.get("industry_sources", [])

    comp_added = 0
    comp_feeds_added = 0
    ind_added = 0

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            row_type = row.get("type", "").strip().lower()
            name = row.get("name", "").strip()
            feed_type = row.get("feed_type", "rss").strip() or "rss"
            feed_url = row.get("feed_url", "").strip()
            category = row.get("category", "").strip()
            tier_raw = row.get("tier", "").strip()
            refresh_raw = row.get("refresh_hours", "").strip()

            if not name or not feed_url:
                continue

            if row_type == "competitor":
                existing = next(
                    (c for c in competitors if c["name"].lower() == name.lower()),
                    None,
                )
                if existing is None:
                    competitors.append({"name": name, "feeds": [{"type": feed_type, "url": feed_url}]})
                    comp_added += 1
                    print(f"  [+] Competitor added: {name}")
                else:
                    if not any(f["url"] == feed_url for f in existing.get("feeds", [])):
                        existing.setdefault("feeds", []).append({"type": feed_type, "url": feed_url})
                        comp_feeds_added += 1
                        print(f"  [+] Feed added to {name}: {feed_url}")
                    # else: already present, skip

            elif row_type == "industry":
                if any(s["name"] == name for s in industry_sources):
                    continue  # already exists, skip

                entry: dict = {
                    "name": name,
                    "category": category or "Uncategorized",
                    "tier": int(tier_raw) if tier_raw.isdigit() else 2,
                    "feeds": [{"type": feed_type, "url": feed_url}],
                }
                if refresh_raw:
                    try:
                        entry["refresh_hours"] = float(refresh_raw)
                    except ValueError:
                        pass
                industry_sources.append(entry)
                ind_added += 1
                print(f"  [+] Industry source added: {name}")

    if comp_added or comp_feeds_added:
        competitors_data["competitors"] = competitors
        write_yaml(COMPETITOR_FILE, competitors_data)

    if ind_added:
        industry_data["industry_sources"] = industry_sources
        write_yaml(INDUSTRY_FILE, industry_data)

    print(
        f"\nDone. Competitors added: {comp_added}, "
        f"feeds added to existing competitors: {comp_feeds_added}, "
        f"industry sources added: {ind_added}."
    )


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: python {sys.argv[0]} path/to/sources.csv")
        sys.exit(1)
    import_csv(sys.argv[1])
