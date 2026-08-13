import type { FactSheet, TopicFact } from "@/lib/ai/types";
import {
  aggregateTopics,
  bucketByMonth,
  summarizePeriod,
  topNegativeTopics,
  topPositiveTopics,
} from "@/lib/analytics/aggregate";
import { loadAnalyzedReviews } from "@/lib/analytics/load";
import { computeScoreDelta } from "@/lib/analytics/score";
import {
  compareWindows,
  emergingIssues,
  improvingIssues,
} from "@/lib/analytics/trends";
import type {
  AnalyzedReview,
  PeriodSummary,
  ReputationScore,
  TopicAggregate,
  TopicTrend,
  WindowComparison,
} from "@/lib/analytics/types";
import { filterWindow } from "@/lib/analytics/windows";

/**
 * Assembles everything the dashboard, recommendation generator, alert
 * evaluator, and report builder need, from one load of the review data.
 *
 * Having a single place that turns rows into insight means the number on the
 * overview page, the number in the monthly report, and the number the AI is
 * shown are the same number by construction.
 */

export type BusinessInsights = {
  reviews: AnalyzedReview[];
  now: Date;
  /** Reviews in the last 30 days. */
  current: AnalyzedReview[];
  summary30: PeriodSummary;
  summary90: PeriodSummary;
  score: ReputationScore;
  scoreDelta: number | null;
  previousScore: ReputationScore;
  topics30: TopicAggregate[];
  negativeTopics: TopicAggregate[];
  positiveTopics: TopicAggregate[];
  comparison7: WindowComparison;
  comparison30: WindowComparison;
  comparison90: WindowComparison;
  emerging: TopicTrend[];
  improving: TopicTrend[];
  monthly: ReturnType<typeof bucketByMonth>;
};

export async function buildInsights(
  businessId: string,
  now: Date = new Date(),
): Promise<BusinessInsights> {
  const reviews = await loadAnalyzedReviews(businessId);
  return buildInsightsFromReviews(reviews, now);
}

/** Pure counterpart, so tests can drive the whole pipeline from fixtures. */
export function buildInsightsFromReviews(
  reviews: AnalyzedReview[],
  now: Date = new Date(),
): BusinessInsights {
  const day = 24 * 60 * 60 * 1000;

  const current = filterWindow(reviews, {
    start: new Date(now.getTime() - 30 * day),
    end: now,
  });
  const window90 = filterWindow(reviews, {
    start: new Date(now.getTime() - 90 * day),
    end: now,
  });

  const summary30 = summarizePeriod(current);
  const summary90 = summarizePeriod(window90);

  const { current: score, previous: previousScore, delta } = computeScoreDelta(
    reviews,
    { now },
  );

  const topics30 = aggregateTopics(current);

  const comparison7 = compareWindows(reviews, 7, "Last 7 days", now);
  const comparison30 = compareWindows(reviews, 30, "Last 30 days", now);
  const comparison90 = compareWindows(reviews, 90, "Last 90 days", now);

  return {
    reviews,
    now,
    current,
    summary30,
    summary90,
    score,
    scoreDelta: delta,
    previousScore,
    topics30,
    negativeTopics: topNegativeTopics(topics30),
    positiveTopics: topPositiveTopics(topics30),
    comparison7,
    comparison30,
    comparison90,
    emerging: emergingIssues(comparison30.topics),
    improving: improvingIssues(comparison30.topics),
    monthly: bucketByMonth(reviews, 12, now),
  };
}

/**
 * One reporting window's view of the data.
 *
 * The dashboard always shows 30 days, but a weekly report must describe the
 * week — quoting a 30-day review count in a weekly report is exactly the kind
 * of misleading figure this product is supposed to eliminate.
 */
export type PeriodView = {
  days: number;
  summary: PeriodSummary;
  topics: TopicAggregate[];
  negativeTopics: TopicAggregate[];
  positiveTopics: TopicAggregate[];
  comparison: WindowComparison;
  emerging: TopicTrend[];
  improving: TopicTrend[];
};

export function selectPeriodView(
  insights: BusinessInsights,
  days: 7 | 30 | 90,
): PeriodView {
  const comparison =
    days === 7
      ? insights.comparison7
      : days === 90
        ? insights.comparison90
        : insights.comparison30;

  // The trend layer already aggregated this window's topics; reuse them rather
  // than re-deriving and risking a different answer.
  const topics = comparison.topics
    .map((t) => t.current)
    .filter((t) => t.mentions > 0)
    .sort((a, b) => b.mentions - a.mentions);

  return {
    days,
    summary: comparison.current,
    topics,
    negativeTopics: topNegativeTopics(topics),
    positiveTopics: topPositiveTopics(topics),
    comparison,
    emerging: emergingIssues(comparison.topics),
    improving: improvingIssues(comparison.topics),
  };
}

function toTopicFact(
  aggregate: TopicAggregate,
  trends: TopicTrend[],
): TopicFact {
  const trend = trends.find((t) => t.key === aggregate.key);
  return {
    key: aggregate.key,
    label: aggregate.label,
    mentions: aggregate.mentions,
    negativeMentions: aggregate.negativeMentions,
    positiveMentions: aggregate.positiveMentions,
    trendPercent: trend?.trendPercent ?? null,
    shareOfReviews: aggregate.shareOfReviews,
    evidenceReviewIds: aggregate.evidenceReviewIds,
    sampleQuotes: aggregate.sampleQuotes,
  };
}

/**
 * The fact sheet handed to the AI layer.
 *
 * This is the complete set of numbers a model is permitted to refer to. The
 * guard in src/lib/ai/guards.ts rejects generated prose containing anything
 * outside it.
 */
export function buildFactSheet(
  business: { name: string; industry: string },
  insights: BusinessInsights,
  periodLabel: string,
  /** Defaults to the 30-day view the dashboard shows. */
  view?: PeriodView,
): FactSheet {
  const period = view ?? selectPeriodView(insights, 30);
  const trends = period.comparison.topics;

  return {
    businessName: business.name,
    industry: business.industry,
    periodLabel,
    totalReviews: period.summary.count,
    averageRating: period.summary.averageRating,
    positiveRate: period.summary.positiveRate,
    negativeRate: period.summary.negativeRate,
    // The score is always the 90-day figure — it is a measure of the business,
    // not of the reporting window, and recomputing it per window would make
    // the weekly and monthly reports disagree about the same score.
    reputationScore: insights.score.score ?? 0,
    scoreDelta: insights.scoreDelta,
    topNegativeTopics: period.negativeTopics.map((t) => toTopicFact(t, trends)),
    topPositiveTopics: period.positiveTopics.map((t) => toTopicFact(t, trends)),
    emergingTopics: period.emerging.map((t) => toTopicFact(t.current, trends)),
  };
}
