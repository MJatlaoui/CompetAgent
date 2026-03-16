"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from "recharts";
import type { TrendPoint } from "@/lib/types";
import { CLASSIFICATION_LABELS } from "@/lib/classifications";

const COMPETITOR_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#3b82f6", "#8b5cf6", "#0891b2", "#f97316",
];

const CLASS_COLORS: Record<string, string> = {
  FEATURE_LAUNCH:   "#8b5cf6",
  TECHNICAL_SHIFT:  "#3b82f6",
  PRICING_CHANGE:   "#10b981",
  PARTNERSHIP:      "#0891b2",
  MARKETING_NOISE:  "#94a3b8",
  IRRELEVANT:       "#f87171",
};

function scoreColor(score: number): string {
  if (score >= 9) return "#10b981";
  if (score >= 7) return "#3b82f6";
  if (score >= 5) return "#f59e0b";
  return "#94a3b8";
}

function StatCard({
  label, value, sub, color, href,
}: {
  label: string; value: string | number; sub?: string; color: string; href?: string;
}) {
  const inner = (
    <div className={`rounded-xl border bg-white p-5 flex flex-col gap-1 shadow-sm ${href ? "hover:border-gray-300 transition-colors cursor-pointer" : ""}`}>
      <span className={`text-xs font-semibold uppercase tracking-wider ${color}`}>{label}</span>
      <span className="text-3xl font-bold text-gray-900">{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

const dateLabel = (d: string) => {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

type SourceEntry = {
  name: string;
  enabled: boolean;
  consecutiveFailures: number;
  lastError: string | null;
};

export default function DashboardPage() {
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [sources, setSources] = useState<SourceEntry[] | null>(null);

  useEffect(() => {
    function load() {
      fetch("/api/trends").then((r) => r.json()).then((d) => setTrends(d.trends));
      fetch("/api/stats").then((r) => r.json()).then((d) => setStats(d));
    }
    load();
    const timer = setInterval(load, 120_000);

    // Sources fetched once; no need to poll
    fetch("/api/sources").then((r) => r.json()).then((d) => {
      const competitors: any[] = d.competitors ?? [];
      const industry: any[] = d.industry ?? [];
      const healthLog: Record<string, any> = d.healthLog ?? {};
      const all: SourceEntry[] = [...competitors, ...industry].map((s) => ({
        name: s.name,
        enabled: !s.disabled,
        consecutiveFailures: healthLog[s.name]?.consecutiveFailures ?? 0,
        lastError: healthLog[s.name]?.lastError ?? null,
      }));
      setSources(all);
    });

    return () => clearInterval(timer);
  }, []);

  const competitors = [...new Set(trends.map((t) => t.competitor))];
  const dates = [...new Set(trends.map((t) => t.date))].sort();

  const areaData = dates.map((date) => {
    const point: Record<string, any> = { date, label: dateLabel(date) };
    competitors.forEach((comp) => {
      point[comp] = trends
        .filter((t) => t.date === date && t.competitor === comp)
        .reduce((sum, t) => sum + t.count, 0);
    });
    return point;
  });

  const classMap: Record<string, number> = {};
  trends.forEach((t) => {
    classMap[t.classification] = (classMap[t.classification] || 0) + t.count;
  });
  const classData = Object.entries(classMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Fill score distribution: ensure scores 1-10 all present
  const scoreDistFull = stats?.scoreDistribution
    ? Array.from({ length: 10 }, (_, i) => {
        const found = stats.scoreDistribution.find((d: any) => d.score === i + 1);
        return { score: i + 1, count: found?.count ?? 0 };
      })
    : [];

  // Source health summary
  const activeSources = sources?.filter((s) => s.enabled).length ?? 0;
  const totalSources = sources?.length ?? 0;
  const failingSources = sources?.filter((s) => s.consecutiveFailures > 0) ?? [];

  if (!stats && trends.length === 0) {
    return <p className="text-gray-400 text-sm mt-8">No data yet. Run an ingestion cycle first.</p>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>

      {/* Stat cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Insights" value={stats.total} color="text-gray-500" />
          <StatCard label="Items in Feed" value={stats.seenItemsCount ?? "—"} sub="total scraped" color="text-blue-500" href="/ingested" />
          <StatCard label="Pending" value={stats.pending} sub="awaiting review" color="text-indigo-500" />
          <StatCard label="Approved" value={stats.approved} sub="in bulletin" color="text-green-600" />
          <StatCard label="For Review" value={stats.review} sub="flagged" color="text-amber-500" />
          <StatCard label="Discarded" value={stats.discarded} sub="below threshold" color="text-red-400" href="/history?status=discarded" />
          <StatCard label="Avg Score" value={stats.avgScore} sub="out of 10" color="text-purple-500" />
          <StatCard label="API Spend" value={`$${(stats.totalCostUsd ?? 0).toFixed(4)}`} sub="total cost" color="text-rose-500" />
        </div>
      )}

      {/* Activity over time */}
      {areaData.length > 0 && (
        <SectionCard title="Insights Over Time by Source">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={areaData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                {competitors.map((comp, i) => (
                  <linearGradient key={comp} id={`g${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COMPETITOR_COLORS[i % COMPETITOR_COLORS.length]} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={COMPETITOR_COLORS[i % COMPETITOR_COLORS.length]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                labelFormatter={(l) => l}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              {competitors.map((comp, i) => (
                <Area
                  key={comp}
                  type="monotone"
                  dataKey={comp}
                  stroke={COMPETITOR_COLORS[i % COMPETITOR_COLORS.length]}
                  fill={`url(#g${i})`}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Classification distribution */}
        {classData.length > 0 && (
          <SectionCard title="Classification Breakdown">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={classData} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={120}
                  tickFormatter={(v: string) => CLASSIFICATION_LABELS[v] ?? v.replace(/_/g, " ")}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                  formatter={(v) => [v, "items"]}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {classData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={CLASS_COLORS[entry.name] || "#94a3b8"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>
        )}

        {/* Score distribution */}
        {scoreDistFull.length > 0 && (
          <SectionCard title="Score Distribution">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={scoreDistFull} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="score" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                  formatter={(v) => [v, "insights"]}
                  labelFormatter={(l) => `Score ${l}`}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {scoreDistFull.map((entry) => (
                    <Cell key={entry.score} fill={scoreColor(entry.score)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-400 mt-2">
              <span className="inline-block w-2 h-2 rounded-full bg-gray-400 mr-1" />1–4 low &nbsp;
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />5–6 medium &nbsp;
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />7–8 high &nbsp;
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />9–10 critical
            </p>
          </SectionCard>
        )}

        {/* Top competitors */}
        {stats?.topCompetitors?.length > 0 && (
          <SectionCard title="Top Sources by Volume">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={stats.topCompetitors}
                layout="vertical"
                margin={{ left: 8, right: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="competitor"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={110}
                  tickFormatter={(v: string) => v.replace(/_/g, " ")}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                  formatter={(v) => [v, "insights"]}
                />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>
        )}

        {/* Source health */}
        {sources !== null && (
          <SectionCard title="Source Health">
            <div className="text-sm text-gray-700 mb-3">
              <span className="font-semibold">{activeSources}</span>
              <span className="text-gray-400"> / {totalSources} sources active</span>
              {failingSources.length > 0 && (
                <span className="ml-2 text-red-500 font-medium">· {failingSources.length} failing</span>
              )}
            </div>
            {failingSources.length > 0 ? (
              <div className="space-y-2">
                {failingSources.map((s) => (
                  <div key={s.name} className="flex items-start gap-2 text-xs border border-red-100 bg-red-50 rounded-lg px-3 py-2">
                    <span className="font-medium text-red-700 shrink-0">{s.name}</span>
                    <span className="text-red-400">{s.consecutiveFailures}× failures</span>
                    {s.lastError && <span className="text-red-400 truncate">{s.lastError}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-green-600">All monitored sources are healthy.</p>
            )}
            <Link href="/sources" className="inline-block mt-3 text-xs text-blue-500 hover:underline">
              Manage sources →
            </Link>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
