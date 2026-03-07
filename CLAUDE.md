# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

CompetAgent is a competitive intelligence pipeline for the CCaaS (Contact Center as a Service) market, built for Zoom Contact Center. It:
1. Scrapes RSS feeds and HTML pages from competitor websites on a schedule
2. Runs each item through Claude Haiku to score and classify competitive signals
3. Stores insights in a SQLite DB (`data/seen.db`)
4. Surfaces high-score items to analysts via a Next.js web UI (and optionally Slack)
5. Lets analysts approve insights to a Google Sheets battlecard

## Commands

### Python backend
```bash
# Run ingestion (fetch, score, save)
python -m src.main

# Run approval checker
python -m src.approve

# Run all tests
pytest

# Run a single test file
pytest tests/test_main.py

# Run a single test
pytest tests/test_main.py::test_run_skips_low_score_items
```

### Web UI (Next.js in `web/`)
```bash
cd web
npm run dev        # dev server at localhost:3000
npm run build      # production build
npm run lint       # ESLint
```

## Architecture

### Data Flow
```
config/sources.yaml + config/industry_sources.yaml
  -> src/sources/ (RSS/HTML scrapers)
  -> src/intelligence.py (Claude Haiku scoring)
  -> data/seen.db (SQLite)
  -> web UI review queue
  -> src/persistence.py (Google Sheets battlecard)
```

### Python modules (`src/`)
- `main.py` — orchestrates ingestion: load sources, deduplicate via `seen_items` table, score unseen items, save high-score ones to `pending_insights`
- `sources/` — `SourceAdapter` protocol with RSS (`feedparser`) and HTML (`BeautifulSoup`) implementations; `__init__.py` dispatches based on `type` field in config
- `intelligence.py` — calls `claude-haiku-4-5` with `prompts/intel_filter.txt` as system prompt; returns structured JSON insight
- `database.py` — all SQLite operations; two tables: `seen_items` (dedup) and `pending_insights` (review queue with status + tags)
- `delivery.py` — optional Slack posting; only imported when `SLACK_ENABLED=true`
- `persistence.py` — Google Sheets write via `gspread`; called from web UI approval flow
- `approve.py` — thin CLI shim (approval now handled via web UI)

### Web UI (`web/src/`)
- Next.js 14 App Router with three pages: `/review` (pending queue), `/history` (all insights with filters), `/dashboard` (Recharts trend charts)
- `lib/db.ts` — reads the same `data/seen.db` via `better-sqlite3`; `DATABASE_PATH` env var overrides the default path (`../data/seen.db` relative to `web/`)
- `lib/sheets.ts` — calls Python-side Google Sheets write
- `app/api/insights/route.ts` — GET with optional `?view=pending`; PATCH on `[id]` for status/tag updates

### Config files
- `config/sources.yaml` — competitor RSS/HTML feeds (core competitors)
- `config/industry_sources.yaml` — industry publication feeds (merged at runtime)
- `config/strategy.yaml` — `score_threshold` (default 6) and strategic priorities list used in the system prompt context
- `prompts/intel_filter.txt` — full system prompt for Claude Haiku; defines classification types, scoring rubric, and required JSON output schema

### CI/CD (GitHub Actions)
- `ingest.yml` — runs every 2 hours; commits `data/seen.db` back to repo
- `approve_check.yml` — runs hourly; checks Slack reactions for approvals
- `validate_sources.yml` — validates `config/pending_sources.json` entries

## Key Environment Variables
| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Always | Claude Haiku for scoring |
| `SLACK_ENABLED` | No | Set to `"true"` to enable Slack posting |
| `SLACK_BOT_TOKEN` | If Slack enabled | Bot OAuth token |
| `SLACK_CHANNEL_ID` | If Slack enabled | Channel to post insights |
| `GOOGLE_CREDENTIALS_JSON` | For approval | Service account JSON (stringified) |
| `GOOGLE_SHEET_ID` | For approval | Battlecard spreadsheet ID |
| `DATABASE_PATH` | Web UI only | Override SQLite path (default: `../data/seen.db`) |

## Intelligence Output Schema
Claude Haiku must return JSON with these fields: `classification`, `score` (1-10), `competitor`, `headline`, `product_facts[]`, `strategic_priorities_hit[]`, `competitive_gap`, `sales_angle`, `source_url`, `worth_surfacing`. Items with `worth_surfacing=true` AND `score >= score_threshold` are saved.

Classifications: `TECHNICAL_SHIFT`, `FEATURE_LAUNCH`, `PRICING_CHANGE`, `PARTNERSHIP`, `MARKETING_NOISE`, `IRRELEVANT`.

## Testing Patterns
Tests use `monkeypatch` to redirect `DB_PATH` to a `tmp_path` for isolation. External calls (YAML loading, source fetching, Claude API, Slack) are mocked with `unittest.mock.patch`.
