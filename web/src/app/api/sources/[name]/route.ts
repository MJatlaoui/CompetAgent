import { NextRequest, NextResponse } from "next/server";
import { removeCompetitorSource, removeIndustrySource, updateRefreshHours, toggleSourceEnabled } from "@/lib/sources";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const decoded = decodeURIComponent(name);
    const { searchParams } = new URL(request.url);
    const sourceType = searchParams.get("type");

    if (sourceType === "competitor") {
      removeCompetitorSource(decoded);
    } else if (sourceType === "industry") {
      removeIndustrySource(decoded);
    } else {
      return NextResponse.json({ error: "type must be 'competitor' or 'industry'" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const decoded = decodeURIComponent(name);
    const { searchParams } = new URL(request.url);
    const sourceType = searchParams.get("type") as "competitor" | "industry";
    const body = await request.json();
    const refreshHours = Number(body.refresh_hours);

    if (!sourceType || !["competitor", "industry"].includes(sourceType)) {
      return NextResponse.json({ error: "type must be 'competitor' or 'industry'" }, { status: 400 });
    }
    if (body.refresh_hours !== undefined && (!Number.isFinite(refreshHours) || refreshHours < 0.25 || refreshHours > 72)) {
      return NextResponse.json({ error: "refresh_hours must be between 0.25 and 72" }, { status: 400 });
    }

    if (body.refresh_hours !== undefined) {
      updateRefreshHours(sourceType, decoded, refreshHours);
    }
    if (body.enabled !== undefined) {
      toggleSourceEnabled(sourceType, decoded, Boolean(body.enabled));
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
