#!/usr/bin/env python3
"""
Validate pending sources from a JSON file.

Usage:
    python tools/validate_sources.py config/pending_sources.json
    python tools/validate_sources.py config/pending_sources.json --write-yaml
"""
import sys
import json
import argparse
import feedparser
import httpx
import yaml
from pathlib import Path
from datetime import datetime, UTC

TIMEOUT = 15
INDUSTRY_YAML_PATH = Path("config/industry_sources.yaml")
NO_RSS_PHRASES = ("No native RSS", "No official RSS", "No native RSS;")


def validate_source(source: dict) -> dict:
    """Returns {"status": "PASS"|"FAIL"|"SKIP", "reason": str}."""
    url = source.get("url")
    notes = source.get("notes", "")

    if not url or any(phrase in notes for phrase in NO_RSS_PHRASES):
        return {"status": "SKIP", "reason": "No RSS feed available"}

    try:
        resp = httpx.get(
            url, timeout=TIMEOUT, follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; IntelBot/1.0)"},
        )
        resp.raise_for_status()
    except Exception as e:
        return {"status": "FAIL", "reason": str(e)}

    feed = feedparser.parse(resp.text)
    if len(feed.entries) == 0:
        return {"status": "FAIL", "reason": "Feed parsed but has 0 entries"}

    return {"status": "PASS", "reason": f"{len(feed.entries)} entries found"}


def _write_industry_sources(results: list[dict]) -> None:
    """Append passing sources to INDUSTRY_YAML_PATH (idempotent — no duplicates)."""
    existing: dict[str, dict] = {}
    if INDUSTRY_YAML_PATH.exists():
        data = yaml.safe_load(INDUSTRY_YAML_PATH.read_text()) or {}
        existing = {s["name"]: s for s in data.get("industry_sources", [])}

    added = 0
    for result in results:
        if result["status"] == "PASS" and result["name"] not in existing:
            existing[result["name"]] = {
                "name": result["name"],
                "category": result.get("category", ""),
                "feeds": [{"type": result.get("type", "rss"), "url": result["url"]}],
            }
            added += 1

    INDUSTRY_YAML_PATH.write_text(
        yaml.dump({"industry_sources": list(existing.values())},
                  default_flow_style=False, allow_unicode=True)
    )
    print(f"Written {len(existing)} sources to {INDUSTRY_YAML_PATH} ({added} new)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate RSS sources from a JSON file")
    parser.add_argument("json_file", help="Path to pending_sources.json")
    parser.add_argument("--write-yaml", action="store_true",
                        help="Write passing sources to config/industry_sources.yaml")
    args = parser.parse_args()

    sources = json.loads(Path(args.json_file).read_text())
    results = []

    for source in sources:
        result = validate_source(source)
        results.append({**source, **result})
        status = result["status"]
        reason = result["reason"]
        print(f"[{status:4}] {source['name'][:45]:<45} {reason}")

    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = sum(1 for r in results if r["status"] == "FAIL")
    skipped = sum(1 for r in results if r["status"] == "SKIP")

    report = {
        "generated_at": datetime.now(UTC).isoformat(),
        "total": len(results),
        "pass": passed,
        "fail": failed,
        "skip": skipped,
        "results": results,
    }
    report_path = Path("config/validation_report.json")
    report_path.write_text(json.dumps(report, indent=2))

    print(f"\nPASS: {passed}  FAIL: {failed}  SKIP: {skipped}")
    print(f"Report saved to {report_path}")

    if args.write_yaml:
        _write_industry_sources(results)


if __name__ == "__main__":
    main()
