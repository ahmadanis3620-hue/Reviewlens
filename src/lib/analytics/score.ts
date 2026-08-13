import { aggregateTopics, summarizePeriod } from "@/lib/analytics/aggregate";
import type {
  AnalyzedReview,
  ReputationScore,
  ScoreComponent,
} from "@/lib/analytics/types";
import { comparisonWindows, filterWindow } from "@/lib/analytics/windows";
import { clamp, round } from "@/lib/utils";

/**
 * Reputation score: 0–100, deterministic and reproducible.
 *
 * "Deterministic" is a product requirement, not just an implementation detail.
 * The same reviews and the same reference date always produce the same score,
 * no model is involved at any point, and every component is displayed with the
 * sentence that explains it. An owner who disagrees with their score can see
 * exactly which part they disagree with.
 *
 * Weights (total 100):
 *   35  rating quality        the headline number customers see
 *   25  sentiment             what reviewers actually express
 *   15  negative review rate  how often things go visibly wrong
 *   10  review velocity       a stale profile is a weak profile
 *    5  responsiveness        replying to unhappy customers
 *   10  unresolved themes     penalty for recurring, unaddressed complaints
 */

export const SCORE_WEIGHTS = {
  rating: 35,
  sentiment: 25,
  negativeRate: 15,
  velocity: 10,
  responsiveness: 5,
  unresolvedThemes: 10,
} as const;

/** Reviews per 30 days at which velocity is considered fully healthy. */
export const VELOCITY_TARGET_PER_MONTH = 12;

/** Fewer reviews than this and we decline to produce a score at all. */
export const MIN_REVIEWS_FOR_SCORE = 5;

/** A theme counts as "unresolved" once it reaches this many negative mentions. */
const UNRESOLVED_THEME_THRESHOLD = 3;
/** Number of unresolved themes at which the penalty is fully applied. */
const UNRESOLVED_THEME_CEILING = 4;

export type ScoreOptions = {
  /** Window length in days. Defaults to 90. */
  windowDays?: number;
  now?: Date;
};

export function computeReputationScore(
  reviews: AnalyzedReview[],
  options: ScoreOptions = {},
): ReputationScore {
  const { windowDays = 90, now = new Date() } = options;

  const window = {
    start: new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000),
    end: now,
  };
  const windowed = filterWindow(reviews, window);
  const summary = summarizePeriod(windowed);

  if (summary.count < MIN_REVIEWS_FOR_SCORE) {
    return {
      score: null,
      components: [],
      positiveDrivers: [],
      negativeDrivers: [],
      reviewCount: summary.count,
    };
  }

  const components: ScoreComponent[] = [];

  // 1. Rating quality — linear from 1.0 (zero points) to 5.0 (full marks).
  const ratingEarned = round(
    clamp((summary.averageRating - 1) / 4, 0, 1) * SCORE_WEIGHTS.rating,
    1,
  );
  components.push({
    key: "rating",
    label: "Average rating",
    earned: ratingEarned,
    max: SCORE_WEIGHTS.rating,
    detail: `${summary.averageRating.toFixed(2)} average across ${summary.count} reviews in the last ${windowDays} days.`,
  });

  // 2. Sentiment — mean sentiment score mapped from [-1, 1] to [0, 1].
  const sentimentEarned = round(
    clamp((summary.averageSentiment + 1) / 2, 0, 1) * SCORE_WEIGHTS.sentiment,
    1,
  );
  components.push({
    key: "sentiment",
    label: "Review sentiment",
    earned: sentimentEarned,
    max: SCORE_WEIGHTS.sentiment,
    detail:
      summary.analyzedCount > 0
        ? `Mean sentiment ${summary.averageSentiment >= 0 ? "+" : ""}${summary.averageSentiment.toFixed(2)} across ${summary.analyzedCount} analyzed reviews.`
        : "No reviews have been analyzed yet.",
  });

  // 3. Negative rate — full marks at zero negatives, zero at 50% or worse.
  const negativePenaltyBase = clamp(1 - summary.negativeRate * 2, 0, 1);
  const negativeEarned = round(negativePenaltyBase * SCORE_WEIGHTS.negativeRate, 1);
  components.push({
    key: "negativeRate",
    label: "Negative review rate",
    earned: negativeEarned,
    max: SCORE_WEIGHTS.negativeRate,
    detail: `${(summary.negativeRate * 100).toFixed(1)}% of analyzed reviews are negative.`,
  });

  // 4. Velocity — measured over the trailing 30 days regardless of window.
  const last30 = filterWindow(reviews, {
    start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    end: now,
  });
  const velocityRatio = clamp(last30.length / VELOCITY_TARGET_PER_MONTH, 0, 1);
  const velocityEarned = round(velocityRatio * SCORE_WEIGHTS.velocity, 1);
  components.push({
    key: "velocity",
    label: "Review velocity",
    earned: velocityEarned,
    max: SCORE_WEIGHTS.velocity,
    detail: `${last30.length} new reviews in the last 30 days (target ${VELOCITY_TARGET_PER_MONTH}).`,
  });

  // 5. Responsiveness — share of negative reviews with an owner response.
  //
  // With no negative reviews there is nothing to respond to, so full marks:
  // scoring zero here would penalize the businesses doing best, which is
  // exactly backwards.
  const responsivenessEarned =
    summary.negative === 0
      ? SCORE_WEIGHTS.responsiveness
      : round(summary.negativeResponseRate * SCORE_WEIGHTS.responsiveness, 1);
  components.push({
    key: "responsiveness",
    label: "Response to negative reviews",
    earned: responsivenessEarned,
    max: SCORE_WEIGHTS.responsiveness,
    detail:
      summary.negative > 0
        ? `${(summary.negativeResponseRate * 100).toFixed(0)}% of negative reviews have a public response.`
        : "No negative reviews in this period.",
  });

  // 6. Unresolved themes — recurring complaints that have not gone away.
  const topics = aggregateTopics(windowed);
  const unresolved = topics.filter(
    (t) => t.negativeMentions >= UNRESOLVED_THEME_THRESHOLD,
  );
  const unresolvedRatio = clamp(unresolved.length / UNRESOLVED_THEME_CEILING, 0, 1);
  const unresolvedEarned = round(
    (1 - unresolvedRatio) * SCORE_WEIGHTS.unresolvedThemes,
    1,
  );
  components.push({
    key: "unresolvedThemes",
    label: "Recurring complaints",
    earned: unresolvedEarned,
    max: SCORE_WEIGHTS.unresolvedThemes,
    detail:
      unresolved.length === 0
        ? "No theme has reached three or more negative mentions."
        : `${unresolved.length} theme${unresolved.length === 1 ? "" : "s"} with ${UNRESOLVED_THEME_THRESHOLD} or more negative mentions: ${unresolved
            .map((t) => t.label)
            .join(", ")}.`,
  });

  const total = components.reduce((sum, c) => sum + c.earned, 0);

  const positiveDrivers = topics
    .filter((t) => t.positiveMentions >= 2 && t.averageSentiment > 0.15)
    .sort((a, b) => b.positiveMentions - a.positiveMentions)
    .slice(0, 4)
    .map((t) => t.label);

  const negativeDrivers = topics
    .filter((t) => t.negativeMentions >= 2 && t.averageSentiment < -0.1)
    .sort((a, b) => b.negativeMentions - a.negativeMentions)
    .slice(0, 4)
    .map((t) => t.label);

  return {
    score: Math.round(clamp(total, 0, 100)),
    components,
    positiveDrivers,
    negativeDrivers,
    reviewCount: summary.count,
  };
}

/**
 * Score change versus the equivalent window one period earlier.
 *
 * Computed by re-running the same function over data as it stood then, rather
 * than by reading a stored value — so the delta is reproducible from the
 * reviews alone and cannot drift from the score beside it.
 */
export function computeScoreDelta(
  reviews: AnalyzedReview[],
  options: ScoreOptions = {},
): { current: ReputationScore; previous: ReputationScore; delta: number | null } {
  const { windowDays = 90, now = new Date() } = options;
  const { previous } = comparisonWindows(windowDays, now);

  const current = computeReputationScore(reviews, { windowDays, now });

  // "As it stood then": only reviews that existed at the earlier reference
  // point, scored over a window of the same length ending there.
  const asOfPrevious = reviews.filter(
    (r) => r.reviewedAt.getTime() < previous.end.getTime(),
  );
  const previousScore = computeReputationScore(asOfPrevious, {
    windowDays,
    now: previous.end,
  });

  const delta =
    current.score !== null && previousScore.score !== null
      ? current.score - previousScore.score
      : null;

  return { current, previous: previousScore, delta };
}
