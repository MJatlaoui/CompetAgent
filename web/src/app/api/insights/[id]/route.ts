import { NextRequest, NextResponse } from "next/server";
import { updateInsightStatus, updateInsightTags, getInsightById } from "@/lib/db";
import { writeToSheet } from "@/lib/sheets";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  if (body.status) {
    updateInsightStatus(id, body.status);

    if (body.status === "approved") {
      const insight = getInsightById(id);
      if (insight) {
        try {
          await writeToSheet(insight);
        } catch (e) {
          console.error("Google Sheets write failed:", e);
        }
      }
    }
  }

  if (body.tags) {
    updateInsightTags(id, body.tags);
  }

  const updated = getInsightById(id);
  return NextResponse.json({ insight: updated });
}
