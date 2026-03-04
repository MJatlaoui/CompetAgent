import pytest
import os
from unittest.mock import patch, MagicMock
from datetime import datetime


@pytest.fixture(autouse=True)
def mock_env(monkeypatch):
    monkeypatch.setenv("NOTION_API_KEY", "secret_fake_key")
    monkeypatch.setenv("NOTION_DATABASE_ID", "fake-database-id-1234")


SAMPLE_INSIGHT = {
    "classification": "FEATURE_LAUNCH",
    "score": 8,
    "competitor": "Five9",
    "headline": "Five9 launches native Salesforce CTI v3",
    "strategic_priorities_hit": ["Native Salesforce CRM integration"],
    "competitive_gap": "Direct threat to ZCC",
    "sales_angle": "Emphasize Zoom Einstein AI depth",
    "source_url": "https://five9.com/blog/post",
}


def test_write_to_battlecard_calls_notion_create(monkeypatch):
    monkeypatch.setenv("NOTION_API_KEY", "secret_fake_key")
    monkeypatch.setenv("NOTION_DATABASE_ID", "fake-database-id-1234")

    mock_notion = MagicMock()
    mock_notion.pages.create.return_value = {"id": "page-id-123"}

    import importlib
    import src.persistence as persistence_mod
    importlib.reload(persistence_mod)
    persistence_mod.notion = mock_notion
    persistence_mod.DATABASE_ID = "fake-database-id-1234"

    persistence_mod.write_to_battlecard(SAMPLE_INSIGHT)

    mock_notion.pages.create.assert_called_once()
    call_kwargs = mock_notion.pages.create.call_args[1]
    assert call_kwargs["parent"]["database_id"] == "fake-database-id-1234"
    props = call_kwargs["properties"]
    assert props["Headline"]["title"][0]["text"]["content"] == "Five9 launches native Salesforce CTI v3"
    assert props["Score"]["number"] == 8
    assert props["Competitor"]["select"]["name"] == "Five9"
