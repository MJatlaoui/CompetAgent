"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Trash2, Plus, Rss, Globe, ChevronDown, ChevronUp, Clock, Download, Upload, FlaskConical, CheckCircle2, XCircle, Loader2, AlertTriangle, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CompetitorSource, IndustrySource, Feed } from "@/lib/sources";
import { DisableAllButton } from "@/components/DisableAllButton";
import { useTheme } from "@/components/ThemeProvider";

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

type FeedTestResult = { url: string; ok: boolean; status?: number; error?: string };
type SourceTestResult = { ok: boolean; feeds: FeedTestResult[] };
type TestMap = Record<string, SourceTestResult>;
type HealthStatus = { lastError: string | null; lastErrorAt: string | null; consecutiveFailures: number };
type HealthLog = Record<string, HealthStatus>;

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

// ─── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      title={enabled ? "Disable source" : "Enable source"}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none",
        enabled ? "bg-green-500" : "bg-gray-300",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <span className={cn(
        "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
        enabled ? "translate-x-[18px]" : "translate-x-0.5",
      )} />
    </button>
  );
}

// ─── Test badge ────────────────────────────────────────────────────────────────
function TestBadge({ result, testing }: { result: SourceTestResult | undefined; testing: boolean }) {
  if (testing) return <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />;
  if (!result) return null;
  if (result.ok) return <span title="All feeds reachable"><CheckCircle2 className="w-4 h-4 text-green-500" /></span>;
  const err = result.feeds.find((f) => !f.ok)?.error ?? "Failed";
  return <span title={err}><XCircle className="w-4 h-4 text-red-500" /></span>;
}

// ─── Health badge ─────────────────────────────────────────────────────────────
function HealthBadge({ health }: { health: HealthStatus | undefined }) {
  if (!health || health.consecutiveFailures === 0) return null;
  const color = health.consecutiveFailures >= 3 ? "text-red-500" : "text-yellow-500";
  const tooltip = `${health.consecutiveFailures}x consecutive failure${health.consecutiveFailures > 1 ? "s" : ""}: ${health.lastError ?? "unknown error"}`;
  return (
    <span title={tooltip}>
      <AlertTriangle className={cn("w-4 h-4 shrink-0", color)} />
    </span>
  );
}

// ─── Feed pill ────────────────────────────────────────────────────────────────
function FeedPill({ feed, testResult }: { feed: Feed; testResult?: FeedTestResult }) {
  const Icon = feed.type === "rss" ? Rss : Globe;
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full max-w-xs truncate"
        title={feed.url}
      >
        <Icon className="w-3 h-3 shrink-0" />
        {feed.url}
      </span>
      {testResult && (
        testResult.ok
          ? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
          : <span className="text-xs text-red-500 shrink-0">{testResult.error}</span>
      )}
    </div>
  );
}

// ─── Refresh selector ─────────────────────────────────────────────────────────
function RefreshSelector({
  name, sourceType, currentHours, lastFetched, onSaved,
}: {
  name: string; sourceType: "competitor" | "industry"; currentHours: number;
  lastFetched: string | undefined; onSaved: () => void;
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
  source, lastFetched, testResult, testing, healthStatus, onRemove, onToggle, onRefresh,
}: {
  source: CompetitorSource; lastFetched: string | undefined;
  testResult: SourceTestResult | undefined; testing: boolean;
  healthStatus: HealthStatus | undefined;
  onRemove: (name: string) => void; onToggle: (name: string, enabled: boolean) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const enabled = !source.disabled;
  const refreshHours = source.refresh_hours ?? 2;

  return (
    <div className={cn("bg-white border rounded-lg p-4 flex flex-col gap-1 transition-opacity", !enabled && "opacity-50")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Toggle enabled={enabled} onChange={(v) => onToggle(source.name, v)} />
          <span className="font-semibold text-gray-900 text-sm">{source.name}</span>
          <span className="text-xs text-gray-400">{source.feeds.length} feed{source.feeds.length !== 1 ? "s" : ""}</span>
          <HealthBadge health={healthStatus} />
          <TestBadge result={testResult} testing={testing} />
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setExpanded((v) => !v)} className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button onClick={() => onRemove(source.name)} className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition" title="Remove source">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="flex flex-col gap-1.5 pl-1 mt-1">
          {source.feeds.map((f, i) => (
            <FeedPill key={i} feed={f} testResult={testResult?.feeds[i]} />
          ))}
        </div>
      )}
      <RefreshSelector name={source.name} sourceType="competitor" currentHours={refreshHours} lastFetched={lastFetched} onSaved={onRefresh} />
    </div>
  );
}

// ─── Industry card ────────────────────────────────────────────────────────────
function IndustryCard({
  source, lastFetched, testResult, testing, healthStatus, onRemove, onToggle, onRefresh,
}: {
  source: IndustrySource; lastFetched: string | undefined;
  testResult: SourceTestResult | undefined; testing: boolean;
  healthStatus: HealthStatus | undefined;
  onRemove: (name: string) => void; onToggle: (name: string, enabled: boolean) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const enabled = !source.disabled;
  const refreshHours = source.refresh_hours ?? 24;

  return (
    <div className={cn("bg-white border rounded-lg p-4 flex flex-col gap-1 transition-opacity", !enabled && "opacity-50")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Toggle enabled={enabled} onChange={(v) => onToggle(source.name, v)} />
          <span className="font-semibold text-gray-900 text-sm">{source.name}</span>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{source.category}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${source.tier === 1 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
            Tier {source.tier}
          </span>
          <HealthBadge health={healthStatus} />
          <TestBadge result={testResult} testing={testing} />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setExpanded((v) => !v)} className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button onClick={() => onRemove(source.name)} className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition" title="Remove source">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="flex flex-col gap-1.5 pl-1 mt-1">
          {source.feeds.map((f, i) => (
            <FeedPill key={i} feed={f} testResult={testResult?.feeds[i]} />
          ))}
        </div>
      )}
      <RefreshSelector name={source.name} sourceType="industry" currentHours={refreshHours} lastFetched={lastFetched} onSaved={onRefresh} />
    </div>
  );
}

// ─── Add forms (unchanged) ────────────────────────────────────────────────────
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
  const { theme, setTheme } = useTheme();
  const [competitors, setCompetitors] = useState<CompetitorSource[]>([]);
  const [industry, setIndustry] = useState<IndustrySource[]>([]);
  const [fetchLog, setFetchLog] = useState<Record<string, string>>({});
  const [healthLog, setHealthLog] = useState<HealthLog>({});
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [paused, setPaused] = useState<boolean | null>(null);
  const [pauseLoading, setPauseLoading] = useState(false);
  const [testResults, setTestResults] = useState<TestMap>({});
  const [testing, setTesting] = useState(false);
  const [testSummary, setTestSummary] = useState<{ ok: number; fail: number } | null>(null);
  const [scoreThreshold, setScoreThreshold] = useState<number>(7);
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [autoScoringEnabled, setAutoScoringEnabled] = useState(true);
  const [autoInboxThreshold, setAutoInboxThreshold] = useState(9);
  const [autoDiscardThreshold, setAutoDiscardThreshold] = useState(4);
  const [autoSettingsSaving, setAutoSettingsSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings?key=ingestion_paused")
      .then((r) => r.json())
      .then((d) => setPaused(d.value === "true"));
    // Load auto-scoring settings
    Promise.all([
      fetch("/api/settings?key=auto_scoring_enabled").then((r) => r.json()),
      fetch("/api/settings?key=auto_inbox_threshold").then((r) => r.json()),
      fetch("/api/settings?key=auto_discard_threshold").then((r) => r.json()),
    ]).then(([en, inbox, discard]) => {
      if (en.value !== null) setAutoScoringEnabled(en.value !== "false");
      if (inbox.value !== null) setAutoInboxThreshold(Number(inbox.value));
      if (discard.value !== null) setAutoDiscardThreshold(Number(discard.value));
    });
  }, []);

  useEffect(() => {
    fetch("/api/settings?key=score_threshold")
      .then((r) => r.json())
      .then((d) => {
        if (d.value !== null && d.value !== undefined) {
          setScoreThreshold(Number(d.value));
        }
      });
  }, []);

  async function saveScoreThreshold(value: number) {
    const clamped = Math.min(10, Math.max(1, value));
    setScoreThreshold(clamped);
    setThresholdSaving(true);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "score_threshold", value: String(clamped) }),
    });
    setThresholdSaving(false);
  }

  async function saveAutoSetting(key: string, value: string) {
    setAutoSettingsSaving(true);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    setAutoSettingsSaving(false);
  }

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

  function handleExport() { window.location.href = "/api/sources/export"; }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportMsg(null);
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
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function fetchSources() {
    const res = await fetch("/api/sources");
    const data = await res.json();
    setCompetitors(data.competitors ?? []);
    setIndustry(data.industry ?? []);
    setFetchLog(data.fetchLog ?? {});
    setHealthLog(data.healthLog ?? {});
    setLoading(false);
  }

  useEffect(() => { fetchSources(); }, []);

  async function toggleSource(sourceType: "competitor" | "industry", name: string, enabled: boolean) {
    await fetch(`/api/sources/${encodeURIComponent(name)}?type=${sourceType}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    fetchSources();
  }

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

  async function runTests() {
    setTesting(true);
    setTestResults({});
    setTestSummary(null);
    try {
      const res = await fetch("/api/sources/test");
      const data = await res.json();
      const results: TestMap = data.results ?? {};
      setTestResults(results);
      const entries = Object.values(results);
      setTestSummary({ ok: entries.filter((r) => r.ok).length, fail: entries.filter((r) => !r.ok).length });
    } catch {
      setTestSummary({ ok: 0, fail: 0 });
    }
    setTesting(false);
  }

  const failingNames = Object.entries(testResults)
    .filter(([, r]) => !r.ok)
    .map(([name]) => name);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h2 className="text-2xl font-bold">Sources</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage RSS feeds and refresh schedules. Toggle sources on/off to include or exclude them from the pipeline.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-1">
          <DisableAllButton />
          <Button
            variant="outline"
            size="sm"
            onClick={runTests}
            disabled={testing || loading}
          >
            {testing
              ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Testing…</>
              : <><FlaskConical className="w-3 h-3 mr-1.5" /> Test All Sources</>
            }
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-3 h-3 mr-1.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload className="w-3 h-3 mr-1.5" />
            {importing ? "Importing…" : "Import CSV"}
          </Button>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImport} />
        </div>
      </div>

      {importMsg && (
        <p className={`text-sm mt-2 mb-4 px-3 py-2 rounded-md border ${importMsg.ok ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
          {importMsg.text}
        </p>
      )}

      {/* Test summary banner */}
      {testSummary && (
        <div className={`flex items-center gap-4 px-4 py-3 rounded-lg border mb-4 text-sm ${testSummary.fail > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
          <span className="font-medium text-gray-800">Test results:</span>
          <span className="flex items-center gap-1 text-green-700"><CheckCircle2 className="w-4 h-4" /> {testSummary.ok} reachable</span>
          {testSummary.fail > 0 && (
            <span className="flex items-center gap-1 text-red-600"><XCircle className="w-4 h-4" /> {testSummary.fail} failing — {failingNames.slice(0, 5).join(", ")}{failingNames.length > 5 ? ` +${failingNames.length - 5} more` : ""}</span>
          )}
        </div>
      )}

      {/* Ingestion Pipeline toggle */}
      {paused !== null && (
        <div className="flex items-center justify-between px-4 py-3 rounded-lg border mb-4 bg-white">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-800">Ingestion Pipeline</span>
            {paused
              ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">PAUSED</span>
              : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">RUNNING</span>
            }
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

      {/* Display Theme */}
      <div className="flex items-center justify-between px-4 py-3 rounded-lg border mb-3 bg-white">
        <div>
          <span className="text-sm font-semibold text-gray-800">Display Theme</span>
          <p className="text-xs text-gray-500 mt-0.5">
            {theme === "tactical"
              ? "Tactical — Intel-X dark mode with neon green palette"
              : "Default — Clean light mode"}
          </p>
        </div>
        <button
          onClick={() => setTheme(theme === "tactical" ? "default" : "tactical")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded text-sm font-semibold transition-all",
            theme === "tactical"
              ? "bg-green-600 hover:bg-green-700 text-black border border-green-500"
              : "bg-gray-900 hover:bg-gray-700 text-white border border-gray-700"
          )}
        >
          <Monitor className="w-4 h-4" />
          {theme === "tactical" ? "Switch to Default" : "Switch to Tactical"}
        </button>
      </div>

      {/* Score Threshold setting */}
      <div className="flex items-center justify-between px-4 py-3 rounded-lg border mb-3 bg-white">
        <div>
          <span className="text-sm font-semibold text-gray-800">Score Threshold</span>
          <p className="text-xs text-gray-500 mt-0.5">Minimum score (1–10) for the automated pipeline to save items to the Inbox. Manual scoring from the Feed always shows results regardless of score.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="number"
            min={1}
            max={10}
            value={scoreThreshold}
            onChange={(e) => setScoreThreshold(Number(e.target.value))}
            onBlur={(e) => saveScoreThreshold(Number(e.target.value))}
            onKeyDown={(e) => { if (e.key === "Enter") saveScoreThreshold(scoreThreshold); }}
            disabled={thresholdSaving}
            className="w-16 text-center text-sm border border-gray-200 rounded px-2 py-1 bg-white text-gray-800 focus:outline-none focus:border-blue-400"
          />
          {thresholdSaving && <span className="text-xs text-blue-500">Saving…</span>}
        </div>
      </div>

      {/* Auto-Scoring settings panel */}
      <div className="rounded-lg border mb-6 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-violet-500" />
            <span className="text-sm font-semibold text-gray-800">Auto-Scoring</span>
            {autoScoringEnabled
              ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">ENABLED</span>
              : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">DISABLED</span>
            }
          </div>
          <Toggle
            enabled={autoScoringEnabled}
            onChange={(v) => { setAutoScoringEnabled(v); saveAutoSetting("auto_scoring_enabled", v ? "true" : "false"); }}
          />
        </div>
        <div className={`px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-4 ${!autoScoringEnabled ? "opacity-50 pointer-events-none" : ""}`}>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Inbox threshold</label>
            <div className="flex items-center gap-2">
              <select
                value={autoInboxThreshold}
                onChange={(e) => { const v = Number(e.target.value); setAutoInboxThreshold(v); saveAutoSetting("auto_inbox_threshold", String(v)); }}
                disabled={autoSettingsSaving}
                className="text-sm border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-violet-400"
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span className="text-xs text-gray-400">Items scoring ≥ this appear in the Suggested inbox</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Discard threshold</label>
            <div className="flex items-center gap-2">
              <select
                value={autoDiscardThreshold}
                onChange={(e) => { const v = Number(e.target.value); setAutoDiscardThreshold(v); saveAutoSetting("auto_discard_threshold", String(v)); }}
                disabled={autoSettingsSaving}
                className="text-sm border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-violet-400"
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span className="text-xs text-gray-400">Items scoring ≤ this are auto-discarded</span>
            </div>
          </div>
          <div className="sm:col-span-2 text-xs text-gray-400">
            Scores recent unscored feed items (last 7 days, up to 50 per run). High-signal items surface with a violet AI badge in the inbox.
            {autoSettingsSaving && <span className="ml-2 text-violet-500">Saving…</span>}
          </div>
        </div>
      </div>

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
              {testSummary && (
                <span className="ml-2 text-xs font-normal text-red-500">
                  {competitors.filter((s) => testResults[s.name] && !testResults[s.name].ok).length > 0
                    ? `${competitors.filter((s) => testResults[s.name] && !testResults[s.name].ok).length} failing`
                    : ""}
                </span>
              )}
            </h3>
            <div className="space-y-2">
              {competitors.map((src) => (
                <CompetitorCard
                  key={src.name}
                  source={src}
                  lastFetched={fetchLog[src.name]}
                  testResult={testResults[src.name]}
                  testing={testing}
                  healthStatus={healthLog[src.name]}
                  onRemove={removeCompetitor}
                  onToggle={(name, enabled) => toggleSource("competitor", name, enabled)}
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
              {testSummary && (
                <span className="ml-2 text-xs font-normal text-red-500">
                  {industry.filter((s) => testResults[s.name] && !testResults[s.name].ok).length > 0
                    ? `${industry.filter((s) => testResults[s.name] && !testResults[s.name].ok).length} failing`
                    : ""}
                </span>
              )}
            </h3>
            <div className="space-y-2">
              {industry.map((src) => (
                <IndustryCard
                  key={src.name}
                  source={src}
                  lastFetched={fetchLog[src.name]}
                  testResult={testResults[src.name]}
                  testing={testing}
                  healthStatus={healthLog[src.name]}
                  onRemove={removeIndustry}
                  onToggle={(name, enabled) => toggleSource("industry", name, enabled)}
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
