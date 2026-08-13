import type { Sentiment, Urgency } from "@prisma/client";

/**
 * The plain shape every analytics function operates on.
 *
 * Deliberately not a Prisma model: the aggregation, trend, and scoring code is
 * pure and testable with literal fixtures, and has no opinion about where the
 * rows came from.
 */

export type AnalyzedTopicMention = {
  key: string;
  label: string;
  sentiment: Sentiment;
  sentimentScore: number;
  confidence: number;
  importance: number;
  excerpt?: string | null;
};

export type AnalyzedReview = {
  id: string;
  rating: number;
  reviewedAt: Date;
  hasResponse: boolean;
  /** Null when the review has not been analyzed yet. */
  sentiment: Sentiment | null;
  sentimentScore: number | null;
  urgency: Urgency | null;
  topics: AnalyzedTopicMention[];
};

export type PeriodSummary = {
  count: number;
  analyzedCount: number;
  averageRating: number;
  ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
  positive: number;
  neutral: number;
  negative: number;
  positiveRate: number;
  negativeRate: number;
  averageSentiment: number;
  /** Share of negative reviews that received an owner response. */
  negativeResponseRate: number;
};

export type TopicAggregate = {
  key: string;
  label: string;
  mentions: number;
  positiveMentions: number;
  neutralMentions: number;
  negativeMentions: number;
  averageSentiment: number;
  averageImportance: number;
  /** Mentions as a share of reviews in the period. */
  shareOfReviews: number;
  /** Ids of the reviews behind these counts — the traceability link. */
  evidenceReviewIds: string[];
  /** Most emphatic excerpts regardless of polarity. */
  sampleQuotes: string[];
  /**
   * Excerpts split by polarity.
   *
   * A "biggest problems" section that quotes a compliment reads as though the
   * analysis did not understand its own finding, so each section pulls the
   * quote that matches the point it is making.
   */
  positiveQuotes: string[];
  negativeQuotes: string[];
};

export type TrendStatus =
  | "new"
  | "growing"
  | "stable"
  | "improving"
  | "resolved"
  | "insufficient-data";

export type TopicTrend = {
  key: string;
  label: string;
  current: TopicAggregate;
  previous: TopicAggregate | null;
  mentionsDelta: number;
  /**
   * Percent change in mention count. Null when either period is too sparse for
   * the number to mean anything — the UI must render "not enough data" rather
   * than a spurious percentage.
   */
  trendPercent: number | null;
  negativeTrendPercent: number | null;
  status: TrendStatus;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

export type WindowComparison = {
  label: string;
  currentStart: Date;
  currentEnd: Date;
  previousStart: Date;
  previousEnd: Date;
  current: PeriodSummary;
  previous: PeriodSummary;
  ratingDelta: number | null;
  volumeDelta: number;
  volumePercent: number | null;
  sentimentDelta: number | null;
  negativeRateDelta: number | null;
  topics: TopicTrend[];
};

export type ScoreComponent = {
  key: string;
  label: string;
  /** Points earned, out of `max`. */
  earned: number;
  max: number;
  /** Plain-language statement of what produced this number. */
  detail: string;
};

export type ReputationScore = {
  /** Null when there is not enough data to score honestly. */
  score: number | null;
  components: ScoreComponent[];
  positiveDrivers: string[];
  negativeDrivers: string[];
  reviewCount: number;
};
