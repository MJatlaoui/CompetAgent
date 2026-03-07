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
{`RSS / HTML feeds (config/sources.yaml)
  ↓
Scraper (src/sources/)
  ↓
Deduplication (seen_items table)
  ↓
Claude Haiku scoring (src/intelligence.py)
  ↓
SQLite DB → data/seen.db
  ↓
Web UI review queue  ──→  Google Sheets battlecard`}
          </pre>
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
            { page: "Dashboard",          path: "/dashboard", desc: "Trend charts showing insight volume over time, broken down by competitor and classification." },
            { page: "Sources & Settings", path: "/sources",   desc: "Browse all ingested URLs grouped by source. Review per-source fetch timestamps." },
            { page: "Feed",               path: "/ingested",  desc: "Raw feed of every item seen by the scraper, before scoring." },
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
        <h2 className="text-base font-semibold text-gray-800">Pipeline details</h2>
        <div className="text-sm text-gray-600 space-y-2">
          <p>
            <span className="font-medium text-gray-700">Score threshold:</span>{" "}
            Items score 1–10. Items with score ≥ 3 and <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">worth_surfacing = true</code> are saved to the review queue.
          </p>
          <p className="font-medium text-gray-700 mt-2">Classification types:</p>
          <div className="flex flex-wrap gap-2">
            {["TECHNICAL_SHIFT", "FEATURE_LAUNCH", "PRICING_CHANGE", "PARTNERSHIP", "MARKETING_NOISE", "IRRELEVANT"].map((c) => (
              <span key={c} className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="border-t border-gray-200 pt-6 text-xs text-gray-400">
        Powered by Claude Haiku · Built for Zoom Contact Center
      </div>
    </div>
  );
}
