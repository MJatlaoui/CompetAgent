import Database from "better-sqlite3";
import path from "path";
import type { Insight, TrendPoint, MetricsData, SeenItem } from "./types";

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
  cost_usd?: number;
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
    subScores: insight.sub_scores,
    heat: insight.heat,
    heatDelta: insight.heat_delta,
    sourceType: insight.source_type,
    costUsd: row.cost_usd ?? 0,
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
  classification?: string;
  from?: string;
  to?: string;
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
    if (filters?.classification) {
      conditions.push("json_extract(insight_json, '$.classification') = ?");
      params.push(filters.classification);
    }
    if (filters?.from) {
      conditions.push("posted_at >= ?");
      params.push(filters.from);
    }
    if (filters?.to) {
      conditions.push("posted_at <= ?");
      params.push(filters.to);
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

export function getReviewCount(): number {
  const db = getDb();
  try {
    const result = db.prepare("SELECT COUNT(*) as count FROM pending_insights WHERE status = 'review'").get() as { count: number };
    return result.count;
  } finally {
    db.close();
  }
}

export function getStats(): {
  total: number; pending: number; approved: number; review: number; discarded: number;
  topCompetitors: { competitor: string; count: number }[];
  avgScore: number;
  totalCostUsd: number;
} {
  const db = getDb();
  try {
    const counts = db.prepare(`
      SELECT status, COUNT(*) as count FROM pending_insights GROUP BY status
    `).all() as { status: string; count: number }[];
    const byStatus: Record<string, number> = {};
    counts.forEach((r) => { byStatus[r.status] = r.count; });

    const total = counts.reduce((s, r) => s + r.count, 0);
    const topCompetitors = db.prepare(`
      SELECT json_extract(insight_json, '$.competitor') as competitor, COUNT(*) as count
      FROM pending_insights GROUP BY competitor ORDER BY count DESC LIMIT 8
    `).all() as { competitor: string; count: number }[];

    const avgRow = db.prepare(`
      SELECT AVG(json_extract(insight_json, '$.score')) as avg FROM pending_insights
    `).get() as { avg: number };

    const costRow = db.prepare(`
      SELECT COALESCE(SUM(cost_usd), 0) as total FROM pending_insights
    `).get() as { total: number };

    return {
      total,
      pending: byStatus["pending"] || 0,
      approved: byStatus["approved"] || 0,
      review: byStatus["review"] || 0,
      discarded: byStatus["discarded"] || 0,
      topCompetitors,
      avgScore: Math.round((avgRow.avg || 0) * 10) / 10,
      totalCostUsd: costRow.total || 0,
    };
  } finally {
    db.close();
  }
}

export function getSeenItems(filters?: {
  sources?: string[];
  search?: string;
  limit?: number;
  offset?: number;
}): { items: SeenItem[]; total: number } {
  const db = getDb();
  try {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters?.sources && filters.sources.length > 0) {
      conditions.push(`competitor IN (${filters.sources.map(() => "?").join(",")})`);
      params.push(...filters.sources);
    }
    if (filters?.search) {
      conditions.push("(title LIKE ? OR url LIKE ?)");
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters?.limit || 100;
    const offset = filters?.offset || 0;

    const total = (db.prepare(`SELECT COUNT(*) as count FROM seen_items ${where}`).get(...params) as { count: number }).count;
    const rows = db.prepare(
      `SELECT * FROM seen_items ${where} ORDER BY seen_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as any[];

    return {
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        competitor: r.competitor,
        seenAt: r.seen_at,
      })),
      total,
    };
  } finally {
    db.close();
  }
}

export function getDistinctSources(): string[] {
  const db = getDb();
  try {
    const rows = db.prepare(
      "SELECT DISTINCT competitor FROM seen_items WHERE competitor IS NOT NULL ORDER BY competitor"
    ).all() as any[];
    return rows.map((r) => r.competitor);
  } finally {
    db.close();
  }
}

export function getAllSeenItems(): SeenItem[] {
  const db = getDb();
  try {
    const rows = db.prepare("SELECT * FROM seen_items ORDER BY seen_at DESC").all() as any[];
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      competitor: r.competitor,
      seenAt: r.seen_at,
    }));
  } finally {
    db.close();
  }
}

export function archiveAllPending(): number {
  const db = getDb();
  try {
    const result = db.prepare(
      "UPDATE pending_insights SET status = 'discarded' WHERE status = 'pending'"
    ).run();
    return result.changes;
  } finally {
    db.close();
  }
}

export function getSetting(key: string): string | null {
  const db = getDb();
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  try {
    db.prepare(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))"
    ).run(key, value);
  } finally {
    db.close();
  }
}

export function getLastSyncAt(): string | null {
  const db = getDb();
  try {
    const row = db.prepare(
      "SELECT MAX(last_fetched_at) as ts FROM source_fetch_log"
    ).get() as { ts: string | null };
    return row?.ts ?? null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export function getSourceFetchLog(): Record<string, string> {
  const db = getDb();
  try {
    const rows = db.prepare("SELECT source_name, last_fetched_at FROM source_fetch_log").all() as any[];
    const result: Record<string, string> = {};
    rows.forEach((r) => { result[r.source_name] = r.last_fetched_at; });
    return result;
  } catch {
    return {};
  } finally {
    db.close();
  }
}

export function getMetrics(): MetricsData {
  const db = getDb();
  try {
    const total = (db.prepare("SELECT COUNT(*) as count FROM pending_insights").get() as { count: number }).count;
    const analyses = (db.prepare("SELECT COUNT(*) as count FROM pending_insights WHERE status != 'discarded'").get() as { count: number }).count;
    const today = (db.prepare("SELECT COUNT(*) as count FROM pending_insights WHERE date(posted_at) = date('now')").get() as { count: number }).count;
    const saved = (db.prepare("SELECT COUNT(*) as count FROM pending_insights WHERE status = 'approved'").get() as { count: number }).count;
    const costRow = db.prepare("SELECT COALESCE(SUM(cost_usd), 0) as total FROM pending_insights").get() as { total: number };
    return { total, analyses, today, saved, totalCostUsd: costRow.total };
  } finally {
    db.close();
  }
}
