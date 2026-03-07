import { NextResponse } from "next/server";
import { getSources } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UA = "Mozilla/5.0 (compatible; IntelBot/1.0)";

async function testUrl(url: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    return { ok: true, status: res.status };
  } catch (e: any) {
    const msg: string = e?.message ?? String(e);
    if (msg.includes("timed out") || msg.includes("abort")) return { ok: false, error: "Timed out" };
    if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) return { ok: false, error: "DNS failure" };
    if (msg.includes("ECONNREFUSED")) return { ok: false, error: "Connection refused" };
    return { ok: false, error: msg.slice(0, 80) };
  }
}

export async function GET() {
  const { competitors, industry } = getSources();

  type Task = { name: string; sourceType: "competitor" | "industry"; feedIndex: number; url: string };
  const tasks: Task[] = [];

  for (const src of competitors) {
    src.feeds.forEach((f, i) => tasks.push({ name: src.name, sourceType: "competitor", feedIndex: i, url: f.url }));
  }
  for (const src of industry) {
    src.feeds.forEach((f, i) => tasks.push({ name: src.name, sourceType: "industry", feedIndex: i, url: f.url }));
  }

  const settled = await Promise.allSettled(
    tasks.map((t) => testUrl(t.url).then((r) => ({ ...t, ...r })))
  );

  const results = settled.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { ...tasks[i], ok: false, error: "Test error" }
  );

  // Aggregate per-source: ok only if all feeds ok
  const byName: Record<string, { ok: boolean; feeds: { url: string; ok: boolean; status?: number; error?: string }[] }> = {};
  for (const r of results) {
    if (!byName[r.name]) byName[r.name] = { ok: true, feeds: [] };
    byName[r.name].feeds.push({ url: r.url, ok: r.ok, status: r.status, error: r.error });
    if (!r.ok) byName[r.name].ok = false;
  }

  return NextResponse.json({ results: byName });
}
