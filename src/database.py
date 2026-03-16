import os
import sqlite3, json
import contextlib
from pathlib import Path
from datetime import datetime, timedelta, UTC
from uuid import uuid4

DB_PATH = Path(os.environ.get("DB_PATH", "data/seen.db"))


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
            "ALTER TABLE pending_insights ADD COLUMN auto_scored INTEGER DEFAULT 0",
            "ALTER TABLE seen_items ADD COLUMN url_norm TEXT",
            "ALTER TABLE pending_insights ADD COLUMN sheets_synced INTEGER DEFAULT 0",
            "ALTER TABLE pending_insights ADD COLUMN notes TEXT DEFAULT ''",
            "ALTER TABLE pending_insights ADD COLUMN updated_at TEXT",
            "ALTER TABLE pending_insights ADD COLUMN updated_by TEXT",
            "ALTER TABLE seen_items ADD COLUMN published_at TEXT",
            "ALTER TABLE source_fetch_log ADD COLUMN last_error TEXT",
            "ALTER TABLE source_fetch_log ADD COLUMN last_error_at TEXT",
            "ALTER TABLE source_fetch_log ADD COLUMN consecutive_failures INTEGER DEFAULT 0",
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


def mark_seen(item_id: str, title: str, url: str, competitor: str, url_norm: str = "", published_at: str = ""):
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute(
            "INSERT OR IGNORE INTO seen_items (id, title, url, competitor, seen_at, url_norm, published_at) VALUES (?,?,?,?,?,?,?)",
            (item_id, title, url, competitor, datetime.now(UTC).isoformat(), url_norm, published_at or None),
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


def save_pending(item_id: str, insight: dict, cost_usd: float = 0.0,
                 status: str = "pending", auto_scored: bool = False) -> str:
    """Save a scored insight. Returns the generated UUID."""
    uid = str(uuid4())
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute(
            "INSERT INTO pending_insights (id, item_id, insight_json, posted_at, status, tags, cost_usd, sheets_synced, auto_scored) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (uid, item_id, json.dumps(insight), datetime.now(UTC).isoformat(), status, "[]", cost_usd, 0, int(auto_scored)),
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


def get_unscored_recent_items(days: int = 7, limit: int = 50) -> list[dict]:
    """Return seen_items from the last N days not yet in pending_insights."""
    cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat()
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("""
            SELECT id, title, url, competitor, seen_at,
                   COALESCE(published_at, seen_at) as effective_date
            FROM seen_items
            WHERE COALESCE(published_at, seen_at) >= ?
              AND id NOT IN (SELECT item_id FROM pending_insights)
            ORDER BY COALESCE(published_at, seen_at) DESC
            LIMIT ?
        """, (cutoff, limit)).fetchall()
    return [dict(r) for r in rows]


def get_last_fetched(source_name: str) -> str | None:
    """Return ISO timestamp of the last successful fetch for a source, or None."""
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        row = conn.execute(
            "SELECT last_fetched_at FROM source_fetch_log WHERE source_name=?",
            (source_name,),
        ).fetchone()
    return row[0] if row else None


def mark_source_fetched(source_name: str):
    """Record a successful fetch and clear any prior error state."""
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO source_fetch_log "
            "(source_name, last_fetched_at, last_error, last_error_at, consecutive_failures) "
            "VALUES (?,?,NULL,NULL,0)",
            (source_name, datetime.now(UTC).isoformat()),
        )
        conn.commit()


def mark_source_error(source_name: str, error_msg: str):
    """Record a fetch failure and increment the consecutive failure counter."""
    now = datetime.now(UTC).isoformat()
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute(
            "INSERT OR IGNORE INTO source_fetch_log (source_name, last_fetched_at, consecutive_failures) VALUES (?,NULL,0)",
            (source_name,),
        )
        conn.execute(
            "UPDATE source_fetch_log SET last_error=?, last_error_at=?, consecutive_failures=consecutive_failures+1 WHERE source_name=?",
            (error_msg, now, source_name),
        )
        conn.commit()


def backfill_published_at_from_urls():
    import re
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        rows = conn.execute(
            "SELECT id, url FROM seen_items WHERE published_at IS NULL AND url IS NOT NULL"
        ).fetchall()
        updates = []
        for row_id, url in rows:
            m = re.search(r'(\d{4}-\d{2}-\d{2})', url)
            if m:
                updates.append((f"{m.group(1)}T00:00:00+00:00", row_id))
        if updates:
            conn.executemany("UPDATE seen_items SET published_at=? WHERE id=?", updates)
            conn.commit()


def get_setting(key: str, default: str | None = None) -> str | None:
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return row[0] if row else default


def set_setting(key: str, value: str):
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?,?,?)",
            (key, value, datetime.now(UTC).isoformat()),
        )
        conn.commit()


def create_scoring_placeholders(item_ids: list[str]) -> dict:
    """Insert 'scoring' placeholder rows for items not yet in pending_insights.
    Returns {"created": [...item_ids], "skipped": [...item_ids]}."""
    created = []
    skipped = []
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        for item_id in item_ids:
            existing = conn.execute(
                "SELECT id, status FROM pending_insights WHERE item_id=?", [item_id]
            ).fetchone()
            if existing:
                if existing["status"] != "scoring":
                    skipped.append(item_id)
                else:
                    created.append(item_id)  # already has placeholder, Python will pick it up
                continue

            row = conn.execute(
                "SELECT title, competitor FROM seen_items WHERE id=?", [item_id]
            ).fetchone()
            if not row:
                skipped.append(item_id)
                continue

            uid = str(uuid4())
            insight = json.dumps({
                "headline": row["title"] or "",
                "competitor": row["competitor"] or "",
                "score": 0,
                "classification": "PENDING",
                "worth_surfacing": False,
                "product_facts": [],
                "strategic_priorities_hit": [],
                "competitive_gap": "",
                "sales_angle": "",
                "source_url": "",
            })
            conn.execute(
                "INSERT OR IGNORE INTO pending_insights (id, item_id, insight_json, posted_at, status, tags, cost_usd) "
                "VALUES (?,?,?,?,?,?,?)",
                (uid, item_id, insight, datetime.now(UTC).isoformat(), "scoring", "[]", 0),
            )
            conn.commit()
            created.append(item_id)
    return {"created": created, "skipped": skipped}


def update_scoring_result(item_id: str, insight: dict, cost: float, status: str = "pending") -> None:
    """UPDATE a 'scoring' placeholder with the final insight data."""
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute(
            "UPDATE pending_insights SET insight_json=?, cost_usd=?, status=?, posted_at=? "
            "WHERE item_id=? AND status='scoring'",
            (json.dumps(insight), cost, status, datetime.now(UTC).isoformat(), item_id),
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
