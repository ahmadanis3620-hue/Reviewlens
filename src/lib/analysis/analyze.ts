import { UsageKind, type Prisma } from "@prisma/client";

import { getAIService } from "@/lib/ai/service";
import { PROMPT_VERSION } from "@/lib/ai/types";
import { ensureTopics } from "@/lib/analysis/topics";
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";

/**
 * Review analysis pipeline.
 *
 * Idempotent: reviews already analyzed at the current prompt version are
 * skipped, so a re-run costs nothing and a timed-out run resumes where it
 * stopped. Bumping PROMPT_VERSION makes the whole corpus eligible again.
 */

export type AnalyzeStats = {
  considered: number;
  analyzed: number;
  failed: number;
  skipped: number;
};

export type AnalyzeOptions = {
  /** Cap per invocation, so a job stays inside its execution budget. */
  limit?: number;
  /** Re-analyze reviews that already have a current-version analysis. */
  force?: boolean;
};

export async function analyzeBusinessReviews(
  businessId: string,
  options: AnalyzeOptions = {},
): Promise<AnalyzeStats> {
  const { limit = 200, force = false } = options;

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { id: true, name: true, industry: true, organizationId: true },
  });

  const pending = await prisma.review.findMany({
    where: force
      ? { businessId }
      : {
          businessId,
          OR: [
            { analysis: { is: null } },
            { analysis: { promptVersion: { not: PROMPT_VERSION } } },
          ],
        },
    orderBy: { reviewedAt: "desc" },
    take: limit,
    select: { id: true, rating: true, text: true, reviewedAt: true },
  });

  const stats: AnalyzeStats = {
    considered: pending.length,
    analyzed: 0,
    failed: 0,
    skipped: 0,
  };
  if (pending.length === 0) return stats;

  const knownTopics = await prisma.reviewTopic.findMany({
    where: { businessId },
    select: { key: true },
  });
  const knownTopicKeys = knownTopics.map((t) => t.key);

  const ai = getAIService();

  for (const review of pending) {
    // An empty review carries no information to analyze; a star rating alone
    // is already captured in the rating metrics.
    if (!review.text.trim()) {
      stats.skipped += 1;
      continue;
    }

    try {
      const { result, providerName, modelName } = await ai.analyzeReview({
        reviewText: review.text,
        rating: review.rating,
        reviewedAt: review.reviewedAt,
        businessName: business.name,
        industry: business.industry,
        knownTopicKeys,
      });

      const topicLookup = await ensureTopics(
        businessId,
        result.topics.map((t) => ({ key: t.key, label: t.label })),
      );

      await prisma.$transaction(async (tx) => {
        const analysis = await tx.reviewAnalysis.upsert({
          where: { reviewId: review.id },
          create: {
            reviewId: review.id,
            businessId,
            sentiment: result.sentiment,
            sentimentScore: result.sentimentScore,
            urgency: result.urgency,
            summary: result.summary,
            problems: result.problems,
            strengths: result.strengths,
            riskFlagged: result.riskFlagged,
            riskCategories: result.riskCategories,
            modelProvider: providerName,
            modelName,
            promptVersion: PROMPT_VERSION,
            raw: result as unknown as Prisma.InputJsonValue,
          },
          update: {
            sentiment: result.sentiment,
            sentimentScore: result.sentimentScore,
            urgency: result.urgency,
            summary: result.summary,
            problems: result.problems,
            strengths: result.strengths,
            riskFlagged: result.riskFlagged,
            riskCategories: result.riskCategories,
            modelProvider: providerName,
            modelName,
            promptVersion: PROMPT_VERSION,
            raw: result as unknown as Prisma.InputJsonValue,
            analyzedAt: new Date(),
          },
        });

        // Replace mentions wholesale: a re-analysis that no longer detects a
        // topic must not leave the old mention behind.
        await tx.reviewTopicMention.deleteMany({
          where: { reviewAnalysisId: analysis.id },
        });

        const mentions = result.topics
          .map((topic) => {
            const topicId = topicLookup.get(topic.key);
            if (!topicId) return null;
            return {
              reviewAnalysisId: analysis.id,
              reviewTopicId: topicId,
              businessId,
              sentiment: topic.sentiment,
              sentimentScore: topic.sentimentScore,
              confidence: topic.confidence,
              importance: topic.importance,
              excerpt: topic.excerpt ?? null,
            };
          })
          .filter((m): m is NonNullable<typeof m> => m !== null);

        if (mentions.length > 0) {
          await tx.reviewTopicMention.createMany({
            data: mentions,
            skipDuplicates: true,
          });
        }
      });

      stats.analyzed += 1;
    } catch (error) {
      stats.failed += 1;
      log.error("review analysis failed", {
        reviewId: review.id,
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (stats.analyzed > 0) {
    await prisma.usageRecord.create({
      data: {
        organizationId: business.organizationId,
        businessId,
        kind: UsageKind.AI_ANALYSIS,
        quantity: stats.analyzed,
      },
    });
  }

  log.info("analysis complete", { businessId, ...stats });
  return stats;
}

/**
 * Analyzes competitor reviews.
 *
 * Uses the same AIService as the business's own reviews, deliberately. Running
 * a cheaper analyzer over competitor text would make any sentiment comparison
 * between the two invalid — you would be comparing analyzers, not businesses.
 */
export async function analyzeCompetitorReviews(
  competitorId: string,
  options: { limit?: number } = {},
): Promise<AnalyzeStats> {
  const { limit = 200 } = options;

  const competitor = await prisma.competitor.findUniqueOrThrow({
    where: { id: competitorId },
    select: { id: true, name: true, business: { select: { industry: true } } },
  });

  const pending = await prisma.competitorReview.findMany({
    where: { competitorId, sentiment: null },
    orderBy: { reviewedAt: "desc" },
    take: limit,
    select: { id: true, rating: true, text: true, reviewedAt: true },
  });

  const stats: AnalyzeStats = {
    considered: pending.length,
    analyzed: 0,
    failed: 0,
    skipped: 0,
  };

  const ai = getAIService();

  for (const review of pending) {
    if (!review.text.trim()) {
      stats.skipped += 1;
      continue;
    }

    try {
      const { result } = await ai.analyzeReview({
        reviewText: review.text,
        rating: review.rating,
        reviewedAt: review.reviewedAt,
        businessName: competitor.name,
        industry: competitor.business.industry,
        knownTopicKeys: [],
      });

      await prisma.competitorReview.update({
        where: { id: review.id },
        data: {
          sentiment: result.sentiment,
          sentimentScore: result.sentimentScore,
          topicKeys: result.topics.map((t) => t.key),
        },
      });

      stats.analyzed += 1;
    } catch (error) {
      stats.failed += 1;
      log.error("competitor review analysis failed", {
        competitorReviewId: review.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return stats;
}
