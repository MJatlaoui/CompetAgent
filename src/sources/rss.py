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


def _parse_entry_date(entry) -> str | None:
    """Extract publish date from a feedparser entry as an ISO string (UTC).
    Uses the parsed struct_time so it's timezone-normalised and reliable.
    Falls back to raw string fields, then URL extraction."""
    for attr in ("published_parsed", "updated_parsed", "created_parsed"):
        t = entry.get(attr)
        if t:
            try:
                return datetime(*t[:6], tzinfo=UTC).isoformat()
            except Exception:
                pass
    # Raw string fallback (RFC 2822 or ISO — browsers can parse either)
    for attr in ("published", "updated"):
        v = entry.get(attr)
        if v:
            return v
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
                published=_parse_entry_date(entry) or _date_from_url(entry.get("link", "")) or "",
            ))
        return items
