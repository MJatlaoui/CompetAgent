import pytest
from unittest.mock import patch, MagicMock


MOCK_CONFIG = {
    "competitors": [
        {"name": "Five9", "feeds": [{"type": "rss", "url": "https://five9.com/feed"}]}
    ]
}
MOCK_STRATEGY = {"score_threshold": 7}

MOCK_ITEM = {
    "id": "abc123456789abcd",
    "competitor": "Five9",
    "title": "Five9 Launches Feature",
    "url": "https://five9.com/blog/feature",
    "summary": "Details about the contact center feature.",
    "published": "2026-03-04",
}

HIGH_SCORE_INSIGHT = {
    "classification": "FEATURE_LAUNCH",
    "score": 8,
    "competitor": "Five9",
    "headline": "Five9 new feature",
    "product_facts": ["Fact 1"],
    "strategic_priorities_hit": [],
    "competitive_gap": "Gap description",
    "sales_angle": "Sales angle",
    "source_url": "https://five9.com/blog/feature",
    "worth_surfacing": True,
}

LOW_SCORE_INSIGHT = {**HIGH_SCORE_INSIGHT, "score": 3, "worth_surfacing": False}


@pytest.fixture(autouse=True)
def mock_slack_env(monkeypatch):
    monkeypatch.setenv("SLACK_BOT_TOKEN", "xoxb-fake")
    monkeypatch.setenv("SLACK_CHANNEL_ID", "C123")
    monkeypatch.setenv("GOOGLE_CREDENTIALS_JSON", '{"type":"service_account"}')
    monkeypatch.setenv("GOOGLE_SHEET_ID", "fake-sheet-id")


def test_run_posts_high_score_items_to_slack(tmp_path, monkeypatch):
    import src.database as db_mod
    monkeypatch.setattr(db_mod, "DB_PATH", tmp_path / "test.db")

    with patch("src.main.yaml.safe_load", side_effect=[MOCK_CONFIG, MOCK_STRATEGY]), \
         patch("builtins.open"), \
         patch("src.main.Path.exists", return_value=False), \
         patch("src.main.load_sources", return_value=([MOCK_ITEM], {})), \
         patch("src.main.analyze_batch", return_value=[(HIGH_SCORE_INSIGHT, 0.001)]), \
         patch("src.main.save_pending", return_value="fake-uuid") as mock_save:

        from src.main import run
        run()

    mock_save.assert_called_once()


def test_run_skips_low_score_items(tmp_path, monkeypatch):
    import src.database as db_mod
    monkeypatch.setattr(db_mod, "DB_PATH", tmp_path / "test.db")

    with patch("src.main.yaml.safe_load", side_effect=[MOCK_CONFIG, MOCK_STRATEGY]), \
         patch("builtins.open"), \
         patch("src.main.Path.exists", return_value=False), \
         patch("src.main.load_sources", return_value=([MOCK_ITEM], {})), \
         patch("src.main.analyze_batch", return_value=[(LOW_SCORE_INSIGHT, 0.001)]), \
         patch("src.main.save_pending") as mock_save:

        from src.main import run
        run()

    mock_save.assert_not_called()


def test_run_skips_already_seen_items(tmp_path, monkeypatch):
    import src.database as db_mod
    monkeypatch.setattr(db_mod, "DB_PATH", tmp_path / "test.db")
    db_mod.init_db()
    db_mod.mark_seen(MOCK_ITEM["id"], MOCK_ITEM["title"], MOCK_ITEM["url"], MOCK_ITEM["competitor"])

    with patch("src.main.yaml.safe_load", side_effect=[MOCK_CONFIG, MOCK_STRATEGY]), \
         patch("builtins.open"), \
         patch("src.main.Path.exists", return_value=False), \
         patch("src.main.load_sources", return_value=([MOCK_ITEM], {})), \
         patch("src.main.run_auto_scoring"), \
         patch("src.main.analyze_batch") as mock_analyze:

        from src.main import run
        run()

    mock_analyze.assert_not_called()


def test_run_exits_early_when_paused(tmp_path, monkeypatch):
    import src.database as db_mod
    monkeypatch.setattr(db_mod, "DB_PATH", tmp_path / "test.db")
    db_mod.init_db()
    db_mod.set_setting("ingestion_paused", "true")

    with patch("src.main.load_sources") as mock_load:
        from src.main import run
        run()

    mock_load.assert_not_called()


def test_run_includes_industry_sources_when_file_exists(tmp_path, monkeypatch):
    """When config/industry_sources.yaml exists, its sources are included in ingestion."""
    import src.database as db_mod
    monkeypatch.setattr(db_mod, "DB_PATH", tmp_path / "test.db")

    industry_yaml = tmp_path / "industry_sources.yaml"
    industry_yaml.write_text(
        "industry_sources:\n"
        "  - name: CX Today\n"
        "    category: CX\n"
        "    feeds:\n"
        "      - type: rss\n"
        "        url: https://cxtoday.com/feed/\n"
    )

    MOCK_STRATEGY_LOCAL = {"score_threshold": 7}
    MOCK_CONFIG_LOCAL = {"competitors": []}
    MOCK_INDUSTRY_DATA = {
        "industry_sources": [
            {"name": "CX Today", "category": "CX",
             "feeds": [{"type": "rss", "url": "https://cxtoday.com/feed/"}]},
        ]
    }

    with patch("src.main.yaml.safe_load",
               side_effect=[MOCK_CONFIG_LOCAL, MOCK_STRATEGY_LOCAL, MOCK_INDUSTRY_DATA]), \
         patch("builtins.open"), \
         patch("src.main.INDUSTRY_SOURCES_PATH", str(industry_yaml)), \
         patch("src.main.load_sources") as mock_load, \
         patch("src.main.analyze_batch", return_value=[]):
        mock_load.return_value = ([], {})
        from src.main import run
        run()

    # load_sources should have been called with config containing the industry source
    call_config = mock_load.call_args[0][0]
    names = [c["name"] for c in call_config["competitors"]]
    assert "CX Today" in names
