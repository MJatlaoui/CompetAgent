import { getMetrics } from "@/lib/db";
import { Clock, CheckCircle, Zap, Trophy, DollarSign, ActivitySquare, RefreshCw, Newspaper } from "lucide-react";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function MetricsHeader() {
  const metrics = getMetrics();
  const cleanCompetitor = metrics.topCompetitor.replace(/_/g, " ");

  const pills = [
    {
      label: "Pending Review",
      value: String(metrics.pendingCount),
      Icon: Clock,
      color: "text-blue-600",
      bg: "bg-blue-50",
      title: undefined,
    },
    {
      label: "Approved This Week",
      value: String(metrics.approvedThisWeek),
      Icon: CheckCircle,
      color: "text-green-600",
      bg: "bg-green-50",
      title: undefined,
    },
    {
      label: "High-Signal Today",
      value: String(metrics.highSignalToday),
      Icon: Zap,
      color: "text-amber-600",
      bg: "bg-amber-50",
      title: undefined,
    },
    {
      label: "In Review",
      value: String(metrics.inReview),
      Icon: ActivitySquare,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
      title: undefined,
    },
    {
      label: `Top Competitor · ${metrics.topCompetitorCount} mentions`,
      value: cleanCompetitor,
      Icon: Trophy,
      color: "text-purple-600",
      bg: "bg-purple-50",
      title: undefined,
    },
    {
      label: "Last Sync",
      value: metrics.lastSyncAt ? relativeTime(metrics.lastSyncAt) : "—",
      Icon: RefreshCw,
      color: "text-teal-600",
      bg: "bg-teal-50",
      title: metrics.lastSyncAt ?? undefined,
    },
    {
      label: "New Today",
      value: String(metrics.newToday),
      Icon: Newspaper,
      color: "text-orange-600",
      bg: "bg-orange-50",
      title: undefined,
    },
    {
      label: "API Spend",
      value: `$${metrics.totalCostUsd.toFixed(2)}`,
      Icon: DollarSign,
      color: "text-rose-600",
      bg: "bg-rose-50",
      title: `$${metrics.totalCostUsd.toFixed(6)}`,
    },
  ];

  return (
    <div className="flex items-center gap-3 mb-6 flex-wrap">
      {pills.map(({ label, value, Icon, color, bg, title }) => (
        <div
          key={label}
          className={`flex items-center gap-2 ${bg} px-4 py-2 rounded-lg border border-opacity-20`}
          title={title}
        >
          <Icon className={`w-4 h-4 ${color}`} />
          <span className={`text-lg font-bold ${color}`}>{value}</span>
          <span className="text-xs text-gray-500">{label}</span>
        </div>
      ))}
    </div>
  );
}
