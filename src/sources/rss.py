import hashlib
import feedparser
from datetime import datetime
from .base import FeedItem


class RSSAdapter:
    """Fetch items from an RSS or Atom feed."""

    def fetch(self, url: str, competitor: str, **kwargs) -> list[FeedItem]:
        feed = feedparser.parse(url)
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
                published=entry.get("published", datetime.utcnow().isoformat()),
            ))
        return items
