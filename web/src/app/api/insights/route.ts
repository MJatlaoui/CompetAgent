import { NextRequest, NextResponse } from "next/server";
import { getAllInsights, getPendingInsights } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view");
  const status = searchParams.get("status") || undefined;
  const competitor = searchParams.get("competitor") || undefined;
  const search = searchParams.get("search") || undefined;
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  if (view === "pending") {
    const insights = getPendingInsights();
    return NextResponse.json({ insights, total: insights.length });
  }

  const result = getAllInsights({ status, competitor, search, limit, offset });
  return NextResponse.json(result);
}
