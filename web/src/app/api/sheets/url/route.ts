import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const url = sheetId
    ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit`
    : null;
  return NextResponse.json({ url });
}
