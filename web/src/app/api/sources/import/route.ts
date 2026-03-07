import { NextRequest, NextResponse } from "next/server";
import { addCompetitorSource, addIndustrySource, updateRefreshHours, getSources } from "@/lib/sources";

interface ParsedRow {
  type: string;
  name: string;
  feedType: string;
  feedUrl: string;
  category: string;
  tier: number;
  refreshHours: number | undefined;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return NextResponse.json({ error: "CSV is empty or has only a header row" }, { status: 400 });
    }

    // Validate header
    const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
    const expected = ["type", "name", "feed_type", "feed_url", "category", "tier", "refresh_hours"];
    const missing = expected.slice(0, 4).filter((col) => !header.includes(col));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `CSV missing required columns: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const idx = (col: string) => header.indexOf(col);

    const rows: ParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const fields = parseCsvLine(lines[i]);
      const type = fields[idx("type")]?.trim().toLowerCase();
      const name = fields[idx("name")]?.trim();
      const feedType = fields[idx("feed_type")]?.trim() || "rss";
      const feedUrl = fields[idx("feed_url")]?.trim();
      const category = fields[idx("category")]?.trim() || "General";
      const tierRaw = fields[idx("tier")]?.trim();
      const tier = tierRaw === "2" ? 2 : 1;
      const rhRaw = fields[idx("refresh_hours")]?.trim();
      const refreshHours = rhRaw ? Number(rhRaw) : undefined;

      if (!type || !name || !feedUrl) continue;
      if (!["competitor", "industry"].includes(type)) continue;

      rows.push({ type, name, feedType, feedUrl, category, tier, refreshHours });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid rows found in CSV" }, { status: 400 });
    }

    let added = 0;
    let skipped = 0;

    for (const row of rows) {
      try {
        if (row.type === "competitor") {
          const before = getSources().competitors.find((c) => c.name.toLowerCase() === row.name.toLowerCase());
          const hadFeed = before?.feeds.some((f) => f.url === row.feedUrl) ?? false;
          addCompetitorSource(row.name, row.feedUrl);
          if (row.refreshHours !== undefined) {
            updateRefreshHours("competitor", row.name, row.refreshHours);
          }
          if (!hadFeed) added++; else skipped++;
        } else {
          const before = getSources().industry.find((s) => s.name === row.name);
          const hadFeed = before?.feeds.some((f) => f.url === row.feedUrl) ?? false;
          addIndustrySource(row.name, row.category, row.tier as 1 | 2, row.feedUrl);
          if (row.refreshHours !== undefined) {
            updateRefreshHours("industry", row.name, row.refreshHours);
          }
          if (!hadFeed) added++; else skipped++;
        }
      } catch {
        skipped++;
      }
    }

    return NextResponse.json({ ok: true, added, skipped });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
