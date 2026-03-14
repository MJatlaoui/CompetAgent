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
                tags TEXT DEFAULT '[]',
                cost_usd REAL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS api_call_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                called_at TEXT,
                stage TEXT,
                batch_size INTEGER,
                input_tokens INTEGER,
                output_tokens INTEGER,
                cache_read_tokens INTEGER,
                cost_usd REAL
            );
        """)
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS source_fetch_log (
                source_name TEXT PRIMARY KEY,
                last_fetched_at TEXT
            );
            CREATE TABLE IF NOT EXISTS settings (
                key        TEXT PRIMARY KEY,
                value      TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """)
        # Migrations
        for migration in [
            "ALTER TABLE pending_insights ADD COLUMN cost_usd REAL DEFAULT 0",
            "ALTER TABLE seen_items ADD COLUMN url_norm TEXT",
            "ALTER TABLE pending_insights ADD COLUMN sheets_synced INTEGER DEFAULT 0",
        ]:
            try:
                conn.execute(migration)
                conn.commit()
            except Exception:
                pass  # column already exists


def is_seen(item_id: str) -> bool:
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        result = conn.execute("SELECT 1 FROM seen_items WHERE id=?", (item_id,)).fetchone()
    return result is not None


def mark_seen(item_id: str, title: str, url: str, competitor: str, url_norm: str = ""):
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute(
            "INSERT OR IGNORE INTO seen_items (id, title, url, competitor, seen_at, url_norm) VALUES (?,?,?,?,?,?)",
            (item_id, title, url, competitor, datetime.now(UTC).isoformat(), url_norm),
        )
        conn.commit()


def is_url_norm_seen(url_norm: str) -> bool:
    """Return True if a normalized URL was already seen (catches cross-source reposts)."""
    if not url_norm:
        return False
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        result = conn.execute(
            "SELECT 1 FROM seen_items WHERE url_norm=? LIMIT 1", (url_norm,)
        ).fetchone()
    return result is not None


def get_recent_url_norms(days: int = 30) -> set[str]:
    """Return normalized URLs seen in the last N days."""
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        rows = conn.execute(
            "SELECT url_norm FROM seen_items WHERE url_norm IS NOT NULL AND url_norm != '' AND seen_at >= datetime('now', ?)",
            (f"-{days} days",),
        ).fetchall()
    return {r[0] for r in rows}


def save_pending(item_id: str, insight: dict, cost_usd: float = 0.0) -> str:
    """Save a scored insight. Returns the generated UUID."""
    uid = str(uuid4())
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute(
            "INSERT INTO pending_insights (id, item_id, insight_json, posted_at, status, tags, cost_usd, sheets_synced) VALUES (?,?,?,?,?,?,?,?)",
            (uid, item_id, json.dumps(insight), datetime.now(UTC).isoformat(), "pending", "[]", cost_usd, 0),
        )
        conn.commit()
    return uid


def log_api_call(stage: str, batch_size: int, input_tokens: int,
                 output_tokens: int, cache_read_tokens: int, cost_usd: float):
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute(
            "INSERT INTO api_call_log (called_at, stage, batch_size, input_tokens, output_tokens, cache_read_tokens, cost_usd) VALUES (?,?,?,?,?,?,?)",
            (datetime.now(UTC).isoformat(), stage, batch_size, input_tokens, output_tokens, cache_read_tokens, cost_usd),
        )
        conn.commit()


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


def get_recent_titles(days: int = 7) -> list[str]:
    """Return titles from seen_items in the last N days."""
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        rows = conn.execute(
            "SELECT title FROM seen_items WHERE seen_at >= datetime('now', ?)",
            (f"-{days} days",),
        ).fetchall()
    return [r[0] for r in rows if r[0]]


def get_last_fetched(source_name: str) -> str | None:
    """Return ISO timestamp of the last successful fetch for a source, or None."""
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        row = conn.execute(
            "SELECT last_fetched_at FROM source_fetch_log WHERE source_name=?",
            (source_name,),
        ).fetchone()
    return row[0] if row else None


def mark_source_fetched(source_name: str):
    """Record that a source was just fetched."""
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO source_fetch_log (source_name, last_fetched_at) VALUES (?,?)",
            (source_name, datetime.now(UTC).isoformat()),
        )
        conn.commit()


def get_setting(key: str) -> str | None:
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return row[0] if row else None


def set_setting(key: str, value: str):
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?,?,?)",
            (key, value, datetime.now(UTC).isoformat()),
        )
        conn.commit()


def get_all_source_fetch_log() -> dict[str, str]:
    """Return {source_name: last_fetched_at} for all sources."""
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        rows = conn.execute("SELECT source_name, last_fetched_at FROM source_fetch_log").fetchall()
    return {r[0]: r[1] for r in rows}


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
