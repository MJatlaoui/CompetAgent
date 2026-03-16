export interface SubScores {
  f: number;
  n: number;
  a: number;
  d: number;
  s: number;
}

export interface Insight {
  id: string;
  itemId: string;
  headline: string;
  competitor: string;
  classification: string;
  score: number;
  productFacts: string[];
  strategicPrioritiesHit: string[];
  competitiveGap: string;
  salesAngle: string;
  sourceUrl: string;
  worthSurfacing: boolean;
  postedAt: string;
  status: "pending" | "approved" | "review" | "discarded" | "seen" | "suggested" | "scoring" | "error";
  tags: string[];
  subScores?: SubScores;
  heat?: number;
  heatDelta?: number;
  sourceType?: "primary" | "secondary";
  costUsd?: number;
  sheetsSynced?: boolean;
  notes?: string;
  updatedAt?: string;
  updatedBy?: string;
  autoScored?: boolean;
}

export interface TrendPoint {
  date: string;
  competitor: string;
  classification: string;
  count: number;
}

export type InsightStatus = Insight["status"];

export interface MetricsData {
  pendingCount: number;
  approvedThisWeek: number;
  highSignalToday: number;
  topCompetitor: string;
  topCompetitorCount: number;
  totalCostUsd: number;
  lastSyncAt: string | null;
  newToday: number;
  inReview: number;
}

export interface SeenItem {
  id: string;
  title: string;
  url: string;
  competitor: string;
  seenAt: string;
  publishedAt: string | null;
  score?: number | null;
  insightStatus?: string | null;
}
