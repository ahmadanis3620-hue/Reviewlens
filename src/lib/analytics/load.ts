import { prisma } from "@/lib/db";
import type { AnalyzedReview } from "@/lib/analytics/types";
import type { CompetitorSnapshot } from "@/lib/analytics/competitors";

/**
 * The bridge between Postgres and the pure analytics functions.
 *
 * Everything below this line is SQL; everything above it operates on plain
 * objects. Keeping the boundary sharp is what lets the scoring, aggregation,
 * and trend code be tested with literal fixtures.
 */

/** Reviews older than this contribute nothing to any window we report on. */
const LOAD_WINDOW_DAYS = 400;

export async function loadAnalyzedReviews(
  businessId: string,
  options: { since?: Date } = {},
): Promise<AnalyzedReview[]> {
  const since =
    options.since ?? new Date(Date.now() - LOAD_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const rows = await prisma.review.findMany({
    where: { businessId, reviewedAt: { gte: since } },
    orderBy: { reviewedAt: "asc" },
    select: {
      id: true,
      rating: true,
      reviewedAt: true,
      responseText: true,
      analysis: {
        select: {
          sentiment: true,
          sentimentScore: true,
          urgency: true,
          mentions: {
            select: {
              sentiment: true,
              sentimentScore: true,
              confidence: true,
              importance: true,
              excerpt: true,
              topic: { select: { key: true, label: true } },
            },
          },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    rating: row.rating,
    reviewedAt: row.reviewedAt,
    hasResponse: Boolean(row.responseText),
    sentiment: row.analysis?.sentiment ?? null,
    sentimentScore: row.analysis?.sentimentScore ?? null,
    urgency: row.analysis?.urgency ?? null,
    topics:
      row.analysis?.mentions.map((mention) => ({
        key: mention.topic.key,
        label: mention.topic.label,
        sentiment: mention.sentiment,
        sentimentScore: mention.sentimentScore,
        confidence: mention.confidence,
        importance: mention.importance,
        excerpt: mention.excerpt,
      })) ?? [],
  }));
}

export async function loadCompetitorSnapshots(
  businessId: string,
  options: { since?: Date } = {},
): Promise<CompetitorSnapshot[]> {
  const since =
    options.since ?? new Date(Date.now() - LOAD_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const competitors = await prisma.competitor.findMany({
    where: { businessId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      ratingAvg: true,
      reviewCount: true,
      reviews: {
        where: { reviewedAt: { gte: since } },
        select: {
          rating: true,
          reviewedAt: true,
          sentiment: true,
          sentimentScore: true,
          topicKeys: true,
        },
      },
    },
  });

  return competitors.map((competitor) => ({
    id: competitor.id,
    name: competitor.name,
    publishedRating: competitor.ratingAvg,
    publishedReviewCount: competitor.reviewCount,
    reviews: competitor.reviews.map((review) => ({
      rating: review.rating,
      reviewedAt: review.reviewedAt,
      sentiment: review.sentiment,
      sentimentScore: review.sentimentScore,
      topicKeys: review.topicKeys,
    })),
  }));
}
