import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import yaml from "js-yaml";
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
  sheets_synced?: number;
  notes?: string;
  updated_at?: string;
  updated_by?: string;
  auto_scored?: number;
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
    sheetsSynced: row.sheets_synced === 1,
    notes: row.notes || "",
    updatedAt: row.updated_at || undefined,
    updatedBy: row.updated_by || undefined,
    autoScored: (row as any).auto_scored === 1,
  };
}

export function updateInsightNotes(id: string, notes: string): void {
  const db = getDb();
  try {
    db.prepare("UPDATE pending_insights SET notes = ? WHERE id = ?").run(notes, id);
  } finally {
    db.close();
  }
}

export function updateSheetsSynced(id: string, synced: boolean): void {
  const db = getDb();
  try {
    db.prepare("UPDATE pending_insights SET sheets_synced = ? WHERE id = ?").run(synced ? 1 : 0, id);
  } finally {
    db.close();
  }
}

export function getPendingInsights(): Insight[] {
  const db = getDb();
  try {
    const rows = db.prepare(
      "SELECT * FROM pending_insights WHERE status IN ('pending', 'suggested', 'scoring') ORDER BY CASE WHEN status='scoring' THEN 0 ELSE 1 END, json_extract(insight_json, '$.score') DESC"
    ).all();
    return rows.map((r: any) => parseInsightRow(r));
  } finally {
    db.close();
  }
}

export function createScoringPlaceholders(ids: string[]): { created: string[]; skipped: string[] } {
  const db = getDb();
  try {
    const created: string[] = [];
    const skipped: string[] = [];
    for (const id of ids) {
      const existing = db.prepare(
        "SELECT status FROM pending_insights WHERE item_id=?"
      ).get(id) as { status: string } | undefined;

      if (existing) {
        if (existing.status === "scoring") {
          created.push(id); continue; // already has placeholder, Python will pick it up
        }
        if (existing.status === "discarded" || existing.status === "error") {
          // Reset so it can be re-scored
          db.prepare(
            "UPDATE pending_insights SET status='scoring', insight_json=?, posted_at=datetime('now') WHERE item_id=?"
          ).run(JSON.stringify({
            headline: "", competitor: "", score: 0, classification: "PENDING",
            worth_surfacing: false, product_facts: [], strategic_priorities_hit: [],
            competitive_gap: "", sales_angle: "", source_url: "",
          }), id);
          created.push(id); continue;
        }
        skipped.push(id); continue; // pending/approved/review/suggested → skip
      }
      const row = db.prepare(
        "SELECT title, competitor FROM seen_items WHERE id=?"
      ).get(id) as { title: string; competitor: string } | undefined;
      if (!row) { skipped.push(id); continue; }

      const uid = crypto.randomUUID();
      const insight = JSON.stringify({
        headline: row.title || "",
        competitor: row.competitor || "",
        score: 0,
        classification: "PENDING",
        worth_surfacing: false,
        product_facts: [],
        strategic_priorities_hit: [],
        competitive_gap: "",
        sales_angle: "",
        source_url: "",
      });
      db.prepare(
        "INSERT OR IGNORE INTO pending_insights (id, item_id, insight_json, posted_at, status, tags, cost_usd) VALUES (?,?,?,?,?,?,?)"
      ).run(uid, id, insight, new Date().toISOString(), "scoring", "[]", 0);
      created.push(id);
    }
    return { created, skipped };
  } finally {
    db.close();
  }
}

export function getAllInsights(filters?: {
  status?: string;
  statuses?: string[];
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

    if (filters?.statuses && filters.statuses.length > 0) {
      conditions.push(`status IN (${filters.statuses.map(() => "?").join(",")})`);
      params.push(...filters.statuses);
    } else if (filters?.status) {
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
      `SELECT * FROM pending_insights ${where} ORDER BY CASE WHEN status='scoring' THEN 0 ELSE 1 END, posted_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    return {
      insights: rows.map((r: any) => parseInsightRow(r)),
      total,
    };
  } finally {
    db.close();
  }
}

export function updateInsightStatus(id: string, status: string, updatedBy = "web-ui"): void {
  const db = getDb();
  try {
    db.prepare(
      "UPDATE pending_insights SET status = ?, updated_at = datetime('now'), updated_by = ? WHERE id = ?"
    ).run(status, updatedBy, id);
  } finally {
    db.close();
  }
}

export function updateInsightTags(id: string, tags: string[], updatedBy = "web-ui"): void {
  const db = getDb();
  try {
    db.prepare(
      "UPDATE pending_insights SET tags = ?, updated_at = datetime('now'), updated_by = ? WHERE id = ?"
    ).run(JSON.stringify(tags), updatedBy, id);
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
  total: number; pending: number; approved: number; review: number; discarded: number; suggested: number;
  topCompetitors: { competitor: string; count: number }[];
  avgScore: number;
  totalCostUsd: number;
  seenItemsCount: number;
  scoreDistribution: { score: number; count: number }[];
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

    const seenRow = db.prepare("SELECT COUNT(*) as count FROM seen_items").get() as { count: number };

    const scoreDistribution = db.prepare(`
      SELECT CAST(json_extract(insight_json, '$.score') AS INTEGER) as score,
             COUNT(*) as count
      FROM pending_insights
      WHERE json_extract(insight_json, '$.score') IS NOT NULL
      GROUP BY score ORDER BY score
    `).all() as { score: number; count: number }[];

    return {
      total,
      pending: byStatus["pending"] || 0,
      approved: byStatus["approved"] || 0,
      review: byStatus["review"] || 0,
      discarded: byStatus["discarded"] || 0,
      suggested: byStatus["suggested"] || 0,
      topCompetitors,
      avgScore: Math.round((avgRow.avg || 0) * 10) / 10,
      totalCostUsd: costRow.total || 0,
      seenItemsCount: seenRow.count,
      scoreDistribution,
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
  sortDir?: "asc" | "desc";
  sortBy?: "added" | "published";
}): { items: SeenItem[]; total: number } {
  const db = getDb();
  try {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters?.sources && filters.sources.length > 0) {
      conditions.push(`si.competitor IN (${filters.sources.map(() => "?").join(",")})`);
      params.push(...filters.sources);
    }
    if (filters?.search) {
      conditions.push("(si.title LIKE ? OR si.url LIKE ?)");
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const dir = filters?.sortDir === "asc" ? "ASC" : "DESC";
    const limit = filters?.limit || 100;
    const offset = filters?.offset || 0;

    const cols = (db.prepare("PRAGMA table_info(seen_items)").all() as any[]).map((c) => c.name);
    const hasPublishedAt = cols.includes("published_at");

    // Register a UDF that extracts YYYY-MM-DD from a URL path (e.g. tldr.tech/ai/2026-02-09).
    // This mirrors the frontend's getPublishedDate() so sort order matches displayed dates.
    db.function("url_date", (url: unknown) => {
      if (typeof url !== "string") return null;
      const m = url.match(/(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : null;
    });

    const orderExpr = filters?.sortBy === "published" && hasPublishedAt
      ? `COALESCE(si.published_at, url_date(si.url))`
      : `si.seen_at`;

    const total = (db.prepare(`SELECT COUNT(*) as count FROM seen_items si LEFT JOIN pending_insights pi ON si.id = pi.item_id ${where}`).get(...params) as { count: number }).count;
    const rows = db.prepare(
      `SELECT si.*, json_extract(pi.insight_json, '$.score') as score, pi.status as insight_status FROM seen_items si LEFT JOIN pending_insights pi ON si.id = pi.item_id ${where} ORDER BY ${orderExpr} ${dir}, si.id ASC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as any[];

    return {
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        competitor: r.competitor,
        seenAt: r.seen_at,
        publishedAt: hasPublishedAt ? (r.published_at ?? null) : null,
        score: r.score ?? null,
        insightStatus: r.insight_status ?? null,
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
      publishedAt: r.published_at ?? null,
    }));
  } finally {
    db.close();
  }
}

export function archiveAllPending(): number {
  const db = getDb();
  try {
    const result = db.prepare(
      "UPDATE pending_insights SET status = 'discarded' WHERE status IN ('pending', 'suggested')"
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

export function getSourceHealthLog(): Record<string, { lastError: string | null; lastErrorAt: string | null; consecutiveFailures: number }> {
  const db = getDb();
  try {
    const rows = db.prepare(
      "SELECT source_name, last_error, last_error_at, COALESCE(consecutive_failures, 0) as consecutive_failures FROM source_fetch_log"
    ).all() as any[];
    const result: Record<string, { lastError: string | null; lastErrorAt: string | null; consecutiveFailures: number }> = {};
    rows.forEach((r) => {
      result[r.source_name] = {
        lastError: r.last_error ?? null,
        lastErrorAt: r.last_error_at ?? null,
        consecutiveFailures: r.consecutive_failures,
      };
    });
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
    const pendingCount = (db.prepare(
      "SELECT COUNT(*) as count FROM pending_insights WHERE status = 'pending'"
    ).get() as { count: number }).count;

    const approvedThisWeek = (db.prepare(
      "SELECT COUNT(*) as count FROM pending_insights WHERE status = 'approved' AND posted_at >= datetime('now', '-7 days')"
    ).get() as { count: number }).count;

    const highSignalToday = (db.prepare(
      "SELECT COUNT(*) as count FROM pending_insights WHERE date(posted_at) = date('now') AND json_extract(insight_json, '$.score') >= 8"
    ).get() as { count: number }).count;

    // Load direct competitor names from sources.yaml to filter out industry sources
    let competitorNames: string[] = [];
    try {
      const sourcesPath = path.join(process.cwd(), "..", "config", "sources.yaml");
      const raw = yaml.load(fs.readFileSync(sourcesPath, "utf8")) as any;
      competitorNames = (raw?.competitors ?? []).map((c: any) => c.name as string);
    } catch { /* fall through — no filter applied if file unreadable */ }

    const topCompetitorRow = competitorNames.length > 0
      ? db.prepare(`
          SELECT json_extract(insight_json, '$.competitor') as competitor, COUNT(*) as count
          FROM pending_insights
          WHERE posted_at >= datetime('now', '-30 days')
            AND json_extract(insight_json, '$.competitor') IN (${competitorNames.map(() => "?").join(",")})
          GROUP BY competitor
          ORDER BY count DESC
          LIMIT 1
        `).get(...competitorNames) as { competitor: string; count: number } | undefined
      : db.prepare(`
          SELECT json_extract(insight_json, '$.competitor') as competitor, COUNT(*) as count
          FROM pending_insights
          WHERE posted_at >= datetime('now', '-30 days')
          GROUP BY competitor
          ORDER BY count DESC
          LIMIT 1
        `).get() as { competitor: string; count: number } | undefined;

    const costRow = db.prepare(
      "SELECT COALESCE(SUM(cost_usd), 0) as total FROM pending_insights"
    ).get() as { total: number };

    const inReview = (db.prepare(
      "SELECT COUNT(*) as count FROM pending_insights WHERE status = 'review'"
    ).get() as { count: number }).count;

    const newToday = (db.prepare(
      "SELECT COUNT(*) as c FROM seen_items WHERE date(seen_at) = date('now')"
    ).get() as { c: number }).c;

    let lastSyncAt: string | null = null;
    try {
      const syncRow = db.prepare(
        "SELECT MAX(last_fetched_at) as ts FROM source_fetch_log"
      ).get() as { ts: string | null };
      lastSyncAt = syncRow?.ts ?? null;
    } catch { /* table may not exist */ }

    return {
      pendingCount,
      approvedThisWeek,
      highSignalToday,
      topCompetitor: topCompetitorRow?.competitor || "—",
      topCompetitorCount: topCompetitorRow?.count || 0,
      totalCostUsd: costRow.total || 0,
      lastSyncAt,
      newToday,
      inReview,
    };
  } finally {
    db.close();
  }
}
