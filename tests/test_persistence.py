import pytest
import json
from unittest.mock import patch, MagicMock, call

FAKE_CREDS = {
    "type": "service_account",
    "project_id": "test",
    "private_key_id": "key-id",
    "private_key": "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n",
    "client_email": "test@test.iam.gserviceaccount.com",
    "client_id": "123",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/test",
    "universe_domain": "googleapis.com",
}

SAMPLE_INSIGHT = {
    "classification": "FEATURE_LAUNCH",
    "score": 8,
    "competitor": "Five9",
    "headline": "Five9 launches native Salesforce CTI v3",
    "strategic_priorities_hit": ["Native Salesforce CRM integration"],
    "competitive_gap": "Direct threat to ZCC",
    "sales_angle": "Emphasize Zoom Einstein AI depth",
    "source_url": "https://five9.com/blog/post",
}


@pytest.fixture(autouse=True)
def mock_env(monkeypatch):
    monkeypatch.setenv("GOOGLE_CREDENTIALS_JSON", json.dumps(FAKE_CREDS))
    monkeypatch.setenv("GOOGLE_SHEET_ID", "fake-sheet-id")


def _make_mock_sheet(has_header=True):
    """Build a mock worksheet."""
    mock_ws = MagicMock()
    mock_ws.row_values.return_value = ["Headline"] if has_header else []
    return mock_ws


def test_write_to_battlecard_appends_row(monkeypatch):
    monkeypatch.setenv("GOOGLE_CREDENTIALS_JSON", json.dumps(FAKE_CREDS))
    monkeypatch.setenv("GOOGLE_SHEET_ID", "fake-sheet-id")

    mock_ws = _make_mock_sheet(has_header=True)

    import importlib
    import src.persistence as pm
    with patch("src.persistence.Credentials.from_service_account_info"), \
         patch("src.persistence.gspread.authorize") as mock_auth:
        mock_auth.return_value.open_by_key.return_value.sheet1 = mock_ws
        importlib.reload(pm)
        pm.write_to_battlecard(SAMPLE_INSIGHT)

    mock_ws.append_row.assert_called_once()
    row = mock_ws.append_row.call_args[0][0]
    assert row[0] == "Five9 launches native Salesforce CTI v3"   # Headline
    assert row[1] == "Five9"                                      # Competitor
    assert row[2] == "FEATURE_LAUNCH"                             # Type
    assert row[3] == 8                                            # Score
    assert row[4] == "https://five9.com/blog/post"                # Source URL
    assert row[7] == "Direct threat to ZCC"                       # Gap Analysis
    assert "Native Salesforce CRM integration" in row[8]          # Priorities


def test_write_to_battlecard_writes_header_when_sheet_empty(monkeypatch):
    monkeypatch.setenv("GOOGLE_CREDENTIALS_JSON", json.dumps(FAKE_CREDS))
    monkeypatch.setenv("GOOGLE_SHEET_ID", "fake-sheet-id")

    mock_ws = _make_mock_sheet(has_header=False)

    import importlib
    import src.persistence as pm
    with patch("src.persistence.Credentials.from_service_account_info"), \
         patch("src.persistence.gspread.authorize") as mock_auth:
        mock_auth.return_value.open_by_key.return_value.sheet1 = mock_ws
        importlib.reload(pm)
        pm.write_to_battlecard(SAMPLE_INSIGHT)

    # First call = header row, second call = data row
    assert mock_ws.append_row.call_count == 2
    header_row = mock_ws.append_row.call_args_list[0][0][0]
    assert header_row[0] == "Headline"
    assert header_row[3] == "Score"
