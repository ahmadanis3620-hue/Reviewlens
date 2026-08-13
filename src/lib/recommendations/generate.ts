import { Priority, RecommendationStatus, type Prisma } from "@prisma/client";

import { getAIService } from "@/lib/ai/service";
import { buildFactSheet, buildInsights } from "@/lib/insights/build";
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";

/**
 * Recommendation generation.
 *
 * The model writes the prose. Every number attached to a recommendation — the
 * mention counts, the trend, the evidence review ids — comes from the
 * analytics layer and is stored in structured fields, which is what the UI
 * renders. Nothing numeric is parsed back out of generated text.
 */

const MAX_RECOMMENDATIONS = 5;

export type RecommendationStats = {
  generated: number;
  replaced: number;
};

export async function generateRecommendations(
  businessId: string,
  now: Date = new Date(),
): Promise<RecommendationStats> {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { id: true, name: true, industry: true },
  });

  const insights = await buildInsights(businessId, now);

  if (insights.summary30.analyzedCount === 0) {
    log.info("skipping recommendations: no analyzed reviews", { businessId });
    return { generated: 0, replaced: 0 };
  }

  const periodStart = insights.comparison30.currentStart;
  const periodEnd = insights.comparison30.currentEnd;
  const facts = buildFactSheet(business, insights, "the last 30 days");

  const drafts = await getAIService().generateRecommendations({
    facts,
    maxRecommendations: MAX_RECOMMENDATIONS,
  });

  // Open recommendations from a previous run are superseded by this one.
  // Anything the owner has acted on (IN_PROGRESS, DONE, DISMISSED) is left
  // alone — clearing their work would be the wrong kind of tidy.
  const superseded = await prisma.recommendation.deleteMany({
    where: { businessId, status: RecommendationStatus.OPEN },
  });

  let generated = 0;

  for (const draft of drafts) {
    const topic = draft.topicKey
      ? insights.topics30.find((t) => t.key === draft.topicKey)
      : undefined;
    const trend = draft.topicKey
      ? insights.comparison30.topics.find((t) => t.key === draft.topicKey)
      : undefined;

    const metrics = {
      topicKey: draft.topicKey ?? null,
      mentions: topic?.mentions ?? null,
      negativeMentions: topic?.negativeMentions ?? null,
      positiveMentions: topic?.positiveMentions ?? null,
      shareOfReviews: topic?.shareOfReviews ?? null,
      trendPercent: trend?.trendPercent ?? null,
      negativeTrendPercent: trend?.negativeTrendPercent ?? null,
      previousNegativeMentions: trend?.previous?.negativeMentions ?? null,
      reviewsInPeriod: insights.summary30.count,
    } satisfies Record<string, unknown>;

    await prisma.recommendation.create({
      data: {
        businessId,
        title: draft.title,
        problem: draft.problem,
        action: draft.action,
        rationale: draft.rationale,
        priority: draft.priority as Priority,
        expectedImpact: draft.expectedImpact,
        topicKey: draft.topicKey ?? null,
        evidenceReviewIds: topic?.evidenceReviewIds ?? [],
        metrics: metrics as unknown as Prisma.InputJsonValue,
        periodStart,
        periodEnd,
      },
    });

    generated += 1;
  }

  log.info("recommendations generated", {
    businessId,
    generated,
    replaced: superseded.count,
  });

  return { generated, replaced: superseded.count };
}
