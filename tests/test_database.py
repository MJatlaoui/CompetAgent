import pytest
import json
from pathlib import Path


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
    mark_seen("dup", "Title", "https://example.com", "Five9")
    assert is_seen("dup") is True


def test_save_pending_with_uuid():
    from src.database import init_db, save_pending, get_pending
    init_db()
    insight = {"headline": "Test insight", "score": 8}
    save_pending("item_abc", insight)
    rows = get_pending()
    assert len(rows) == 1
    uid, iid, ins = rows[0]
    assert len(uid) == 36  # UUID format
    assert iid == "item_abc"
    assert ins["headline"] == "Test insight"


def test_save_pending_generates_unique_ids():
    from src.database import init_db, save_pending, get_pending
    init_db()
    save_pending("item_1", {"score": 5})
    save_pending("item_2", {"score": 6})
    rows = get_pending()
    assert len(rows) == 2
    assert rows[0][0] != rows[1][0]  # different UUIDs


def test_update_status_with_uuid():
    from src.database import init_db, save_pending, get_pending, update_status
    init_db()
    save_pending("item_xyz", {"score": 9})
    rows = get_pending()
    uid = rows[0][0]
    update_status(uid, "approved")
    pending = get_pending()
    assert len(pending) == 0


def test_get_all_insights():
    from src.database import init_db, save_pending, get_all_insights, update_status
    init_db()
    save_pending("item_1", {"score": 5, "headline": "Low"})
    save_pending("item_2", {"score": 9, "headline": "High"})
    rows = get_all_insights()
    assert len(rows) == 2
    uid, iid, ins, posted_at, status, tags = rows[0]
    assert status == "pending"
    assert tags == []


def test_get_trends():
    from src.database import init_db, save_pending, get_trends
    init_db()
    save_pending("item_1", {"score": 5, "competitor": "Genesys", "classification": "FEATURE_LAUNCH"})
    save_pending("item_2", {"score": 9, "competitor": "Five9", "classification": "TECHNICAL_SHIFT"})
    trends = get_trends()
    assert len(trends) >= 1
