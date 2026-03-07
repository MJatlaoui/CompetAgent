import { NextResponse } from "next/server";
import { getAllSeenItems } from "@/lib/db";
import { writeIngestedTab } from "@/lib/sheets";

export async function POST() {
  try {
    const items = getAllSeenItems();
    await writeIngestedTab(items);
    return NextResponse.json({ ok: true, count: items.length });
  } catch (e: any) {
    console.error("Ingested export failed:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
