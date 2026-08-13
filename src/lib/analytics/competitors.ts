import type { Sentiment } from "@prisma/client";

import type { PeriodSummary, TopicAggregate } from "@/lib/analytics/types";
import { labelForTopicKey } from "@/lib/topics/catalog";
import { round } from "@/lib/utils";

/**
 * Competitor comparison.
 *
 * Two rules shape this code:
 *
 * 1. Competitor rating and review count are whatever the provider publishes.
 *    We never recompute them from a partial sample, because a sample of ten
 *    reviews would produce a confident-looking average that is simply wrong.
 * 2. Topic comparison is expressed as a *share* of each side's own reviews,
 *    never as raw counts. A competitor with three times the review volume is
 *    not three times worse at wait times.
 */

export type CompetitorReviewFact = {
  rating: number;
  reviewedAt: Date;
  sentiment: Sentiment | null;
  sentimentScore: number | null;
  topicKeys: string[];
};

export type CompetitorSnapshot = {
  id: string;
  name: string;
  /** As published by the provider. */
  publishedRating: number | null;
  publishedReviewCount: number | null;
  reviews: CompetitorReviewFact[];
};

export type CompetitorProfile = {
  id: string;
  name: string;
  publishedRating: number | null;
  publishedReviewCount: number | null;
  /** Rating over the reviews we actually hold — labelled as a sample in the UI. */
  sampleRating: number | null;
  sampleSize: number;
  positiveRate: number | null;
  negativeRate: number | null;
  topPositiveTopics: string[];
  topNegativeTopics: string[];
};

export type TopicDivergence = {
  topicKey: string;
  topicLabel: string;
  businessNegativeShare: number;
  competitorNegativeShare: number;
  /** Positive means the business attracts proportionally more complaints. */
  delta: number;
};

export type CompetitorComparison = {
  businessRating: number;
  competitorAverageRating: number | null;
  ratingGap: number | null;
  profiles: CompetitorProfile[];
  divergences: TopicDivergence[];
  strengths: TopicDivergence[];
  weaknesses: TopicDivergence[];
  /** True when there is too little competitor data to draw conclusions from. */
  thin: boolean;
};

/** Below this many competitor reviews, topic shares are not worth comparing. */
export const MIN_COMPETITOR_REVIEWS = 8;
/** Share difference that counts as a real divergence rather than noise. */
export const MATERIAL_DIVERGENCE = 0.03;

function topicShares(
  reviews: CompetitorReviewFact[],
): Map<string, { negative: number; positive: number; total: number }> {
  const map = new Map<string, { negative: number; positive: number; total: number }>();

  for (const review of reviews) {
    for (const key of new Set(review.topicKeys)) {
      const entry = map.get(key) ?? { negative: 0, positive: 0, total: 0 };
      entry.total += 1;
      if (review.sentiment === "NEGATIVE") entry.negative += 1;
      else if (review.sentiment === "POSITIVE") entry.positive += 1;
      map.set(key, entry);
    }
  }

  return map;
}

export function buildCompetitorProfile(
  snapshot: CompetitorSnapshot,
): CompetitorProfile {
  const { reviews } = snapshot;
  const analyzed = reviews.filter((r) => r.sentiment !== null);
  const shares = topicShares(reviews);

  const ranked = [...shares.entries()];

  return {
    id: snapshot.id,
    name: snapshot.name,
    publishedRating: snapshot.publishedRating,
    publishedReviewCount: snapshot.publishedReviewCount,
    sampleRating:
      reviews.length > 0
        ? round(reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length, 2)
        : null,
    sampleSize: reviews.length,
    positiveRate:
      analyzed.length > 0
        ? round(
            analyzed.filter((r) => r.sentiment === "POSITIVE").length / analyzed.length,
            4,
          )
        : null,
    negativeRate:
      analyzed.length > 0
        ? round(
            analyzed.filter((r) => r.sentiment === "NEGATIVE").length / analyzed.length,
            4,
          )
        : null,
    topPositiveTopics: ranked
      .filter(([, v]) => v.positive > 0)
      .sort((a, b) => b[1].positive - a[1].positive)
      .slice(0, 3)
      .map(([key]) => labelForTopicKey(key)),
    topNegativeTopics: ranked
      .filter(([, v]) => v.negative > 0)
      .sort((a, b) => b[1].negative - a[1].negative)
      .slice(0, 3)
      .map(([key]) => labelForTopicKey(key)),
  };
}

export function compareToCompetitors(input: {
  businessSummary: PeriodSummary;
  businessTopics: TopicAggregate[];
  competitors: CompetitorSnapshot[];
}): CompetitorComparison {
  const { businessSummary, businessTopics, competitors } = input;

  const profiles = competitors.map(buildCompetitorProfile);

  // Prefer the published rating; fall back to our sample only when the
  // provider gives us nothing, and the UI labels which one is shown.
  const ratings = profiles
    .map((p) => p.publishedRating ?? p.sampleRating)
    .filter((r): r is number => r !== null);

  const competitorAverageRating =
    ratings.length > 0
      ? round(ratings.reduce((a, b) => a + b, 0) / ratings.length, 2)
      : null;

  const allCompetitorReviews = competitors.flatMap((c) => c.reviews);
  const thin = allCompetitorReviews.length < MIN_COMPETITOR_REVIEWS;

  const competitorShares = topicShares(allCompetitorReviews);
  const competitorReviewCount = allCompetitorReviews.length;

  const divergences: TopicDivergence[] = [];

  if (!thin) {
    const keys = new Set([
      ...businessTopics.map((t) => t.key),
      ...competitorShares.keys(),
    ]);

    for (const key of keys) {
      const business = businessTopics.find((t) => t.key === key);
      const competitor = competitorShares.get(key);

      const businessNegativeShare =
        businessSummary.count > 0
          ? round((business?.negativeMentions ?? 0) / businessSummary.count, 4)
          : 0;
      const competitorNegativeShare =
        competitorReviewCount > 0
          ? round((competitor?.negative ?? 0) / competitorReviewCount, 4)
          : 0;

      // Ignore topics neither side is talking about.
      if (businessNegativeShare === 0 && competitorNegativeShare === 0) continue;

      divergences.push({
        topicKey: key,
        topicLabel: business?.label ?? labelForTopicKey(key),
        businessNegativeShare,
        competitorNegativeShare,
        delta: round(businessNegativeShare - competitorNegativeShare, 4),
      });
    }

    divergences.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }

  return {
    businessRating: businessSummary.averageRating,
    competitorAverageRating,
    ratingGap:
      competitorAverageRating !== null
        ? round(businessSummary.averageRating - competitorAverageRating, 2)
        : null,
    profiles,
    divergences,
    // Weakness = we attract proportionally more complaints on this topic.
    weaknesses: divergences.filter((d) => d.delta > MATERIAL_DIVERGENCE).slice(0, 5),
    strengths: divergences.filter((d) => d.delta < -MATERIAL_DIVERGENCE).slice(0, 5),
    thin,
  };
}
