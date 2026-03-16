import pytest
from unittest.mock import patch, MagicMock


# --- RSS adapter ---

def test_rss_adapter_returns_normalized_items():
    from src.sources.rss import RSSAdapter
    mock_entry = MagicMock()
    mock_entry.get = lambda k, d="": {
        "link": "https://genesys.com/blog/post-1",
        "id":   "https://genesys.com/blog/post-1",
        "title": "Genesys Launches New Feature",
        "summary": "This is the summary.",
        "published": "2026-03-04",
    }.get(k, d)
    mock_feed = MagicMock()
    mock_feed.entries = [mock_entry]
    mock_feed.status = None
    mock_feed.bozo = False

    with patch("src.sources.rss.feedparser.parse", return_value=mock_feed):
        items = RSSAdapter().fetch("https://genesys.com/feed", "Genesys")

    assert len(items) == 1
    item = items[0]
    assert item["competitor"] == "Genesys"
    assert item["title"] == "Genesys Launches New Feature"
    assert item["url"] == "https://genesys.com/blog/post-1"
    assert len(item["id"]) == 16


def test_rss_adapter_caps_at_20_entries():
    from src.sources.rss import RSSAdapter
    mock_entry = MagicMock()
    mock_entry.get = lambda k, d="": "https://example.com/post" if k in ("link", "id") else ""
    mock_feed = MagicMock()
    mock_feed.entries = [mock_entry] * 30
    mock_feed.status = None
    mock_feed.bozo = False

    with patch("src.sources.rss.feedparser.parse", return_value=mock_feed):
        items = RSSAdapter().fetch("https://example.com/feed", "Test")

    assert len(items) == 20


# --- HTML adapter ---

def test_html_adapter_returns_items():
    from src.sources.html import HTMLAdapter
    mock_resp = MagicMock()
    mock_resp.text = '''
        <html><body>
          <a class="item-title" href="/release/1">Connect feature 1</a>
          <a class="item-title" href="https://external.com/2">External link</a>
        </body></html>
    '''
    mock_resp.raise_for_status = MagicMock()

    with patch("src.sources.html.httpx.get", return_value=mock_resp):
        items = HTMLAdapter().fetch(
            "https://aws.amazon.com/releasenotes/",
            "Amazon_Connect",
            selector=".item-title",
            base_url="https://aws.amazon.com"
        )

    assert len(items) == 2
    assert items[0]["url"] == "https://aws.amazon.com/release/1"
    assert items[1]["url"] == "https://external.com/2"


def test_html_adapter_handles_network_error():
    from src.sources.html import HTMLAdapter
    with patch("src.sources.html.httpx.get", side_effect=Exception("timeout")):
        with pytest.raises(Exception, match="timeout"):
            HTMLAdapter().fetch("https://bad.url/", "Test", selector="a", base_url="")


# --- Registry / load_sources ---

def test_load_sources_dispatches_to_correct_adapters():
    from src.sources import load_sources

    config = {
        "competitors": [
            {"name": "Alpha", "feeds": [{"type": "rss", "url": "https://alpha.com/feed"}]},
            {"name": "Beta",  "feeds": [{"type": "html", "url": "https://beta.com/",
                                         "selector": "a", "base_url": "https://beta.com"}]},
        ]
    }

    with patch("src.sources.ADAPTERS", {
        "rss":  MagicMock(fetch=MagicMock(return_value=[{"id": "rss_item"}])),
        "html": MagicMock(fetch=MagicMock(return_value=[{"id": "html_item"}])),
    }):
        items, errors = load_sources(config)

    assert len(items) == 2


def test_load_sources_warns_on_unknown_type(capsys):
    from src.sources import load_sources

    config = {
        "competitors": [
            {"name": "Alpha", "feeds": [{"type": "graphql", "url": "https://alpha.com/gql"}]},
        ]
    }
    items, errors = load_sources(config)
    assert items == []
    captured = capsys.readouterr()
    assert "Unknown source type: graphql" in captured.out
