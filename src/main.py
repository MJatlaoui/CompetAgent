import os
import yaml
from pathlib import Path
from src.database import init_db, is_seen, mark_seen, save_pending
from src.sources import load_sources
from src.intelligence import analyze_item

INDUSTRY_SOURCES_PATH = "config/industry_sources.yaml"
SLACK_ENABLED = os.environ.get("SLACK_ENABLED", "").lower() == "true"


def run():
    init_db()

    with open("config/sources.yaml") as f:
        sources_cfg = yaml.safe_load(f)
    with open("config/strategy.yaml") as f:
        strategy_cfg = yaml.safe_load(f)

    # Merge validated industry sources if the file exists
    industry_path = Path(INDUSTRY_SOURCES_PATH)
    if industry_path.exists():
        industry_data = yaml.safe_load(industry_path.read_text()) or {}
        for src in industry_data.get("industry_sources", []):
            sources_cfg["competitors"].append({
                "name": src["name"],
                "feeds": src["feeds"],
            })

    threshold = strategy_cfg.get("score_threshold", 7)
    items = load_sources(sources_cfg)
    print(f"[INFO] Fetched {len(items)} raw items across all sources")

    new_items = [i for i in items if not is_seen(i["id"])]
    print(f"[INFO] {len(new_items)} new (unseen) items to analyze")

    for item in new_items:
        mark_seen(item["id"], item["title"], item["url"], item["competitor"])

        insight = analyze_item(item)
        if not insight:
            continue

        score = insight.get("score", 0)
        worth_it = insight.get("worth_surfacing", False)

        print(f"[{item['competitor']}] Score {score} | {insight.get('classification')} | {item['title'][:60]}")

        if worth_it and score >= threshold:
            uid = save_pending(item["id"], insight)
            print(f"  -> Saved insight (id={uid})")

            if SLACK_ENABLED:
                from src.delivery import post_insight
                post_insight(insight)


if __name__ == "__main__":
    run()
