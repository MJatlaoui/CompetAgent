"use client";

import { useEffect, useState } from "react";
import { InsightCard } from "@/components/InsightCard";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { Insight } from "@/lib/types";

const STATUSES = ["all", "pending", "approved", "review", "discarded"];

export default function HistoryPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [offset, setOffset] = useState(0);
  const limit = 20;

  async function fetchInsights() {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status !== "all") params.set("status", status);
    if (search) params.set("search", search);

    const res = await fetch(`/api/insights?${params}`);
    const data = await res.json();
    setInsights(data.insights);
    setTotal(data.total);
    setLoading(false);
  }

  useEffect(() => {
    fetchInsights();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, offset]);

  function handleSearch() {
    setOffset(0);
    fetchInsights();
  }

  async function handleStatusChange(id: string, newStatus: string) {
    await fetch(`/api/insights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchInsights();
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">History</h2>

      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Search insights..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="max-w-sm"
        />
        <Button variant="outline" onClick={handleSearch}>Search</Button>
        <Select value={status} onValueChange={(v) => { setStatus(v); setOffset(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-sm text-gray-500 mb-3">{total} total insights</p>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : insights.length === 0 ? (
        <p className="text-gray-500">No insights found.</p>
      ) : (
        <>
          {insights.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              showActions={insight.status === "pending"}
              onStatusChange={handleStatusChange}
            />
          ))}
          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
