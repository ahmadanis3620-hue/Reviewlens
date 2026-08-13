import {
  ReportStatus,
  ReportType,
  UsageKind,
  type Prisma,
} from "@prisma/client";

import { getAIService } from "@/lib/ai/service";
import { compareToCompetitors } from "@/lib/analytics/competitors";
import { loadCompetitorSnapshots } from "@/lib/analytics/load";
import {
  monthWindow,
  previousMonthWindow,
  previousWeekWindow,
  formatWindowLabel,
  type Window,
} from "@/lib/analytics/windows";
import { prisma } from "@/lib/db";
import {
  buildFactSheet,
  buildInsights,
  selectPeriodView,
} from "@/lib/insights/build";
import { log } from "@/lib/logger";

/**
 * Report generation.
 *
 * Idempotent on (businessId, type, periodStart): regenerating a report
 * replaces its sections rather than accumulating duplicates.
 *
 * Every figure in every section comes from the analytics layer and is stored
 * in the section's `data` blob. The narrative text is generated prose that has
 * already passed the numeric guard. The web view and the email render from the
 * same rows, so they cannot drift.
 */

export type ReportSectionDraft = {
  key: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

/** The reporting period ending most recently before `now`. */
export function periodFor(type: ReportType, now: Date): Window {
  if (type === ReportType.WEEKLY) {
    // The week just finished, not the partial current one.
    return previousWeekWindow(now);
  }
  const current = monthWindow(now);
  // Within the first few days of a month, report on the month just ended.
  return now.getUTCDate() <= 7 ? previousMonthWindow(now) : current;
}

export async function generateReport(
  businessId: string,
  type: ReportType,
  now: Date = new Date(),
): Promise<{ reportId: string }> {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { id: true, name: true, industry: true, organizationId: true },
  });

  const period = periodFor(type, now);
  const periodLabel = formatWindowLabel(period);

  const report = await prisma.report.upsert({
    where: {
      businessId_type_periodStart: {
        businessId,
        type,
        periodStart: period.start,
      },
    },
    create: {
      businessId,
      type,
      periodStart: period.start,
      periodEnd: period.end,
      status: ReportStatus.GENERATING,
    },
    update: { status: ReportStatus.GENERATING, error: null },
  });

  try {
    // Insights are computed as of the end of the period, so a report generated
    // late describes the period it covers rather than the moment it ran.
    const asOf = new Date(Math.min(period.end.getTime(), now.getTime()));
    const insights = await buildInsights(businessId, asOf);

    // A weekly report must describe the week. Quoting the trailing 30-day
    // review count in a 7-day report would be a real figure attached to the
    // wrong period, which is precisely the kind of claim this product exists
    // to avoid.
    const view = selectPeriodView(insights, type === ReportType.WEEKLY ? 7 : 30);
    const facts = buildFactSheet(business, insights, periodLabel, view);

    const ai = getAIService();
    const summary = await ai.generateExecutiveSummary({ facts });

    const competitors = await loadCompetitorSnapshots(businessId);
    const comparison = compareToCompetitors({
      businessSummary: view.summary,
      businessTopics: view.topics,
      competitors,
    });

    const competitorNarrative =
      competitors.length > 0
        ? await ai.compareCompetitors({
            facts,
            competitors: comparison.profiles.map((p) => ({
              name: p.name,
              averageRating: p.publishedRating ?? p.sampleRating,
              reviewCount: p.publishedReviewCount ?? p.sampleSize,
              topPositiveTopics: p.topPositiveTopics,
              topNegativeTopics: p.topNegativeTopics,
            })),
            divergences: comparison.divergences.slice(0, 5).map((d) => ({
              topicLabel: d.topicLabel,
              businessNegativeShare: d.businessNegativeShare,
              competitorNegativeShare: d.competitorNegativeShare,
            })),
          })
        : "No competitors have been added yet. Add one or two nearby businesses to see how your reputation compares.";

    const recommendations = await prisma.recommendation.findMany({
      where: { businessId },
      orderBy: [{ priority: "desc" }, { generatedAt: "desc" }],
      take: 3,
      select: {
        title: true,
        problem: true,
        action: true,
        rationale: true,
        priority: true,
        expectedImpact: true,
        metrics: true,
      },
    });

    const sections: ReportSectionDraft[] = [
      {
        key: "executive-summary",
        title: "Executive summary",
        body: summary,
        data: { periodLabel },
      },
      {
        key: "reputation-score",
        title: "Reputation score",
        body:
          insights.score.score === null
            ? "There are not yet enough reviews in this period to produce a reputation score."
            : `Your reputation score is ${insights.score.score} out of 100.` +
              (insights.scoreDelta === null
                ? " There is no prior period to compare against."
                : insights.scoreDelta === 0
                  ? " That is unchanged from the previous period."
                  : ` That is ${Math.abs(insights.scoreDelta)} point${Math.abs(insights.scoreDelta) === 1 ? "" : "s"} ${insights.scoreDelta > 0 ? "higher" : "lower"} than the previous period.`),
        data: {
          score: insights.score.score,
          delta: insights.scoreDelta,
          components: insights.score.components,
          positiveDrivers: insights.score.positiveDrivers,
          negativeDrivers: insights.score.negativeDrivers,
        },
      },
      {
        key: "review-performance",
        title: "Review performance",
        body: `You received ${view.summary.count} reviews with an average rating of ${view.summary.averageRating.toFixed(2)}.`,
        data: {
          count: view.summary.count,
          averageRating: view.summary.averageRating,
          positive: view.summary.positive,
          neutral: view.summary.neutral,
          negative: view.summary.negative,
          positiveRate: view.summary.positiveRate,
          negativeRate: view.summary.negativeRate,
          ratingDistribution: view.summary.ratingDistribution,
          volumeDelta: view.comparison.volumeDelta,
          ratingDelta: view.comparison.ratingDelta,
        },
      },
      {
        key: "customers-love",
        title: "What customers love",
        body:
          view.positiveTopics.length > 0
            ? `Customers consistently praise ${view.positiveTopics
                .slice(0, 3)
                .map((t) => t.label.toLowerCase())
                .join(", ")}.`
            : "No clearly positive theme stands out in this period.",
        data: {
          topics: view.positiveTopics.map((t) => ({
            label: t.label,
            mentions: t.mentions,
            positiveMentions: t.positiveMentions,
            quotes: t.positiveQuotes,
            evidenceReviewIds: t.evidenceReviewIds,
          })),
        },
      },
      {
        key: "biggest-problems",
        title: "Biggest problems",
        body:
          view.negativeTopics.length > 0
            ? `The themes drawing the most criticism are ${view.negativeTopics
                .slice(0, 3)
                .map((t) => t.label.toLowerCase())
                .join(", ")}.`
            : "No theme drew sustained criticism in this period.",
        data: {
          topics: view.negativeTopics.map((t) => {
            const trend = view.comparison.topics.find((x) => x.key === t.key);
            return {
              label: t.label,
              mentions: t.mentions,
              negativeMentions: t.negativeMentions,
              trendPercent: trend?.trendPercent ?? null,
              previousNegativeMentions: trend?.previous?.negativeMentions ?? null,
              quotes: t.negativeQuotes,
              evidenceReviewIds: t.evidenceReviewIds,
            };
          }),
        },
      },
      {
        key: "emerging-issues",
        title: "Emerging issues",
        body:
          view.emerging.length > 0
            ? `${view.emerging[0]?.label} is growing fastest as a negative theme.`
            : "No new negative theme is growing fast enough to flag this period.",
        data: {
          emerging: view.emerging.map((t) => ({
            label: t.label,
            negativeMentions: t.current.negativeMentions,
            previousNegativeMentions: t.previous?.negativeMentions ?? 0,
            trendPercent: t.negativeTrendPercent,
            status: t.status,
          })),
          improving: view.improving.map((t) => ({
            label: t.label,
            negativeMentions: t.current.negativeMentions,
            previousNegativeMentions: t.previous?.negativeMentions ?? 0,
            trendPercent: t.negativeTrendPercent,
          })),
        },
      },
      {
        key: "competitor-comparison",
        title: "Competitor comparison",
        body: competitorNarrative,
        data: {
          businessRating: comparison.businessRating,
          competitorAverageRating: comparison.competitorAverageRating,
          ratingGap: comparison.ratingGap,
          thin: comparison.thin,
          profiles: comparison.profiles,
          strengths: comparison.strengths,
          weaknesses: comparison.weaknesses,
        },
      },
      {
        key: "recommended-actions",
        title: "Recommended actions",
        body:
          recommendations.length > 0
            ? `${recommendations.length === 1 ? "One action" : `${recommendations.length} actions`} to prioritize this period.`
            : "No recommendations have been generated for this period yet.",
        data: { recommendations },
      },
      {
        key: "trends",
        title: "Period-over-period trends",
        body: "How the last three windows compare with the periods before them.",
        data: {
          windows: [
            insights.comparison7,
            insights.comparison30,
            insights.comparison90,
          ].map((c) => ({
            label: c.label,
            currentCount: c.current.count,
            previousCount: c.previous.count,
            volumePercent: c.volumePercent,
            currentRating: c.current.averageRating,
            previousRating: c.previous.averageRating,
            ratingDelta: c.ratingDelta,
            negativeRateDelta: c.negativeRateDelta,
          })),
          monthly: insights.monthly,
        },
      },
      {
        key: "appendix",
        title: "Appendix",
        body: `Based on ${view.summary.count} reviews in ${periodLabel}, of which ${view.summary.analyzedCount} have been analyzed. Every figure in this report is computed from those reviews.`,
        data: {
          reviewCount: view.summary.count,
          analyzedCount: view.summary.analyzedCount,
          periodStart: period.start.toISOString(),
          periodEnd: period.end.toISOString(),
          scoreMethod:
            "Rating 35, sentiment 25, negative rate 15, velocity 10, responsiveness 5, recurring complaints 10.",
        },
      },
    ];

    await prisma.$transaction(async (tx) => {
      await tx.reportSection.deleteMany({ where: { reportId: report.id } });
      await tx.reportSection.createMany({
        data: sections.map((section, index) => ({
          reportId: report.id,
          order: index,
          key: section.key,
          title: section.title,
          body: section.body,
          data: (section.data ?? {}) as unknown as Prisma.InputJsonValue,
        })),
      });

      await tx.report.update({
        where: { id: report.id },
        data: {
          status: ReportStatus.READY,
          reputationScore: insights.score.score,
          scoreDelta: insights.scoreDelta,
          summary,
          metrics: {
            reviewCount: view.summary.count,
            averageRating: view.summary.averageRating,
            positiveRate: view.summary.positiveRate,
            negativeRate: view.summary.negativeRate,
          } as unknown as Prisma.InputJsonValue,
          generatedAt: new Date(),
        },
      });
    });

    await prisma.usageRecord.create({
      data: {
        organizationId: business.organizationId,
        businessId,
        kind: UsageKind.REPORT_GENERATED,
      },
    });

    log.info("report generated", { businessId, reportId: report.id, type });
    return { reportId: report.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Report generation failed";
    log.error("report generation failed", { businessId, type, error: message });

    await prisma.report.update({
      where: { id: report.id },
      data: { status: ReportStatus.FAILED, error: message.slice(0, 500) },
    });

    throw error;
  }
}
