import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export async function POST() {
  try {
    const rootDir = path.join(process.cwd(), "..");
    const child = spawn("python", ["-m", "src.main"], {
      cwd: rootDir,
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
