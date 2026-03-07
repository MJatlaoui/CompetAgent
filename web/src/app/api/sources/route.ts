import { NextRequest, NextResponse } from "next/server";
import { getSources, addCompetitorSource, addIndustrySource } from "@/lib/sources";
import { getSourceFetchLog } from "@/lib/db";

export async function GET() {
  try {
    const sources = getSources();
    const fetchLog = getSourceFetchLog();
    return NextResponse.json({ ...sources, fetchLog });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sourceType, name, feedUrl, category, tier } = body;

    if (!name || !feedUrl) {
      return NextResponse.json({ error: "name and feedUrl are required" }, { status: 400 });
    }

    if (sourceType === "competitor") {
      addCompetitorSource(name.trim(), feedUrl.trim());
    } else if (sourceType === "industry") {
      addIndustrySource(name.trim(), category?.trim() || "General", Number(tier) as 1 | 2, feedUrl.trim());
    } else {
      return NextResponse.json({ error: "sourceType must be 'competitor' or 'industry'" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
