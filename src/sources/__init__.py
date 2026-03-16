from .base import SourceAdapter
from .rss import RSSAdapter
from .html import HTMLAdapter

# Registry: maps `type:` value in sources.yaml to its adapter instance.
# To add a new source type, add one entry here and create the adapter file.
ADAPTERS: dict[str, SourceAdapter] = {
    "rss":  RSSAdapter(),
    "html": HTMLAdapter(),
}


def load_sources(config: dict) -> tuple[list[dict], dict[str, str]]:
    """Dispatch each feed entry in config to the appropriate adapter.

    Returns (items, errors) where errors maps source_name -> error message
    for any source that failed to fetch.
    """
    all_items: list[dict] = []
    errors: dict[str, str] = {}

    for comp in config["competitors"]:
        name = comp["name"]
        tier = comp.get("tier", 1)
        source_errors: list[str] = []

        for feed in comp["feeds"]:
            feed_type = feed["type"]
            adapter = ADAPTERS.get(feed_type)
            if adapter is None:
                print(f"[WARN] Unknown source type: {feed_type} — skipping")
                continue
            extra = {k: v for k, v in feed.items() if k not in ("type", "url")}
            try:
                items = adapter.fetch(feed["url"], name, **extra)
                for item in items:
                    item["tier"] = tier
                all_items.extend(items)
            except Exception as e:
                msg = f"{feed['url']}: {e}"
                print(f"[ERROR] {name} — {msg}")
                source_errors.append(msg)

        if source_errors:
            errors[name] = "; ".join(source_errors)

    return all_items, errors
