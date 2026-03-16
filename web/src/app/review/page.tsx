"use client";

import { useEffect, useState } from "react";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InsightCard } from "@/components/InsightCard";
import { FilterBar, dateRangeToParam } from "@/components/FilterBar";
import type { FilterState } from "@/components/FilterBar";
import type { Insight } from "@/lib/types";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

const LIMIT = 20;

function ScoringPlaceholderCard({ insight }: { insight: Insight }) {
  return (
    <div className="bg-white rounded-lg border border-blue-200 p-4 mb-3 flex items-center gap-3 animate-pulse">
      <svg className="h-5 w-5 text-blue-400 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-700 truncate">
          {insight.competitor && <span className="text-blue-600 mr-2">{insight.competitor}</span>}
          {insight.headline || "Untitled"}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">Scoring with Claude…</p>
      </div>
    </div>
  );
}

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
  const [sheetsErrors, setSheetsErrors] = useState<string[]>([]);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/stats").then(r => r.json()).then(data => {
      setCompetitors((data.topCompetitors || []).map((c: { competitor: string }) => c.competitor));
    });
  }, []);

  // Reset focusedIndex when insights change
  useEffect(() => { setFocusedIndex(0); }, [insights]);

  const hasScoringItems = insights.some((i) => i.status === "scoring");
  useEffect(() => {
    const interval = hasScoringItems ? 3_000 : 60_000;
    const timer = setInterval(() => fetch_(0), interval);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasScoringItems]);

  function handleSearch() { setOffset(0); fetch_(0); }

  async function handleStatusChange(id: string, status: string) {
    const insight = insights.find((i) => i.id === id);
    const res = await fetch(`/api/insights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (data.sheetsError && insight) {
      setSheetsErrors((prev) => [...prev, insight.headline || id]);
    }
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

  async function handleNotesChange(id: string, notes: string) {
    await fetch(`/api/insights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    setInsights((prev) => prev.map((i) => (i.id === id ? { ...i, notes } : i)));
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

  function handleToggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useKeyboardShortcuts({
    insights,
    focusedIndex,
    setFocusedIndex,
    onApprove: (id) => handleStatusChange(id, "approved"),
    onDiscard: (id) => handleStatusChange(id, "discarded"),
    onFlag: (id) => handleStatusChange(id, "review"),
    onToggleExpand: handleToggleExpand,
    onShowHelp: () => setShowShortcutsHelp(true),
    expandedIds,
  });

  const allSelected = insights.length > 0 && selectedIds.size === insights.length;
  const someSelected = selectedIds.size > 0;

  return (
    <div>
      {sheetsErrors.length > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>
            ⚠ Sheets sync failed for {sheetsErrors.length} insight{sheetsErrors.length > 1 ? "s" : ""} — approved in the database but not written to the battlecard.
          </span>
          <button
            className="text-amber-700 hover:text-amber-900 font-medium underline shrink-0"
            onClick={() => setSheetsErrors([])}
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">
            Inbox
            {!loading && total > 0 && (
              <span className="text-sm font-normal text-gray-500 ml-2">({total} pending)</span>
            )}
          </h2>
          <button
            onClick={() => setShowShortcutsHelp(true)}
            className="text-xs text-gray-400 hover:text-gray-600 border rounded px-2 py-0.5"
            title="Keyboard shortcuts"
          >
            ? shortcuts
          </button>
        </div>
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
          {insights.map((insight, idx) =>
            insight.status === "scoring" ? (
              <ScoringPlaceholderCard key={insight.id} insight={insight} />
            ) : (
              <InsightCard
                key={insight.id}
                insight={insight}
                onStatusChange={handleStatusChange}
                onTagsChange={handleTagsChange}
                onNotesChange={handleNotesChange}
                selected={selectedIds.has(insight.id)}
                onSelect={handleSelect}
                focused={focusedIndex === idx}
                forceExpanded={expandedIds.has(insight.id)}
              />
            )
          )}
          {total > LIMIT && (
            <div className="flex items-center gap-2 mt-4">
              <Button variant="outline" disabled={offset === 0} onClick={() => goTo(Math.max(0, offset - LIMIT))}>Previous</Button>
              <span className="text-sm text-gray-500">Page {Math.floor(offset / LIMIT) + 1} of {Math.ceil(total / LIMIT)}</span>
              <Button variant="outline" disabled={offset + LIMIT >= total} onClick={() => goTo(offset + LIMIT)}>Next</Button>
            </div>
          )}
        </>
      )}

      {showShortcutsHelp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowShortcutsHelp(false)}>
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">Keyboard Shortcuts</h3>
            <div className="space-y-2 text-sm">
              {[
                ["j", "Next card"],
                ["k", "Previous card"],
                ["a", "Approve focused card"],
                ["d", "Discard/archive focused card"],
                ["f", "Flag for review"],
                ["e / Space", "Expand/collapse card"],
                ["?", "Show this help"],
              ].map(([key, desc]) => (
                <div key={key} className="flex justify-between">
                  <kbd className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">{key}</kbd>
                  <span className="text-gray-600">{desc}</span>
                </div>
              ))}
            </div>
            <button
              className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700"
              onClick={() => setShowShortcutsHelp(false)}
            >
              Close (click anywhere)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
