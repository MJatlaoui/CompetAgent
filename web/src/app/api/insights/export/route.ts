import { NextRequest, NextResponse } from "next/server";
import { getAllInsights } from "@/lib/db";

export const dynamic = "force-dynamic";

function escapeCsv(value: unknown): string {
  const str = String(value ?? "").replace(/"/g, '""');
  return `"${str}"`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const competitor = searchParams.get("competitor") || undefined;
  const classification = searchParams.get("classification") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const search = searchParams.get("search") || undefined;

  const { insights } = getAllInsights({
    status,
    competitor,
    classification,
    from,
    to,
    search,
    limit: 10000,
    offset: 0,
  });

  const headers = [
    "id", "competitor", "classification", "score", "headline",
    "productFacts", "competitiveGap", "salesAngle", "sourceUrl",
    "status", "tags", "postedAt"
  ];

  const rows = insights.map((i) => [
    escapeCsv(i.id),
    escapeCsv(i.competitor),
    escapeCsv(i.classification),
    escapeCsv(i.score),
    escapeCsv(i.headline),
    escapeCsv(i.productFacts.join("; ")),
    escapeCsv(i.competitiveGap),
    escapeCsv(i.salesAngle),
    escapeCsv(i.sourceUrl),
    escapeCsv(i.status),
    escapeCsv(i.tags.join("; ")),
    escapeCsv(i.postedAt),
  ].join(","));

  const csv = [headers.map(escapeCsv).join(","), ...rows].join("\r\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="insights-export.csv"`,
    },
  });
}
