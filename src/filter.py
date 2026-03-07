"""Keyword pre-filter: skip Claude API call when content has no CCaaS/AI signal."""

SIGNAL_KEYWORDS = {
    "contact center", "ccaas", "cpaas", "ucaas", "ivr", "crm",
    "ai agent", "virtual agent", "salesforce", "five9", "genesys",
    "talkdesk", "nice", "avaya", "amazon connect", "workforce",
    "omnichannel", "chatbot", "voice ai", "llm", "claude", "openai",
    "zoom contact center", "zcc", "intelligent routing", "auto summary",
    "quality management", "workforce management", "wfm", "csat",
}

COMPETITOR_NAMES = {
    "genesys", "five9", "talkdesk", "nice", "avaya", "amazon connect",
    "ring central", "ringcentral", "cisco", "webex", "salesforce",
    "servicenow", "zendesk", "freshdesk", "8x8", "dialpad", "vonage",
    "twilio", "bandwidth", "sinch", "liveops", "ujet",
}


def is_worth_analyzing(item: dict) -> bool:
    """Return True if the item contains CCaaS/AI signal keywords."""
    text = (item["title"] + " " + item["summary"][:500]).lower()
    return any(kw in text for kw in SIGNAL_KEYWORDS)


def has_competitor_mention(item: dict) -> bool:
    """Return True if the item explicitly mentions a known competitor."""
    text = (item["title"] + " " + item["summary"][:500]).lower()
    return any(name in text for name in COMPETITOR_NAMES)
