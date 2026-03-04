import os
from notion_client import Client
from datetime import datetime

notion = Client(auth=os.environ["NOTION_API_KEY"])
DATABASE_ID = os.environ["NOTION_DATABASE_ID"]


def write_to_battlecard(insight: dict):
    """Write an approved insight as a new row in the Notion battlecard database."""
    notion.pages.create(
        parent={"database_id": DATABASE_ID},
        properties={
            "Headline":    {"title": [{"text": {"content": insight["headline"]}}]},
            "Competitor":  {"select": {"name": insight["competitor"]}},
            "Type":        {"select": {"name": insight["classification"]}},
            "Score":       {"number": insight["score"]},
            "Source":      {"url": insight["source_url"]},
            "Date Added":  {"date": {"start": datetime.utcnow().date().isoformat()}},
            "Sales Angle": {"rich_text": [{"text": {"content": insight["sales_angle"]}}]},
            "Gap Analysis":{"rich_text": [{"text": {"content": insight["competitive_gap"]}}]},
            "Priorities":  {"multi_select": [
                {"name": p[:100]} for p in insight.get("strategic_priorities_hit", [])
            ]},
        }
    )
    print(f"[OK] Written to Notion battlecard: {insight['headline']}")
