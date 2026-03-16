import { NextRequest, NextResponse } from "next/server";
import { getSeenItems, getDistinctSources } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  if (searchParams.get("view") === "sources") {
    return NextResponse.json({ sources: getDistinctSources() });
  }

  const sourcesParam = searchParams.get("sources");
  const sources = sourcesParam ? sourcesParam.split(",").filter(Boolean) : undefined;
  const search = searchParams.get("search") || undefined;
  const limit = parseInt(searchParams.get("limit") || "100");
  const offset = parseInt(searchParams.get("offset") || "0");
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";

  const result = getSeenItems({ sources, search, limit, offset, sortDir });
  return NextResponse.json(result);
}
