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
  status: "pending" | "approved" | "review" | "discarded" | "seen" | "saved_offline";
  tags: string[];
  subScores?: SubScores;
  heat?: number;
  heatDelta?: number;
  sourceType?: "primary" | "secondary";
  costUsd?: number;
}

export interface TrendPoint {
  date: string;
  competitor: string;
  classification: string;
  count: number;
}

export type InsightStatus = Insight["status"];

export interface MetricsData {
  total: number;
  analyses: number;
  today: number;
  saved: number;
  totalCostUsd: number;
}

export interface SeenItem {
  id: string;
  title: string;
  url: string;
  competitor: string;
  seenAt: string;
}
