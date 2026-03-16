# CompetAgent

Automated competitive intelligence pipeline for **Zoom Contact Center** in the CCaaS (Contact Center as a Service) market. It scrapes competitor and industry sources every two hours, scores each article with Claude AI, and surfaces actionable signals to analysts through a web UI with optional Slack notifications and Google Sheets export.

---

## Table of Contents

1. [What it does](#what-it-does)
2. [Tech stack](#tech-stack)
3. [External services](#external-services)
4. [Architecture overview](#architecture-overview)
5. [Data flow — step by step](#data-flow--step-by-step)
6. [Scoring and review agent](#scoring-and-review-agent)
7. [Module reference](#module-reference)
8. [Database schema](#database-schema)
9. [Configuration files](#configuration-files)
10. [Environment variables](#environment-variables)
11. [CI/CD pipelines](#cicd-pipelines)
12. [Web UI pages and API routes](#web-ui-pages-and-api-routes)
13. [Running locally](#running-locally)
14. [Running tests](#running-tests)
15. [Known limitations](#known-limitations)

---

## What it does

1. **Fetches** RSS feeds and HTML pages from competitor websites and industry publications on a 2-hour schedule.
2. **Deduplicates** new items against a local SQLite database by item ID, normalized URL, and fuzzy title match.
3. **Pre-filters** tier-2 (industry) sources with keyword rules, then a cheap Claude title-only check, before spending tokens on full analysis.
4. **Scores** surviving items with Claude Haiku in batches of 5, producing a structured JSON insight: classification, 1–10 score, headline, product facts, strategic priorities hit, competitive gap, and sales angle.
5. **Stores** high-score insights in SQLite for review.
6. **Surfaces** insights in a Next.js web UI where analysts can approve, discard, tag, or re-score items.
7. **Exports** approved items to a Google Sheets battlecard and optionally posts to Slack.

---

## Tech stack

| Layer | Choice | Reason |
|---|---|---|
| **Ingestion runtime** | Python 3.11 | Mature ecosystem for RSS/HTTP parsing and the Anthropic SDK |
| **RSS parsing** | `feedparser` | Handles malformed XML, Atom and RSS 0.9–2.0, bozo detection |
| **HTML scraping** | `BeautifulSoup4` + `requests` | Simple selector-based scraping for sources without feeds |
| **AI scoring** | `anthropic` SDK — `claude-haiku-4-5` | Cheapest Claude model that reliably returns structured JSON; prompt caching cuts repeat costs by ~90 % |
| **Database** | SQLite (`data/seen.db`) | Zero-infrastructure; committed to git by CI so the web UI picks up changes without a separate DB server |
| **Web UI framework** | Next.js 14 (App Router) | Server components for DB reads, client components only where interactivity is needed |
| **DB access from Node** | `better-sqlite3` | Synchronous SQLite driver — fits Next.js server component model with no async overhead |
| **UI components** | shadcn/ui + Tailwind CSS | Accessible primitives with minimal custom CSS |
| **Charts** | Recharts | React-native; no separate chart server required |
| **Google Sheets** | `gspread` + `google-auth` | Service account auth; append-only writes to a shared battlecard |
| **Slack** | `slack_sdk` | Optional; gated by `SLACK_ENABLED=true` so the import never runs in CI unless enabled |
| **CI/CD** | GitHub Actions | Free for public repos; `workflow_dispatch` enables manual reruns |
| **Dependency management (Python)** | `requirements.txt` + pip | Kept simple; no Poetry/pyproject overhead for a script-style pipeline |
| **Testing** | `pytest` + `monkeypatch` | `tmp_path` DB isolation; all external calls mocked |

---

## External services

### Anthropic (Claude API)

- **Used by:** `src/intelligence.py`
- **Model:** `claude-haiku-4-5` for both the quick title filter and the full batch analysis.
- **Prompt caching:** The full system prompt (`prompts/intel_filter.txt`) is sent with `cache_control: ephemeral`. After the first call in a session, subsequent calls read the prompt from cache at $0.08/Mtok instead of $0.80/Mtok — roughly a 10x cost reduction on the largest token block.
- **Pricing constants** (defined in `intelligence.py`): `$0.80/Mtok` input, `$4.00/Mtok` output, `$1.00/Mtok` cache write, `$0.08/Mtok` cache read. These are used to compute per-insight `cost_usd` stored in the DB.
- **Required env var:** `ANTHROPIC_API_KEY`

### Slack (optional)

- **Used by:** `src/delivery.py` — only imported when `SLACK_ENABLED=true`.
- **What it does:** Posts a formatted insight card (classification, score bar, product facts, sales angle) to a channel. Reacting with ✅ or ❌ was the original approval flow; approval is now handled in the web UI instead.
- **Required env vars:** `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`

### Google Sheets (optional)

- **Used by:** `src/persistence.py` — called from the web UI approval API route.
- **What it does:** Appends one row per approved insight to a shared battlecard spreadsheet. Writes headers on first use if the sheet is empty.
- **Auth:** Service account JSON (`GOOGLE_CREDENTIALS_JSON`) with `spreadsheets` scope.
- **Required env vars:** `GOOGLE_CREDENTIALS_JSON` (stringified JSON), `GOOGLE_SHEET_ID`

### GitHub Actions

- Runs the ingestion pipeline every 2 hours, commits `data/seen.db` back to the repo, and runs source validation on config PRs. See [CI/CD pipelines](#cicd-pipelines).

---

## Architecture overview

```
config/sources.yaml
config/industry_sources.yaml        ← source definitions (URL, type, tier, refresh_hours)
config/strategy.yaml                ← score_threshold, strategic priorities list
prompts/intel_filter.txt            ← Claude system prompt (cached)

         src/main.py  ←  orchestrator
              │
    ┌─────────┴──────────┐
    │                    │
src/sources/          src/filter.py
  rss.py              (keyword + competitor
  html.py              mention pre-filter)
  __init__.py
    │                    │
    └─────────┬──────────┘
              │  new, non-duplicate items that pass keyword filter
              ▼
       src/intelligence.py
         quick_filter()     ← Stage 1: title-only Claude call (~$0.00005/item)
         analyze_batch()    ← Stage 2: batched full analysis (5 items/call)
              │
              ▼
       src/database.py      ← all SQLite reads/writes
         data/seen.db
              │
    ┌─────────┴─────────────────────┐
    │                               │
web/src/lib/db.ts            src/delivery.py (optional Slack)
(better-sqlite3, read-write)  src/persistence.py (Google Sheets)
    │
web/src/app/
  /review          ← pending queue
  /ingested        ← full seen_items feed
  /history         ← all insights with filters
  /dashboard       ← Recharts trend charts
  /sources         ← source health and on/off toggle
  /api/...         ← Next.js route handlers
```

---

## Data flow — step by step

### 1. Source loading (`src/main.py` → `src/sources/`)

`run()` in `main.py` reads `config/sources.yaml` and `config/industry_sources.yaml`, merges them into a single source list, then calls `load_sources()` from `src/sources/__init__.py`.

`load_sources()` dispatches each source to either `RSSAdapter.fetch()` or `HTMLAdapter.fetch()` based on the `type` field. Each adapter returns a list of `FeedItem` dicts:

```python
FeedItem = {
  "id": str,         # SHA-256[:16] of the item URL
  "competitor": str, # source name from config
  "title": str,
  "url": str,
  "summary": str,    # truncated to 2000 chars
  "published": str,  # ISO-8601; falls back to URL date, then now()
  "tier": int,       # 1 = direct competitor, 2 = industry publication
}
```

Sources with `disabled: true` in config are skipped entirely. Sources that haven't exceeded their `refresh_hours` window are also skipped (checked against `source_fetch_log` in the DB).

### 2. Deduplication (`src/database.py`)

Three dedup layers, applied in order:

- **Item ID:** SHA-256 of URL, checked against `seen_items.id`. Exact match only.
- **Normalized URL:** query params, fragments, `www.` prefix, and trailing slashes stripped. Catches the same article reposted by multiple aggregators within 30 days.
- **Fuzzy title:** `difflib.SequenceMatcher` ratio > 0.72 on noise-stripped titles (verbs like "announces", "launches", short words removed). Catches rephrased reposts within 14 days.

All new items are immediately written to `seen_items` via `mark_seen()` before any filtering, so even filtered-out items aren't re-evaluated on the next run.

### 3. Pre-filtering (`src/filter.py` + `src/intelligence.py`)

Applied to **tier-2 sources only** (tier-1 competitor sources go directly to Claude):

1. **`is_worth_analyzing()`** — keyword set match against `SIGNAL_KEYWORDS` (CCaaS terms, product names, AI terms). If no match: skip.
2. **`has_competitor_mention()`** — explicit competitor name match against `COMPETITOR_NAMES`. If no match: skip.
3. **`quick_filter()`** — single Claude call with `max_tokens=20`. Returns `{"relevant": true/false}`. Fails open (returns `True`) on any API error.

### 4. Batch analysis (`src/intelligence.py`)

Surviving items are grouped into batches of `BATCH_SIZE = 5` and sent to `analyze_batch()`. All 5 articles are packed into a single user message so the system prompt cache hit is shared across all items in the batch.

For a single item, the prompt is simplified (no "ARTICLE N:" prefix). For multiple items, Claude is instructed to return a JSON array with exactly N objects in order.

`_derive_fields()` injects metadata known without reading the article (competitor name, source URL, tier-mapped source type) so Claude doesn't need to reproduce it.

Claude must return the schema defined in `prompts/intel_filter.txt`:

```json
{
  "classification": "FEATURE_LAUNCH",
  "score": 8,
  "headline": "...",
  "product_facts": ["..."],
  "strategic_priorities_hit": ["..."],
  "competitive_gap": "...",
  "sales_angle": "...",
  "worth_surfacing": true,
  "sub_scores": {"f": 85, "n": 70, "a": 90, "d": 75, "s": 60},
  "heat": 82
}
```

Sub-scores: **f** = factuality, **n** = novelty, **a** = authority, **d** = depth, **s** = threat severity (each 0–100). **heat** is an overall urgency score combining novelty, threat severity, and recency.

### 5. Saving (`src/database.py`)

Items with `worth_surfacing = true` AND `score >= score_threshold` (default 3, set in `config/strategy.yaml`) are written to `pending_insights` via `save_pending()`. The full insight JSON is stored as a blob; individual fields are extracted at query time via SQLite's `json_extract()`.

### 6. Review and approval (Web UI + `src/persistence.py`)

The Next.js UI reads directly from `data/seen.db` using `better-sqlite3`. Analysts can:

- **Approve** → sets `status = 'approved'`, calls `write_to_battlecard()` via a Python subprocess or direct import
- **Discard** → sets `status = 'discarded'`
- **Flag for review** → sets `status = 'review'`
- **Tag** → stores a JSON array in `pending_insights.tags`
- **Re-score** → sends selected `seen_items` IDs to `/api/seen-items/score`, which calls `analyze_item()` and saves results

---

## Scoring and review agent

The scoring agent is the core intelligence layer. It runs in two distinct modes: **automated** (triggered by CI every 2 hours via `src/main.py`) and **on-demand** (triggered by an analyst selecting items in the Feed page and clicking "Score with Claude →").

Both modes ultimately call the same Claude Haiku functions in `src/intelligence.py`, but differ in how items are selected, how content is fetched, and what happens to the result.

---

### System prompt and scoring persona

All Claude calls use `prompts/intel_filter.txt` as the system prompt. It instructs Claude to act as a **senior competitive intelligence analyst at Zoom**, specializing in the CCaaS market.

The prompt defines:

**Strategic lens** — Zoom's five key differentiators that Claude uses as the evaluation baseline:
- Native Zoom platform integration
- Deep Salesforce partnership (Service Cloud Voice, Einstein AI)
- Zoom AI Companion (Expert Assist, Auto Summary, Quality Management)
- Zoom Virtual Agent (ZVA) for self-service routing
- Simpler deployment vs. legacy players (Genesys, NICE, Avaya)

**Classification** — Claude must assign exactly one of six labels:

| Label | When to use |
|---|---|
| `TECHNICAL_SHIFT` | New API, architecture change, or integration update — highest priority |
| `FEATURE_LAUNCH` | Real, generally-available new feature or major enhancement |
| `PRICING_CHANGE` | Packaging, licensing, or pricing model update |
| `PARTNERSHIP` | New integration partner or technology alliance |
| `MARKETING_NOISE` | Blog post, award, thought leadership with no new product substance |
| `IRRELEVANT` | Off-topic or unrelated to CCaaS/CRM/AI |

**Scoring rubric** — a 1–10 integer score based on competitive impact to Zoom:

| Score | Meaning |
|---|---|
| 9–10 | Direct threat to a Zoom differentiator, or a major gap opened |
| 7–8 | Relevant feature parity move or strategic partnership to respond to |
| 5–6 | Worth monitoring, no immediate action needed |
| 1–4 | Low signal, mostly noise |

**Sub-scores** — five 0–100 dimensions Claude evaluates per article:

| Key | Dimension | High when… |
|---|---|---|
| `f` | Factuality | Claims are specific and verifiable (version numbers, GA dates, pricing figures) |
| `n` | Novelty | Genuinely first announcement, not a repackaged capability |
| `a` | Authority | Official vendor press release or announcement |
| `d` | Depth | Long technical content with substantial detail |
| `s` | Threat Severity | Direct overlap with a named ZCC feature or differentiator |

**Heat** (0–100) — a single urgency score combining novelty, threat severity, and recency, left to Claude's judgment.

**`worth_surfacing`** — Claude sets this to `true` only when `score >= 7` AND classification is not `MARKETING_NOISE` or `IRRELEVANT`. It is the primary gate for whether an insight reaches the review queue.

**Knowledge base injection** — if `prompts/zoom_knowledge.md` exists, its content is prepended to the system prompt before the first call. This file contains Zoom-specific product context (fetched via `src/fetch_zoom_kb.py`) that keeps Claude's competitive framing current without modifying the core prompt.

---

### Prompt caching

The system prompt is large (~800 tokens including the knowledge base). To avoid paying full input price on every call, it is sent with `cache_control: {"type": "ephemeral"}` and the `anthropic-beta: prompt-caching-2024-07-31` header. After the first call in a session, subsequent calls read the prompt from the Anthropic cache at **$0.08/Mtok** instead of **$0.80/Mtok** — a ~10× cost reduction on the largest token block per call.

Cost constants used for per-insight `cost_usd` tracking:
```
Regular input:  $0.80 / 1M tokens
Output:         $4.00 / 1M tokens
Cache write:    $1.00 / 1M tokens
Cache read:     $0.08 / 1M tokens
```

At the end of each automated run, a cache efficiency summary is printed:
```
[CACHE] read=12,400 write=820 uncached=1,100 (88% cache-hit rate)
```

---

### Automated scoring pipeline (`src/main.py`)

This is the path taken when the CI job runs `python -m src.main` every 2 hours.

```
Fetch all due sources
        │
        ▼
 ┌─ For each new item ──────────────────────────────────────────┐
 │                                                              │
 │  1. mark_seen() — always written to seen_items               │
 │                                                              │
 │  2. URL dedup — skip if same normalized URL seen in 30 days  │
 │                                                              │
 │  3. Title dedup — skip if SequenceMatcher ratio > 0.72       │
 │     against titles seen in last 14 days                      │
 │                                                              │
 │  4. [Tier-2 only] Keyword filter — is_worth_analyzing()      │
 │     Checks for CCaaS/AI/product terms in title+summary       │
 │                                                              │
 │  5. [Tier-2 only] Competitor mention — has_competitor_mention()│
 │     At least one known competitor name in title+summary      │
 │                                                              │
 │  6. [Tier-2 only] Stage-1 AI filter — quick_filter()         │
 │     Single Claude call, max_tokens=20, no system prompt cache│
 │     Returns {"relevant": true/false}. Cost: ~$0.00005/item   │
 │     Fails open (returns True) on any API error               │
 │                                                              │
 │  [Tier-1 competitor sources skip steps 4–6 entirely]         │
 │                                                              │
 └──────────────────────────────────────────────────────────────┘
        │
        ▼  items that passed all filters
 ┌─ Batched Stage-2 analysis ───────────────────────────────────┐
 │                                                              │
 │  Group into batches of 5 (BATCH_SIZE)                        │
 │                                                              │
 │  For each batch → analyze_batch():                           │
 │    • Pack all articles into a single user message            │
 │    • Send with cached system prompt                          │
 │    • Claude returns a JSON array, one object per article     │
 │    • _derive_fields() injects competitor, source_url,        │
 │      source_type — metadata already known, not read by Claude│
 │    • cost split evenly across items in the batch             │
 │                                                              │
 │  For each insight:                                           │
 │    if worth_surfacing=true AND score >= threshold            │
 │      → save_pending() → status="pending"                     │
 │      → optionally post to Slack                              │
 │                                                              │
 └──────────────────────────────────────────────────────────────┘
        │
        ▼
 Auto-scoring second pass: run_auto_scoring()
 (see below)
```

**Tier-1 vs tier-2 treatment** — the two-stage filter only applies to industry publications (tier-2). Direct competitor sources (tier-1, e.g. Genesys Blog, Salesforce) bypass the keyword and quick-filter steps and go straight to batch analysis. The rationale: every post from a direct competitor is worth reading; for broad industry feeds, the pre-filter avoids paying for articles that have nothing to do with CCaaS or Zoom.

---

### Auto-scoring second pass (`run_auto_scoring` in `src/main.py`)

After the main pipeline finishes, a second pass runs automatically:

1. Fetches up to 50 `seen_items` from the last 7 days that have **no entry** in `pending_insights` (i.e. were never scored — typically items that were below threshold on first pass or came from sources not yet analyzed).
2. Sends them through `analyze_batch()` in batches of 5 using title only (no live content fetch).
3. Applies two configurable thresholds from the `settings` table:
   - `auto_inbox_threshold` (default **9**): score ≥ this → save as `status="suggested"` with `auto_scored=true`
   - `auto_discard_threshold` (default **4**): score < inbox threshold → save as `status="discarded"` with `auto_scored=true`

This pass is controlled by the `auto_scoring_enabled` setting (default `"true"`). It can be toggled off from the web UI settings without redeploying.

---

### On-demand scoring from the Feed page (`src/score_items.py`)

When an analyst selects items in `/ingested` and clicks **"Score with Claude →"**, a different code path runs:

```
Analyst selects items in /ingested
        │
        ▼
POST /api/seen-items/score  { ids: ["abc", "def", ...] }
        │
        ▼
createScoringPlaceholders(ids)  [web/src/lib/db.ts]
  • For each id:
    - Already scored (pending/approved/review/suggested) → skip
    - Has a "scoring" placeholder → keep (Python will pick it up)
    - Has a "discarded" or "error" entry → reset to "scoring"
    - No entry → INSERT into pending_insights with status="scoring",
      score=0, classification="PENDING"
  • Returns { created: [...], skipped: [...] }
        │
        ▼  created.length > 0
spawn("python", ["-m", "src.score_items", "--ids", ...created, "--force"])
  detached=false, stdio=ignore  ← runs in background, UI doesn't wait
        │
        ▼  API returns immediately: { ok: true, queued: N, alreadyScored: M }
  → UI redirects analyst to /review
```

The spawned Python process runs `score_items()`:

```
For each item_id:
  1. Fetch row from seen_items (title, url, competitor)
  2. Live content fetch via httpx — GET the article URL,
     strip <script>/<style>/<nav>/<footer> with BeautifulSoup,
     take first 2000 chars of body text
     Falls back to title only if fetch fails
  3. Call analyze_item() → analyze_batch([single item])
     (same Stage-2 Claude call as automated pipeline)
  4. Evaluate result:
     - insight is None → update placeholder to status="error"
     - score < threshold AND --force not set → update to status="discarded"
     - score < threshold AND --force set → update to status="suggested"
       (user explicitly requested it — show them regardless)
     - score >= threshold → update to status="pending"
       (or INSERT if no placeholder existed)
```

The `--force` flag is always passed by the web UI, so even low-scoring items land in the review queue as `suggested` rather than being silently discarded. This lets analysts see what Claude found without the threshold acting as a hard gate on manual review.

The "scoring" placeholder written before the Python process starts is what makes the Feed page show the pulsing `…` spinner in the Score column while the item is in-flight.

---

### Scoring decision matrix

| Trigger | Content source | Threshold gate | Result status |
|---|---|---|---|
| Automated pipeline (CI) | RSS/HTML summary (~2000 chars) | `score_threshold` (default 7) | `pending` |
| Auto-score second pass | Title only | `auto_inbox_threshold` (default 9) | `suggested` (auto_scored=true) |
| On-demand, score ≥ threshold | Live-fetched article body | `score_threshold` | `pending` |
| On-demand, score < threshold | Live-fetched article body | `score_threshold` (--force overrides) | `suggested` |
| On-demand, analysis fails | — | — | `error` |
| Already scored (any status) | — | — | skipped, not re-scored |

---

### Python backend (`src/`)

| File | Purpose | Key functions | Calls |
|---|---|---|---|
| `main.py` | Orchestrator: load → dedup → filter → score → save | `run(limit, dry_run, fresh)` | `sources/__init__.py`, `filter.py`, `intelligence.py`, `database.py`, `delivery.py` |
| `sources/__init__.py` | Dispatches sources to RSS or HTML adapter | `load_sources(cfg)` | `rss.py`, `html.py` |
| `sources/rss.py` | Fetches and parses RSS/Atom feeds | `RSSAdapter.fetch()`, `_date_from_url()` | `feedparser` |
| `sources/html.py` | Scrapes structured HTML pages | `HTMLAdapter.fetch()` | `requests`, `BeautifulSoup4` |
| `sources/base.py` | Shared `FeedItem` TypedDict | — | — |
| `intelligence.py` | All Claude API calls | `quick_filter(item)`, `analyze_batch(items)`, `analyze_item(item)`, `_calc_cost(usage)` | `anthropic` SDK |
| `filter.py` | Keyword pre-filter (no API cost) | `is_worth_analyzing(item)`, `has_competitor_mention(item)` | — |
| `database.py` | All SQLite operations | `init_db()`, `backfill_published_at_from_urls()`, `is_seen()`, `mark_seen()`, `save_pending()`, `log_api_call()`, `get_setting()`, `set_setting()`, `mark_source_fetched()`, `mark_source_error()` | `sqlite3` |
| `delivery.py` | Optional Slack posting | `post_insight(insight)`, `get_reactions(slack_ts)` | `slack_sdk` |
| `persistence.py` | Google Sheets write | `write_to_battlecard(insight)` | `gspread`, `google-auth` |
| `approve.py` | CLI shim (legacy) | — | `database.py` |
| `score_items.py` | Standalone scorer for `/api/seen-items/score` | — | `intelligence.py`, `database.py` |

### Web UI (`web/src/`)

| Path | Type | Purpose |
|---|---|---|
| `lib/db.ts` | Server util | All `better-sqlite3` queries; single source of truth for DB access in Node |
| `lib/types.ts` | Types | `Insight`, `SeenItem`, `TrendPoint`, `MetricsData`, `SubScores` |
| `lib/sources.ts` | Server util | Reads source config YAMLs for the sources management page |
| `app/layout.tsx` | Server component | Global layout; renders `MetricsHeader` (total, pending count, cost) |
| `app/review/page.tsx` | Client component | Pending insight queue sorted by score |
| `app/ingested/page.tsx` | Client component | Full `seen_items` feed with search, source filter, sort, and re-score |
| `app/history/page.tsx` | Client component | All insights with status/competitor/date filters |
| `app/dashboard/page.tsx` | Client component | Recharts trend charts by competitor and classification |
| `app/sources/page.tsx` | Client component | Source list with last-fetch time, error state, enable/disable toggle, connectivity test |
| `app/api/insights/route.ts` | API route | GET all insights with filters; PATCH status/tags by ID |
| `app/api/ingested/route.ts` | API route | GET `seen_items` with search/source/sort/pagination; GET distinct sources |
| `app/api/sources/route.ts` | API route | GET source config; PATCH to toggle disabled state |
| `app/api/seen-items/score/route.ts` | API route | POST list of `seen_item` IDs → run through `score_items.py` |
| `components/MetricsHeader.tsx` | Server component | Top-bar metrics strip (reads DB on every request) |
| `components/Sidebar.tsx` | Client component | Navigation sidebar |
| `components/DisableAllButton.tsx` | Client component | Bulk-disable all sources |

---

## Database schema

All tables live in `data/seen.db` (SQLite). The file is committed to git by the CI ingest job so the web UI always has access to it without a network call.

### `seen_items`

Every item fetched from any source — whether scored or not.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | SHA-256[:16] of the item URL |
| `title` | TEXT | |
| `url` | TEXT | Original URL |
| `url_norm` | TEXT | Normalized URL for cross-source dedup |
| `competitor` | TEXT | Source name from config |
| `seen_at` | TEXT | ISO-8601, UTC — when the ingestion run fetched this item |
| `published_at` | TEXT | ISO-8601, UTC — from feed `<pubDate>`, URL date pattern, or NULL |

### `pending_insights`

High-score items that survived all filters. One row per insight.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID4 |
| `item_id` | TEXT | FK → `seen_items.id` |
| `insight_json` | TEXT | Full Claude output as JSON blob |
| `posted_at` | TEXT | ISO-8601, UTC — when the insight was saved |
| `status` | TEXT | `pending` / `approved` / `review` / `discarded` / `seen` / `saved_offline` |
| `tags` | TEXT | JSON array of strings |
| `cost_usd` | REAL | Cost of the Claude call that produced this insight |

### `api_call_log`

One row per Claude API call for cost tracking.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Autoincrement |
| `called_at` | TEXT | ISO-8601, UTC |
| `stage` | TEXT | `quick_filter` or `analyze_batch` |
| `batch_size` | INTEGER | Number of items in the call |
| `input_tokens` | INTEGER | |
| `output_tokens` | INTEGER | |
| `cache_read_tokens` | INTEGER | |
| `cost_usd` | REAL | |

### `source_fetch_log`

One row per source name. Updated on every fetch attempt.

| Column | Type | Notes |
|---|---|---|
| `source_name` | TEXT PK | Matches `name` field in config |
| `last_fetched_at` | TEXT | ISO-8601, UTC — NULL if never fetched successfully |
| `last_error` | TEXT | Last error message, or NULL |
| `last_error_at` | TEXT | ISO-8601, UTC — when the last error occurred |
| `consecutive_failures` | INTEGER | Resets to 0 on success |

### `settings`

Key-value store for runtime configuration.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT PK | e.g. `ingestion_paused` |
| `value` | TEXT | |
| `updated_at` | TEXT | ISO-8601, UTC |

---

## Configuration files

### `config/sources.yaml`

Defines tier-1 direct competitor sources.

```yaml
competitors:
  - name: Genesys Blog
    feeds:
      - url: https://www.genesys.com/blog/rss
        type: rss
    tier: 1
    refresh_hours: 2
    disabled: false
```

- `type`: `rss` or `html`
- `tier`: `1` = direct competitor (bypasses keyword filter), `2` = industry publication (full filter stack)
- `refresh_hours`: minimum gap between fetches for this source; prevents hammering sources that rarely update
- `disabled`: set to `true` to skip permanently (also controllable from the Sources page in the web UI)

### `config/industry_sources.yaml`

Same format but under an `industry_sources` key. Merged into `sources.yaml` at runtime. Contains newsletters, analyst blogs, and community sources that use tier-2 filtering.

### `config/strategy.yaml`

```yaml
score_threshold: 3
priorities:
  - "Native Salesforce CRM integration..."
  - "AI virtual agent or self-service IVR improvements"
  - ...
```

- `score_threshold`: minimum score for `save_pending()`. Items below this are discarded even if `worth_surfacing = true`. Default is 3; the Claude prompt rubric treats 7–8 as "respond to" and 9–10 as direct threats.
- `priorities`: injected into the system prompt to focus Claude's `strategic_priorities_hit` scoring on what matters to Zoom.

### `prompts/intel_filter.txt`

The full Claude system prompt. Defines:
- Zoom's competitive differentiators (the "strategic lens")
- Classification rules with explicit examples
- Scoring rubric (1–10) with per-band descriptions
- Sub-score definitions (factuality, novelty, authority, depth, threat severity)
- The exact required JSON output schema

This file is sent with `cache_control: ephemeral` so it is only billed as a cache write on the first call in a session, then read from cache on every subsequent call.

---

## Environment variables

| Variable | Required | Used by | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Always | `src/intelligence.py` | Claude Haiku API access |
| `SLACK_ENABLED` | No | `src/main.py` | Set to `"true"` to enable Slack posting |
| `SLACK_BOT_TOKEN` | If Slack enabled | `src/delivery.py` | Bot OAuth token |
| `SLACK_CHANNEL_ID` | If Slack enabled | `src/delivery.py` | Channel to post insights |
| `GOOGLE_CREDENTIALS_JSON` | For approval export | `src/persistence.py` | Service account JSON (stringified) |
| `GOOGLE_SHEET_ID` | For approval export | `src/persistence.py` | Battlecard spreadsheet ID |
| `DATABASE_PATH` | Web UI only | `web/src/lib/db.ts` | Override SQLite path (default: `../data/seen.db` relative to `web/`) |
| `DB_PATH` | Tests only | `src/database.py` | Override SQLite path for test isolation |

---

## CI/CD pipelines

### `ingest.yml` — runs every 2 hours

```
schedule: "0 */2 * * *"
```

1. Checks out the repo (which includes the latest `data/seen.db`)
2. Installs Python dependencies
3. Runs `python -m src.main`
4. Commits `data/seen.db` back to the repo with `[skip ci]` to avoid triggering itself

Slack is commented out by default. Uncomment the env vars in `ingest.yml` to enable it.

### `approve_check.yml` — runs hourly (legacy)

Checks Slack reactions on posted messages. This flow is largely superseded by the web UI approval buttons but is kept for backwards compatibility.

### `validate_sources.yml`

Runs on PRs that touch `config/pending_sources.json`. Validates source URLs and config structure before merging.

### `test_slack.yml`

Manual workflow for testing Slack connectivity without running a full ingestion.

---

## Web UI pages and API routes

### Pages

| Route | Description |
|---|---|
| `/review` | Pending insights sorted by score descending. Approve / discard / flag / tag actions. |
| `/ingested` | Full `seen_items` table: every URL fetched, regardless of score. Search, filter by source, sort by published date, paginated. Select items to re-score with Claude. |
| `/history` | All `pending_insights` (all statuses) with filters for status, competitor, classification, date range, and free text. |
| `/dashboard` | Recharts bar/line charts: insights per day by competitor, classification breakdown. |
| `/sources` | Live source health: last fetch time, consecutive failures, error message. Toggle sources on/off without editing YAML. Connectivity test button. |

### API routes

| Route | Method | Description |
|---|---|---|
| `/api/insights` | GET | All insights with filter params (`status`, `competitor`, `search`, `classification`, `from`, `to`, `limit`, `offset`) |
| `/api/insights/[id]` | PATCH | Update `status` or `tags` on a single insight |
| `/api/ingested` | GET | `seen_items` with `search`, `sources`, `sortDir`, `limit`, `offset`; also `?view=sources` for distinct source list |
| `/api/ingested/export` | POST | Export all `seen_items` to Google Sheets "Ingested" tab |
| `/api/sources` | GET | Source config with health data merged in |
| `/api/sources/[name]` | PATCH | Toggle `disabled` on a source (writes to YAML file) |
| `/api/sources/[name]/test` | POST | Attempt a live fetch of one source and return item count or error |
| `/api/seen-items/score` | POST | Accept `{ ids: string[] }`, fetch each item from `seen_items`, run through `analyze_item()`, save to `pending_insights` if score qualifies |

---

## Running locally

### Prerequisites

- Python 3.11+
- Node.js 18+
- An Anthropic API key

### Backend setup

```bash
# Install Python dependencies
pip install -r requirements.txt

# Copy and fill in the env file
cp .env.example .env   # add ANTHROPIC_API_KEY at minimum

# Run a dry-run ingestion (scores but does not save)
python -m src.main --dry-run

# Run a full ingestion against a throwaway DB
python -m src.main --fresh

# Limit to the first 3 sources (fast smoke test)
python -m src.main --limit 3
```

### Web UI setup

```bash
cd web
npm install

# Dev server at http://localhost:3000
npm run dev

# Production build
npm run build
npm start
```

The web UI defaults to reading `../data/seen.db` relative to `web/`. Override with:

```bash
DATABASE_PATH=/absolute/path/to/seen.db npm run dev
```

---

## Running tests

```bash
# All tests
pytest

# Single file
pytest tests/test_main.py

# Single test
pytest tests/test_main.py::test_run_skips_low_score_items

# With output
pytest -s
```

Tests use `monkeypatch` to redirect `DB_PATH` to a `tmp_path` fixture for full isolation. All external calls — YAML loading, RSS fetching, Claude API, Slack, Google Sheets — are mocked with `unittest.mock.patch`. No network access or API keys are needed to run the test suite.

```bash
# TypeScript/ESLint checks
cd web && npm run lint
```

---

## Known limitations

### SQLite as a shared database

`data/seen.db` is committed to git by the CI job every 2 hours. This means:

- **The web UI always lags up to 2 hours behind the latest ingestion run** if the repo isn't pulled.
- **Concurrent writes are not safe.** If the CI job and a web UI action (approve, re-score) run simultaneously, one write will be blocked or may corrupt the WAL. In practice this is rare given the short write windows, but it is a real race condition.
- **No multi-user access control.** Anyone who can access the web UI can approve, discard, or re-score items.

### Published date accuracy

RSS feeds often omit `<pubDate>`. The system falls back to extracting a `YYYY-MM-DD` date from the URL path, then to the scrape timestamp. Sources that don't embed dates in URLs (e.g. short-form slugs) will show the scrape date as the published date.

### Fuzzy title dedup

The 0.72 `SequenceMatcher` threshold is a heuristic. It will occasionally:
- **False-positive** — suppress a genuinely new article with a similar title to a recent one.
- **False-negative** — let through a re-posted article with significant title rewriting.

The 14-day lookback window means articles older than that are not compared, so a slow-news week followed by a burst of similar coverage could slip through.

### Claude JSON reliability

Claude Haiku occasionally wraps JSON in markdown fences or adds preamble text. `_extract_json_object()` and `_extract_json_array()` in `intelligence.py` handle the common cases, but genuinely malformed responses result in a `None` insight and a `[ERR]` log line — the item is not retried.

### Batch analysis ordering

`analyze_batch()` relies on Claude returning array elements in the same order as the input articles. If Claude reorders them (rare but possible), insights are attributed to the wrong article. There is no per-item ID in the output schema to catch this.

### Rate limits and cost

There is no rate-limiter or budget cap. A full run across all sources can issue 20–40 Claude API calls. If a large number of new items appears simultaneously (e.g. after a long CI outage), cost per run can spike. Use `--limit N` to cap source count during testing.

### HTML adapter

`HTMLAdapter` is a thin BeautifulSoup scraper configured by CSS selectors in the source config. It is brittle: any markup change on the target site will silently return zero items until the selector is updated.

### Secrets in CI

`GOOGLE_CREDENTIALS_JSON` must be stored as a single-line stringified JSON secret in GitHub. Newlines in the service account key file must be replaced with `\n` before storing.
