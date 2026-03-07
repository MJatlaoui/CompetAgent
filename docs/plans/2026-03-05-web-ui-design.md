# CompetAgent Web UI Design

**Date:** 2026-03-05
**Status:** Approved

## Overview

Replace Slack as the review/approval interface with a Next.js web application. Google Sheets remains the battlecard output. The Python ingestion pipeline (GitHub Actions cron) stays unchanged except for writing insights to SQLite with UUID keys instead of Slack timestamps.

## Architecture

```
GitHub Actions (cron)           Next.js App (web/)
+--------------+                +-------------------------------+
| main.py      |                | React Pages                   |
|  fetch RSS   |                | /review    - triage queue     |
|  score items |--writes-->     | /history   - all insights     |
|  save to DB  |  SQLite        | /dashboard - trends charts    |
+--------------+  data/seen.db  |                               |
                                | API Routes (/api/*)           |
                                |  GET  /api/insights           |
                                |  PATCH /api/insights/:id      |
                                |  GET  /api/trends             |
                                |                               |
                                | SQLite (better-sqlite3)       |
                                | Google Sheets (googleapis)    |
                                +-------------------------------+
```

- **No Python runtime needed** for the web app
- SQLite (`data/seen.db`) is the shared interface between Python (writer) and Next.js (reader/writer)
- Google Sheets write ported to TypeScript using `googleapis` npm package

## Data Model

### `pending_insights` table (modified)

| Column       | Type | Notes                                    |
|-------------|------|------------------------------------------|
| id          | TEXT | UUID (PK), replaces slack_ts             |
| item_id     | TEXT | Links to seen_items                      |
| insight_json| TEXT | Full insight dict as JSON                 |
| posted_at   | TEXT | Ingestion timestamp                      |
| status      | TEXT | pending / approved / review / discarded  |
| tags        | TEXT | JSON array of tags (starred, follow-up)  |

### Status values

| UI Action       | Status value | Google Sheets |
|-----------------|-------------|---------------|
| Important       | approved    | Written       |
| Need to Review  | review      | Not written   |
| Discard         | discarded   | Not written   |

### Tags (additive, optional)

Tags are stored as a JSON array in the `tags` column. Can include: `starred`, `follow-up`, `archived`, or custom values. Tags provide extra labeling without changing the core approval workflow.

### `seen_items` table (unchanged)

Deduplication table. No changes needed.

## UI Pages

### 1. `/review` - Review Queue

- List of insight cards with status=`pending`, sorted by score (highest first)
- Each card displays: competitor name, classification emoji, headline, score bar (1-10), product facts, competitive gap, sales angle, source link
- Three action buttons per card: **Important** (green), **Need to Review** (yellow), **Discard** (red)
- Filter sidebar: competitor, classification type, score range
- Header badge showing pending item count

### 2. `/history` - All Insights

- Paginated table/list of all insights (all statuses)
- Search by keyword (headline, competitor, facts)
- Filter by: status, competitor, classification, date range, score range
- Click to expand full insight detail
- Ability to change status from this view

### 3. `/dashboard` - Trends

- Line chart: insight count over time (daily/weekly), grouped by competitor
- Bar chart: classification distribution
- Source breakdown: which feeds produce the most signal
- Date range picker
- Score distribution histogram

### Layout

- Sidebar navigation: Review Queue, History, Dashboard
- Header with pending count badge
- Responsive (works on mobile for quick triage)

## Tech Stack

| Layer          | Technology                    |
|----------------|-------------------------------|
| Framework      | Next.js 14 (App Router)       |
| UI Components  | shadcn/ui + Tailwind CSS      |
| Charts         | Recharts                      |
| Database       | better-sqlite3                |
| Google Sheets  | googleapis npm package        |
| State          | React Server Components + Server Actions |
| Package manager| npm                           |

## Directory Structure

```
web/
  src/
    app/
      layout.tsx          # Sidebar nav, header
      page.tsx            # Redirect to /review
      review/
        page.tsx          # Review queue
      history/
        page.tsx          # All insights
      dashboard/
        page.tsx          # Trends charts
      api/
        insights/
          route.ts        # GET (list), POST (not needed)
          [id]/
            route.ts      # PATCH (update status/tags)
        trends/
          route.ts        # GET (aggregated data)
    components/
      InsightCard.tsx     # Reusable insight display
      FilterSidebar.tsx   # Competitor/score/type filters
      TrendChart.tsx      # Recharts wrapper
      StatusBadge.tsx     # Colored status indicator
    lib/
      db.ts               # better-sqlite3 wrapper
      sheets.ts           # Google Sheets write (googleapis)
      types.ts            # TypeScript types for Insight, etc.
  package.json
  tailwind.config.ts
  tsconfig.json
```

## Python Changes

1. **`src/database.py`**: Change `save_pending()` to use `uuid4()` as the primary key instead of `slack_ts`
2. **`src/main.py`**: Always save scored insights to `pending_insights` (not just when posting to Slack). Remove the `post_insight()` call (or gate it behind `SLACK_ENABLED` env var)
3. **Slack delivery**: Keep `delivery.py` but make it optional. If `SLACK_ENABLED=true`, also post to Slack. Default: disabled.

## Google Sheets Port (Node.js)

Port `src/persistence.py` to `web/src/lib/sheets.ts`:
- Use `googleapis` package with `google.sheets('v4')`
- Auth via `GOOGLE_CREDENTIALS_JSON` env var (same service account)
- Same logic: ensure header row exists, append insight row
- Called from the PATCH API route when status changes to `approved`

## Deployment

- **Local**: `cd web && npm run dev` (reads from `../data/seen.db`)
- **Production**: deployment-agnostic. SQLite file can be replaced with a hosted DB later if needed.
- **Env vars**: `GOOGLE_CREDENTIALS_JSON`, `GOOGLE_SHEET_ID`, `DATABASE_PATH` (defaults to `../data/seen.db`)
