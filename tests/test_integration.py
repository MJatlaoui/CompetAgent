"""
Integration tests — hit real network + real Claude API.

Run with:
    pytest tests/test_integration.py -v -m integration

These are skipped automatically when ANTHROPIC_API_KEY is missing or when
running in environments without network access (e.g. CI without the key).
"""
import os
import pytest

# ── markers ───────────────────────────────────────────────────────────────────

requires_network = pytest.mark.skipif(
    os.environ.get("CI") == "true" and not os.environ.get("ANTHROPIC_API_KEY"),
    reason="Network tests skipped in CI without API key",
)

requires_api_key = pytest.mark.skipif(
    not os.environ.get("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set",
)

pytestmark = pytest.mark.integration


# ── 1. RSS fetch ───────────────────────────────────────────────────────────────

@requires_network
def test_rss_feed_returns_articles():
    """Verify that the RSS adapter can fetch and normalise real articles."""
    from src.sources.rss import RSSAdapter

    # voicebot.ai — tier-1 Conversational AI source in industry_sources.yaml
    url = "https://voicebot.ai/feed/"
    items = RSSAdapter().fetch(url, "Voicebot.ai")

    assert len(items) > 0, "Expected at least one article from the feed"

    item = items[0]
    assert item.get("competitor") == "Voicebot.ai"
    assert item.get("title"), "Item must have a title"
    assert item.get("url", "").startswith("http"), "Item must have a valid URL"
    assert len(item.get("id", "")) == 16, "Item ID must be a 16-char hash"
    print(f"\n[OK] Fetched {len(items)} items. First: {item['title'][:80]}")


# ── 2. Scoring ─────────────────────────────────────────────────────────────────

@requires_api_key
def test_score_competitive_article():
    """
    Pass a realistic CCaaS competitor article through the full scoring pipeline
    and verify the returned insight conforms to the expected schema.
    """
    from src.intelligence import analyze_item

    item = {
        "competitor": "Genesys",
        "title": "Genesys Launches AI-Powered Agent Copilot for Real-Time Coaching",
        "url": "https://www.genesys.com/blog/ai-agent-copilot",
        "summary": (
            "Genesys today announced Agent Copilot, an AI assistant embedded directly "
            "into the agent desktop. The feature provides real-time suggested responses, "
            "sentiment alerts, and post-call summaries powered by large language models. "
            "It integrates natively with Genesys Cloud CX and is generally available "
            "starting Q2 2026, included at no extra cost on Elite plans."
        ),
        "published": "2026-03-07",
        "tier": 1,
    }

    insight, cost = analyze_item(item)

    assert insight is not None, "analyze_item returned None — API call may have failed"
    assert isinstance(cost, float) and cost > 0, "Expected a positive cost value"

    # Schema checks
    assert insight.get("classification") in {
        "TECHNICAL_SHIFT", "FEATURE_LAUNCH", "PRICING_CHANGE",
        "PARTNERSHIP", "MARKETING_NOISE", "IRRELEVANT",
    }, f"Unexpected classification: {insight.get('classification')}"

    score = insight.get("score")
    assert isinstance(score, int) and 1 <= score <= 10, f"Score out of range: {score}"

    assert isinstance(insight.get("product_facts"), list)
    assert isinstance(insight.get("strategic_priorities_hit"), list)
    assert isinstance(insight.get("worth_surfacing"), bool)

    print(
        f"\n[OK] classification={insight['classification']} "
        f"score={score} "
        f"worth_surfacing={insight['worth_surfacing']} "
        f"cost=${cost:.5f}"
    )
    print(f"     headline: {insight.get('headline', '')[:80]}")


# ── 3. End-to-end: fetch → score ───────────────────────────────────────────────

@requires_network
@requires_api_key
def test_fetch_then_score_pipeline():
    """
    Fetch a real article from a live RSS feed, then score it with Claude.
    Validates that the full fetch→score pipeline produces a valid insight.
    """
    from src.sources.rss import RSSAdapter
    from src.intelligence import analyze_item

    url = "https://voicebot.ai/feed/"
    items = RSSAdapter().fetch(url, "Voicebot.ai")
    assert items, "Feed returned no items"

    # Take the first item and score it
    item = {**items[0], "tier": 2}
    insight, cost = analyze_item(item)

    assert insight is not None, "Scoring returned None for a real article"
    assert 1 <= insight.get("score", 0) <= 10, "Score must be between 1 and 10"
    assert isinstance(insight.get("worth_surfacing"), bool)

    print(
        f"\n[OK] title={item['title'][:60]}\n"
        f"     score={insight['score']} "
        f"classification={insight['classification']} "
        f"cost=${cost:.5f}"
    )
