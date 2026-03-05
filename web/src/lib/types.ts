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
  status: "pending" | "approved" | "review" | "discarded";
  tags: string[];
}

export interface TrendPoint {
  date: string;
  competitor: string;
  classification: string;
  count: number;
}

export type InsightStatus = Insight["status"];
