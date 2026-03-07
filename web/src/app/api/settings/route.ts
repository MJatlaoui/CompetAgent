import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });
  const value = getSetting(key);
  return NextResponse.json({ key, value });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { key, value } = body;
  if (!key || value === undefined) {
    return NextResponse.json({ error: "Missing key or value" }, { status: 400 });
  }
  setSetting(key, String(value));
  return NextResponse.json({ ok: true });
}
