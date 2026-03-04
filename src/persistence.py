import json, os
import gspread
from google.oauth2.service_account import Credentials
from datetime import datetime, UTC

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

HEADERS = [
    "Headline", "Competitor", "Type", "Score", "Source URL",
    "Date Added", "Sales Angle", "Gap Analysis", "Priorities",
]


def _get_sheet():
    """Authenticate and return the first worksheet of the battlecard sheet."""
    creds_dict = json.loads(os.environ["GOOGLE_CREDENTIALS_JSON"])
    creds = Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
    gc = gspread.authorize(creds)
    return gc.open_by_key(os.environ["GOOGLE_SHEET_ID"]).sheet1


def write_to_battlecard(insight: dict):
    """Append an approved insight as a new row in the Google Sheet."""
    ws = _get_sheet()

    # Write header if sheet is empty
    if not ws.row_values(1):
        ws.append_row(HEADERS)

    row = [
        insight["headline"],
        insight["competitor"],
        insight["classification"],
        insight["score"],
        insight["source_url"],
        datetime.now(UTC).date().isoformat(),
        insight.get("sales_angle", ""),
        insight.get("competitive_gap", ""),
        ", ".join(insight.get("strategic_priorities_hit", [])),
    ]
    ws.append_row(row)
    print(f"[OK] Written to Google Sheet: {insight['headline']}")
