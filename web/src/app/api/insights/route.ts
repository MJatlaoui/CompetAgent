import { NextRequest, NextResponse } from "next/server";
import { getAllInsights, getPendingInsights, archiveAllPending } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view");
  const status = searchParams.get("status") || undefined;
  const competitor = searchParams.get("competitor") || undefined;
  const search = searchParams.get("search") || undefined;
  const classification = searchParams.get("classification") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  if (view === "pending") {
    const result = getAllInsights({ status: "pending", competitor, search, classification, from, to, limit, offset });
    return NextResponse.json(result);
  }

  const result = getAllInsights({ status, competitor, search, classification, from, to, limit, offset });
  return NextResponse.json(result);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  if (body.action === "archive_all_pending") {
    const count = archiveAllPending();
    return NextResponse.json({ archived: count });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
