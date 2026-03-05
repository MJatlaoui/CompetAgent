import Database from "better-sqlite3";
import path from "path";
import type { Insight, TrendPoint } from "./types";

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "..", "data", "seen.db");

function getDb() {
  return new Database(DB_PATH, { readonly: false });
}

function parseInsightRow(row: {
  id: string;
  item_id: string;
  insight_json: string;
  posted_at: string;
  status: string;
  tags: string;
}): Insight {
  const insight = JSON.parse(row.insight_json);
  return {
    id: row.id,
    itemId: row.item_id,
    headline: insight.headline || "",
    competitor: insight.competitor || "",
    classification: insight.classification || "",
    score: insight.score || 0,
    productFacts: insight.product_facts || [],
    strategicPrioritiesHit: insight.strategic_priorities_hit || [],
    competitiveGap: insight.competitive_gap || "",
    salesAngle: insight.sales_angle || "",
    sourceUrl: insight.source_url || "",
    worthSurfacing: insight.worth_surfacing || false,
    postedAt: row.posted_at,
    status: row.status as Insight["status"],
    tags: JSON.parse(row.tags || "[]"),
  };
}

export function getPendingInsights(): Insight[] {
  const db = getDb();
  try {
    const rows = db.prepare(
      "SELECT * FROM pending_insights WHERE status = 'pending' ORDER BY json_extract(insight_json, '$.score') DESC"
    ).all();
    return rows.map((r: any) => parseInsightRow(r));
  } finally {
    db.close();
  }
}

export function getAllInsights(filters?: {
  status?: string;
  competitor?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): { insights: Insight[]; total: number } {
  const db = getDb();
  try {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters?.status) {
      conditions.push("status = ?");
      params.push(filters.status);
    }
    if (filters?.competitor) {
      conditions.push("json_extract(insight_json, '$.competitor') = ?");
      params.push(filters.competitor);
    }
    if (filters?.search) {
      conditions.push("(insight_json LIKE ? OR json_extract(insight_json, '$.headline') LIKE ?)");
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const total = (db.prepare(`SELECT COUNT(*) as count FROM pending_insights ${where}`).get(...params) as { count: number }).count;
    const rows = db.prepare(
      `SELECT * FROM pending_insights ${where} ORDER BY posted_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    return {
      insights: rows.map((r: any) => parseInsightRow(r)),
      total,
    };
  } finally {
    db.close();
  }
}

export function updateInsightStatus(id: string, status: string): void {
  const db = getDb();
  try {
    db.prepare("UPDATE pending_insights SET status = ? WHERE id = ?").run(status, id);
  } finally {
    db.close();
  }
}

export function updateInsightTags(id: string, tags: string[]): void {
  const db = getDb();
  try {
    db.prepare("UPDATE pending_insights SET tags = ? WHERE id = ?").run(JSON.stringify(tags), id);
  } finally {
    db.close();
  }
}

export function getInsightById(id: string): Insight | null {
  const db = getDb();
  try {
    const row = db.prepare("SELECT * FROM pending_insights WHERE id = ?").get(id) as any;
    return row ? parseInsightRow(row) : null;
  } finally {
    db.close();
  }
}

export function getTrends(): TrendPoint[] {
  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT date(posted_at) as date,
             json_extract(insight_json, '$.competitor') as competitor,
             json_extract(insight_json, '$.classification') as classification,
             COUNT(*) as count
      FROM pending_insights
      GROUP BY date, competitor, classification
      ORDER BY date
    `).all();
    return rows.map((r: any) => ({
      date: r.date,
      competitor: r.competitor,
      classification: r.classification,
      count: r.count,
    }));
  } finally {
    db.close();
  }
}

export function getPendingCount(): number {
  const db = getDb();
  try {
    const result = db.prepare("SELECT COUNT(*) as count FROM pending_insights WHERE status = 'pending'").get() as { count: number };
    return result.count;
  } finally {
    db.close();
  }
}
