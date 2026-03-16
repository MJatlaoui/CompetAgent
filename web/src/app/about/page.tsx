import { getStats, getLastSyncAt } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function AboutPage() {
  const stats = getStats();
  const lastSyncAt = getLastSyncAt();

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">CompetAgent</h1>
        <p className="mt-1 text-gray-500">
          Automated competitive intelligence pipeline for Zoom Contact Center.
        </p>
      </div>

      {/* What it does */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-800">What it does</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          CompetAgent monitors competitor websites, product blogs, and industry publications in the
          CCaaS (Contact Center as a Service) market. It fetches new content every two hours, scores
          each item using Claude Haiku for strategic relevance, and surfaces high-signal insights to
          analysts for review. Approved insights are pushed to a Google Sheets battlecard for use in
          sales and product conversations.
        </p>
      </section>

      {/* How it works */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-800">How it works</h2>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <pre className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap font-mono">
{`RSS / HTML feeds (config/sources.yaml + config/industry_sources.yaml)
  ↓
Stage 0 — Source loading  (RSS vs HTML, tier-1 vs tier-2, refresh_hours throttle)
  ↓
Stage 1 — Deduplication   (SHA-256 item ID, normalised URL, fuzzy title 0.72 / 14-day window)
  ↓
Stage 2 — Pre-filter      (tier-2 only: keyword → competitor name → quick Claude title call)
  ↓
Stage 3 — Batch analysis  (5 items/call, shared system-prompt cache)
  ↓
Stage 4 — Persist if worth_surfacing=true AND score ≥ threshold
  ↓
SQLite DB → data/seen.db  (+ api_call_log: token counts, cache hit rate)
  ↓
Stage 5 — Auto-score      (recent unseen items → auto-suggest ≥ 9 / auto-discard ≤ 4)
  ↓
Web UI review queue  ──→  Google Sheets battlecard`}
          </pre>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-800">Tech stack</h2>
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden text-sm">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/3">Layer</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/3">Choice</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs text-gray-600">
              {[
                ["Runtime", "Python 3.11", "Async-friendly; rich ecosystem for feed parsing"],
                ["Feed parsing", "feedparser", "Battle-tested RSS/Atom parser"],
                ["HTML scraping", "BeautifulSoup4", "CSS-selector scraping for pages without feeds"],
                ["AI scoring", "Claude Haiku (prompt caching)", "Fast, cheap; $0.08/Mtok on cached reads"],
                ["Zoom KB", "prompts/zoom_knowledge.md (~24k chars)", "Zoom CC product context injected into system prompt for grounded competitor comparison"],
                ["Storage", "SQLite (committed to git)", "Zero-ops; CI writes DB every 2h"],
                ["Web UI", "Next.js 14 App Router", "Server components + API routes in one repo"],
                ["DB bindings", "better-sqlite3", "Synchronous reads, no async overhead in server components"],
                ["UI components", "shadcn/ui + Tailwind", "Accessible, unstyled primitives + utility CSS"],
                ["Charts", "Recharts", "React-first charting with minimal configuration"],
                ["Sheets write", "gspread + google-auth", "Official Google client; service-account auth"],
                ["Slack", "slack_sdk", "Optional; gated by SLACK_ENABLED env var"],
                ["CI/CD", "GitHub Actions", "2h ingest schedule + DB commit back to repo"],
              ].map(([layer, choice, reason]) => (
                <tr key={layer}>
                  <td className="px-4 py-2 font-medium text-gray-700">{layer}</td>
                  <td className="px-4 py-2 font-mono">{choice}</td>
                  <td className="px-4 py-2 text-gray-500">{reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* External services */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-800">External services</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {[
            {
              name: "Anthropic",
              detail: "Claude Haiku · prompt caching · $0.08/Mtok on cached reads",
              required: true,
            },
            {
              name: "Slack",
              detail: "Optional · gated by SLACK_ENABLED env var · bot posts high-score items",
              required: false,
            },
            {
              name: "Google Sheets",
              detail: "Service account · append-only battlecard write · triggered on approval",
              required: false,
            },
            {
              name: "GitHub Actions",
              detail: "2h ingest schedule · commits updated seen.db back to repo after each run",
              required: true,
            },
          ].map(({ name, detail, required }) => (
            <div key={name} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-gray-800">{name}</span>
                {required
                  ? <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full">required</span>
                  : <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">optional</span>
                }
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Running locally */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-800">Running locally</h2>
        <div className="text-sm text-gray-600 space-y-3">
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="font-medium text-gray-800 mb-1">1 — Prerequisites</p>
            <ul className="text-xs text-gray-500 space-y-0.5 list-disc list-inside">
              <li>Python 3.11+, Node.js 18+</li>
              <li><code className="bg-gray-100 px-1 py-0.5 rounded">ANTHROPIC_API_KEY</code> (required)</li>
            </ul>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="font-medium text-gray-800 mb-2">2 — Backend</p>
            <pre className="text-xs text-gray-600 bg-gray-50 rounded p-3 font-mono overflow-x-auto">{`pip install -r requirements.txt
cp .env.example .env   # add ANTHROPIC_API_KEY
python -m src.main`}</pre>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="font-medium text-gray-800 mb-2">3 — Web UI</p>
            <pre className="text-xs text-gray-600 bg-gray-50 rounded p-3 font-mono overflow-x-auto">{`cd web && npm install
npm run dev            # → http://localhost:3000`}</pre>
          </div>
        </div>
      </section>

      {/* Live stats */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-800">Live stats</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total scored",    value: stats.total },
            { label: "Pending review",  value: stats.pending },
            { label: "Approved",        value: stats.approved },
            { label: "Discarded",       value: stats.discarded },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-gray-200 bg-white p-3 text-center">
              <p className="text-xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-500 mb-0.5">Avg. score</p>
            <p className="text-lg font-semibold text-gray-900">{stats.avgScore} / 10</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-500 mb-0.5">Total API cost</p>
            <p className="text-lg font-semibold text-gray-900">${stats.totalCostUsd.toFixed(4)}</p>
          </div>
        </div>
        {stats.topCompetitors.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500 mb-2">Top competitors tracked</p>
            <div className="flex flex-wrap gap-2">
              {stats.topCompetitors.map(({ competitor, count }) => (
                <span key={competitor} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700">
                  {competitor}
                  <span className="text-gray-400">{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        <p className="text-xs text-gray-400">
          Last synced:{" "}
          {lastSyncAt
            ? new Date(lastSyncAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
            : "Never"}
        </p>
      </section>

      {/* Using the UI */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-800">Using the UI</h2>
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white text-sm">
          {[
            { page: "Inbox",              path: "/review",    desc: "High-score pending insights awaiting analyst review. Approve, flag, or discard each item." },
            { page: "Flagged",            path: "/flagged",   desc: "Items marked for closer review — use for escalations or items needing more context before approval." },
            { page: "Bulletin",           path: "/bulletin",  desc: "Newsletter-style digest of all approved insights, grouped by competitor." },
            { page: "History",            path: "/history",   desc: "Full archive of all scored insights with filters for competitor, classification, status, and date range." },
            { page: "Dashboard",          path: "/dashboard", desc: "Trend charts, score quality distribution, source health, and volume stats." },
            { page: "Sources & Settings", path: "/sources",   desc: "Manage source feeds, toggle on/off, test connectivity, pause ingestion, export/import CSV." },
            { page: "Feed",               path: "/ingested",  desc: "Raw feed of every URL seen by the scraper, before scoring. Searchable by title, source, and date." },
          ].map(({ page, path, desc }) => (
            <div key={path} className="flex gap-3 px-4 py-3">
              <span className="w-36 shrink-0 font-medium text-gray-700">{page}</span>
              <span className="text-gray-500 leading-relaxed">{desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Pipeline details */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-800">Pipeline stages</h2>
        <div className="text-sm text-gray-600 space-y-3">
          {[
            {
              stage: "Stage 0 — Source loading",
              body: "Reads config/sources.yaml (competitors) and config/industry_sources.yaml (industry publications). Sources have a type (rss or html), optional tier (1 = primary, 2 = secondary), and a refresh_hours throttle so slow-moving sources aren't fetched on every run.",
            },
            {
              stage: "Stage 1 — Deduplication",
              body: "Each item is hashed (SHA-256 of normalised URL) and checked against the seen_items table. Duplicate URLs are dropped. A fuzzy title comparison (threshold 0.72, 14-day rolling window) catches paywalled or redirected re-posts.",
            },
            {
              stage: "Stage 2 — Pre-filter (tier-2 only)",
              body: "Tier-2 industry sources produce high volume. Before hitting the full AI, each item is checked for competitor keywords in the title/body. Items with no keyword match are dropped; borderline cases get a quick single-item Claude call on the title alone.",
            },
            {
              stage: "Stage 3 — Batch analysis",
              body: "Surviving items are grouped into batches of 5. Each batch is sent to Claude Haiku with a shared system prompt (prompt caching dramatically reduces cost on the ~6,500-token system prompt (Zoom KB + intel filter)). Claude returns structured JSON for each item. Each run logs token counts and cache hit rate to the api_call_log table; a summary line is printed at run end.",
            },
            {
              stage: "Stage 4 — Persist",
              body: "Items where worth_surfacing=true AND score ≥ threshold (default 7) are written to pending_insights. Items below threshold are discarded. All seen URLs are recorded in seen_items regardless of score.",
            },
            {
              stage: "Stage 5 — Auto-scoring",
              body: "After the main loop, a second pass scores recent feed items not yet in pending_insights (last 7 days, up to 50 items). Items scoring ≥ inbox_threshold (default 9) are auto-suggested for review; items ≤ discard_threshold (default 4) are auto-discarded. Thresholds are configurable via Settings.",
            },
          ].map(({ stage, body }) => (
            <div key={stage} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="font-medium text-gray-800 mb-1">{stage}</p>
              <p className="text-gray-500 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sub-scores */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-800">Scoring & sub-scores</h2>
        <p className="text-sm text-gray-600">
          Each insight carries a composite <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">score</code> (1–10) and five sub-scores used to compute a <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">heat</code> index (0–100) that reflects urgency.
        </p>
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden text-sm">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">Key</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Name</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Meaning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs text-gray-600">
              {[
                ["f", "Freshness", "How recently the item was published (decays over time)"],
                ["n", "Novelty", "Whether the claim is new vs. a known talking point"],
                ["a", "Actionability", "How directly this affects a sales motion or product decision"],
                ["d", "Depth", "Level of technical or market detail in the source"],
                ["s", "Strategic alignment", "How many of the configured strategic priorities this hits"],
                ["heat", "Heat index", "Weighted composite of f/n/a/d/s; drives the heat badge colour (red > 75, amber > 50, green ≤ 50)"],
              ].map(([key, name, meaning]) => (
                <tr key={key}>
                  <td className="px-4 py-2 font-mono font-semibold text-gray-700">{key}</td>
                  <td className="px-4 py-2 font-medium text-gray-700">{name}</td>
                  <td className="px-4 py-2 text-gray-500">{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-gray-600">
          Classification types:{" "}
          {["TECHNICAL_SHIFT", "FEATURE_LAUNCH", "PRICING_CHANGE", "PARTNERSHIP", "MARKETING_NOISE", "IRRELEVANT"].map((c) => (
            <span key={c} className="inline-block mr-1 mb-1 text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
              {c}
            </span>
          ))}
        </p>
      </section>

      {/* Limitations */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-800">Known limitations</h2>
        <ul className="text-sm text-gray-600 space-y-2 list-none">
          {[
            ["SQLite race condition", "CI writes seen.db every 2 hours. Concurrent web UI writes (e.g. status updates during a CI run) can collide. Use the web UI and CI sequentially if this is a concern."],
            ["Published date accuracy", "If a feed doesn't include a publish date, the pipeline falls back to a date extracted from the URL, then to the scrape time. Dates shown in the feed may therefore be approximate."],
            ["Fuzzy dedup false positives / negatives", "The 0.72 similarity threshold can occasionally merge distinct articles with similar titles, or allow near-duplicate paywalled re-posts through."],
            ["Claude JSON reliability", "Malformed JSON responses from Claude cause the item to be silently lost (no retry). Very rare with Haiku but possible under high load or API instability."],
            ["Batch ordering fragility", "Batches of 5 items sent to Claude are returned in declared order. If Claude reorders the JSON array, scores can be misattributed. This has not been observed in practice."],
            ["HTML adapter brittleness", "HTML sources use CSS selectors to extract article links. Competitor site redesigns will break the selector and silently yield zero items until the config is updated."],
          ].map(([title, body]) => (
            <li key={title as string} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <span className="font-medium text-gray-800">{title}</span>
              <span className="text-gray-400 mx-2">—</span>
              <span className="text-gray-500">{body}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Footer */}
      <div className="border-t border-gray-200 pt-6 text-xs text-gray-400">
        Powered by Claude Haiku · Built for Zoom Contact Center
      </div>
    </div>
  );
}
