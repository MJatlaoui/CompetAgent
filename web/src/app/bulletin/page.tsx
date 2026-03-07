"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Newspaper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterBar, dateRangeToParam } from "@/components/FilterBar";
import type { FilterState } from "@/components/FilterBar";
import { InsightCard } from "@/components/InsightCard";
import type { Insight } from "@/lib/types";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function sevenDaysAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function NewsletterPanel() {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(sevenDaysAgoStr);
  const [to, setTo] = useState(todayStr);
  const [format, setFormat] = useState<"html" | "md">("html");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, format }),
      });
      if (!res.ok) {
        let msg = `Server error ${res.status}`;
        try { const d = await res.json(); msg = d.error || msg; } catch { /* non-JSON error body */ }
        setError(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cc-intel-${to}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-5 border border-gray-200 rounded-xl bg-white overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-gray-400" />
          Generate Newsletter
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-gray-100">
          <div className="flex flex-wrap gap-4 mt-3">
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="border border-gray-200 rounded-md px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              To
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="border border-gray-200 rounded-md px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </label>
            <div className="flex flex-col gap-1 text-xs text-gray-500">
              Format
              <div className="flex items-center gap-3 mt-1">
                <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="nl-format"
                    value="html"
                    checked={format === "html"}
                    onChange={() => setFormat("html")}
                    className="accent-blue-600"
                  />
                  HTML
                </label>
                <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="nl-format"
                    value="md"
                    checked={format === "md"}
                    onChange={() => setFormat("md")}
                    className="accent-blue-600"
                  />
                  Markdown
                </label>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <Button onClick={generate} disabled={loading} size="sm">
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Generating…
                </span>
              ) : (
                "Generate & Download"
              )}
            </Button>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 20;

export default function BulletinPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filters, setFilters] = useState<FilterState>({ search: "", dateRange: "all", classification: "" });

  async function handleStatusChange(id: string, status: string) {
    await fetch(`/api/insights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setInsights((prev) => prev.filter((i) => i.id !== id));
    setTotal((t) => t - 1);
  }

  function buildParams(off: number) {
    const p = new URLSearchParams({ status: "approved", limit: String(PAGE_SIZE), offset: String(off) });
    if (filters.search) p.set("search", filters.search);
    if (filters.classification) p.set("classification", filters.classification);
    const { from, to } = dateRangeToParam(filters.dateRange);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p;
  }

  async function load(newOffset: number, append: boolean) {
    if (append) setLoadingMore(true); else setLoading(true);
    const res = await fetch(`/api/insights?${buildParams(newOffset)}`);
    const d = await res.json();
    setInsights((prev) => append ? [...prev, ...d.insights] : d.insights);
    setTotal(d.total);
    setOffset(newOffset + d.insights.length);
    if (append) setLoadingMore(false); else setLoading(false);
  }

  useEffect(() => { load(0, false); }, []);

  function handleSearch() { setOffset(0); load(0, false); }

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="max-w-3xl">
      <div className="mb-4 pb-4 border-b">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">CompetAgent</p>
        <h2 className="text-3xl font-bold text-gray-900">Bulletin</h2>
        <p className="text-sm text-gray-500 mt-1">{today}</p>
      </div>

      <NewsletterPanel />

      <FilterBar value={filters} onChange={setFilters} onSearch={handleSearch} />

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-l-4 border-l-gray-200 shadow-sm p-5 animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-1/3 mb-3" />
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-full mb-1" />
              <div className="h-3 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : insights.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Newspaper className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No approved insights yet.</p>
          <p className="text-sm mt-1">Approve items from the Inbox to populate this bulletin.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-5">
            {total} approved insight{total !== 1 ? "s" : ""}
          </p>
          {insights.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              onStatusChange={handleStatusChange}
              variant="bulletin"
            />
          ))}
          {offset < total && (
            <div className="text-center mt-2 mb-6">
              <Button
                variant="outline"
                onClick={() => load(offset, true)}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : `Load more (${total - offset} remaining)`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
