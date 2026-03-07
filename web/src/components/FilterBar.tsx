"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CLASSIFICATION_LABELS } from "@/lib/classifications";

export interface FilterState {
  search: string;
  dateRange: string;   // "all" | "today" | "7d" | "30d" | "90d"
  classification: string; // "" = all
}

const DATE_OPTIONS = [
  { label: "All time",   value: "all" },
  { label: "Today",      value: "today" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 3 months", value: "90d" },
];

export function dateRangeToParam(range: string): { from?: string; to?: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  switch (range) {
    case "today": {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      return { from: iso(start) };
    }
    case "7d":  return { from: iso(new Date(now.getTime() - 7  * 86400000)) };
    case "30d": return { from: iso(new Date(now.getTime() - 30 * 86400000)) };
    case "90d": return { from: iso(new Date(now.getTime() - 90 * 86400000)) };
    default:    return {};
  }
}

interface FilterBarProps {
  value: FilterState;
  onChange: (next: FilterState) => void;
  onSearch: () => void;
  showClassification?: boolean;
}

export function FilterBar({ value, onChange, onSearch, showClassification = true }: FilterBarProps) {
  function set(patch: Partial<FilterState>) {
    onChange({ ...value, ...patch });
  }

  function clear() {
    onChange({ search: "", dateRange: "all", classification: "" });
  }

  const isDirty = value.search || value.dateRange !== "all" || value.classification;

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {/* Search */}
      <div className="relative flex-1 min-w-48">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <Input
          placeholder="Search headlines, facts…"
          value={value.search}
          onChange={(e) => set({ search: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          className="pl-8 h-8 text-sm"
        />
      </div>

      {/* Date range */}
      <select
        value={value.dateRange}
        onChange={(e) => { set({ dateRange: e.target.value }); }}
        className="h-8 text-sm border border-gray-200 rounded-md px-2 bg-white text-gray-700 focus:outline-none focus:border-blue-400"
      >
        {DATE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Classification / topic */}
      {showClassification && (
        <select
          value={value.classification}
          onChange={(e) => { set({ classification: e.target.value }); }}
          className="h-8 text-sm border border-gray-200 rounded-md px-2 bg-white text-gray-700 focus:outline-none focus:border-blue-400"
        >
          <option value="">All topics</option>
          {Object.entries(CLASSIFICATION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      )}

      {/* Search button + clear */}
      <button
        onClick={onSearch}
        className="h-8 px-3 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-700 transition"
      >
        Search
      </button>
      {isDirty && (
        <button
          onClick={clear}
          className="h-8 px-2 text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 rounded-md hover:bg-gray-100 transition"
        >
          <X className="w-3.5 h-3.5" /> Clear
        </button>
      )}
    </div>
  );
}
