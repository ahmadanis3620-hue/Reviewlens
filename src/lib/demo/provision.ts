import { ReviewProviderKey, SourceStatus } from "@prisma/client";

import { ensureDefaultAlertRules } from "@/lib/alerts/evaluate";
import { seedStarterTopics } from "@/lib/analysis/topics";
import { prisma } from "@/lib/db";
import {
  DEMO_BUSINESS,
  DEMO_COMPETITORS,
  generateCorpus,
} from "@/lib/demo/generator";
import { computeContentHash, normalizeReview } from "@/lib/ingestion/normalize";
import { log } from "@/lib/logger";

/**
 * Creates the demo business, its competitors, and their review corpora.
 *
 * Everything created here is flagged `isDemo`, and the UI banners it wherever
 * it appears. There is no code path that mixes demo and real reviews inside a
 * single business.
 *
 * Idempotent: running it twice returns the existing demo business rather than
 * creating a second one.
 */
export async function provisionDemoBusiness(
  organizationId: string,
  now: Date = new Date(),
): Promise<{ businessId: string; created: boolean }> {
  const existing = await prisma.business.findFirst({
    where: { organizationId, isDemo: true },
    select: { id: true },
  });
  if (existing) return { businessId: existing.id, created: false };

  const business = await prisma.business.create({
    data: {
      organizationId,
      name: DEMO_BUSINESS.name,
      industry: DEMO_BUSINESS.industry,
      website: DEMO_BUSINESS.website,
      timezone: DEMO_BUSINESS.timezone,
      isDemo: true,
      locations: { create: { ...DEMO_BUSINESS.location } },
    },
    select: { id: true, locations: { select: { id: true } } },
  });

  await seedStarterTopics(business.id);
  await ensureDefaultAlertRules(business.id);

  await prisma.reviewSource.create({
    data: {
      businessId: business.id,
      locationId: business.locations[0]?.id ?? null,
      provider: ReviewProviderKey.DEMO,
      displayName: "Demo review feed",
      externalAccountId: "demo-primary",
      status: SourceStatus.CONNECTED,
      isDemo: true,
      config: { endDate: now.toISOString() },
    },
  });

  for (const competitor of DEMO_COMPETITORS) {
    const corpus = generateCorpus({ ...competitor.config, endDate: now });
    const ratings = corpus.map((r) => r.rating);
    const publishedRating =
      ratings.length > 0
        ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
        : null;

    await prisma.competitor.create({
      data: {
        businessId: business.id,
        name: competitor.name,
        city: competitor.city,
        region: competitor.region,
        provider: ReviewProviderKey.DEMO,
        externalId: competitor.config.idPrefix,
        ratingAvg: publishedRating,
        reviewCount: corpus.length,
        isDemo: true,
        lastSyncedAt: now,
        reviews: {
          create: corpus.map((review) => {
            const normalized = normalizeReview(review, ReviewProviderKey.DEMO);
            return {
              provider: ReviewProviderKey.DEMO,
              externalReviewId: normalized.externalReviewId,
              rating: normalized.rating,
              text: normalized.text,
              reviewedAt: normalized.reviewedAt,
              contentHash: normalized.contentHash,
            };
          }),
        },
      },
    });
  }

  log.info("demo business provisioned", { organizationId, businessId: business.id });
  return { businessId: business.id, created: true };
}

/**
 * Adds competitor reviews idempotently. Used by the demo path and available to
 * real competitor sources when one is connected.
 */
export async function ingestCompetitorReviews(
  competitorId: string,
  provider: ReviewProviderKey,
  reviews: Array<{
    externalReviewId: string;
    rating: number;
    text: string;
    reviewedAt: Date;
  }>,
): Promise<{ created: number; duplicates: number }> {
  const existing = await prisma.competitorReview.findMany({
    where: {
      competitorId,
      externalReviewId: { in: reviews.map((r) => r.externalReviewId) },
    },
    select: { externalReviewId: true },
  });
  const known = new Set(existing.map((r) => r.externalReviewId));

  const fresh = reviews.filter((r) => !known.has(r.externalReviewId));

  if (fresh.length > 0) {
    await prisma.competitorReview.createMany({
      data: fresh.map((review) => ({
        competitorId,
        provider,
        externalReviewId: review.externalReviewId,
        rating: review.rating,
        text: review.text,
        reviewedAt: review.reviewedAt,
        contentHash: computeContentHash({
          provider,
          text: review.text,
          rating: review.rating,
          reviewedAt: review.reviewedAt,
        }),
      })),
      skipDuplicates: true,
    });
  }

  return { created: fresh.length, duplicates: reviews.length - fresh.length };
}
