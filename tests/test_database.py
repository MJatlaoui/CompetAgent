import pytest
import json
from pathlib import Path
from unittest.mock import patch


@pytest.fixture(autouse=True)
def use_temp_db(tmp_path, monkeypatch):
    """Redirect the DB to a temp dir for each test."""
    import src.database as db_module
    temp_db = tmp_path / "test.db"
    monkeypatch.setattr(db_module, "DB_PATH", temp_db)


def test_init_db_creates_tables():
    from src.database import init_db, DB_PATH
    init_db()
    import sqlite3
    conn = sqlite3.connect(DB_PATH)
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    assert "seen_items" in tables
    assert "pending_insights" in tables
    conn.close()


def test_is_seen_returns_false_for_new_item():
    from src.database import init_db, is_seen
    init_db()
    assert is_seen("nonexistent_id") is False


def test_mark_seen_and_is_seen():
    from src.database import init_db, mark_seen, is_seen
    init_db()
    mark_seen("abc123", "Test Title", "https://example.com", "Genesys")
    assert is_seen("abc123") is True


def test_mark_seen_idempotent():
    from src.database import init_db, mark_seen, is_seen
    init_db()
    mark_seen("dup", "Title", "https://example.com", "Five9")
    mark_seen("dup", "Title", "https://example.com", "Five9")  # should not raise
    assert is_seen("dup") is True


def test_save_and_get_pending():
    from src.database import init_db, save_pending, get_pending
    init_db()
    insight = {"headline": "Test insight", "score": 8}
    save_pending("12345.67890", "item_abc", insight)
    rows = get_pending()
    assert len(rows) == 1
    ts, iid, ins = rows[0]
    assert ts == "12345.67890"
    assert iid == "item_abc"
    assert ins["headline"] == "Test insight"


def test_update_status_approved():
    from src.database import init_db, save_pending, get_pending, update_status
    init_db()
    save_pending("99.00", "item_xyz", {"score": 9})
    update_status("99.00", "approved")
    pending = get_pending()
    assert len(pending) == 0  # approved items no longer in pending list
