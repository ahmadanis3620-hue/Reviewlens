import { Rng } from "@/lib/demo/rng";
import {
  CLOSERS_NEGATIVE,
  CLOSERS_POSITIVE,
  FIRST_NAMES,
  LAST_INITIALS,
  OPENERS_NEGATIVE,
  OPENERS_POSITIVE,
  OWNER_RESPONSES,
  SNIPPETS,
  type SnippetBank,
} from "@/lib/demo/snippets";
import type { NormalizedReview } from "@/lib/providers/types";
import { clamp } from "@/lib/utils";

/**
 * Demo corpus generator.
 *
 * The corpus is *composed*, not random. Each theme has a probability schedule
 * across the timeline, so the data encodes a deliberate narrative the analysis
 * pipeline can genuinely discover:
 *
 *   - staff and cleanliness: consistently praised throughout
 *   - wait time: a real problem that worsens sharply in the final two months
 *   - pricing and billing: a complaint thread that emerges late
 *
 * Ratings fall out of the themes selected rather than being drawn independently,
 * so rating and text always agree — which is what makes the sentiment analysis
 * results defensible instead of decorative.
 */

export type ThemeSchedule = {
  topicKey: string;
  polarity: "positive" | "negative";
  /**
   * Probability the theme appears, by month index counting backwards from the
   * end of the timeline (0 = most recent month). Missing entries fall back to
   * `base`.
   */
  base: number;
  byRecentMonth?: Record<number, number>;
};

export type CorpusConfig = {
  seed: number;
  months: number;
  /** Reviews per month, before jitter. */
  reviewsPerMonth: number;
  /** Random +/- applied to the monthly count. */
  monthlyJitter: number;
  themes: ThemeSchedule[];
  /** Fraction of negative reviews that received an owner response. */
  responseRate: number;
  /** Prefix for generated external ids, so sources never collide. */
  idPrefix: string;
  /** End of the timeline. Defaults to now. */
  endDate?: Date;
  /**
   * Per-topic sentence banks layered over the shared ones.
   *
   * Lets a sample corpus be written in the language a specific practice is
   * actually described in, without editing the shared banks and shifting every
   * other seeded corpus.
   */
  snippets?: Record<string, Partial<SnippetBank>>;
};

/** The demo business: a dental practice with a wait-time problem. */
export const COLUMBUS_DENTAL_CONFIG: Omit<CorpusConfig, "endDate"> = {
  seed: 20260812,
  months: 14,
  reviewsPerMonth: 22,
  monthlyJitter: 4,
  responseRate: 0.35,
  idPrefix: "demo-cdc",
  themes: [
    // The demo is calibrated to a *healthy* practice with a problem starting
    // to bite, not a business in freefall. That is both the more common real
    // situation and the more useful sales conversation: "you are doing well,
    // and here is the thing that is quietly getting worse."
    { topicKey: "staff", polarity: "positive", base: 0.6 },
    { topicKey: "cleanliness", polarity: "positive", base: 0.32 },
    { topicKey: "quality", polarity: "positive", base: 0.35 },
    { topicKey: "communication", polarity: "positive", base: 0.18 },
    { topicKey: "professionalism", polarity: "positive", base: 0.16 },
    { topicKey: "facilities", polarity: "positive", base: 0.12 },
    {
      topicKey: "wait-time",
      polarity: "negative",
      base: 0.09,
      // The story: wait times deteriorate over the final quarter.
      byRecentMonth: { 0: 0.36, 1: 0.31, 2: 0.19, 3: 0.12 },
    },
    {
      topicKey: "pricing",
      polarity: "negative",
      base: 0.05,
      byRecentMonth: { 0: 0.16, 1: 0.13, 2: 0.1 },
    },
    {
      topicKey: "billing",
      polarity: "negative",
      base: 0.04,
      byRecentMonth: { 0: 0.12, 1: 0.1 },
    },
    { topicKey: "scheduling", polarity: "negative", base: 0.1 },
    { topicKey: "communication", polarity: "negative", base: 0.07 },
    { topicKey: "quality", polarity: "negative", base: 0.04 },
  ],
};

/** Competitor A: better on wait time, weaker on staff warmth. */
export const COMPETITOR_A_CONFIG: Omit<CorpusConfig, "endDate"> = {
  seed: 771001,
  months: 12,
  reviewsPerMonth: 6,
  monthlyJitter: 2,
  responseRate: 0.1,
  idPrefix: "demo-compa",
  themes: [
    { topicKey: "wait-time", polarity: "positive", base: 0.3 },
    { topicKey: "quality", polarity: "positive", base: 0.3 },
    { topicKey: "facilities", polarity: "positive", base: 0.2 },
    { topicKey: "staff", polarity: "positive", base: 0.18 },
    { topicKey: "staff", polarity: "negative", base: 0.16 },
    { topicKey: "communication", polarity: "negative", base: 0.14 },
    { topicKey: "pricing", polarity: "negative", base: 0.12 },
    { topicKey: "scheduling", polarity: "negative", base: 0.1 },
  ],
};

/** Competitor B: cheaper, but quality and scheduling complaints. */
export const COMPETITOR_B_CONFIG: Omit<CorpusConfig, "endDate"> = {
  seed: 883202,
  months: 12,
  reviewsPerMonth: 5,
  monthlyJitter: 2,
  responseRate: 0.05,
  idPrefix: "demo-compb",
  themes: [
    { topicKey: "pricing", polarity: "positive", base: 0.3 },
    { topicKey: "staff", polarity: "positive", base: 0.3 },
    { topicKey: "wait-time", polarity: "positive", base: 0.14 },
    { topicKey: "quality", polarity: "negative", base: 0.22 },
    { topicKey: "scheduling", polarity: "negative", base: 0.2 },
    { topicKey: "cleanliness", polarity: "negative", base: 0.1 },
    { topicKey: "communication", polarity: "negative", base: 0.12 },
  ],
};

function probabilityFor(theme: ThemeSchedule, recentMonthIndex: number): number {
  return theme.byRecentMonth?.[recentMonthIndex] ?? theme.base;
}

/**
 * Rating from theme mix. A review with only praise lands at 5; each negative
 * theme pulls it down, with the first one costing the most.
 */
function ratingFromThemes(
  positives: number,
  negatives: number,
  rng: Rng,
): number {
  if (negatives === 0) {
    if (positives === 0) return rng.bool(0.6) ? 4 : 5;
    return rng.bool(0.72) ? 5 : 4;
  }
  if (negatives === 1) {
    if (positives >= 2) return rng.bool(0.6) ? 4 : 3;
    if (positives === 1) return rng.bool(0.55) ? 3 : 4;
    return rng.bool(0.5) ? 2 : 3;
  }
  // Two or more distinct complaints.
  if (positives >= 2) return rng.bool(0.6) ? 3 : 2;
  return rng.bool(0.6) ? 1 : 2;
}

function assemble(
  rng: Rng,
  parts: { positive: string[]; negative: string[] },
): string {
  const leansPositive = parts.positive.length >= parts.negative.length;

  const opener = rng.pick(leansPositive ? OPENERS_POSITIVE : OPENERS_NEGATIVE);
  const closer = rng.pick(leansPositive ? CLOSERS_POSITIVE : CLOSERS_NEGATIVE);

  // Interleave so the text reads like a person weighing things up rather than
  // a block of praise followed by a block of complaints.
  const body: string[] = [];
  if (leansPositive) {
    body.push(...parts.positive, ...parts.negative);
  } else {
    const [firstComplaint, ...restComplaints] = parts.negative;
    if (firstComplaint) body.push(firstComplaint);
    body.push(...parts.positive);
    body.push(...restComplaints);
  }

  return [opener, ...body, closer].filter(Boolean).join(" ").trim();
}

export function generateCorpus(config: CorpusConfig): NormalizedReview[] {
  const rng = new Rng(config.seed);
  const end = config.endDate ?? new Date();
  const reviews: NormalizedReview[] = [];
  let counter = 0;

  // Oldest month first, so ids ascend with time.
  for (let monthOffset = config.months - 1; monthOffset >= 0; monthOffset--) {
    const monthStart = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - monthOffset, 1),
    );
    const daysInMonth = new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
    ).getUTCDate();

    // The most recent month is usually partial. Scale its volume to the days
    // that have actually elapsed and draw dates only from those days —
    // otherwise the current month looks like a collapse in review volume,
    // which would be an artefact of the generator rather than the story the
    // corpus is meant to tell.
    const isCurrentMonth = monthOffset === 0;
    const daysAvailable = isCurrentMonth
      ? Math.max(1, end.getUTCDate())
      : daysInMonth;
    const elapsedFraction = daysAvailable / daysInMonth;

    const count = Math.max(
      1,
      Math.round(
        (config.reviewsPerMonth +
          rng.int(-config.monthlyJitter, config.monthlyJitter)) *
          elapsedFraction,
      ),
    );

    for (let i = 0; i < count; i++) {
      const day = rng.int(1, daysAvailable);
      const reviewedAt = new Date(
        Date.UTC(
          monthStart.getUTCFullYear(),
          monthStart.getUTCMonth(),
          day,
          rng.int(8, 20),
          rng.int(0, 59),
        ),
      );
      // Never emit a review dated in the future.
      if (reviewedAt.getTime() > end.getTime()) continue;

      const positive: string[] = [];
      const negative: string[] = [];
      const usedTopics = new Set<string>();

      for (const theme of config.themes) {
        const p = probabilityFor(theme, monthOffset);
        if (!rng.bool(p)) continue;
        // One polarity per topic per review — a single reviewer praising and
        // damning the same thing reads as noise.
        if (usedTopics.has(theme.topicKey)) continue;

        const override = config.snippets?.[theme.topicKey];
        const shared = SNIPPETS[theme.topicKey];
        const pool = override?.[theme.polarity] ?? shared?.[theme.polarity];
        if (!pool || pool.length === 0) continue;

        usedTopics.add(theme.topicKey);
        (theme.polarity === "positive" ? positive : negative).push(rng.pick(pool));
      }

      // A review with nothing to say is not a review.
      if (positive.length === 0 && negative.length === 0) {
        const fallback =
          config.snippets?.["staff"]?.positive ?? SNIPPETS["staff"]?.positive;
        if (fallback && fallback.length > 0) positive.push(rng.pick(fallback));
      }

      const rating = clamp(ratingFromThemes(positive.length, negative.length, rng), 1, 5);
      const text = assemble(rng, { positive, negative });

      counter += 1;
      const review: NormalizedReview = {
        externalReviewId: `${config.idPrefix}-${String(counter).padStart(4, "0")}`,
        reviewerName: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_INITIALS)}.`,
        rating,
        text,
        reviewedAt,
        language: "en",
      };

      if (rating <= 3 && rng.bool(config.responseRate)) {
        review.responseText = rng.pick(OWNER_RESPONSES);
        review.respondedAt = new Date(
          reviewedAt.getTime() + rng.int(1, 6) * 24 * 60 * 60 * 1000,
        );
      }

      reviews.push(review);
    }
  }

  return reviews.sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime());
}

export const DEMO_BUSINESS = {
  name: "Columbus Dental Care",
  industry: "Dentist",
  website: "https://example.com/columbus-dental-care",
  timezone: "America/New_York",
  location: {
    label: "Main Office",
    addressLine1: "1420 Grandview Ave",
    city: "Columbus",
    region: "OH",
    postalCode: "43212",
    country: "US",
  },
} as const;

export const DEMO_COMPETITORS = [
  {
    name: "Grandview Family Dentistry",
    city: "Columbus",
    region: "OH",
    config: COMPETITOR_A_CONFIG,
  },
  {
    name: "Olentangy Smile Studio",
    city: "Columbus",
    region: "OH",
    config: COMPETITOR_B_CONFIG,
  },
] as const;
