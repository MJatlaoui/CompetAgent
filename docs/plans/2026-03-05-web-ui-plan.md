# CompetAgent Web UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Slack with a Next.js web UI for reviewing, triaging, and approving competitive intelligence insights.

**Architecture:** Next.js 14 App Router reads/writes the same SQLite database (`data/seen.db`) that the Python ingestion pipeline writes to. Google Sheets integration ported to TypeScript. Python side modified to save all scored insights (not just Slack-posted ones) with UUID keys.

**Tech Stack:** Next.js 14, shadcn/ui, Tailwind CSS, better-sqlite3, googleapis, Recharts

**Design doc:** `docs/plans/2026-03-05-web-ui-design.md`

---

## Task 1: Modify Python database layer (UUID keys + tags column)

**Files:**
- Modify: `src/database.py`
- Modify: `tests/test_database.py`

**Step 1: Write failing tests for new schema**

Add to `tests/test_database.py`:

```python
def test_save_pending_with_uuid():
    from src.database import init_db, save_pending, get_pending
    init_db()
    insight = {"headline": "Test insight", "score": 8}
    save_pending("item_abc", insight)
    rows = get_pending()
    assert len(rows) == 1
    uid, iid, ins = rows[0]
    assert len(uid) == 36  # UUID format
    assert iid == "item_abc"
    assert ins["headline"] == "Test insight"


def test_save_pending_generates_unique_ids():
    from src.database import init_db, save_pending, get_pending
    init_db()
    save_pending("item_1", {"score": 5})
    save_pending("item_2", {"score": 6})
    rows = get_pending()
    assert len(rows) == 2
    assert rows[0][0] != rows[1][0]  # different UUIDs


def test_update_status_with_uuid():
    from src.database import init_db, save_pending, get_pending, update_status
    init_db()
    save_pending("item_xyz", {"score": 9})
    rows = get_pending()
    uid = rows[0][0]
    update_status(uid, "approved")
    pending = get_pending()
    assert len(pending) == 0


def test_get_all_insights():
    from src.database import init_db, save_pending, get_all_insights, update_status
    init_db()
    save_pending("item_1", {"score": 5, "headline": "Low"})
    save_pending("item_2", {"score": 9, "headline": "High"})
    rows = get_all_insights()
    assert len(rows) == 2
    # Should include id, item_id, insight_json (parsed), posted_at, status, tags
    uid, iid, ins, posted_at, status, tags = rows[0]
    assert status == "pending"
    assert tags == []


def test_get_trends():
    from src.database import init_db, save_pending, get_trends
    init_db()
    save_pending("item_1", {"score": 5, "competitor": "Genesys", "classification": "FEATURE_LAUNCH"})
    save_pending("item_2", {"score": 9, "competitor": "Five9", "classification": "TECHNICAL_SHIFT"})
    trends = get_trends()
    assert len(trends) >= 1  # at least one day of data
```

**Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_database.py -v`
Expected: FAIL — `save_pending()` signature changed, `get_all_insights` and `get_trends` don't exist

**Step 3: Update `src/database.py`**

Replace the current `save_pending`, `get_pending`, `update_status` functions and add new ones:

```python
import sqlite3, json
import contextlib
from pathlib import Path
from datetime import datetime, UTC
from uuid import uuid4

DB_PATH = Path("data/seen.db")


def init_db():
    DB_PATH.parent.mkdir(exist_ok=True)
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS seen_items (
                id TEXT PRIMARY KEY,
                title TEXT,
                url TEXT,
                competitor TEXT,
                seen_at TEXT
            );
            CREATE TABLE IF NOT EXISTS pending_insights (
                id TEXT PRIMARY KEY,
                item_id TEXT,
                insight_json TEXT,
                posted_at TEXT,
                status TEXT DEFAULT 'pending',
                tags TEXT DEFAULT '[]'
            );
        """)


def is_seen(item_id: str) -> bool:
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        result = conn.execute("SELECT 1 FROM seen_items WHERE id=?", (item_id,)).fetchone()
    return result is not None


def mark_seen(item_id: str, title: str, url: str, competitor: str):
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute(
            "INSERT OR IGNORE INTO seen_items VALUES (?,?,?,?,?)",
            (item_id, title, url, competitor, datetime.now(UTC).isoformat()),
        )
        conn.commit()


def save_pending(item_id: str, insight: dict) -> str:
    """Save a scored insight. Returns the generated UUID."""
    uid = str(uuid4())
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute(
            "INSERT INTO pending_insights VALUES (?,?,?,?,?,?)",
            (uid, item_id, json.dumps(insight), datetime.now(UTC).isoformat(), "pending", "[]"),
        )
        conn.commit()
    return uid


def get_pending() -> list[tuple]:
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        rows = conn.execute(
            "SELECT id, item_id, insight_json FROM pending_insights WHERE status='pending'"
        ).fetchall()
    return [(uid, iid, json.loads(ij)) for uid, iid, ij in rows]


def update_status(uid: str, status: str):
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        conn.execute(
            "UPDATE pending_insights SET status=? WHERE id=?", (status, uid)
        )
        conn.commit()


def get_all_insights() -> list[tuple]:
    """Return all insights (all statuses) for the history view."""
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        rows = conn.execute(
            "SELECT id, item_id, insight_json, posted_at, status, tags FROM pending_insights ORDER BY posted_at DESC"
        ).fetchall()
    return [(uid, iid, json.loads(ij), posted_at, status, json.loads(tags))
            for uid, iid, ij, posted_at, status, tags in rows]


def get_trends() -> list[dict]:
    """Return daily counts grouped by competitor for the dashboard."""
    with contextlib.closing(sqlite3.connect(DB_PATH)) as conn:
        rows = conn.execute("""
            SELECT date(posted_at) as day,
                   json_extract(insight_json, '$.competitor') as competitor,
                   json_extract(insight_json, '$.classification') as classification,
                   COUNT(*) as count
            FROM pending_insights
            GROUP BY day, competitor, classification
            ORDER BY day
        """).fetchall()
    return [{"date": r[0], "competitor": r[1], "classification": r[2], "count": r[3]} for r in rows]
```

**Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_database.py -v`
Expected: PASS (may need to update old tests that use the 2-arg `save_pending(slack_ts, item_id, insight)` signature)

**Step 5: Fix existing tests that call old `save_pending` signature**

In `tests/test_database.py`, update these tests:
- `test_save_and_get_pending`: change `save_pending("12345.67890", "item_abc", insight)` to `save_pending("item_abc", insight)` and update assertions (UUID instead of "12345.67890")
- `test_update_status_approved`: change `save_pending("99.00", "item_xyz", {"score": 9})` to `save_pending("item_xyz", {"score": 9})` and fetch the UUID from `get_pending()`

**Step 6: Run full test suite**

Run: `python -m pytest tests/ -v`
Expected: Some failures in `test_main.py` and `test_approve.py` (they reference old `save_pending` signature) — those are fixed in Task 2.

**Step 7: Commit**

```bash
git add src/database.py tests/test_database.py
git commit -m "feat: migrate pending_insights to UUID keys with tags column"
```

---

## Task 2: Update Python main.py and approve.py for new schema

**Files:**
- Modify: `src/main.py`
- Modify: `src/approve.py`
- Modify: `tests/test_main.py`
- Modify: `tests/test_approve.py`

**Step 1: Update `src/main.py`**

Change the insight-saving logic to always save (not just when Slack posts), and make Slack optional:

```python
import os
import yaml
from pathlib import Path
from src.database import init_db, is_seen, mark_seen, save_pending
from src.sources import load_sources
from src.intelligence import analyze_item

INDUSTRY_SOURCES_PATH = "config/industry_sources.yaml"
SLACK_ENABLED = os.environ.get("SLACK_ENABLED", "").lower() == "true"


def run():
    init_db()

    with open("config/sources.yaml") as f:
        sources_cfg = yaml.safe_load(f)
    with open("config/strategy.yaml") as f:
        strategy_cfg = yaml.safe_load(f)

    industry_path = Path(INDUSTRY_SOURCES_PATH)
    if industry_path.exists():
        industry_data = yaml.safe_load(industry_path.read_text()) or {}
        for src in industry_data.get("industry_sources", []):
            sources_cfg["competitors"].append({
                "name": src["name"],
                "feeds": src["feeds"],
            })

    threshold = strategy_cfg.get("score_threshold", 7)
    items = load_sources(sources_cfg)
    print(f"[INFO] Fetched {len(items)} raw items across all sources")

    new_items = [i for i in items if not is_seen(i["id"])]
    print(f"[INFO] {len(new_items)} new (unseen) items to analyze")

    for item in new_items:
        mark_seen(item["id"], item["title"], item["url"], item["competitor"])

        insight = analyze_item(item)
        if not insight:
            continue

        score = insight.get("score", 0)
        worth_it = insight.get("worth_surfacing", False)

        print(f"[{item['competitor']}] Score {score} | {insight.get('classification')} | {item['title'][:60]}")

        if worth_it and score >= threshold:
            uid = save_pending(item["id"], insight)
            print(f"  -> Saved insight (id={uid})")

            if SLACK_ENABLED:
                from src.delivery import post_insight
                post_insight(insight)


if __name__ == "__main__":
    run()
```

**Step 2: Update `tests/test_main.py`**

Update the `save_pending` mock calls. The new `save_pending` takes 2 args `(item_id, insight)` instead of 3 `(slack_ts, item_id, insight)`. Also remove the `post_insight` mock requirement (Slack is now optional):

- In `test_run_posts_high_score_items_to_slack`: Replace `patch("src.main.post_insight", ...)` with `patch("src.main.save_pending", return_value="fake-uuid") as mock_save`. Assert `mock_save.assert_called_once()`.
- In `test_run_skips_low_score_items`: Remove the `post_insight` mock. Assert `save_pending` is not called (since score is below threshold).
- Keep `test_run_skips_already_seen_items` and `test_run_includes_industry_sources_when_file_exists` with minimal changes.

**Step 3: Update `src/approve.py`**

The approval workflow is now handled by the web UI, but keep this file for backward compatibility. Update it to use the new UUID-based `update_status`:

```python
from src.database import init_db, get_pending, update_status
from src.persistence import write_to_battlecard


def run():
    init_db()
    pending = get_pending()
    print(f"[INFO] {len(pending)} pending insights (use web UI to approve)")
    # This script is kept for CLI/batch approval if needed
    # Web UI handles approval via API routes


if __name__ == "__main__":
    run()
```

**Step 4: Run full test suite**

Run: `python -m pytest tests/ -v`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/main.py src/approve.py tests/test_main.py tests/test_approve.py
git commit -m "feat: save all scored insights to DB, make Slack optional"
```

---

## Task 3: Scaffold Next.js app

**Files:**
- Create: `web/` directory with Next.js scaffold

**Step 1: Initialize Next.js project**

```bash
cd C:\Users\Mehdi\Documents\GitHub\CompetAgent
npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir --no-import-alias
```

Answer prompts: Yes to Turbopack if asked. Use npm as package manager.

**Step 2: Install dependencies**

```bash
cd web
npm install better-sqlite3 googleapis recharts
npm install -D @types/better-sqlite3
```

**Step 3: Install shadcn/ui**

```bash
npx shadcn@latest init
```

Select: New York style, Neutral color, CSS variables = yes.

Then add needed components:

```bash
npx shadcn@latest add button card badge select input separator tabs
```

**Step 4: Verify dev server starts**

```bash
npm run dev
```

Expected: Server starts at http://localhost:3000

**Step 5: Commit**

```bash
cd ..
git add web/
git commit -m "feat: scaffold Next.js app with shadcn/ui"
```

---

## Task 4: Database and types library

**Files:**
- Create: `web/src/lib/types.ts`
- Create: `web/src/lib/db.ts`

**Step 1: Create TypeScript types**

Create `web/src/lib/types.ts`:

```typescript
export interface Insight {
  id: string;
  itemId: string;
  headline: string;
  competitor: string;
  classification: string;
  score: number;
  productFacts: string[];
  strategicPrioritiesHit: string[];
  competitiveGap: string;
  salesAngle: string;
  sourceUrl: string;
  worthSurfacing: boolean;
  postedAt: string;
  status: "pending" | "approved" | "review" | "discarded";
  tags: string[];
}

export interface TrendPoint {
  date: string;
  competitor: string;
  classification: string;
  count: number;
}

export type InsightStatus = Insight["status"];
```

**Step 2: Create database wrapper**

Create `web/src/lib/db.ts`:

```typescript
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

    const total = db.prepare(`SELECT COUNT(*) as count FROM pending_insights ${where}`).get(...params) as { count: number };
    const rows = db.prepare(
      `SELECT * FROM pending_insights ${where} ORDER BY posted_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    return {
      insights: rows.map((r: any) => parseInsightRow(r)),
      total: total.count,
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
```

**Step 3: Verify TypeScript compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors (or only unrelated Next.js scaffold warnings)

**Step 4: Commit**

```bash
git add web/src/lib/
git commit -m "feat: add TypeScript DB wrapper and types"
```

---

## Task 5: API Routes

**Files:**
- Create: `web/src/app/api/insights/route.ts`
- Create: `web/src/app/api/insights/[id]/route.ts`
- Create: `web/src/app/api/trends/route.ts`

**Step 1: Create GET /api/insights**

Create `web/src/app/api/insights/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAllInsights, getPendingInsights } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view"); // "pending" or "all"
  const status = searchParams.get("status") || undefined;
  const competitor = searchParams.get("competitor") || undefined;
  const search = searchParams.get("search") || undefined;
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  if (view === "pending") {
    const insights = getPendingInsights();
    return NextResponse.json({ insights, total: insights.length });
  }

  const result = getAllInsights({ status, competitor, search, limit, offset });
  return NextResponse.json(result);
}
```

**Step 2: Create PATCH /api/insights/[id]**

Create `web/src/app/api/insights/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { updateInsightStatus, updateInsightTags, getInsightById } from "@/lib/db";
import { writeToSheet } from "@/lib/sheets";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  if (body.status) {
    updateInsightStatus(id, body.status);

    // If approved, write to Google Sheets
    if (body.status === "approved") {
      const insight = getInsightById(id);
      if (insight) {
        try {
          await writeToSheet(insight);
        } catch (e) {
          console.error("Google Sheets write failed:", e);
          // Don't fail the status update if Sheets write fails
        }
      }
    }
  }

  if (body.tags) {
    updateInsightTags(id, body.tags);
  }

  const updated = getInsightById(id);
  return NextResponse.json({ insight: updated });
}
```

**Step 3: Create GET /api/trends**

Create `web/src/app/api/trends/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getTrends } from "@/lib/db";

export async function GET() {
  const trends = getTrends();
  return NextResponse.json({ trends });
}
```

**Step 4: Commit**

```bash
git add web/src/app/api/
git commit -m "feat: add API routes for insights and trends"
```

---

## Task 6: Google Sheets TypeScript port

**Files:**
- Create: `web/src/lib/sheets.ts`

**Step 1: Create sheets.ts**

```typescript
import { google } from "googleapis";
import type { Insight } from "./types";

const HEADERS = [
  "Headline", "Competitor", "Type", "Score", "Source URL",
  "Date Added", "Sales Angle", "Gap Analysis", "Priorities",
];

function getAuth() {
  const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON || "{}");
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export async function writeToSheet(insight: Insight): Promise<void> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    console.warn("[WARN] GOOGLE_SHEET_ID not set, skipping Sheets write");
    return;
  }

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // Check if header row exists
  const headerCheck = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "Sheet1!A1:I1",
  });

  if (!headerCheck.data.values || headerCheck.data.values.length === 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "Sheet1!A1",
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS] },
    });
  }

  const row = [
    insight.headline,
    insight.competitor,
    insight.classification,
    insight.score,
    insight.sourceUrl,
    new Date().toISOString().split("T")[0],
    insight.salesAngle,
    insight.competitiveGap,
    insight.strategicPrioritiesHit.join(", "),
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: "Sheet1!A1",
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  });

  console.log(`[OK] Written to Google Sheet: ${insight.headline}`);
}
```

**Step 2: Commit**

```bash
git add web/src/lib/sheets.ts
git commit -m "feat: port Google Sheets write to TypeScript"
```

---

## Task 7: Layout and navigation

**Files:**
- Modify: `web/src/app/layout.tsx`
- Create: `web/src/app/page.tsx` (redirect)
- Create: `web/src/components/Sidebar.tsx`

**Step 1: Create Sidebar component**

Create `web/src/components/Sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/review", label: "Review Queue", icon: "inbox" },
  { href: "/history", label: "History", icon: "clock" },
  { href: "/dashboard", label: "Dashboard", icon: "chart" },
];

const ICONS: Record<string, string> = {
  inbox: "\u{1F4E5}",
  clock: "\u{1F552}",
  chart: "\u{1F4CA}",
};

export function Sidebar({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r bg-gray-50 p-4 flex flex-col gap-1">
      <h1 className="text-lg font-bold mb-4">CompetAgent</h1>
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-md text-sm",
            pathname === item.href
              ? "bg-gray-200 font-medium"
              : "hover:bg-gray-100"
          )}
        >
          <span>{ICONS[item.icon]}</span>
          <span>{item.label}</span>
          {item.href === "/review" && pendingCount > 0 && (
            <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
              {pendingCount}
            </span>
          )}
        </Link>
      ))}
    </aside>
  );
}
```

**Step 2: Update layout.tsx**

Replace `web/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { getPendingCount } from "@/lib/db";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CompetAgent",
  description: "Competitive Intelligence Review",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pendingCount = getPendingCount();

  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex h-screen">
          <Sidebar pendingCount={pendingCount} />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
```

**Step 3: Create root page (redirect)**

Replace `web/src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/review");
}
```

**Step 4: Verify layout renders**

Run: `cd web && npm run dev`
Navigate to http://localhost:3000 — should redirect to /review with sidebar visible.

**Step 5: Commit**

```bash
git add web/src/app/layout.tsx web/src/app/page.tsx web/src/components/Sidebar.tsx
git commit -m "feat: add sidebar layout with navigation"
```

---

## Task 8: InsightCard component

**Files:**
- Create: `web/src/components/InsightCard.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Insight } from "@/lib/types";

const CLASSIFICATION_EMOJI: Record<string, string> = {
  TECHNICAL_SHIFT: "\u{1F527}",
  FEATURE_LAUNCH: "\u{1F680}",
  PRICING_CHANGE: "\u{1F4B0}",
  PARTNERSHIP: "\u{1F91D}",
  MARKETING_NOISE: "\u{1F4E2}",
  IRRELEVANT: "\u{1F5D1}",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-200 text-gray-800",
  approved: "bg-green-100 text-green-800",
  review: "bg-yellow-100 text-yellow-800",
  discarded: "bg-red-100 text-red-800",
};

interface InsightCardProps {
  insight: Insight;
  showActions?: boolean;
  onStatusChange?: (id: string, status: string) => void;
}

export function InsightCard({ insight, showActions = true, onStatusChange }: InsightCardProps) {
  const emoji = CLASSIFICATION_EMOJI[insight.classification] || "\u{1F4CC}";
  const scoreBar = "\u2588".repeat(insight.score) + "\u2591".repeat(10 - insight.score);

  return (
    <Card className="p-4 mb-3">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{emoji}</span>
          <span className="font-semibold">{insight.competitor}</span>
          <Badge variant="outline">{insight.classification}</Badge>
          <Badge className={STATUS_COLORS[insight.status]}>{insight.status}</Badge>
        </div>
        <span className="text-sm font-mono text-gray-500">
          {insight.score}/10 {scoreBar}
        </span>
      </div>

      <h3 className="font-medium mb-2">{insight.headline}</h3>

      {insight.productFacts.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase">Product Facts</p>
          <ul className="text-sm list-disc list-inside">
            {insight.productFacts.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-sm mb-2">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase">Competitive Gap</p>
          <p>{insight.competitiveGap}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase">Sales Angle</p>
          <p>{insight.salesAngle}</p>
        </div>
      </div>

      {insight.strategicPrioritiesHit.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase">Priorities Hit</p>
          <div className="flex gap-1 flex-wrap">
            {insight.strategicPrioritiesHit.map((p, i) => (
              <Badge key={i} variant="secondary" className="text-xs">{p}</Badge>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-3">
        <a
          href={insight.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:underline"
        >
          Read original
        </a>

        {showActions && insight.status === "pending" && onStatusChange && (
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              onClick={() => onStatusChange(insight.id, "approved")}
            >
              Important
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-yellow-500 text-yellow-700 hover:bg-yellow-50"
              onClick={() => onStatusChange(insight.id, "review")}
            >
              Need to Review
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-400 text-red-600 hover:bg-red-50"
              onClick={() => onStatusChange(insight.id, "discarded")}
            >
              Discard
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
```

**Step 2: Commit**

```bash
git add web/src/components/InsightCard.tsx
git commit -m "feat: add InsightCard component with triage actions"
```

---

## Task 9: Review Queue page

**Files:**
- Create: `web/src/app/review/page.tsx`

**Step 1: Create review page**

```tsx
"use client";

import { useEffect, useState } from "react";
import { InsightCard } from "@/components/InsightCard";
import type { Insight } from "@/lib/types";

export default function ReviewPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchPending() {
    const res = await fetch("/api/insights?view=pending");
    const data = await res.json();
    setInsights(data.insights);
    setLoading(false);
  }

  useEffect(() => {
    fetchPending();
  }, []);

  async function handleStatusChange(id: string, status: string) {
    await fetch(`/api/insights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    // Remove from list after action
    setInsights((prev) => prev.filter((i) => i.id !== id));
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">
        Review Queue
        {insights.length > 0 && (
          <span className="text-sm font-normal text-gray-500 ml-2">
            ({insights.length} pending)
          </span>
        )}
      </h2>

      {insights.length === 0 ? (
        <p className="text-gray-500">No pending insights to review.</p>
      ) : (
        insights.map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            onStatusChange={handleStatusChange}
          />
        ))
      )}
    </div>
  );
}
```

**Step 2: Verify page renders**

Run dev server, navigate to http://localhost:3000/review. Should show "No pending insights" (or real data if DB has entries).

**Step 3: Commit**

```bash
git add web/src/app/review/
git commit -m "feat: add review queue page with triage actions"
```

---

## Task 10: History page

**Files:**
- Create: `web/src/app/history/page.tsx`

**Step 1: Create history page**

```tsx
"use client";

import { useEffect, useState } from "react";
import { InsightCard } from "@/components/InsightCard";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { Insight } from "@/lib/types";

const STATUSES = ["all", "pending", "approved", "review", "discarded"];

export default function HistoryPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [offset, setOffset] = useState(0);
  const limit = 20;

  async function fetchInsights() {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status !== "all") params.set("status", status);
    if (search) params.set("search", search);

    const res = await fetch(`/api/insights?${params}`);
    const data = await res.json();
    setInsights(data.insights);
    setTotal(data.total);
    setLoading(false);
  }

  useEffect(() => {
    fetchInsights();
  }, [status, offset]);

  function handleSearch() {
    setOffset(0);
    fetchInsights();
  }

  async function handleStatusChange(id: string, newStatus: string) {
    await fetch(`/api/insights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchInsights();
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">History</h2>

      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Search insights..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="max-w-sm"
        />
        <Button variant="outline" onClick={handleSearch}>Search</Button>
        <Select value={status} onValueChange={(v) => { setStatus(v); setOffset(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-sm text-gray-500 mb-3">{total} total insights</p>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : insights.length === 0 ? (
        <p className="text-gray-500">No insights found.</p>
      ) : (
        <>
          {insights.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              showActions={insight.status === "pending"}
              onStatusChange={handleStatusChange}
            />
          ))}
          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add web/src/app/history/
git commit -m "feat: add history page with search and filters"
```

---

## Task 11: Dashboard page with charts

**Files:**
- Create: `web/src/app/dashboard/page.tsx`

**Step 1: Create dashboard page**

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { TrendPoint } from "@/lib/types";

const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#9333ea", "#0891b2"];

export default function DashboardPage() {
  const [trends, setTrends] = useState<TrendPoint[]>([]);

  useEffect(() => {
    fetch("/api/trends")
      .then((r) => r.json())
      .then((d) => setTrends(d.trends));
  }, []);

  // Group by date for the line chart (one line per competitor)
  const competitors = [...new Set(trends.map((t) => t.competitor))];
  const dates = [...new Set(trends.map((t) => t.date))].sort();

  const lineData = dates.map((date) => {
    const point: Record<string, any> = { date };
    competitors.forEach((comp) => {
      point[comp] = trends
        .filter((t) => t.date === date && t.competitor === comp)
        .reduce((sum, t) => sum + t.count, 0);
    });
    return point;
  });

  // Classification distribution
  const classificationMap: Record<string, number> = {};
  trends.forEach((t) => {
    classificationMap[t.classification] = (classificationMap[t.classification] || 0) + t.count;
  });
  const barData = Object.entries(classificationMap).map(([name, count]) => ({ name, count }));

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Dashboard</h2>

      {trends.length === 0 ? (
        <p className="text-gray-500">No data yet. Run an ingestion cycle first.</p>
      ) : (
        <>
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-2">Insights Over Time by Competitor</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                {competitors.map((comp, i) => (
                  <Line
                    key={comp}
                    type="monotone"
                    dataKey={comp}
                    stroke={COLORS[i % COLORS.length]}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-2">Classification Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add web/src/app/dashboard/
git commit -m "feat: add dashboard page with trend charts"
```

---

## Task 12: Environment config and .env.local

**Files:**
- Create: `web/.env.local`
- Create: `web/.env.example`
- Modify: `web/.gitignore`

**Step 1: Create .env.example**

```
DATABASE_PATH=../data/seen.db
GOOGLE_CREDENTIALS_JSON={"type":"service_account","project_id":"..."}
GOOGLE_SHEET_ID=your-sheet-id-here
```

**Step 2: Create .env.local with actual values**

Copy the real `GOOGLE_CREDENTIALS_JSON` and `GOOGLE_SHEET_ID` from GitHub Secrets (or ask the user to provide them).

```
DATABASE_PATH=../data/seen.db
GOOGLE_CREDENTIALS_JSON=<paste real value>
GOOGLE_SHEET_ID=your-sheet-id-here
```

**Step 3: Ensure .env.local is in .gitignore**

Verify `web/.gitignore` contains `.env.local` (Next.js scaffold includes this by default).

**Step 4: Commit**

```bash
git add web/.env.example
git commit -m "feat: add environment config for web app"
```

---

## Task 13: End-to-end smoke test

**Step 1: Ensure the Python DB has data**

Run the ingest workflow or manually insert test data:

```bash
cd C:\Users\Mehdi\Documents\GitHub\CompetAgent
python -c "
from src.database import init_db, save_pending
init_db()
save_pending('test-item-1', {
    'headline': 'Five9 launches AI agent',
    'competitor': 'Five9',
    'classification': 'FEATURE_LAUNCH',
    'score': 8,
    'product_facts': ['AI virtual agent for inbound calls', 'Integrates with Salesforce'],
    'strategic_priorities_hit': ['AI virtual agent or self-service IVR improvements'],
    'competitive_gap': 'Zoom lacks native AI agent capabilities',
    'sales_angle': 'Position Zoom AI Companion as alternative',
    'source_url': 'https://five9.com/blog/ai-agent',
    'worth_surfacing': True,
})
print('Test insight inserted')
"
```

**Step 2: Start the web app**

```bash
cd web
npm run dev
```

**Step 3: Verify each page**

1. http://localhost:3000 → redirects to /review
2. /review → shows the test insight card with Important/Need to Review/Discard buttons
3. Click "Important" → card disappears, insight written to Google Sheets
4. /history → shows the insight with status "approved"
5. /dashboard → shows one data point

**Step 4: Commit final state**

```bash
git add -A
git commit -m "feat: CompetAgent web UI complete - review, history, dashboard"
```

---

## Task 14: Update GitHub Actions workflow

**Files:**
- Modify: `.github/workflows/ingest.yml`

**Step 1: Remove SLACK_BOT_TOKEN requirement from ingest**

Since Slack is now optional, the ingest workflow no longer needs `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID` unless `SLACK_ENABLED=true`. Update the workflow env to not require them:

In `.github/workflows/ingest.yml`, change the env section for the "Run ingestion" step:
- Keep `ANTHROPIC_API_KEY`
- Keep `GOOGLE_CREDENTIALS_JSON` and `GOOGLE_SHEET_ID`
- Make Slack vars optional or remove them

**Step 2: Commit**

```bash
git add .github/workflows/ingest.yml
git commit -m "ci: make Slack optional in ingest workflow"
```
