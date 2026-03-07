"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Plus, Rss, Globe, ChevronDown, ChevronUp, Clock, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CompetitorSource, IndustrySource, Feed } from "@/lib/sources";

const REFRESH_OPTIONS = [
  { label: "15 min", value: 0.25 },
  { label: "30 min", value: 0.5 },
  { label: "1 h",    value: 1 },
  { label: "2 h",    value: 2 },
  { label: "4 h",    value: 4 },
  { label: "6 h",    value: 6 },
  { label: "12 h",   value: 12 },
  { label: "24 h",   value: 24 },
  { label: "48 h",   value: 48 },
  { label: "72 h",   value: 72 },
];

function formatRelative(isoStr: string | undefined): string {
  if (!isoStr) return "never";
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatNextFetch(isoStr: string | undefined, refreshHours: number): string {
  if (!isoStr) return "on next run";
  const nextMs = new Date(isoStr).getTime() + refreshHours * 3600 * 1000;
  const diffMs = nextMs - Date.now();
  if (diffMs <= 0) return "overdue";
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  return `in ${Math.floor(hrs / 24)}d`;
}

// ─── Feed pill ────────────────────────────────────────────────────────────────
function FeedPill({ feed }: { feed: Feed }) {
  const Icon = feed.type === "rss" ? Rss : Globe;
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full max-w-xs truncate" title={feed.url}>
      <Icon className="w-3 h-3 shrink-0" />
      {feed.url}
    </span>
  );
}

// ─── Refresh selector ─────────────────────────────────────────────────────────
function RefreshSelector({
  name,
  sourceType,
  currentHours,
  lastFetched,
  onSaved,
}: {
  name: string;
  sourceType: "competitor" | "industry";
  currentHours: number;
  lastFetched: string | undefined;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState(currentHours);
  const [saving, setSaving] = useState(false);

  async function save(hours: number) {
    setSelected(hours);
    if (hours === currentHours) return;
    setSaving(true);
    await fetch(`/api/sources/${encodeURIComponent(name)}?type=${sourceType}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_hours: hours }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
      <Clock className="w-3 h-3 text-gray-400 shrink-0" />
      <span className="text-xs text-gray-500">Refresh every</span>
      <select
        value={selected}
        onChange={(e) => save(Number(e.target.value))}
        disabled={saving}
        className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white text-gray-700 focus:outline-none focus:border-blue-400"
      >
        {REFRESH_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span className="text-xs text-gray-400 ml-auto">
        Last: <span className="font-medium">{formatRelative(lastFetched)}</span>
        {" · "}
        Next: <span className="font-medium">{formatNextFetch(lastFetched, selected)}</span>
      </span>
      {saving && <span className="text-xs text-blue-500">Saving…</span>}
    </div>
  );
}

// ─── Competitor card ──────────────────────────────────────────────────────────
function CompetitorCard({
  source,
  lastFetched,
  onRemove,
  onRefresh,
}: {
  source: CompetitorSource;
  lastFetched: string | undefined;
  onRemove: (name: string) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const refreshHours = source.refresh_hours ?? 2;

  return (
    <div className="bg-white border rounded-lg p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900 text-sm">{source.name}</span>
          <span className="text-xs text-gray-400">{source.feeds.length} feed{source.feeds.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            onClick={() => onRemove(source.name)}
            className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
            title="Remove source"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="flex flex-col gap-1 pl-1 mt-1">
          {source.feeds.map((f, i) => <FeedPill key={i} feed={f} />)}
        </div>
      )}
      <RefreshSelector
        name={source.name}
        sourceType="competitor"
        currentHours={refreshHours}
        lastFetched={lastFetched}
        onSaved={onRefresh}
      />
    </div>
  );
}

// ─── Industry card ────────────────────────────────────────────────────────────
function IndustryCard({
  source,
  lastFetched,
  onRemove,
  onRefresh,
}: {
  source: IndustrySource;
  lastFetched: string | undefined;
  onRemove: (name: string) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const refreshHours = source.refresh_hours ?? 24;

  return (
    <div className="bg-white border rounded-lg p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900 text-sm">{source.name}</span>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{source.category}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${source.tier === 1 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
            Tier {source.tier}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            onClick={() => onRemove(source.name)}
            className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
            title="Remove source"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="flex flex-col gap-1 pl-1 mt-1">
          {source.feeds.map((f, i) => <FeedPill key={i} feed={f} />)}
        </div>
      )}
      <RefreshSelector
        name={source.name}
        sourceType="industry"
        currentHours={refreshHours}
        lastFetched={lastFetched}
        onSaved={onRefresh}
      />
    </div>
  );
}

// ─── Add competitor form ──────────────────────────────────────────────────────
function AddCompetitorForm({ onAdd }: { onAdd: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!name.trim() || !url.trim()) { setError("Name and URL are required."); return; }
    setSaving(true); setError("");
    const res = await fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceType: "competitor", name, feedUrl: url }),
    });
    setSaving(false);
    if (res.ok) { setName(""); setUrl(""); setOpen(false); onAdd(); }
    else { const d = await res.json(); setError(d.error || "Failed to save."); }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="w-full mt-2">
        <Plus className="w-3 h-3 mr-1" /> Add Competitor Source
      </Button>
    );
  }

  return (
    <div className="border border-dashed border-gray-300 rounded-lg p-4 mt-2 bg-gray-50 space-y-2">
      <p className="text-xs font-semibold text-gray-600 uppercase">New Competitor Source</p>
      <Input placeholder="Competitor name (e.g. Genesys)" value={name} onChange={(e) => setName(e.target.value)} />
      <Input placeholder="RSS feed URL" value={url} onChange={(e) => setUrl(e.target.value)} />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add"}</Button>
        <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setError(""); }}>Cancel</Button>
      </div>
    </div>
  );
}

// ─── Add industry form ────────────────────────────────────────────────────────
function AddIndustryForm({ onAdd }: { onAdd: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [tier, setTier] = useState<"1" | "2">("1");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!name.trim() || !url.trim()) { setError("Name and URL are required."); return; }
    setSaving(true); setError("");
    const res = await fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceType: "industry", name, feedUrl: url, category: category || "General", tier: Number(tier) }),
    });
    setSaving(false);
    if (res.ok) { setName(""); setCategory(""); setUrl(""); setTier("1"); setOpen(false); onAdd(); }
    else { const d = await res.json(); setError(d.error || "Failed to save."); }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="w-full mt-2">
        <Plus className="w-3 h-3 mr-1" /> Add Industry Source
      </Button>
    );
  }

  return (
    <div className="border border-dashed border-gray-300 rounded-lg p-4 mt-2 bg-gray-50 space-y-2">
      <p className="text-xs font-semibold text-gray-600 uppercase">New Industry Source</p>
      <Input placeholder="Source name (e.g. CX Today)" value={name} onChange={(e) => setName(e.target.value)} />
      <Input placeholder="Category (e.g. CX / CCaaS News)" value={category} onChange={(e) => setCategory(e.target.value)} />
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-600">Tier:</span>
        {(["1", "2"] as const).map((t) => (
          <label key={t} className="flex items-center gap-1 text-xs cursor-pointer">
            <input type="radio" value={t} checked={tier === t} onChange={() => setTier(t)} className="accent-blue-600" />
            Tier {t} {t === "1" ? "(primary)" : "(secondary)"}
          </label>
        ))}
      </div>
      <Input placeholder="RSS feed URL" value={url} onChange={(e) => setUrl(e.target.value)} />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add"}</Button>
        <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setError(""); }}>Cancel</Button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SourcesPage() {
  const [competitors, setCompetitors] = useState<CompetitorSource[]>([]);
  const [industry, setIndustry] = useState<IndustrySource[]>([]);
  const [fetchLog, setFetchLog] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [paused, setPaused] = useState<boolean | null>(null);
  const [pauseLoading, setPauseLoading] = useState(false);

  useEffect(() => {
    fetch("/api/settings?key=ingestion_paused")
      .then((r) => r.json())
      .then((d) => setPaused(d.value === "true"));
  }, []);

  async function togglePause() {
    if (paused === null) return;
    const next = !paused;
    setPauseLoading(true);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "ingestion_paused", value: next ? "true" : "false" }),
    });
    setPaused(next);
    setPauseLoading(false);
  }

  function handleExport() {
    window.location.href = "/api/sources/export";
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMsg(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/sources/import", { method: "POST", body: form });
    const data = await res.json();
    setImporting(false);
    if (res.ok) {
      setImportMsg({ text: `Imported ${data.added} feed${data.added !== 1 ? "s" : ""} (${data.skipped} already existed).`, ok: true });
      fetchSources();
    } else {
      setImportMsg({ text: data.error || "Import failed.", ok: false });
    }
    // reset so the same file can be re-imported if needed
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function fetchSources() {
    const res = await fetch("/api/sources");
    const data = await res.json();
    setCompetitors(data.competitors ?? []);
    setIndustry(data.industry ?? []);
    setFetchLog(data.fetchLog ?? {});
    setLoading(false);
  }

  useEffect(() => { fetchSources(); }, []);

  async function removeCompetitor(name: string) {
    if (!confirm(`Remove competitor "${name}"?`)) return;
    await fetch(`/api/sources/${encodeURIComponent(name)}?type=competitor`, { method: "DELETE" });
    fetchSources();
  }

  async function removeIndustry(name: string) {
    if (!confirm(`Remove industry source "${name}"?`)) return;
    await fetch(`/api/sources/${encodeURIComponent(name)}?type=industry`, { method: "DELETE" });
    fetchSources();
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h2 className="text-2xl font-bold">Sources</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage RSS feeds and refresh schedules. The pipeline runs every 2 hours but only fetches sources that are due.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-1">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-3 h-3 mr-1.5" /> Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            <Upload className="w-3 h-3 mr-1.5" />
            {importing ? "Importing…" : "Import CSV"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleImport}
          />
        </div>
      </div>
      {importMsg && (
        <p className={`text-sm mt-2 mb-4 px-3 py-2 rounded-md border ${importMsg.ok ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
          {importMsg.text}
        </p>
      )}

      {/* Ingestion Pipeline toggle */}
      {paused !== null && (
        <div className="flex items-center justify-between px-4 py-3 rounded-lg border mb-6 bg-white">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-800">Ingestion Pipeline</span>
            {paused ? (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">PAUSED</span>
            ) : (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">RUNNING</span>
            )}
          </div>
          <Button
            size="sm"
            variant={paused ? "default" : "outline"}
            className={paused ? "bg-green-600 hover:bg-green-700 text-white" : "border-red-400 text-red-600 hover:bg-red-50"}
            onClick={togglePause}
            disabled={pauseLoading}
          >
            {pauseLoading ? "Saving…" : paused ? "Resume" : "Pause"}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg border p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Competitor Sources */}
          <section>
            <h3 className="text-base font-semibold text-gray-800 mb-3">
              Competitor Sources
              <span className="ml-2 text-sm font-normal text-gray-400">{competitors.length}</span>
            </h3>
            <div className="space-y-2">
              {competitors.map((src) => (
                <CompetitorCard
                  key={src.name}
                  source={src}
                  lastFetched={fetchLog[src.name]}
                  onRemove={removeCompetitor}
                  onRefresh={fetchSources}
                />
              ))}
            </div>
            <AddCompetitorForm onAdd={fetchSources} />
          </section>

          {/* Industry Sources */}
          <section>
            <h3 className="text-base font-semibold text-gray-800 mb-3">
              Industry Sources
              <span className="ml-2 text-sm font-normal text-gray-400">{industry.length}</span>
            </h3>
            <div className="space-y-2">
              {industry.map((src) => (
                <IndustryCard
                  key={src.name}
                  source={src}
                  lastFetched={fetchLog[src.name]}
                  onRemove={removeIndustry}
                  onRefresh={fetchSources}
                />
              ))}
            </div>
            <AddIndustryForm onAdd={fetchSources} />
          </section>
        </div>
      )}
    </div>
  );
}
