"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Insight } from "@/lib/types";
import { CategoryAnchor } from "./CategoryAnchor";
import { HeatBadge } from "./HeatBadge";
import { ScoreBar } from "./ScoreBar";
import { SourceTag } from "./SourceTag";
import { StrategicAngle } from "./StrategicAngle";
import { WorkflowToolbar } from "./WorkflowToolbar";
import { CLASSIFICATION_LABELS, CLASSIFICATION_BORDER } from "@/lib/classifications";

const STATUS_STYLES: Record<string, string> = {
  pending:   "text-gray-500 border-gray-300",
  approved:  "text-green-700 border-green-400",
  review:    "text-amber-700 border-amber-400",
  discarded: "text-red-600 border-red-400",
  seen:      "text-blue-600 border-blue-400",
  suggested: "text-violet-600 border-violet-400",
  scoring:   "text-gray-400 border-gray-200",
};

const STATUS_LABELS: Record<string, string> = {
  pending:   "New",
  suggested: "Suggested",
  scoring:   "Scoring…",
  review:    "Flagged",
  approved:  "Approved",
  discarded: "Archived",
  seen:      "Seen",
  error:     "Error",
};

interface InsightCardProps {
  insight: Insight;
  showActions?: boolean;
  onStatusChange?: (id: string, status: string) => void;
  onTagsChange?: (id: string, tags: string[]) => void;
  onNotesChange?: (id: string, notes: string) => void;
  selected?: boolean;
  onSelect?: (id: string, checked: boolean) => void;
  variant?: "default" | "bulletin";
  focused?: boolean;
  forceExpanded?: boolean;
  onToggleExpand?: (id: string) => void;
}

export function InsightCard({
  insight,
  showActions = true,
  onStatusChange,
  onTagsChange,
  onNotesChange,
  selected,
  onSelect,
  variant = "default",
  focused,
  forceExpanded,
  onToggleExpand,
}: InsightCardProps) {
  const [expanded, setExpanded] = useState(variant === "bulletin");
  const [isActing, setIsActing] = useState(false);
  const [actingButton, setActingButton] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const isExpanded = onToggleExpand ? (forceExpanded ?? expanded) : expanded;

  function toggleExpand() {
    if (onToggleExpand) onToggleExpand(insight.id);
    else setExpanded((e) => !e);
  }

  function act(buttonKey: string, status: string) {
    if (isActing || !onStatusChange) return;
    setIsActing(true);
    setActingButton(buttonKey);
    onStatusChange(insight.id, status);
    // Reset after 2s in case the card isn't removed (e.g. non-pending views)
    setTimeout(() => { setIsActing(false); setActingButton(null); }, 2000);
  }

  useEffect(() => {
    if (focused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focused]);

  const postedDate = insight.postedAt
    ? new Date(insight.postedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const borderCls = CLASSIFICATION_BORDER[insight.classification] ?? "border-l-gray-300";
  const statusCls = STATUS_STYLES[insight.status] ?? "text-gray-500 border-gray-300";
  const isBulletin = variant === "bulletin";

  return (
    <div ref={cardRef}>
      <Card className={`mb-3 overflow-hidden transition-colors ${selected ? "ring-2 ring-blue-400 ring-inset" : ""} ${focused ? "ring-2 ring-orange-400 ring-inset" : ""} ${isBulletin ? `border-l-4 ${borderCls}` : ""}`}>
        <div className="flex">
          {!isBulletin && <CategoryAnchor classification={insight.classification} />}

          <div className="flex-1 p-3 min-w-0">
            {/* Always-visible header */}
            <div className="flex items-start gap-2">
              <div
                className={`flex-1 min-w-0 ${!isBulletin ? "cursor-pointer" : ""}`}
                onClick={() => !isBulletin && toggleExpand()}
              >
                {/* Meta row */}
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {onSelect && (
                    <input
                      type="checkbox"
                      checked={selected ?? false}
                      onChange={(e) => onSelect(insight.id, e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 accent-blue-600 cursor-pointer shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  <span className="font-semibold text-gray-900">{insight.competitor}</span>
                  <Badge variant="outline" className="text-xs">
                    {CLASSIFICATION_LABELS[insight.classification] ?? insight.classification}
                  </Badge>
                  <span className={`text-xs border rounded-full px-2 py-0.5 ${statusCls}`}>
                    {STATUS_LABELS[insight.status] ?? insight.status}
                  </span>
                  {insight.autoScored && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium bg-violet-50 text-violet-600 border border-violet-200 px-1.5 py-0.5 rounded-full">
                      <Bot className="w-3 h-3" /> AI
                    </span>
                  )}
                  {insight.status === "approved" && insight.sheetsSynced === false && (
                    <span className="text-xs text-amber-600 border border-amber-400 rounded-full px-2 py-0.5">
                      Sheets sync failed
                    </span>
                  )}
                  <span className="text-sm font-bold text-gray-800">
                    {insight.score}<span className="text-xs font-normal text-gray-400">/10</span>
                  </span>
                </div>

                {/* Headline */}
                <h3 className={`font-semibold text-gray-900 leading-snug mb-1 ${isBulletin ? "text-base" : "text-sm"}`}>
                  {insight.headline}
                </h3>

                {/* Source + date */}
                <div className="flex items-center gap-2 flex-wrap">
                  <SourceTag sourceName={insight.competitor} isPrimary={insight.sourceType === "primary"} />
                  {postedDate && <span className="text-xs text-gray-400">{postedDate}</span>}
                </div>
              </div>

              {/* Right: CTA + primary action + toggle */}
              <div className="flex items-center gap-2 shrink-0">
                {showActions && onStatusChange && (insight.status === "pending" || insight.status === "review" || insight.status === "suggested") && (
                  <button
                    className="text-xs text-gray-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={(e) => { e.stopPropagation(); act("archive-inline", "discarded"); }}
                    disabled={isActing}
                    title="Archive"
                  >
                    {actingButton === "archive-inline" ? "Saving…" : "Archive"}
                  </button>
                )}
                <a
                  href={insight.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-1.5 rounded font-medium transition"
                >
                  Read →
                </a>
                {showActions && onStatusChange && (insight.status === "pending" || insight.status === "review" || insight.status === "suggested") && (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-xs"
                    onClick={(e) => { e.stopPropagation(); act("approve", "approved"); }}
                    disabled={isActing}
                  >
                    {actingButton === "approve" ? (
                      <span className="flex items-center gap-1">
                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        Saving…
                      </span>
                    ) : "Approve"}
                  </Button>
                )}
                {!isBulletin && (
                  <Link
                    href={`/review/${insight.id}`}
                    className="text-gray-400 hover:text-gray-600 p-0.5"
                    title="Open permalink"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                )}
                {!isBulletin && (
                  <button
                    onClick={toggleExpand}
                    className="text-gray-400 hover:text-gray-600 p-0.5"
                    aria-label="Toggle details"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>

            {/* Expanded details */}
            {isExpanded && (
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                {insight.heat !== undefined && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">Heat</span>
                    <HeatBadge heat={insight.heat} delta={insight.heatDelta} />
                  </div>
                )}

                {insight.subScores && <ScoreBar subScores={insight.subScores} />}

                {insight.productFacts.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Product Facts</p>
                    <ul className="text-sm list-disc list-inside space-y-0.5 text-gray-700">
                      {insight.productFacts.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  </div>
                )}

                <StrategicAngle competitiveGap={insight.competitiveGap} />

                {insight.salesAngle && (
                  <div className="text-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Sales Angle</p>
                    <p className="text-gray-700">{insight.salesAngle}</p>
                  </div>
                )}

                {insight.strategicPrioritiesHit.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Priorities Hit</p>
                    <div className="flex gap-1 flex-wrap">
                      {insight.strategicPrioritiesHit.map((p, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{p}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {insight.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {insight.tags.map((tag, i) => (
                      <span key={i} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {showActions && onNotesChange !== undefined && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Analyst Notes</p>
                    <textarea
                      className="w-full text-sm border border-gray-200 rounded p-2 text-gray-700 placeholder-gray-400 resize-none focus:outline-none focus:border-blue-400"
                      rows={2}
                      placeholder="Add context, deal team notes, follow-ups…"
                      defaultValue={insight.notes || ""}
                      onBlur={(e) => onNotesChange(insight.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}

                {(insight.updatedBy || insight.updatedAt) && (
                  <p className="text-xs text-gray-400 pt-1">
                    Last updated
                    {insight.updatedBy && ` by ${insight.updatedBy}`}
                    {insight.updatedAt && ` on ${new Date(insight.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}
                  </p>
                )}

                {/* Footer: workflow + secondary actions */}
                {showActions && onStatusChange && (
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    {onTagsChange ? (
                      <WorkflowToolbar
                        insightId={insight.id}
                        tags={insight.tags}
                        onStatusChange={onStatusChange}
                        onTagsChange={onTagsChange}
                      />
                    ) : <div />}
                    <div className="flex items-center gap-3">
                      {insight.status === "pending" && (
                        <>
                          <button
                            className="text-xs text-amber-700 hover:text-amber-900 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => act("flag", "review")}
                            disabled={isActing}
                          >
                            {actingButton === "flag" ? "Saving…" : "Flag"}
                          </button>
                          <button
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => act("archive-footer", "discarded")}
                            disabled={isActing}
                          >
                            {actingButton === "archive-footer" ? "Saving…" : "Archive"}
                          </button>
                        </>
                      )}
                      {insight.status === "review" && (
                        <>
                          <button
                            className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => act("requeue", "pending")}
                            disabled={isActing}
                          >
                            {actingButton === "requeue" ? "Saving…" : "Requeue"}
                          </button>
                          <button
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => act("archive-footer", "discarded")}
                            disabled={isActing}
                          >
                            {actingButton === "archive-footer" ? "Saving…" : "Archive"}
                          </button>
                        </>
                      )}
                      {insight.status === "discarded" && (
                        <button
                          className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => act("restore", "pending")}
                          disabled={isActing}
                        >
                          {actingButton === "restore" ? "Saving…" : "Restore"}
                        </button>
                      )}
                      {insight.status === "approved" && (
                        <>
                          <button
                            className="text-xs text-amber-700 hover:text-amber-900 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => act("move-review", "review")}
                            disabled={isActing}
                          >
                            {actingButton === "move-review" ? "Saving…" : "Move to Review"}
                          </button>
                          <button
                            className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => act("archive-footer", "discarded")}
                            disabled={isActing}
                          >
                            {actingButton === "archive-footer" ? "Saving…" : "Archive"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
