"use client";

import { useEffect, useState } from "react";
import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InsightCard } from "@/components/InsightCard";
import { FilterBar, dateRangeToParam } from "@/components/FilterBar";
import type { FilterState } from "@/components/FilterBar";
import type { Insight } from "@/lib/types";

const LIMIT = 20;

export default function ArchivedPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState<FilterState>({ search: "", dateRange: "all", classification: "" });

  function buildParams(off = offset) {
    const p = new URLSearchParams({ status: "discarded", limit: String(LIMIT), offset: String(off) });
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

  function goTo(off: number) { setOffset(off); fetch_(off); }

  return (
    <div>
      <div className="mb-4 pb-4 border-b">
        <h2 className="text-2xl font-bold text-gray-900">
          Archived
          {!loading && total > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
              {total} items
            </span>
          )}
        </h2>
        <p className="text-sm text-gray-500 mt-1">Items archived from the review queue. Restore them to send back to pending.</p>
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
          <Archive className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No archived items.</p>
          <p className="text-sm mt-1">Items you archive from the review queue appear here.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-3">
            Showing {offset + 1}–{Math.min(offset + insights.length, total)} of {total} archived items
          </p>
          {insights.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              showActions={true}
              onStatusChange={handleStatusChange}
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
