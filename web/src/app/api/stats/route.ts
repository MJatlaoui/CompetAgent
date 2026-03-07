import { NextResponse } from "next/server";
import { getStats, getLastSyncAt } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = getStats();
  const lastSyncAt = getLastSyncAt();
  return NextResponse.json({ ...stats, lastSyncAt });
}
