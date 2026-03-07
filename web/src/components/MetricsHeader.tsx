import { getMetrics } from "@/lib/db";
import { FileText, Brain, Zap, Star, DollarSign } from "lucide-react";

export function MetricsHeader() {
  const metrics = getMetrics();

  const pills = [
    {
      label: "Total Articles",
      value: metrics.total,
      Icon: FileText,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "AI Analyses",
      value: metrics.analyses,
      Icon: Brain,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      label: "Ingested Today",
      value: metrics.today,
      Icon: Zap,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "Total Saved",
      value: metrics.saved,
      Icon: Star,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "API Spend",
      value: `$${metrics.totalCostUsd.toFixed(4)}`,
      Icon: DollarSign,
      color: "text-rose-600",
      bg: "bg-rose-50",
    },
  ];

  return (
    <div className="flex gap-3 mb-6 flex-wrap">
      {pills.map(({ label, value, Icon, color, bg }) => (
        <div
          key={label}
          className={`flex items-center gap-2 ${bg} px-4 py-2 rounded-lg border border-opacity-20`}
        >
          <Icon className={`w-4 h-4 ${color}`} />
          <span className={`text-lg font-bold ${color}`}>{value}</span>
          <span className="text-xs text-gray-500">{label}</span>
        </div>
      ))}
    </div>
  );
}
