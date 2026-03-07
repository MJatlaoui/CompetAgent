"use client";

import { useEffect, useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InsightCard } from "@/components/InsightCard";
import { FilterBar, dateRangeToParam } from "@/components/FilterBar";
import type { FilterState } from "@/components/FilterBar";
import type { Insight } from "@/lib/types";

const LIMIT = 20;

export default function FlaggedPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState<FilterState>({ search: "", dateRange: "all", classification: "" });

  function buildParams(off = offset) {
    const p = new URLSearchParams({ status: "review", limit: String(LIMIT), offset: String(off) });
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

  useEffect(() => { fetch_(0); setOffset(0); }, []);

  function handleSearch() { setOffset(0); fetch_(0); }

  async function handleStatusChange(id: string, status: string) {
    await fetch(`/api/insights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setInsights((prev) => prev.filter((i) => i.id !== id));
    setTotal((t) => t - 1);
  }

  async function handleTagsChange(id: string, tags: string[]) {
    await fetch(`/api/insights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags }),
    });
    setInsights((prev) => prev.map((i) => (i.id === id ? { ...i, tags } : i)));
  }

  function goTo(off: number) { setOffset(off); fetch_(off); }

  return (
    <div>
      <div className="mb-4 pb-4 border-b">
        <h2 className="text-2xl font-bold text-gray-900">
          Need to Review
          {!loading && total > 0 && (
            <span className="ml-2 text-sm font-normal text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              {total} flagged
            </span>
          )}
        </h2>
        <p className="text-sm text-gray-500 mt-1">Promote to Bulletin, send back to Queue, or Archive.</p>
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
          <Flag className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nothing flagged for review.</p>
          <p className="text-sm mt-1">Items marked "Need to Review" from the Review Queue appear here.</p>
        </div>
      ) : (
        <>
          {insights.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              onStatusChange={handleStatusChange}
              onTagsChange={handleTagsChange}
            />
          ))}
          {total > LIMIT && (
            <div className="flex items-center gap-2 mt-4">
              <Button variant="outline" disabled={offset === 0} onClick={() => goTo(Math.max(0, offset - LIMIT))}>Previous</Button>
              <span className="text-sm text-gray-500">Page {Math.floor(offset / LIMIT) + 1} of {Math.ceil(total / LIMIT)}</span>
              <Button variant="outline" disabled={offset + LIMIT >= total} onClick={() => goTo(offset + LIMIT)}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
