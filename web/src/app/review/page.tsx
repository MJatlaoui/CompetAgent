"use client";

import { useEffect, useState } from "react";
import { InsightCard } from "@/components/InsightCard";
import type { Insight } from "@/lib/types";

export default function ReviewPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchPending() {
    const res = await fetch("/api/insights?view=pending");
    const data = await res.json();
    setInsights(data.insights);
    setLoading(false);
  }

  useEffect(() => {
    fetchPending();
  }, []);

  async function handleStatusChange(id: string, status: string) {
    await fetch(`/api/insights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setInsights((prev) => prev.filter((i) => i.id !== id));
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">
        Review Queue
        {insights.length > 0 && (
          <span className="text-sm font-normal text-gray-500 ml-2">
            ({insights.length} pending)
          </span>
        )}
      </h2>

      {insights.length === 0 ? (
        <p className="text-gray-500">No pending insights to review.</p>
      ) : (
        insights.map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            onStatusChange={handleStatusChange}
          />
        ))
      )}
    </div>
  );
}
