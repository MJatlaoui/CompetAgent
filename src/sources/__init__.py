from .base import SourceAdapter
from .rss import RSSAdapter
from .html import HTMLAdapter

# Registry: maps `type:` value in sources.yaml to its adapter instance.
# To add a new source type, add one entry here and create the adapter file.
ADAPTERS: dict[str, SourceAdapter] = {
    "rss":  RSSAdapter(),
    "html": HTMLAdapter(),
}


def load_sources(config: dict) -> list[dict]:
    """Dispatch each feed entry in config to the appropriate adapter."""
    all_items: list[dict] = []
    for comp in config["competitors"]:
        name = comp["name"]
        tier = comp.get("tier", 1)
        for feed in comp["feeds"]:
            feed_type = feed["type"]
            adapter = ADAPTERS.get(feed_type)
            if adapter is None:
                print(f"[WARN] Unknown source type: {feed_type} — skipping")
                continue
            extra = {k: v for k, v in feed.items() if k not in ("type", "url")}
            items = adapter.fetch(feed["url"], name, **extra)
            for item in items:
                item["tier"] = tier
            all_items.extend(items)
    return all_items
