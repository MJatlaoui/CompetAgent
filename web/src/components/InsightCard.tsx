"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Insight } from "@/lib/types";

const CLASSIFICATION_EMOJI: Record<string, string> = {
  TECHNICAL_SHIFT: "\u{1F527}",
  FEATURE_LAUNCH: "\u{1F680}",
  PRICING_CHANGE: "\u{1F4B0}",
  PARTNERSHIP: "\u{1F91D}",
  MARKETING_NOISE: "\u{1F4E2}",
  IRRELEVANT: "\u{1F5D1}",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-200 text-gray-800",
  approved: "bg-green-100 text-green-800",
  review: "bg-yellow-100 text-yellow-800",
  discarded: "bg-red-100 text-red-800",
};

interface InsightCardProps {
  insight: Insight;
  showActions?: boolean;
  onStatusChange?: (id: string, status: string) => void;
}

export function InsightCard({ insight, showActions = true, onStatusChange }: InsightCardProps) {
  const emoji = CLASSIFICATION_EMOJI[insight.classification] || "\u{1F4CC}";
  const scoreBar = "\u2588".repeat(insight.score) + "\u2591".repeat(10 - insight.score);

  return (
    <Card className="p-4 mb-3">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{emoji}</span>
          <span className="font-semibold">{insight.competitor}</span>
          <Badge variant="outline">{insight.classification}</Badge>
          <Badge className={STATUS_COLORS[insight.status]}>{insight.status}</Badge>
        </div>
        <span className="text-sm font-mono text-gray-500">
          {insight.score}/10 {scoreBar}
        </span>
      </div>

      <h3 className="font-medium mb-2">{insight.headline}</h3>

      {insight.productFacts.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase">Product Facts</p>
          <ul className="text-sm list-disc list-inside">
            {insight.productFacts.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-sm mb-2">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase">Competitive Gap</p>
          <p>{insight.competitiveGap}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase">Sales Angle</p>
          <p>{insight.salesAngle}</p>
        </div>
      </div>

      {insight.strategicPrioritiesHit.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase">Priorities Hit</p>
          <div className="flex gap-1 flex-wrap">
            {insight.strategicPrioritiesHit.map((p, i) => (
              <Badge key={i} variant="secondary" className="text-xs">{p}</Badge>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-3">
        <a
          href={insight.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:underline"
        >
          Read original
        </a>

        {showActions && insight.status === "pending" && onStatusChange && (
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              onClick={() => onStatusChange(insight.id, "approved")}
            >
              Important
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-yellow-500 text-yellow-700 hover:bg-yellow-50"
              onClick={() => onStatusChange(insight.id, "review")}
            >
              Need to Review
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-400 text-red-600 hover:bg-red-50"
              onClick={() => onStatusChange(insight.id, "discarded")}
            >
              Discard
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
