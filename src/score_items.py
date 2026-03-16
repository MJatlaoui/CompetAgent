"""On-demand scoring: score manually selected seen_items → pending_insights."""
import json
import argparse
import contextlib
import sqlite3
import httpx
from pathlib import Path
from bs4 import BeautifulSoup
from src.database import DB_PATH, save_pending, update_scoring_result
from src.intelligence import analyze_item
import yaml


def _load_threshold() -> int:
    try:
        config = yaml.safe_load(Path("config/strategy.yaml").read_text())
        return int(config.get("score_threshold", 7))
    except Exception:
        return 7


def _fetch_summary(url: str, max_chars: int = 2000) -> str | None:
    try:
        r = httpx.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"}, follow_redirects=True)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()
        return " ".join(soup.get_text(" ", strip=True).split())[:max_chars]
    except Exception:
        return None


def score_items(ids: list[str], force: bool = False) -> list[dict]:
    threshold = _load_threshold()
    results = []
    with contextlib.closing(sqlite3.connect(DB_PATH)) as db:
        db.row_factory = sqlite3.Row
        for item_id in ids:
            row = db.execute(
                "SELECT id, title, url, competitor, seen_at FROM seen_items WHERE id=?",
                [item_id],
            ).fetchone()
            if not row:
                results.append({"id": item_id, "error": "not found"})
                continue

            existing = db.execute(
                "SELECT id, status FROM pending_insights WHERE item_id=?", [item_id]
            ).fetchone()
            placeholder_uid = None
            if existing:
                if existing["status"] != "scoring":
                    results.append({"id": item_id, "skipped": True, "uid": existing["id"]})
                    continue
                placeholder_uid = existing["id"]

            summary = _fetch_summary(row["url"]) or row["title"]
            item = {
                "id": row["id"],
                "title": row["title"],
                "url": row["url"],
                "competitor": row["competitor"],
                "summary": summary,
                "published": row["seen_at"],
                "tier": 1,
            }
            insight, cost = analyze_item(item)
            if not insight:
                if placeholder_uid:
                    update_scoring_result(item_id, {}, cost or 0.0, status="error")
                results.append({"id": item_id, "error": "analysis failed"})
                continue

            below_threshold = not (insight.get("worth_surfacing") and insight.get("score", 0) >= threshold)
            if below_threshold and not force:
                if placeholder_uid:
                    update_scoring_result(item_id, insight, cost or 0.0, status="discarded")
                results.append({
                    "id": item_id,
                    "score": insight.get("score"),
                    "classification": insight.get("classification"),
                    "below_threshold": True,
                })
                continue

            if below_threshold and force:
                # User explicitly requested scoring — show them the result even if below threshold
                if placeholder_uid:
                    update_scoring_result(item_id, insight, cost or 0.0, status="suggested")
                    uid = placeholder_uid
                else:
                    uid = save_pending(item_id, insight, cost_usd=cost, status="suggested")
                results.append({
                    "id": item_id,
                    "uid": uid,
                    "score": insight.get("score"),
                    "classification": insight.get("classification"),
                    "saved": True,
                    "below_threshold": True,
                })
                continue

            if placeholder_uid:
                update_scoring_result(item_id, insight, cost or 0.0, status="pending")
                uid = placeholder_uid
            else:
                uid = save_pending(item_id, insight, cost_usd=cost)

            results.append({
                "id": item_id,
                "uid": uid,
                "score": insight.get("score"),
                "classification": insight.get("classification"),
                "saved": True,
            })

    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--ids", nargs="+", required=True)
    parser.add_argument("--force", action="store_true", default=False)
    args = parser.parse_args()
    print(json.dumps(score_items(args.ids, force=args.force)))
