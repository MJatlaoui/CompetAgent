"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { TrendPoint } from "@/lib/types";

const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#9333ea", "#0891b2"];

export default function DashboardPage() {
  const [trends, setTrends] = useState<TrendPoint[]>([]);

  useEffect(() => {
    fetch("/api/trends")
      .then((r) => r.json())
      .then((d) => setTrends(d.trends));
  }, []);

  const competitors = [...new Set(trends.map((t) => t.competitor))];
  const dates = [...new Set(trends.map((t) => t.date))].sort();

  const lineData = dates.map((date) => {
    const point: Record<string, any> = { date };
    competitors.forEach((comp) => {
      point[comp] = trends
        .filter((t) => t.date === date && t.competitor === comp)
        .reduce((sum, t) => sum + t.count, 0);
    });
    return point;
  });

  const classificationMap: Record<string, number> = {};
  trends.forEach((t) => {
    classificationMap[t.classification] = (classificationMap[t.classification] || 0) + t.count;
  });
  const barData = Object.entries(classificationMap).map(([name, count]) => ({ name, count }));

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Dashboard</h2>

      {trends.length === 0 ? (
        <p className="text-gray-500">No data yet. Run an ingestion cycle first.</p>
      ) : (
        <>
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-2">Insights Over Time by Competitor</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                {competitors.map((comp, i) => (
                  <Line
                    key={comp}
                    type="monotone"
                    dataKey={comp}
                    stroke={COLORS[i % COLORS.length]}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-2">Classification Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
