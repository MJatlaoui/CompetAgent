"use client";

import { useEffect, useState } from "react";
import { InsightCard } from "@/components/InsightCard";
import { FilterBar, dateRangeToParam } from "@/components/FilterBar";
import type { FilterState } from "@/components/FilterBar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { Insight } from "@/lib/types";

const STATUSES = ["all", "pending", "approved", "review", "discarded"];
const LIMIT = 20;

export default function HistoryPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState<FilterState>({ search: "", dateRange: "all", classification: "" });

  function buildParams(off = offset) {
    const p = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
    if (status !== "all") p.set("status", status);
    if (filters.search) p.set("search", filters.search);
    if (filters.classification) p.set("classification", filters.classification);
    const { from, to } = dateRangeToParam(filters.dateRange);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p;
  }

  async function fetch_(off = offset) {
    setLoading(true);
    const res = await fetch(`/api/insights?${buildParams(off)}`);
    const data = await res.json();
    setInsights(data.insights);
    setTotal(data.total);
    setLoading(false);
  }

  useEffect(() => {
    fetch_(0);
    setOffset(0);
    const timer = setInterval(() => fetch_(offset), 60_000);
    return () => clearInterval(timer);
  }, [status]);

  function handleSearch() { setOffset(0); fetch_(0); }

  async function handleStatusChange(id: string, newStatus: string) {
    await fetch(`/api/insights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    fetch_(offset);
  }

  function goTo(off: number) { setOffset(off); fetch_(off); }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">History</h2>

      <div className="flex gap-2 mb-3">
        <Select value={status} onValueChange={(v) => { setStatus(v); setOffset(0); }}>
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s === "discarded" ? "archived" : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <FilterBar value={filters} onChange={setFilters} onSearch={handleSearch} />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg border p-3 animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-1/4 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-full" />
            </div>
          ))}
        </div>
      ) : insights.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🔍</p>
          <p className="font-medium">No insights found.</p>
          <p className="text-sm mt-1">Try adjusting your filters.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-3">
            Showing {offset + 1}–{Math.min(offset + insights.length, total)} of {total} insights
          </p>
          {insights.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              showActions={["pending", "review", "discarded"].includes(insight.status)}
              onStatusChange={handleStatusChange}
            />
          ))}
          <div className="flex items-center gap-2 mt-4">
            <Button variant="outline" disabled={offset === 0} onClick={() => goTo(Math.max(0, offset - LIMIT))}>Previous</Button>
            <span className="text-sm text-gray-500">Page {Math.floor(offset / LIMIT) + 1} of {Math.ceil(total / LIMIT)}</span>
            <Button variant="outline" disabled={offset + LIMIT >= total} onClick={() => goTo(offset + LIMIT)}>Next</Button>
          </div>
        </>
      )}
    </div>
  );
}
