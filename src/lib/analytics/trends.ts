import { aggregateTopics, summarizePeriod } from "@/lib/analytics/aggregate";
import type {
  AnalyzedReview,
  TopicAggregate,
  TopicTrend,
  TrendStatus,
  WindowComparison,
} from "@/lib/analytics/types";
import { comparisonWindows, filterWindow } from "@/lib/analytics/windows";
import { round } from "@/lib/utils";

/**
 * Trend detection.
 *
 * The governing rule: a trend is only reported when the underlying counts are
 * large enough for the percentage to mean something. Going from one mention to
 * two is not a 100% increase, it is noise, and the product says
 * "not enough data" rather than dressing it up.
 */

/** Below this many mentions in the larger of the two periods, no percentage. */
export const MIN_MENTIONS_FOR_TREND = 3;

/**
 * Below this many mentions in the *previous* period, no percentage either.
 *
 * A theme going from 1 mention to 5 is arithmetically "+400%", and that figure
 * is technically traceable — but it reads as a catastrophe when the underlying
 * change is four reviews. Such a theme is still surfaced, and loudly; it is
 * classified as new or growing and described in words instead.
 */
export const MIN_BASELINE_FOR_PERCENT = 2;

/** Percentage change treated as movement rather than jitter. */
export const MATERIAL_CHANGE_PERCENT = 15;

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    // Growth from zero has no defined percentage. Callers surface this as
    // "new" instead of dividing by zero or inventing a baseline.
    return null;
  }
  return round(((current - previous) / previous) * 100, 1);
}

function emptyAggregate(key: string, label: string): TopicAggregate {
  return {
    key,
    label,
    mentions: 0,
    positiveMentions: 0,
    neutralMentions: 0,
    negativeMentions: 0,
    averageSentiment: 0,
    averageImportance: 0,
    shareOfReviews: 0,
    evidenceReviewIds: [],
    sampleQuotes: [],
    positiveQuotes: [],
    negativeQuotes: [],
  };
}

function classify(
  current: TopicAggregate,
  previous: TopicAggregate | null,
  trendPercent: number | null,
): TrendStatus {
  if (!previous || previous.mentions === 0) {
    return current.mentions >= MIN_MENTIONS_FOR_TREND ? "new" : "insufficient-data";
  }
  if (current.mentions === 0) return "resolved";

  const enough =
    Math.max(current.mentions, previous.mentions) >= MIN_MENTIONS_FOR_TREND;
  if (!enough) return "insufficient-data";

  if (trendPercent === null) {
    // Too thin a baseline to quote a percentage, but a theme that has grown
    // to a reportable volume from almost nothing is exactly what an owner
    // needs to see. Call it new rather than hiding it.
    return current.mentions > previous.mentions ? "new" : "insufficient-data";
  }

  if (trendPercent >= MATERIAL_CHANGE_PERCENT) return "growing";
  if (trendPercent <= -MATERIAL_CHANGE_PERCENT) return "improving";
  return "stable";
}

/**
 * Priority blends how much negative volume a topic carries with how fast it is
 * moving. Volume alone would bury a fast-emerging problem; velocity alone would
 * over-promote a topic that went from two mentions to four.
 */
function prioritize(
  current: TopicAggregate,
  negativeTrendPercent: number | null,
  status: TrendStatus,
): TopicTrend["priority"] {
  const negatives = current.negativeMentions;
  const rising =
    negativeTrendPercent !== null && negativeTrendPercent >= MATERIAL_CHANGE_PERCENT;

  if (negatives >= 8 && rising) return "CRITICAL";
  if (negatives >= 8) return "HIGH";
  if (negatives >= 4 && rising) return "HIGH";
  if (negatives >= 4) return "MEDIUM";
  if (negatives >= 2 && (rising || status === "new")) return "MEDIUM";
  return "LOW";
}

export function compareTopics(
  currentReviews: AnalyzedReview[],
  previousReviews: AnalyzedReview[],
): TopicTrend[] {
  const current = aggregateTopics(currentReviews);
  const previous = aggregateTopics(previousReviews);

  const previousByKey = new Map(previous.map((t) => [t.key, t]));
  const keys = new Set([...current.map((t) => t.key), ...previous.map((t) => t.key)]);

  const trends: TopicTrend[] = [];

  for (const key of keys) {
    const currentAgg =
      current.find((t) => t.key === key) ??
      emptyAggregate(key, previousByKey.get(key)?.label ?? key);
    const previousAgg = previousByKey.get(key) ?? null;

    const enough =
      Math.max(currentAgg.mentions, previousAgg?.mentions ?? 0) >=
      MIN_MENTIONS_FOR_TREND;

    const trendPercent =
      enough &&
      previousAgg &&
      previousAgg.mentions >= MIN_BASELINE_FOR_PERCENT
        ? percentChange(currentAgg.mentions, previousAgg.mentions)
        : null;

    const negativeTrendPercent =
      enough &&
      previousAgg &&
      previousAgg.negativeMentions >= MIN_BASELINE_FOR_PERCENT
        ? percentChange(currentAgg.negativeMentions, previousAgg.negativeMentions)
        : null;

    const status = classify(currentAgg, previousAgg, trendPercent);

    trends.push({
      key,
      label: currentAgg.label,
      current: currentAgg,
      previous: previousAgg,
      mentionsDelta: currentAgg.mentions - (previousAgg?.mentions ?? 0),
      trendPercent,
      negativeTrendPercent,
      status,
      priority: prioritize(currentAgg, negativeTrendPercent, status),
    });
  }

  return trends.sort(
    (a, b) =>
      b.current.negativeMentions - a.current.negativeMentions ||
      b.current.mentions - a.current.mentions,
  );
}

export function compareWindows(
  reviews: AnalyzedReview[],
  days: number,
  label: string,
  now: Date = new Date(),
): WindowComparison {
  const { current: currentWindow, previous: previousWindow } = comparisonWindows(
    days,
    now,
  );

  const currentReviews = filterWindow(reviews, currentWindow);
  const previousReviews = filterWindow(reviews, previousWindow);

  const current = summarizePeriod(currentReviews);
  const previous = summarizePeriod(previousReviews);

  return {
    label,
    currentStart: currentWindow.start,
    currentEnd: currentWindow.end,
    previousStart: previousWindow.start,
    previousEnd: previousWindow.end,
    current,
    previous,
    // Deltas are null when the previous period had nothing to compare against,
    // so the UI never renders a change against a baseline that does not exist.
    ratingDelta:
      previous.count > 0 && current.count > 0
        ? round(current.averageRating - previous.averageRating, 2)
        : null,
    volumeDelta: current.count - previous.count,
    volumePercent: percentChange(current.count, previous.count),
    sentimentDelta:
      previous.analyzedCount > 0 && current.analyzedCount > 0
        ? round(current.averageSentiment - previous.averageSentiment, 3)
        : null,
    negativeRateDelta:
      previous.analyzedCount > 0 && current.analyzedCount > 0
        ? round(current.negativeRate - previous.negativeRate, 4)
        : null,
    topics: compareTopics(currentReviews, previousReviews),
  };
}

/** The three windows the product reports on. */
export function standardComparisons(
  reviews: AnalyzedReview[],
  now: Date = new Date(),
): WindowComparison[] {
  return [
    compareWindows(reviews, 7, "Last 7 days", now),
    compareWindows(reviews, 30, "Last 30 days", now),
    compareWindows(reviews, 90, "Last 90 days", now),
  ];
}

/** Topics growing as a negative theme — what the owner should worry about. */
export function emergingIssues(trends: TopicTrend[], limit = 5): TopicTrend[] {
  return trends
    .filter(
      (t) =>
        t.current.negativeMentions >= 2 &&
        (t.status === "growing" || t.status === "new"),
    )
    .sort(
      (a, b) =>
        (b.negativeTrendPercent ?? 0) - (a.negativeTrendPercent ?? 0) ||
        b.current.negativeMentions - a.current.negativeMentions,
    )
    .slice(0, limit);
}

/** Topics that used to attract complaints and now attract fewer. */
export function improvingIssues(trends: TopicTrend[], limit = 5): TopicTrend[] {
  return trends
    .filter(
      (t) =>
        (t.previous?.negativeMentions ?? 0) >= MIN_MENTIONS_FOR_TREND &&
        t.current.negativeMentions < (t.previous?.negativeMentions ?? 0),
    )
    .sort(
      (a, b) =>
        (a.negativeTrendPercent ?? 0) - (b.negativeTrendPercent ?? 0) ||
        (b.previous?.negativeMentions ?? 0) - (a.previous?.negativeMentions ?? 0),
    )
    .slice(0, limit);
}
