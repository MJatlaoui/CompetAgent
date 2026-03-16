import hashlib
import httpx
from bs4 import BeautifulSoup
from datetime import datetime, UTC
from urllib.parse import urljoin
from .base import FeedItem

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; IntelBot/1.0)"}


class HTMLAdapter:
    """Scrape an HTML page for links matching a CSS selector."""

    def fetch(self, url: str, competitor: str, selector: str = "a",
              base_url: str = "", follow_links: bool = False,
              title_selector: str = "h1", **kwargs) -> list[FeedItem]:
        try:
            resp = httpx.get(url, timeout=15, follow_redirects=True, headers=HEADERS)
            resp.raise_for_status()
        except Exception as e:
            print(f"[WARN] Failed to fetch {url}: {e}")
            raise

        soup = BeautifulSoup(resp.text, "html.parser")
        items: list[FeedItem] = []
        for el in soup.select(selector)[:20]:
            href = el.get("href", "")
            if href:
                href = urljoin(base_url or url, href)
            link_text = el.get_text(strip=True)

            if follow_links and href:
                try:
                    page = httpx.get(href, timeout=15, follow_redirects=True, headers=HEADERS)
                    page.raise_for_status()
                    page_soup = BeautifulSoup(page.text, "html.parser")
                    title_el = page_soup.select_one(title_selector)
                    title = title_el.get_text(strip=True) if title_el else link_text
                    summary = page_soup.get_text(separator=" ", strip=True)[:2000]
                    published = datetime.now(UTC).isoformat()
                except Exception as e:
                    print(f"[WARN] Failed to follow link {href}: {e}")
                    continue
            else:
                title = link_text
                summary = link_text
                published = datetime.now(UTC).isoformat()

            item_id = hashlib.sha256(href.encode()).hexdigest()[:16]
            items.append(FeedItem(
                id=item_id,
                competitor=competitor,
                title=title,
                url=href,
                summary=summary,
                published=published,
            ))
        return items
