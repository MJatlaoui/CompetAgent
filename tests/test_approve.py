import pytest
from unittest.mock import patch, MagicMock


@pytest.fixture(autouse=True)
def mock_env(monkeypatch):
    monkeypatch.setenv("SLACK_BOT_TOKEN", "xoxb-fake")
    monkeypatch.setenv("SLACK_CHANNEL_ID", "C123")
    monkeypatch.setenv("NOTION_API_KEY", "secret_fake")
    monkeypatch.setenv("NOTION_DATABASE_ID", "fake-db-id")


PENDING = [
    ("12345.67890", "item_1", {"headline": "Five9 Salesforce CTI", "score": 8, "competitor": "Five9"}),
    ("99999.00001", "item_2", {"headline": "Genesys AI launch", "score": 9, "competitor": "Genesys"}),
]


def test_approved_item_writes_to_notion_and_updates_status(tmp_path, monkeypatch):
    import src.database as db_mod
    monkeypatch.setattr(db_mod, "DB_PATH", tmp_path / "test.db")

    with patch("src.approve.get_pending", return_value=[PENDING[0]]), \
         patch("src.approve.get_reactions", return_value=["white_check_mark"]), \
         patch("src.approve.write_to_battlecard") as mock_write, \
         patch("src.approve.update_status") as mock_update:

        from src.approve import run
        run()

    mock_write.assert_called_once_with(PENDING[0][2])
    mock_update.assert_called_once_with("12345.67890", "approved")


def test_discarded_item_updates_status_only(tmp_path, monkeypatch):
    import src.database as db_mod
    monkeypatch.setattr(db_mod, "DB_PATH", tmp_path / "test.db")

    with patch("src.approve.get_pending", return_value=[PENDING[1]]), \
         patch("src.approve.get_reactions", return_value=["x"]), \
         patch("src.approve.write_to_battlecard") as mock_write, \
         patch("src.approve.update_status") as mock_update:

        from src.approve import run
        run()

    mock_write.assert_not_called()
    mock_update.assert_called_once_with("99999.00001", "discarded")


def test_no_reaction_leaves_item_pending(tmp_path, monkeypatch):
    import src.database as db_mod
    monkeypatch.setattr(db_mod, "DB_PATH", tmp_path / "test.db")

    with patch("src.approve.get_pending", return_value=[PENDING[0]]), \
         patch("src.approve.get_reactions", return_value=[]), \
         patch("src.approve.write_to_battlecard") as mock_write, \
         patch("src.approve.update_status") as mock_update:

        from src.approve import run
        run()

    mock_write.assert_not_called()
    mock_update.assert_not_called()
