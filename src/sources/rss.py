import hashlib
import re
import urllib.error
import feedparser
from datetime import datetime, UTC
from .base import FeedItem


def _date_from_url(url: str) -> str | None:
    m = re.search(r'(\d{4}-\d{2}-\d{2})', url)
    if m:
        return f"{m.group(1)}T00:00:00+00:00"
    return None


class RSSAdapter:
    """Fetch items from an RSS or Atom feed."""

    def fetch(self, url: str, competitor: str, **kwargs) -> list[FeedItem]:
        feed = feedparser.parse(url)

        # Raise on HTTP errors
        status = getattr(feed, "status", None)
        if status is not None and status >= 400:
            raise RuntimeError(f"HTTP {status}")

        # Raise on network/connection errors (not just malformed XML)
        if feed.bozo and not feed.entries:
            exc = feed.bozo_exception
            if isinstance(exc, (urllib.error.URLError, OSError, ConnectionError)):
                raise RuntimeError(str(exc))

        items: list[FeedItem] = []
        for entry in feed.entries[:20]:
            item_id = hashlib.sha256(
                entry.get("link", entry.get("id", "")).encode()
            ).hexdigest()[:16]
            items.append(FeedItem(
                id=item_id,
                competitor=competitor,
                title=entry.get("title", ""),
                url=entry.get("link", ""),
                summary=entry.get("summary", entry.get("description", ""))[:2000],
                published=entry.get("published") or _date_from_url(entry.get("link", "")) or datetime.now(UTC).isoformat(),
            ))
        return items
