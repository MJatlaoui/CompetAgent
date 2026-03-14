"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { SeenItem } from "@/lib/types";

function SourceMultiSelect({
  sources,
  selected,
  onChange,
}: {
  sources: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggle(src: string) {
    onChange(selected.includes(src) ? selected.filter((s) => s !== src) : [...selected, src]);
  }

  const label =
    selected.length === 0
      ? "All sources"
      : selected.length === 1
      ? selected[0]
      : `${selected.length} sources`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-accent hover:text-accent-foreground min-w-[160px]"
      >
        <span className="flex-1 text-left truncate">{label}</span>
        <svg className="w-4 h-4 opacity-50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-56 rounded-md border bg-white shadow-lg">
          <div className="p-1">
            <button
              type="button"
              className="w-full text-left text-xs text-gray-500 px-2 py-1 hover:bg-gray-100 rounded"
              onClick={() => onChange([])}
            >
              Clear all
            </button>
          </div>
          <div className="border-t max-h-64 overflow-y-auto">
            {sources.map((src) => (
              <label
                key={src}
                className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(src)}
                  onChange={() => toggle(src)}
                  className="rounded"
                />
                <span className="truncate">{src}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function IngestedPage() {
  const [items, setItems] = useState<SeenItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [allSources, setAllSources] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  const limit = 100;

  useEffect(() => {
    fetch("/api/ingested?view=sources")
      .then((r) => r.json())
      .then((d) => setAllSources(d.sources || []));
  }, []);

  async function fetchItems(resetOffset = false) {
    const currentOffset = resetOffset ? 0 : offset;
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(currentOffset) });
    if (search) params.set("search", search);
    if (selectedSources.length > 0) params.set("sources", selectedSources.join(","));
    const res = await fetch(`/api/ingested?${params}`);
    const data = await res.json();
    setItems(data.items);
    setTotal(data.total);
    setLoading(false);
  }

  useEffect(() => {
    fetchItems();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);

  function handleSearch() {
    setOffset(0);
    fetchItems(true);
  }

  // Re-fetch when source selection changes
  useEffect(() => {
    setOffset(0);
    fetchItems(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSources]);

  async function handleExport() {
    setExporting(true);
    setExportMsg("");
    try {
      const res = await fetch("/api/ingested/export", { method: "POST" });
      const data = await res.json();
      setExportMsg(
        data.ok
          ? `Exported ${data.count} items to Google Sheets → "Ingested" tab`
          : `Export failed: ${data.error}`
      );
    } catch (e: any) {
      setExportMsg(`Export failed: ${e.message}`);
    }
    setExporting(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Raw Feed</h2>
        <div className="flex items-center gap-3">
          {exportMsg && <span className="text-sm text-gray-600">{exportMsg}</span>}
          <Button
            onClick={handleExport}
            disabled={exporting}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {exporting ? "Exporting…" : "Export to Google Sheets"}
          </Button>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Search title or URL…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="max-w-sm"
        />
        <SourceMultiSelect
          sources={allSources}
          selected={selectedSources}
          onChange={setSelectedSources}
        />
        <Button variant="outline" onClick={handleSearch}>Search</Button>
      </div>

      <p className="text-sm text-gray-500 mb-3">{total.toLocaleString()} total ingested items</p>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-gray-500">No items found.</p>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold text-gray-600 w-1/2">Title</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-600 w-32">Source</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-600">URL</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-600 w-36">Seen At</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2 text-gray-900 max-w-0">
                      <span className="block truncate" title={item.title}>{item.title || "—"}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-600">{item.competitor}</td>
                    <td className="px-4 py-2 max-w-0">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-blue-600 hover:underline"
                        title={item.url}
                      >
                        {item.url}
                      </a>
                    </td>
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                      {item.seenAt
                        ? new Date(item.seenAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <Button
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              Previous
            </Button>
            <span className="text-sm text-gray-500">
              {offset + 1}–{Math.min(offset + limit, total)} of {total.toLocaleString()}
            </span>
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
