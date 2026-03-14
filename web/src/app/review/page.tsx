"use client";

import { useEffect, useState } from "react";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InsightCard } from "@/components/InsightCard";
import { FilterBar, dateRangeToParam } from "@/components/FilterBar";
import type { FilterState } from "@/components/FilterBar";
import type { Insight } from "@/lib/types";

const LIMIT = 20;

export default function ReviewPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState<FilterState>({ search: "", dateRange: "all", classification: "", competitor: undefined });
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [archivingAll, setArchivingAll] = useState(false);

  function buildParams(off = offset) {
    const p = new URLSearchParams({ view: "pending", limit: String(LIMIT), offset: String(off) });
    if (filters.search) p.set("search", filters.search);
    if (filters.classification) p.set("classification", filters.classification);
    if (filters.competitor) p.set("competitor", filters.competitor);
    const { from, to } = dateRangeToParam(filters.dateRange);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p;
  }

  async function fetch_(off = offset) {
    setLoading(true);
    setSelectedIds(new Set());
    const res = await fetch(`/api/insights?${buildParams(off)}`);
    const data = await res.json();
    setInsights(data.insights);
    setTotal(data.total);
    setLoading(false);
  }

  useEffect(() => {
    fetch_(0);
    setOffset(0);
    const timer = setInterval(() => fetch_(0), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetch("/api/stats").then(r => r.json()).then(data => {
      setCompetitors((data.topCompetitors || []).map((c: { competitor: string }) => c.competitor));
    });
  }, []);

  function handleSearch() { setOffset(0); fetch_(0); }

  async function handleStatusChange(id: string, status: string) {
    await fetch(`/api/insights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setInsights((prev) => prev.filter((i) => i.id !== id));
    setTotal((t) => t - 1);
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }

  async function handleTagsChange(id: string, tags: string[]) {
    await fetch(`/api/insights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags }),
    });
    setInsights((prev) => prev.map((i) => (i.id === id ? { ...i, tags } : i)));
  }

  function handleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === insights.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(insights.map((i) => i.id)));
    }
  }

  async function bulkAction(status: string) {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    await Promise.all(
      [...selectedIds].map((id) =>
        fetch(`/api/insights/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }),
      ),
    );
    setBulkLoading(false);
    setInsights((prev) => prev.filter((i) => !selectedIds.has(i.id)));
    setTotal((t) => t - selectedIds.size);
    setSelectedIds(new Set());
  }

  async function archiveAll() {
    if (!confirm(`Archive all ${total} pending insights?`)) return;
    setArchivingAll(true);
    await fetch("/api/insights", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archive_all_pending" }),
    });
    setArchivingAll(false);
    fetch_(0);
    setOffset(0);
  }

  function goTo(off: number) { setOffset(off); fetch_(off); }

  const allSelected = insights.length > 0 && selectedIds.size === insights.length;
  const someSelected = selectedIds.size > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">
          Inbox
          {!loading && total > 0 && (
            <span className="text-sm font-normal text-gray-500 ml-2">({total} pending)</span>
          )}
        </h2>
        {!loading && total > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="border-red-300 text-red-600 hover:bg-red-50 text-xs"
            onClick={archiveAll}
            disabled={archivingAll}
          >
            {archivingAll ? "Archiving…" : `Archive All (${total})`}
          </Button>
        )}
      </div>

      <FilterBar value={filters} onChange={setFilters} onSearch={handleSearch} competitors={competitors} />

      {/* Bulk action bar */}
      {!loading && insights.length > 0 && (
        <div className="flex items-center gap-3 mb-3 py-2 px-3 bg-gray-50 border rounded-lg">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
            onChange={toggleSelectAll}
            className="w-4 h-4 rounded border-gray-300 accent-blue-600 cursor-pointer"
          />
          <span className="text-sm text-gray-600">
            {someSelected ? `${selectedIds.size} selected` : `Select all ${insights.length}`}
          </span>
          {someSelected && (
            <div className="flex items-center gap-2 ml-2">
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-xs h-7"
                onClick={() => bulkAction("approved")}
                disabled={bulkLoading}
              >
                Approve {selectedIds.size}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-yellow-500 text-yellow-700 hover:bg-yellow-50 text-xs h-7"
                onClick={() => bulkAction("review")}
                disabled={bulkLoading}
              >
                Flag for Review
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-400 text-red-600 hover:bg-red-50 text-xs h-7"
                onClick={() => bulkAction("discarded")}
                disabled={bulkLoading}
              >
                Archive
              </Button>
              <button
                className="text-xs text-gray-400 hover:text-gray-600 ml-1"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

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
          <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">All caught up!</p>
          <p className="text-sm mt-1">No pending insights match your filters.</p>
        </div>
      ) : (
        <>
          {insights.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              onStatusChange={handleStatusChange}
              onTagsChange={handleTagsChange}
              selected={selectedIds.has(insight.id)}
              onSelect={handleSelect}
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
