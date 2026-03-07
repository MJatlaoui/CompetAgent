import { google } from "googleapis";
import type { Insight, SeenItem } from "./types";

const HEADERS = [
  "Headline", "Competitor", "Type", "Score", "Source URL",
  "Date Added", "Sales Angle", "Gap Analysis", "Priorities",
];

function getAuth() {
  const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON || "{}");
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export async function writeToSheet(insight: Insight): Promise<void> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    console.warn("[WARN] GOOGLE_SHEET_ID not set, skipping Sheets write");
    return;
  }

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const headerCheck = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "Sheet1!A1:I1",
  });

  if (!headerCheck.data.values || headerCheck.data.values.length === 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "Sheet1!A1",
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS] },
    });
  }

  const row = [
    insight.headline,
    insight.competitor,
    insight.classification,
    insight.score,
    insight.sourceUrl,
    new Date().toISOString().split("T")[0],
    insight.salesAngle,
    insight.competitiveGap,
    insight.strategicPrioritiesHit.join(", "),
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: "Sheet1!A1",
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  });

  console.log(`[OK] Written to Google Sheet: ${insight.headline}`);
}

export async function writeIngestedTab(items: SeenItem[]): Promise<void> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    console.warn("[WARN] GOOGLE_SHEET_ID not set, skipping Sheets write");
    return;
  }

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // Get existing sheet metadata to find or create the "Ingested" tab
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const existingSheet = meta.data.sheets?.find(
    (s) => s.properties?.title === "Ingested"
  );

  if (existingSheet) {
    // Clear existing content
    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: "Ingested",
    });
  } else {
    // Create the tab
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: "Ingested" } } }],
      },
    });
  }

  const headers = ["Title", "Competitor", "URL", "Seen At"];
  const rows = items.map((item) => [
    item.title,
    item.competitor,
    item.url,
    item.seenAt,
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: "Ingested!A1",
    valueInputOption: "RAW",
    requestBody: { values: [headers, ...rows] },
  });

  console.log(`[OK] Written ${items.length} ingested items to 'Ingested' tab`);
}
