import { NextRequest, NextResponse } from "next/server";
import { updateInsightStatus, updateInsightTags, getInsightById, updateSheetsSynced, updateInsightNotes } from "@/lib/db";
import { writeToSheet } from "@/lib/sheets";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  let sheetsError = false;

  if (body.status) {
    updateInsightStatus(id, body.status);

    if (body.status === "approved") {
      const insight = getInsightById(id);
      if (insight) {
        try {
          await writeToSheet(insight);
          updateSheetsSynced(id, true);
        } catch (e) {
          console.error("Google Sheets write failed:", e);
          updateSheetsSynced(id, false);
          sheetsError = true;
        }
      }
    }
  }

  if (body.tags) {
    updateInsightTags(id, body.tags);
  }

  if (body.notes !== undefined) {
    updateInsightNotes(id, body.notes);
  }

  // Handle retry of sheets sync
  if (body.retrySheets === true) {
    const insight = getInsightById(id);
    if (insight) {
      try {
        await writeToSheet(insight);
        updateSheetsSynced(id, true);
      } catch (e) {
        console.error("Google Sheets retry failed:", e);
        updateSheetsSynced(id, false);
        sheetsError = true;
      }
    }
  }

  const updated = getInsightById(id);
  return NextResponse.json({ insight: updated, sheetsError });
}
