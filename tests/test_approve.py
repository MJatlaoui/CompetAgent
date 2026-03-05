import pytest
from unittest.mock import patch, MagicMock


@pytest.fixture(autouse=True)
def mock_env(monkeypatch):
    monkeypatch.setenv("GOOGLE_CREDENTIALS_JSON", '{"type":"service_account"}')
    monkeypatch.setenv("GOOGLE_SHEET_ID", "fake-sheet-id")


PENDING = [
    ("fake-uuid-1", "item_1", {"headline": "Five9 Salesforce CTI", "score": 8, "competitor": "Five9"}),
    ("fake-uuid-2", "item_2", {"headline": "Genesys AI launch", "score": 9, "competitor": "Genesys"}),
]


def test_run_prints_pending_count(tmp_path, monkeypatch, capsys):
    import src.database as db_mod
    monkeypatch.setattr(db_mod, "DB_PATH", tmp_path / "test.db")

    with patch("src.approve.get_pending", return_value=PENDING):
        from src.approve import run
        run()

    captured = capsys.readouterr()
    assert "2 pending insights" in captured.out
