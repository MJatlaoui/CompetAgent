import { NextResponse } from "next/server";
import { getSources } from "@/lib/sources";

function csvEscape(value: string | number | undefined): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET() {
  const { competitors, industry } = getSources();

  const rows: string[] = [
    "type,name,feed_type,feed_url,category,tier,refresh_hours",
  ];

  for (const src of competitors) {
    for (const feed of src.feeds) {
      rows.push(
        [
          csvEscape("competitor"),
          csvEscape(src.name),
          csvEscape(feed.type),
          csvEscape(feed.url),
          csvEscape(""),
          csvEscape(""),
          csvEscape(src.refresh_hours ?? ""),
        ].join(","),
      );
    }
  }

  for (const src of industry) {
    for (const feed of src.feeds) {
      rows.push(
        [
          csvEscape("industry"),
          csvEscape(src.name),
          csvEscape(feed.type),
          csvEscape(feed.url),
          csvEscape(src.category),
          csvEscape(src.tier),
          csvEscape(src.refresh_hours ?? ""),
        ].join(","),
      );
    }
  }

  const csv = rows.join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="sources.csv"`,
    },
  });
}
