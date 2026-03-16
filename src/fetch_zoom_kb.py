"""
Crawl Zoom's library pages to build a product knowledge base for the scoring agent.

Usage:
    python -m src.fetch_zoom_kb              # fetch all, write prompts/zoom_knowledge.md
    python -m src.fetch_zoom_kb --dry-run    # print to stdout only
"""
import re
import sys
import argparse
from datetime import date
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

SEED_URLS = [
    "https://library.zoom.com/business-services/zoom-contact-center/zoom-customer-experience",
    "https://library.zoom.com/zoom-workplace/artificial-intelligence/artificial-intelligence-bluepaper",
    "https://library.zoom.com/zoom-workplace/zoom-phone/zoom-phone-bluepaper",
    "https://library.zoom.com/business-services/zoom-quality-management",
    "https://library.zoom.com/business-services/zoom-workforce-management",
]

FOLLOW_PATTERNS = [
    "release-note", "whats-new", "changelog",
    "explainer", "bluepaper", "expert-insight",
]

BASE_DOMAIN = "https://library.zoom.com"
PAGE_CHAR_LIMIT = 4000

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; CompetAgent/1.0; +https://github.com/zoom/competagent)"
    )
}


def _is_followable(href: str) -> bool:
    if not href:
        return False
    parsed = urlparse(href)
    # Must be within library.zoom.com (allow relative URLs too)
    if parsed.netloc and parsed.netloc != "library.zoom.com":
        return False
    path = parsed.path.lower()
    return any(pat in path for pat in FOLLOW_PATTERNS)


_ICON_WORDS = {
    # Font-awesome / custom icon class names that bleed into text
    "hashtag", "arrows-rotate", "map", "arrow", "chevron",
    "fa-", "icon-", "svg-", "bi-",
}


def _looks_like_icon(token: str) -> bool:
    t = token.lower().strip()
    return any(t.startswith(w) or t == w for w in _ICON_WORDS)


def _extract_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    # Remove noise elements
    for tag in soup(["nav", "header", "footer", "script", "style", "aside", "noscript", "svg", "img"]):
        tag.decompose()
    # Strip elements whose sole purpose is icon rendering (typically <i>, <span> with icon classes)
    for tag in soup.find_all(["i", "span"]):
        cls = " ".join(tag.get("class", []))
        if any(pat in cls.lower() for pat in ["icon", "fa-", "svg", "hashtag"]):
            tag.decompose()
    # Prefer main content area
    main = soup.find("main") or soup.find("article") or soup.find(id="content") or soup.body
    if not main:
        return ""
    text = main.get_text(separator="\n", strip=True)
    # Drop lines that are just icon words / single tokens that look like CSS class names.
    # Also strip leading icon-name prefixes that bleed into heading text (e.g. "mapZoom...").
    _ICON_PREFIX_RE = re.compile(
        r"^(?:map|arrows-rotate|arrow(?:s)?|hashtag|chevron|fa-\w+|icon-\w+|check|circle|info|warning|star|clock|user|lock|globe|search|home|cog|gear|bell|envelope|phone|video|chat|file|folder|tag|thumbs|flag|heart|shield|bolt|plus|minus|times|bars|list|grid|table|chart|graph|bar|pie|line)\s*",
        re.IGNORECASE,
    )
    lines = []
    for ln in text.splitlines():
        stripped = ln.strip()
        if not stripped:
            continue
        if _looks_like_icon(stripped):
            continue
        # Strip leading icon name that got concatenated with heading text
        cleaned = _ICON_PREFIX_RE.sub("", stripped).strip()
        if cleaned:
            lines.append(cleaned)
    return "\n".join(lines)


_TITLE_ICON_RE = re.compile(
    r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?=[A-Z])",  # camelCase icon prefix e.g. "mapZoom", "arrows-rotateWhat"
)


def _clean_title(raw: str) -> str:
    """Remove leading icon-name prefixes from page titles."""
    return _TITLE_ICON_RE.sub("", raw).strip()


def _page_title(html: str, url: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    # Remove icon elements before extracting title text
    for tag in soup(["i", "svg", "img"]):
        tag.decompose()
    h1 = soup.find("h1")
    if h1 and h1.get_text(strip=True):
        return _clean_title(h1.get_text(strip=True))
    title = soup.find("title")
    if title:
        return title.get_text(strip=True).split("|")[0].strip()
    return url.rstrip("/").split("/")[-1].replace("-", " ").title()


def _collect_sub_links(html: str, base_url: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    links = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        full = urljoin(base_url, href)
        # Normalise: strip fragment
        full = full.split("#")[0].rstrip("/")
        if full.startswith(BASE_DOMAIN) and _is_followable(full):
            links.append(full)
    return links


def fetch_page(url: str, client: httpx.Client) -> tuple[str, str]:
    """Return (title, text) for a URL, or ('', '') on error."""
    try:
        resp = client.get(url, follow_redirects=True, timeout=15)
        resp.raise_for_status()
        html = resp.text
        return _page_title(html, url), _extract_text(html)[:PAGE_CHAR_LIMIT]
    except Exception as e:
        print(f"[WARN] Could not fetch {url}: {e}", file=sys.stderr)
        return "", ""


def build_knowledge_base() -> str:
    sections = []
    seen_urls: set[str] = set()

    with httpx.Client(headers=HEADERS) as client:
        for seed in SEED_URLS:
            seed_norm = seed.rstrip("/")
            if seed_norm in seen_urls:
                continue
            seen_urls.add(seed_norm)

            print(f"[INFO] Fetching seed: {seed}", file=sys.stderr)
            try:
                resp = client.get(seed, follow_redirects=True, timeout=15)
                resp.raise_for_status()
                html = resp.text
            except Exception as e:
                print(f"[WARN] Skipping seed {seed}: {e}", file=sys.stderr)
                continue

            title = _page_title(html, seed)
            text = _extract_text(html)[:PAGE_CHAR_LIMIT]
            section_lines = [f"## {title}", "", text, ""]

            # Collect sub-links
            sub_links = _collect_sub_links(html, seed)
            unique_sub = []
            for lnk in sub_links:
                if lnk not in seen_urls:
                    seen_urls.add(lnk)
                    unique_sub.append(lnk)

            for sub_url in unique_sub:
                print(f"[INFO]   -> sub-page: {sub_url}", file=sys.stderr)
                sub_title, sub_text = fetch_page(sub_url, client)
                if sub_text:
                    section_lines += [f"### {sub_title}", "", sub_text, ""]

            sections.append("\n".join(section_lines))

    header = (
        f"# Zoom Product Knowledge Base\n"
        f"_Last updated: {date.today().isoformat()}_\n\n"
    )
    return header + "\n---\n\n".join(sections)


def main():
    parser = argparse.ArgumentParser(description="Fetch Zoom KB for scoring agent")
    parser.add_argument("--dry-run", action="store_true", help="Print to stdout instead of writing file")
    args = parser.parse_args()

    kb = build_knowledge_base()

    if args.dry_run:
        print(kb)
    else:
        out = Path("prompts/zoom_knowledge.md")
        out.write_text(kb, encoding="utf-8")
        print(f"[OK] Written {len(kb):,} chars to {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
