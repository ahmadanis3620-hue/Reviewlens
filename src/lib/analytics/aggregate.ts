import type {
  AnalyzedReview,
  PeriodSummary,
  TopicAggregate,
} from "@/lib/analytics/types";
import { round } from "@/lib/utils";

/**
 * Aggregation.
 *
 * Every figure the product displays originates here or in trends.ts / score.ts.
 * No language model contributes a number to anything downstream.
 */

const EMPTY_DISTRIBUTION: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
};

export function summarizePeriod(reviews: AnalyzedReview[]): PeriodSummary {
  const distribution = { ...EMPTY_DISTRIBUTION };
  let ratingTotal = 0;
  let positive = 0;
  let neutral = 0;
  let negative = 0;
  let sentimentTotal = 0;
  let analyzedCount = 0;
  let negativeWithResponse = 0;

  for (const review of reviews) {
    ratingTotal += review.rating;
    const bucket = Math.min(5, Math.max(1, Math.round(review.rating))) as 1 | 2 | 3 | 4 | 5;
    distribution[bucket] += 1;

    if (review.sentiment === null) continue;
    analyzedCount += 1;
    sentimentTotal += review.sentimentScore ?? 0;

    if (review.sentiment === "POSITIVE") positive += 1;
    else if (review.sentiment === "NEGATIVE") {
      negative += 1;
      if (review.hasResponse) negativeWithResponse += 1;
    } else neutral += 1;
  }

  const count = reviews.length;

  return {
    count,
    analyzedCount,
    averageRating: count > 0 ? round(ratingTotal / count, 2) : 0,
    ratingDistribution: distribution,
    positive,
    neutral,
    negative,
    // Rates are over *analyzed* reviews: an unanalyzed review is not evidence
    // of neutrality, and counting it as such would understate both extremes.
    positiveRate: analyzedCount > 0 ? round(positive / analyzedCount, 4) : 0,
    negativeRate: analyzedCount > 0 ? round(negative / analyzedCount, 4) : 0,
    averageSentiment: analyzedCount > 0 ? round(sentimentTotal / analyzedCount, 4) : 0,
    negativeResponseRate: negative > 0 ? round(negativeWithResponse / negative, 4) : 0,
  };
}

export type AggregateOptions = {
  /** Ignore mentions the analyzer was not reasonably sure about. */
  minConfidence?: number;
  /** Quotes to retain per topic for the evidence drawer. */
  maxQuotes?: number;
};

/** Most emphatic first. */
function byWeight(
  quotes: Array<{ text: string; weight: number }>,
): string[] {
  return [...quotes].sort((a, b) => b.weight - a.weight).map((q) => q.text);
}

export function aggregateTopics(
  reviews: AnalyzedReview[],
  options: AggregateOptions = {},
): TopicAggregate[] {
  const { minConfidence = 0.35, maxQuotes = 3 } = options;

  type Accumulator = {
    key: string;
    label: string;
    mentions: number;
    positive: number;
    neutral: number;
    negative: number;
    sentimentTotal: number;
    importanceTotal: number;
    reviewIds: Set<string>;
    quotes: Array<{ text: string; weight: number; sentiment: string }>;
  };

  const byKey = new Map<string, Accumulator>();

  for (const review of reviews) {
    for (const mention of review.topics) {
      if (mention.confidence < minConfidence) continue;

      let acc = byKey.get(mention.key);
      if (!acc) {
        acc = {
          key: mention.key,
          label: mention.label,
          mentions: 0,
          positive: 0,
          neutral: 0,
          negative: 0,
          sentimentTotal: 0,
          importanceTotal: 0,
          reviewIds: new Set(),
          quotes: [],
        };
        byKey.set(mention.key, acc);
      }

      acc.mentions += 1;
      acc.sentimentTotal += mention.sentimentScore;
      acc.importanceTotal += mention.importance;
      acc.reviewIds.add(review.id);

      if (mention.sentiment === "POSITIVE") acc.positive += 1;
      else if (mention.sentiment === "NEGATIVE") acc.negative += 1;
      else acc.neutral += 1;

      if (mention.excerpt) {
        // Prefer the most emphatic excerpts — they are the ones an owner
        // actually needs to read.
        acc.quotes.push({
          text: mention.excerpt,
          weight: Math.abs(mention.sentimentScore) * mention.importance,
          sentiment: mention.sentiment,
        });
      }
    }
  }

  const reviewCount = reviews.length;

  return [...byKey.values()]
    .map((acc) => ({
      key: acc.key,
      label: acc.label,
      mentions: acc.mentions,
      positiveMentions: acc.positive,
      neutralMentions: acc.neutral,
      negativeMentions: acc.negative,
      averageSentiment: round(acc.sentimentTotal / acc.mentions, 3),
      averageImportance: round(acc.importanceTotal / acc.mentions, 3),
      shareOfReviews: reviewCount > 0 ? round(acc.reviewIds.size / reviewCount, 4) : 0,
      evidenceReviewIds: [...acc.reviewIds],
      sampleQuotes: byWeight(acc.quotes).slice(0, maxQuotes),
      positiveQuotes: byWeight(
        acc.quotes.filter((q) => q.sentiment === "POSITIVE"),
      ).slice(0, maxQuotes),
      negativeQuotes: byWeight(
        acc.quotes.filter((q) => q.sentiment === "NEGATIVE"),
      ).slice(0, maxQuotes),
    }))
    .sort((a, b) => b.mentions - a.mentions);
}

/** Topics ranked by how much negative attention they attract. */
export function topNegativeTopics(
  topics: TopicAggregate[],
  limit = 5,
): TopicAggregate[] {
  return topics
    .filter((t) => t.negativeMentions > 0)
    .sort(
      (a, b) =>
        b.negativeMentions - a.negativeMentions ||
        a.averageSentiment - b.averageSentiment,
    )
    .slice(0, limit);
}

export function topPositiveTopics(
  topics: TopicAggregate[],
  limit = 5,
): TopicAggregate[] {
  return topics
    .filter((t) => t.positiveMentions > 0)
    .sort(
      (a, b) =>
        b.positiveMentions - a.positiveMentions ||
        b.averageSentiment - a.averageSentiment,
    )
    .slice(0, limit);
}

/** Rating average over a set, or null when there is nothing to average. */
export function averageRating(reviews: Array<{ rating: number }>): number | null {
  if (reviews.length === 0) return null;
  return round(reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length, 2);
}

/** Monthly buckets for the trend charts. Months with no reviews are included
 *  with zero counts so the x-axis does not silently compress a quiet period. */
export function bucketByMonth(
  reviews: AnalyzedReview[],
  months: number,
  now: Date = new Date(),
): Array<{
  month: string;
  reviewCount: number;
  averageRating: number | null;
  positive: number;
  negative: number;
  averageSentiment: number | null;
}> {
  const buckets: Array<{
    month: string;
    start: number;
    end: number;
    reviews: AnalyzedReview[];
  }> = [];

  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
    buckets.push({
      month: start.toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }),
      start: start.getTime(),
      end: end.getTime(),
      reviews: [],
    });
  }

  for (const review of reviews) {
    const t = review.reviewedAt.getTime();
    const bucket = buckets.find((b) => t >= b.start && t < b.end);
    if (bucket) bucket.reviews.push(review);
  }

  return buckets.map((bucket) => {
    const summary = summarizePeriod(bucket.reviews);
    return {
      month: bucket.month,
      reviewCount: summary.count,
      averageRating: summary.count > 0 ? summary.averageRating : null,
      positive: summary.positive,
      negative: summary.negative,
      averageSentiment: summary.analyzedCount > 0 ? summary.averageSentiment : null,
    };
  });
}
