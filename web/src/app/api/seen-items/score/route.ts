import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { createScoringPlaceholders } from "@/lib/db";

export async function POST(request: NextRequest) {
  const { ids } = await request.json();
  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: "ids must be a non-empty array" }, { status: 400 });

  try {
    const { created, skipped } = createScoringPlaceholders(ids);

    if (created.length > 0) {
      const rootDir = path.join(process.cwd(), "..");
      const child = spawn("python", ["-m", "src.score_items", "--ids", ...created, "--force"], {
        cwd: rootDir,
        detached: false,
        stdio: "ignore",
      });
      child.unref();
    }

    return NextResponse.json({ ok: true, queued: created.length, alreadyScored: skipped.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
