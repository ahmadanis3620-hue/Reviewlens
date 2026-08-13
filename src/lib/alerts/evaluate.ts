import {
  AlertStatus,
  AlertType,
  Priority,
  type Prisma,
} from "@prisma/client";

import { buildInsights, type BusinessInsights } from "@/lib/insights/build";
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";
import { MIN_MENTIONS_FOR_TREND } from "@/lib/analytics/trends";

/**
 * Alert evaluation.
 *
 * Two properties matter here more than cleverness:
 *
 * 1. **Deduplication.** Every alert carries a `dedupeKey` identifying "this
 *    alert, about this thing, in this period". Evaluation runs on a schedule,
 *    and an owner who gets the same warning every hour stops reading them.
 * 2. **Evidence.** No alert fires on a number that the trend layer considers
 *    too sparse to report. An alert that cries wolf on two reviews is worse
 *    than no alert.
 */

export type AlertRuleConfig = {
  type: AlertType;
  enabled: boolean;
  threshold: number;
  windowDays: number;
};

export const DEFAULT_ALERT_RULES: AlertRuleConfig[] = [
  // Negative reviews as a share of the period, up more than 20 percentage
  // points relative to the previous period.
  { type: AlertType.NEGATIVE_SPIKE, enabled: true, threshold: 20, windowDays: 30 },
  { type: AlertType.RATING_DROP, enabled: true, threshold: 0.2, windowDays: 30 },
  {
    type: AlertType.NEW_RECURRING_COMPLAINT,
    enabled: true,
    threshold: 3,
    windowDays: 30,
  },
  { type: AlertType.CRITICAL_REVIEW, enabled: true, threshold: 1, windowDays: 7 },
  { type: AlertType.VOLUME_DROP, enabled: true, threshold: 40, windowDays: 30 },
];

export async function ensureDefaultAlertRules(businessId: string): Promise<void> {
  await prisma.alertRule.createMany({
    data: DEFAULT_ALERT_RULES.map((rule) => ({ businessId, ...rule })),
    skipDuplicates: true,
  });
}

type Candidate = {
  type: AlertType;
  severity: Priority;
  title: string;
  message: string;
  metrics: Record<string, unknown>;
  evidenceReviewIds: string[];
  dedupeKey: string;
};

/** Period stamp so the same condition can re-alert in a later month. */
function periodStamp(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Pure evaluation. Returns the alerts the data justifies; persistence and
 * deduplication happen in `evaluateAlerts`.
 */
export function findAlertCandidates(
  insights: BusinessInsights,
  rules: AlertRuleConfig[],
  now: Date = new Date(),
): Candidate[] {
  const candidates: Candidate[] = [];
  const stamp = periodStamp(now);
  const byType = new Map(rules.filter((r) => r.enabled).map((r) => [r.type, r]));

  const comparison = insights.comparison30;

  // --- Negative review rate spike ---------------------------------------
  const negativeRule = byType.get(AlertType.NEGATIVE_SPIKE);
  if (
    negativeRule &&
    comparison.negativeRateDelta !== null &&
    comparison.current.analyzedCount >= 5 &&
    comparison.previous.analyzedCount >= 5
  ) {
    const deltaPoints = comparison.negativeRateDelta * 100;
    if (deltaPoints >= negativeRule.threshold) {
      candidates.push({
        type: AlertType.NEGATIVE_SPIKE,
        severity: deltaPoints >= 30 ? Priority.CRITICAL : Priority.HIGH,
        title: "Negative reviews are up sharply",
        message: `Negative reviews rose from ${(comparison.previous.negativeRate * 100).toFixed(0)}% to ${(comparison.current.negativeRate * 100).toFixed(0)}% of analyzed reviews compared with the previous 30 days.`,
        metrics: {
          currentNegativeRate: comparison.current.negativeRate,
          previousNegativeRate: comparison.previous.negativeRate,
          deltaPoints: Number(deltaPoints.toFixed(1)),
          currentAnalyzed: comparison.current.analyzedCount,
          previousAnalyzed: comparison.previous.analyzedCount,
        },
        evidenceReviewIds: insights.current
          .filter((r) => r.sentiment === "NEGATIVE")
          .slice(0, 10)
          .map((r) => r.id),
        dedupeKey: `negative-spike:${stamp}`,
      });
    }
  }

  // --- Rating drop -------------------------------------------------------
  const ratingRule = byType.get(AlertType.RATING_DROP);
  if (
    ratingRule &&
    comparison.ratingDelta !== null &&
    comparison.current.count >= 5 &&
    comparison.previous.count >= 5 &&
    comparison.ratingDelta <= -ratingRule.threshold
  ) {
    candidates.push({
      type: AlertType.RATING_DROP,
      severity: comparison.ratingDelta <= -0.5 ? Priority.CRITICAL : Priority.HIGH,
      title: "Average rating has dropped",
      message: `Your 30-day average rating fell from ${comparison.previous.averageRating.toFixed(2)} to ${comparison.current.averageRating.toFixed(2)}.`,
      metrics: {
        currentRating: comparison.current.averageRating,
        previousRating: comparison.previous.averageRating,
        delta: comparison.ratingDelta,
      },
      evidenceReviewIds: insights.current
        .filter((r) => r.rating <= 2)
        .slice(0, 10)
        .map((r) => r.id),
      dedupeKey: `rating-drop:${stamp}`,
    });
  }

  // --- New recurring complaint ------------------------------------------
  const recurringRule = byType.get(AlertType.NEW_RECURRING_COMPLAINT);
  if (recurringRule) {
    for (const trend of comparison.topics) {
      const isNewOrGrowing = trend.status === "new" || trend.status === "growing";
      if (!isNewOrGrowing) continue;
      if (trend.current.negativeMentions < recurringRule.threshold) continue;
      // Only alert on themes that were genuinely quieter before.
      if ((trend.previous?.negativeMentions ?? 0) >= trend.current.negativeMentions) {
        continue;
      }

      candidates.push({
        type: AlertType.NEW_RECURRING_COMPLAINT,
        severity:
          trend.current.negativeMentions >= 8 ? Priority.HIGH : Priority.MEDIUM,
        title: `${trend.label} is becoming a recurring complaint`,
        message: `${trend.label} drew ${trend.current.negativeMentions} negative mentions in the last 30 days, compared with ${trend.previous?.negativeMentions ?? 0} in the previous 30.`,
        metrics: {
          topicKey: trend.key,
          negativeMentions: trend.current.negativeMentions,
          previousNegativeMentions: trend.previous?.negativeMentions ?? 0,
          trendPercent: trend.negativeTrendPercent,
        },
        evidenceReviewIds: trend.current.evidenceReviewIds.slice(0, 10),
        dedupeKey: `recurring:${trend.key}:${stamp}`,
      });
    }
  }

  // --- Critical individual reviews --------------------------------------
  const criticalRule = byType.get(AlertType.CRITICAL_REVIEW);
  if (criticalRule) {
    const criticalReviews = insights.reviews.filter(
      (r) =>
        r.urgency === "CRITICAL" &&
        r.reviewedAt.getTime() >=
          now.getTime() - criticalRule.windowDays * 24 * 60 * 60 * 1000,
    );

    if (criticalReviews.length >= criticalRule.threshold) {
      candidates.push({
        type: AlertType.CRITICAL_REVIEW,
        severity: Priority.CRITICAL,
        title: `${criticalReviews.length} review${criticalReviews.length === 1 ? "" : "s"} flagged for immediate attention`,
        message:
          "These reviews mention something that may carry safety, legal, or regulatory exposure. ReputeIQ does not assess legal or medical claims — please review them yourself.",
        metrics: { count: criticalReviews.length, windowDays: criticalRule.windowDays },
        evidenceReviewIds: criticalReviews.slice(0, 10).map((r) => r.id),
        // Keyed on the reviews themselves, so a genuinely new critical review
        // re-alerts within the same month.
        dedupeKey: `critical:${criticalReviews
          .map((r) => r.id)
          .sort()
          .join(",")
          .slice(0, 180)}`,
      });
    }
  }

  // --- Review volume collapse -------------------------------------------
  const volumeRule = byType.get(AlertType.VOLUME_DROP);
  if (
    volumeRule &&
    comparison.volumePercent !== null &&
    comparison.previous.count >= MIN_MENTIONS_FOR_TREND * 2 &&
    comparison.volumePercent <= -volumeRule.threshold
  ) {
    candidates.push({
      type: AlertType.VOLUME_DROP,
      severity: Priority.MEDIUM,
      title: "New review volume has fallen",
      message: `You received ${comparison.current.count} reviews in the last 30 days, down from ${comparison.previous.count} in the previous 30. A quiet profile weakens over time even when the reviews you do get are good.`,
      metrics: {
        currentCount: comparison.current.count,
        previousCount: comparison.previous.count,
        percentChange: comparison.volumePercent,
      },
      evidenceReviewIds: [],
      dedupeKey: `volume-drop:${stamp}`,
    });
  }

  return candidates;
}

export type AlertStats = { created: number; suppressed: number };

export async function evaluateAlerts(
  businessId: string,
  now: Date = new Date(),
): Promise<AlertStats> {
  await ensureDefaultAlertRules(businessId);

  const [rules, insights] = await Promise.all([
    prisma.alertRule.findMany({ where: { businessId } }),
    buildInsights(businessId, now),
  ]);

  const candidates = findAlertCandidates(
    insights,
    rules.map((r) => ({
      type: r.type,
      enabled: r.enabled,
      threshold: r.threshold,
      windowDays: r.windowDays,
    })),
    now,
  );

  const ruleByType = new Map(rules.map((r) => [r.type, r]));
  const stats: AlertStats = { created: 0, suppressed: 0 };

  for (const candidate of candidates) {
    const existing = await prisma.alert.findUnique({
      where: {
        businessId_dedupeKey: { businessId, dedupeKey: candidate.dedupeKey },
      },
      select: { id: true },
    });

    if (existing) {
      stats.suppressed += 1;
      continue;
    }

    await prisma.alert.create({
      data: {
        businessId,
        alertRuleId: ruleByType.get(candidate.type)?.id ?? null,
        type: candidate.type,
        severity: candidate.severity,
        title: candidate.title,
        message: candidate.message,
        metrics: candidate.metrics as unknown as Prisma.InputJsonValue,
        evidenceReviewIds: candidate.evidenceReviewIds,
        dedupeKey: candidate.dedupeKey,
        status: AlertStatus.NEW,
      },
    });

    stats.created += 1;
  }

  log.info("alerts evaluated", { businessId, ...stats });
  return stats;
}
