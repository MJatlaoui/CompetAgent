import sqlite3, json
from pathlib import Path
from datetime import datetime

DB_PATH = Path("data/seen.db")


def init_db():
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.executescript("""
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
    conn.commit()
    conn.close()


def is_seen(item_id: str) -> bool:
    conn = sqlite3.connect(DB_PATH)
    result = conn.execute("SELECT 1 FROM seen_items WHERE id=?", (item_id,)).fetchone()
    conn.close()
    return result is not None


def mark_seen(item_id: str, title: str, url: str, competitor: str):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("INSERT OR IGNORE INTO seen_items VALUES (?,?,?,?,?)",
                 (item_id, title, url, competitor, datetime.utcnow().isoformat()))
    conn.commit()
    conn.close()


def save_pending(slack_ts: str, item_id: str, insight: dict):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("INSERT INTO pending_insights VALUES (?,?,?,?,?)",
                 (slack_ts, item_id, json.dumps(insight),
                  datetime.utcnow().isoformat(), 'pending'))
    conn.commit()
    conn.close()


def get_pending() -> list[tuple]:
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT slack_ts, item_id, insight_json FROM pending_insights WHERE status='pending'"
    ).fetchall()
    conn.close()
    return [(ts, iid, json.loads(ij)) for ts, iid, ij in rows]


def update_status(slack_ts: str, status: str):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("UPDATE pending_insights SET status=? WHERE slack_ts=?", (status, slack_ts))
    conn.commit()
    conn.close()
