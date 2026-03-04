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


def test_analyze_item_returns_parsed_insight():
    from src.intelligence import analyze_item

    mock_content = MagicMock()
    mock_content.text = json.dumps(SAMPLE_INSIGHT)

    mock_response = MagicMock()
    mock_response.content = [mock_content]

    item = {
        "competitor": "Five9",
        "title": "Five9 Salesforce CTI",
        "url": "https://five9.com/blog/salesforce-cti",
        "summary": "New Salesforce integration announced.",
        "published": "2026-03-04",
    }

    with patch("src.intelligence.client.messages.create", return_value=mock_response):
        result = analyze_item(item)

    assert result is not None
    assert result["score"] == 8
    assert result["competitor"] == "Five9"
    assert result["worth_surfacing"] is True


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
        result = analyze_item(item)

    assert result is None


def test_analyze_item_returns_none_on_invalid_json():
    from src.intelligence import analyze_item

    mock_content = MagicMock()
    mock_content.text = "not valid json {{"

    mock_response = MagicMock()
    mock_response.content = [mock_content]

    item = {
        "competitor": "Talkdesk",
        "title": "Test",
        "url": "https://talkdesk.com/test",
        "summary": "Summary",
        "published": "2026-03-04",
    }

    with patch("src.intelligence.client.messages.create", return_value=mock_response):
        result = analyze_item(item)

    assert result is None
