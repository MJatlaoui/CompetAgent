import sqlite3, json
import contextlib
from pathlib import Path
from datetime import datetime, UTC

DB_PATH = Path("data/seen.db")


def init_db():
    DB_PATH.parent.mkdir(exist_ok=True)
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS seen_items (
                id TEXT PRIMARY KEY,
                title TEXT,
                url TEXT,
                competitor TEXT,
                seen_at TEXT
            );
            CREATE TABLE IF NOT EXISTS pending_insights (
                slack_ts TEXT PRIMARY KEY,
                item_id TEXT,
                insight_json TEXT,
                posted_at TEXT,
                status TEXT DEFAULT 'pending'
            );
        """)


def is_seen(item_id: str) -> bool:
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        result = conn.execute("SELECT 1 FROM seen_items WHERE id=?", (item_id,)).fetchone()
    return result is not None


def mark_seen(item_id: str, title: str, url: str, competitor: str):
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute(
            "INSERT OR IGNORE INTO seen_items VALUES (?,?,?,?,?)",
            (item_id, title, url, competitor, datetime.now(UTC).isoformat()),
        )
        conn.commit()


def save_pending(slack_ts: str, item_id: str, insight: dict):
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute(
            "INSERT OR IGNORE INTO pending_insights VALUES (?,?,?,?,?)",
            (slack_ts, item_id, json.dumps(insight), datetime.now(UTC).isoformat(), "pending"),
        )
        conn.commit()


def get_pending() -> list[tuple]:
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        rows = conn.execute(
            "SELECT slack_ts, item_id, insight_json FROM pending_insights WHERE status='pending'"
        ).fetchall()
    return [(ts, iid, json.loads(ij)) for ts, iid, ij in rows]


def update_status(slack_ts: str, status: str):
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute(
            "UPDATE pending_insights SET status=? WHERE slack_ts=?", (status, slack_ts)
        )
        conn.commit()
