import pytest
import os
from unittest.mock import patch, MagicMock


@pytest.fixture(autouse=True)
def mock_env(monkeypatch):
    monkeypatch.setenv("SLACK_BOT_TOKEN", "xoxb-fake-token")
    monkeypatch.setenv("SLACK_CHANNEL_ID", "C12345678")


SAMPLE_INSIGHT = {
    "classification": "FEATURE_LAUNCH",
    "score": 8,
    "competitor": "Five9",
    "headline": "Five9 launches native Salesforce CTI v3",
    "product_facts": ["Real-time screen pop", "Embedded dialer"],
    "strategic_priorities_hit": ["Native Salesforce CRM integration"],
    "competitive_gap": "Direct threat to ZCC",
    "sales_angle": "Emphasize Zoom Einstein AI depth",
    "source_url": "https://five9.com/blog/post",
    "worth_surfacing": True
}


def test_post_insight_returns_timestamp(monkeypatch):
    monkeypatch.setenv("SLACK_BOT_TOKEN", "xoxb-fake-token")
    monkeypatch.setenv("SLACK_CHANNEL_ID", "C12345678")

    mock_client = MagicMock()
    mock_client.chat_postMessage.return_value = {"ts": "12345.67890"}

    import importlib
    import src.delivery as delivery_mod
    importlib.reload(delivery_mod)
    delivery_mod.client = mock_client
    delivery_mod.SLACK_CHANNEL = "C12345678"

    ts = delivery_mod.post_insight(SAMPLE_INSIGHT)
    assert ts == "12345.67890"


def test_post_insight_returns_none_on_slack_error(monkeypatch):
    from slack_sdk.errors import SlackApiError
    monkeypatch.setenv("SLACK_BOT_TOKEN", "xoxb-fake-token")
    monkeypatch.setenv("SLACK_CHANNEL_ID", "C12345678")

    mock_client = MagicMock()
    mock_client.chat_postMessage.side_effect = SlackApiError(
        message="channel_not_found", response={"error": "channel_not_found"}
    )

    import importlib
    import src.delivery as delivery_mod
    importlib.reload(delivery_mod)
    delivery_mod.client = mock_client
    delivery_mod.SLACK_CHANNEL = "C12345678"

    ts = delivery_mod.post_insight(SAMPLE_INSIGHT)
    assert ts is None


def test_get_reactions_returns_list(monkeypatch):
    monkeypatch.setenv("SLACK_BOT_TOKEN", "xoxb-fake-token")
    monkeypatch.setenv("SLACK_CHANNEL_ID", "C12345678")

    mock_client = MagicMock()
    mock_client.reactions_get.return_value = {
        "message": {
            "reactions": [
                {"name": "white_check_mark", "count": 1},
                {"name": "x", "count": 1}
            ]
        }
    }

    import importlib
    import src.delivery as delivery_mod
    importlib.reload(delivery_mod)
    delivery_mod.client = mock_client
    delivery_mod.SLACK_CHANNEL = "C12345678"

    reactions = delivery_mod.get_reactions("12345.67890")
    assert "white_check_mark" in reactions
    assert "x" in reactions


def test_get_reactions_returns_empty_on_error(monkeypatch):
    from slack_sdk.errors import SlackApiError
    monkeypatch.setenv("SLACK_BOT_TOKEN", "xoxb-fake-token")
    monkeypatch.setenv("SLACK_CHANNEL_ID", "C12345678")

    mock_client = MagicMock()
    mock_client.reactions_get.side_effect = SlackApiError(
        message="message_not_found", response={"error": "message_not_found"}
    )

    import importlib
    import src.delivery as delivery_mod
    importlib.reload(delivery_mod)
    delivery_mod.client = mock_client
    delivery_mod.SLACK_CHANNEL = "C12345678"

    reactions = delivery_mod.get_reactions("bad_ts")
    assert reactions == []
