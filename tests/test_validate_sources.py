import pytest
import json
from unittest.mock import patch, MagicMock
from pathlib import Path


def _make_feed(entries_count=1, bozo=False):
    mock_feed = MagicMock()
    mock_feed.bozo = bozo
    mock_feed.entries = [MagicMock()] * entries_count
    return mock_feed


def _make_resp(text="<rss/>"):
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.text = text
    return mock_resp


# --- validate_source unit tests ---

def test_validate_source_pass():
    from tools.validate_sources import validate_source
    with patch("tools.validate_sources.httpx.get", return_value=_make_resp()), \
         patch("tools.validate_sources.feedparser.parse", return_value=_make_feed(1)):
        result = validate_source({"name": "Test", "url": "https://example.com/feed", "notes": ""})
    assert result["status"] == "PASS"
    assert "1 entries" in result["reason"]


def test_validate_source_skip_null_url():
    from tools.validate_sources import validate_source
    result = validate_source({"name": "No RSS", "url": None, "notes": "No native RSS"})
    assert result["status"] == "SKIP"


def test_validate_source_skip_no_rss_note():
    from tools.validate_sources import validate_source
    result = validate_source({"name": "OpenAI", "url": "https://openai.com", "notes": "No official RSS (use generator)"})
    assert result["status"] == "SKIP"


def test_validate_source_fail_network_error():
    from tools.validate_sources import validate_source
    with patch("tools.validate_sources.httpx.get", side_effect=Exception("timeout")):
        result = validate_source({"name": "Bad", "url": "https://bad.url/feed", "notes": ""})
    assert result["status"] == "FAIL"
    assert "timeout" in result["reason"]


def test_validate_source_fail_empty_feed():
    from tools.validate_sources import validate_source
    with patch("tools.validate_sources.httpx.get", return_value=_make_resp()), \
         patch("tools.validate_sources.feedparser.parse", return_value=_make_feed(0)):
        result = validate_source({"name": "Empty", "url": "https://empty.com/feed", "notes": ""})
    assert result["status"] == "FAIL"
    assert "0 entries" in result["reason"]


# --- write_industry_sources idempotency ---

def test_write_industry_sources_no_duplicates(tmp_path):
    from tools.validate_sources import _write_industry_sources

    results = [
        {"name": "CX Today", "category": "CX", "url": "https://cxtoday.com/feed/",
         "type": "rss", "notes": "", "status": "PASS", "reason": "2 entries"},
    ]
    yaml_path = tmp_path / "industry_sources.yaml"

    with patch("tools.validate_sources.INDUSTRY_YAML_PATH", yaml_path):
        _write_industry_sources(results)  # first write
        _write_industry_sources(results)  # second write — should not duplicate

    import yaml
    data = yaml.safe_load(yaml_path.read_text())
    assert len(data["industry_sources"]) == 1  # not 2
