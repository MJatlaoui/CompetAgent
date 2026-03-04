import os
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

SLACK_TOKEN = os.environ["SLACK_BOT_TOKEN"]
SLACK_CHANNEL = os.environ["SLACK_CHANNEL_ID"]
client = WebClient(token=SLACK_TOKEN)

EMOJI_APPROVE = "white_check_mark"
EMOJI_DISCARD = "x"

CLASSIFICATION_EMOJI = {
    "TECHNICAL_SHIFT": "🔧",
    "FEATURE_LAUNCH": "🚀",
    "PRICING_CHANGE": "💰",
    "PARTNERSHIP": "🤝",
    "MARKETING_NOISE": "📢",
    "IRRELEVANT": "🗑️",
}


def post_insight(insight: dict) -> str | None:
    """Post a formatted insight card to Slack. Returns the message ts."""
    emoji = CLASSIFICATION_EMOJI.get(insight["classification"], "📌")
    score_bar = "█" * insight["score"] + "░" * (10 - insight["score"])

    facts = "\n".join(f"• {f}" for f in insight.get("product_facts", []))
    priorities = ", ".join(insight.get("strategic_priorities_hit", []))

    text = (
        f"{emoji} *{insight['competitor']}* — {insight['classification']} "
        f"| Score: `{insight['score']}/10` `{score_bar}`\n\n"
        f"*{insight['headline']}*\n\n"
        f"*Product facts:*\n{facts}\n\n"
        f"*Priorities:* {priorities}\n"
        f"*Competitive gap:* {insight['competitive_gap']}\n"
        f"*Sales angle:* {insight['sales_angle']}\n\n"
        f"<{insight['source_url']}|Read original>\n\n"
        f"React ✅ to add to Battlecard · ❌ to discard"
    )
    try:
        resp = client.chat_postMessage(channel=SLACK_CHANNEL, text=text, unfurl_links=False)
        return resp["ts"]
    except SlackApiError as e:
        print(f"[ERROR] Slack post failed: {e}")
        return None


def get_reactions(slack_ts: str) -> list[str]:
    """Return list of reaction names on a specific message."""
    try:
        resp = client.reactions_get(channel=SLACK_CHANNEL, timestamp=slack_ts)
        msg = resp["message"]
        return [r["name"] for r in msg.get("reactions", [])]
    except SlackApiError as e:
        print(f"[WARN] Could not fetch reactions for {slack_ts}: {e}")
        return []
