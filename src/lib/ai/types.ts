import type { z } from "zod";

import type {
  reviewAnalysisSchema,
  recommendationDraftSchema,
} from "@/lib/ai/schemas";

export type AnalyzedTopic = z.infer<typeof reviewAnalysisSchema>["topics"][number];
export type ReviewAnalysisResult = z.infer<typeof reviewAnalysisSchema>;
export type RecommendationDraft = z.infer<typeof recommendationDraftSchema>;

export type ReviewAnalysisInput = {
  reviewText: string;
  rating: number;
  reviewedAt: Date;
  businessName: string;
  industry: string;
  /** Existing topic keys for this business — a hint toward consistent naming. */
  knownTopicKeys: string[];
};

/**
 * The fact sheet handed to the model.
 *
 * This exists because the model is never allowed to produce a statistic. Every
 * number it may refer to is computed by src/lib/analytics and listed here; the
 * output guard rejects any numeric token that isn't traceable to this object.
 */
export type FactSheet = {
  businessName: string;
  industry: string;
  periodLabel: string;
  totalReviews: number;
  averageRating: number;
  positiveRate: number;
  negativeRate: number;
  reputationScore: number;
  scoreDelta: number | null;
  topNegativeTopics: TopicFact[];
  topPositiveTopics: TopicFact[];
  emergingTopics: TopicFact[];
};

export type TopicFact = {
  key: string;
  label: string;
  mentions: number;
  negativeMentions: number;
  positiveMentions: number;
  /** Percent change in mentions vs the previous window; null when too sparse. */
  trendPercent: number | null;
  shareOfReviews: number;
  /** Review ids backing these counts — the traceability link. */
  evidenceReviewIds: string[];
  sampleQuotes: string[];
};

export type RecommendationContext = {
  facts: FactSheet;
  maxRecommendations: number;
};

export type SummaryContext = {
  facts: FactSheet;
};

export type CompetitorContext = {
  facts: FactSheet;
  competitors: Array<{
    name: string;
    averageRating: number | null;
    reviewCount: number | null;
    topPositiveTopics: string[];
    topNegativeTopics: string[];
  }>;
  /** Topics where the business and its competitor set diverge most. */
  divergences: Array<{
    topicLabel: string;
    businessNegativeShare: number;
    competitorNegativeShare: number;
  }>;
};

export type SuggestedResponseInput = {
  reviewText: string;
  rating: number;
  businessName: string;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  problems: string[];
};

/**
 * Every model vendor is reached through this interface. There is no `fetch` to
 * an AI vendor anywhere outside src/lib/ai/providers.
 */
export interface AIProvider {
  readonly name: string;
  readonly model: string;
  analyzeReview(input: ReviewAnalysisInput): Promise<ReviewAnalysisResult>;
  generateRecommendations(ctx: RecommendationContext): Promise<RecommendationDraft[]>;
  generateExecutiveSummary(ctx: SummaryContext): Promise<string>;
  generateSuggestedResponse(input: SuggestedResponseInput): Promise<string>;
  compareCompetitors(ctx: CompetitorContext): Promise<string>;
}

/** Bumped whenever prompts or the analysis schema change, so stale analyses
 *  can be identified and recomputed rather than silently mixed with new ones. */
export const PROMPT_VERSION = "2026-08-analysis-v1";
