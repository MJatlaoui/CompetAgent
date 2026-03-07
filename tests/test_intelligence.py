import pytest
import json
from unittest.mock import patch, MagicMock


SAMPLE_INSIGHT = {
    "classification": "FEATURE_LAUNCH",
    "score": 8,
    "competitor": "Five9",
    "headline": "Five9 launches native Salesforce CTI integration v3",
    "product_facts": ["Real-time screen pop", "Embedded dialer in Service Cloud"],
    "strategic_priorities_hit": ["Native Salesforce CRM integration"],
    "competitive_gap": "Direct threat to Zoom's Service Cloud Voice offering",
    "sales_angle": "Emphasize Zoom's deeper Einstein AI integration",
    "source_url": "https://five9.com/blog/salesforce-cti",
    "worth_surfacing": True
}


def _make_mock_response(text: str, usage=None):
    mock_content = MagicMock()
    mock_content.text = text
    mock_response = MagicMock()
    mock_response.content = [mock_content]
    mock_response.usage = usage or MagicMock(
        input_tokens=100, output_tokens=50,
        cache_creation_input_tokens=0, cache_read_input_tokens=0,
    )
    return mock_response


def test_analyze_item_returns_parsed_insight():
    from src.intelligence import analyze_item

    item = {
        "competitor": "Five9",
        "title": "Five9 Salesforce CTI",
        "url": "https://five9.com/blog/salesforce-cti",
        "summary": "New Salesforce integration announced.",
        "published": "2026-03-04",
    }

    with patch("src.intelligence.client.messages.create",
               return_value=_make_mock_response(json.dumps(SAMPLE_INSIGHT))):
        insight, cost = analyze_item(item)

    assert insight is not None
    assert insight["score"] == 8
    assert insight["competitor"] == "Five9"
    assert insight["worth_surfacing"] is True
    assert isinstance(cost, float)


def test_analyze_item_returns_none_on_api_error():
    from src.intelligence import analyze_item

    item = {
        "competitor": "Genesys",
        "title": "Test",
        "url": "https://genesys.com/test",
        "summary": "Summary",
        "published": "2026-03-04",
    }

    with patch("src.intelligence.client.messages.create", side_effect=Exception("API error")):
        insight, cost = analyze_item(item)

    assert insight is None
    assert cost == 0.0


def test_analyze_item_returns_none_on_invalid_json():
    from src.intelligence import analyze_item

    item = {
        "competitor": "Talkdesk",
        "title": "Test",
        "url": "https://talkdesk.com/test",
        "summary": "Summary",
        "published": "2026-03-04",
    }

    with patch("src.intelligence.client.messages.create",
               return_value=_make_mock_response("not valid json {{")):
        insight, cost = analyze_item(item)

    assert insight is None
    assert cost == 0.0
