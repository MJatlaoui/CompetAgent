import { NextResponse } from "next/server";
import { getTrends } from "@/lib/db";

export async function GET() {
  const trends = getTrends();
  return NextResponse.json({ trends });
}
