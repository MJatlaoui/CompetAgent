import sqlite3, json
import contextlib
from pathlib import Path
from datetime import datetime, UTC
from uuid import uuid4

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
                id TEXT PRIMARY KEY,
                item_id TEXT,
                insight_json TEXT,
                posted_at TEXT,
                status TEXT DEFAULT 'pending',
                tags TEXT DEFAULT '[]'
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


def save_pending(item_id: str, insight: dict) -> str:
    """Save a scored insight. Returns the generated UUID."""
    uid = str(uuid4())
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute(
            "INSERT INTO pending_insights VALUES (?,?,?,?,?,?)",
            (uid, item_id, json.dumps(insight), datetime.now(UTC).isoformat(), "pending", "[]"),
        )
        conn.commit()
    return uid


def get_pending() -> list[tuple]:
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        rows = conn.execute(
            "SELECT id, item_id, insight_json FROM pending_insights WHERE status='pending'"
        ).fetchall()
    return [(uid, iid, json.loads(ij)) for uid, iid, ij in rows]


def update_status(uid: str, status: str):
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute(
            "UPDATE pending_insights SET status=? WHERE id=?", (status, uid)
        )
        conn.commit()


def get_all_insights() -> list[tuple]:
    """Return all insights (all statuses) for the history view."""
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        rows = conn.execute(
            "SELECT id, item_id, insight_json, posted_at, status, tags FROM pending_insights ORDER BY posted_at DESC"
        ).fetchall()
    return [(uid, iid, json.loads(ij), posted_at, status, json.loads(tags))
            for uid, iid, ij, posted_at, status, tags in rows]


def get_trends() -> list[dict]:
    """Return daily counts grouped by competitor for the dashboard."""
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        rows = conn.execute("""
            SELECT date(posted_at) as day,
                   json_extract(insight_json, '$.competitor') as competitor,
                   json_extract(insight_json, '$.classification') as classification,
                   COUNT(*) as count
            FROM pending_insights
            GROUP BY day, competitor, classification
            ORDER BY day
        """).fetchall()
    return [{"date": r[0], "competitor": r[1], "classification": r[2], "count": r[3]} for r in rows]
