import hashlib
import httpx
from bs4 import BeautifulSoup
from datetime import datetime
from .base import FeedItem

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; IntelBot/1.0)"}


class HTMLAdapter:
    """Scrape an HTML page for links matching a CSS selector."""

    def fetch(self, url: str, competitor: str, selector: str = "a",
              base_url: str = "", **kwargs) -> list[FeedItem]:
        try:
            resp = httpx.get(url, timeout=15, follow_redirects=True, headers=HEADERS)
            resp.raise_for_status()
        except Exception as e:
            print(f"[WARN] Failed to fetch {url}: {e}")
            return []

        soup = BeautifulSoup(resp.text, "html.parser")
        items: list[FeedItem] = []
        for el in soup.select(selector)[:20]:
            href = el.get("href", "")
            if href and not href.startswith("http"):
                href = base_url + href
            title = el.get_text(strip=True)
            item_id = hashlib.sha256(href.encode()).hexdigest()[:16]
            items.append(FeedItem(
                id=item_id,
                competitor=competitor,
                title=title,
                url=href,
                summary=title,
                published=datetime.utcnow().isoformat(),
            ))
        return items
