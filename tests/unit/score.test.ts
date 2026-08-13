import { describe, expect, it } from "vitest";

import {
  MIN_REVIEWS_FOR_SCORE,
  SCORE_WEIGHTS,
  computeReputationScore,
  computeScoreDelta,
} from "@/lib/analytics/score";
import type { AnalyzedReview } from "@/lib/analytics/types";

const NOW = new Date("2026-06-30T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function review(
  daysAgo: number,
  overrides: Partial<AnalyzedReview> = {},
): AnalyzedReview {
  return {
    id: overrides.id ?? `r-${daysAgo}-${Math.random()}`,
    rating: overrides.rating ?? 5,
    reviewedAt: new Date(NOW.getTime() - daysAgo * DAY),
    hasResponse: overrides.hasResponse ?? false,
    sentiment: overrides.sentiment ?? "POSITIVE",
    sentimentScore: overrides.sentimentScore ?? 1,
    urgency: "LOW",
    topics: overrides.topics ?? [],
  };
}

function perfect(count: number): AnalyzedReview[] {
  return Array.from({ length: count }, (_, i) =>
    review(i, { rating: 5, sentiment: "POSITIVE", sentimentScore: 1 }),
  );
}

describe("computeReputationScore", () => {
  it("declines to score when there is not enough data", () => {
    const result = computeReputationScore(perfect(MIN_REVIEWS_FOR_SCORE - 1), {
      now: NOW,
    });

    // A score built on two reviews would be a number, not a measurement.
    expect(result.score).toBeNull();
    expect(result.components).toHaveLength(0);
  });

  it("awards full marks to a flawless, active business", () => {
    const reviews = perfect(15);
    const result = computeReputationScore(reviews, { now: NOW });

    expect(result.score).toBe(100);
    const total = result.components.reduce((sum, c) => sum + c.max, 0);
    expect(total).toBe(100);
  });

  it("is deterministic — same input, same score", () => {
    const reviews = [
      ...perfect(8),
      review(3, { rating: 1, sentiment: "NEGATIVE", sentimentScore: -0.9 }),
      review(4, { rating: 2, sentiment: "NEGATIVE", sentimentScore: -0.6 }),
    ];

    const a = computeReputationScore(reviews, { now: NOW });
    const b = computeReputationScore(reviews, { now: NOW });

    expect(a.score).toBe(b.score);
    expect(a.components).toEqual(b.components);
  });

  it("scores a poor business below a good one", () => {
    const good = computeReputationScore(perfect(15), { now: NOW });
    const bad = computeReputationScore(
      Array.from({ length: 15 }, (_, i) =>
        review(i, { rating: 1, sentiment: "NEGATIVE", sentimentScore: -0.9 }),
      ),
      { now: NOW },
    );

    expect(bad.score).toBeLessThan(good.score!);
    expect(bad.score).toBeGreaterThanOrEqual(0);
  });

  it("keeps every component within its declared weight", () => {
    const result = computeReputationScore(
      [
        ...perfect(6),
        review(2, { rating: 1, sentiment: "NEGATIVE", sentimentScore: -1 }),
      ],
      { now: NOW },
    );

    for (const component of result.components) {
      expect(component.earned).toBeGreaterThanOrEqual(0);
      expect(component.earned).toBeLessThanOrEqual(component.max);
    }
    expect(result.components.find((c) => c.key === "rating")?.max).toBe(
      SCORE_WEIGHTS.rating,
    );
  });

  it("penalizes recurring complaints", () => {
    const withThemes = Array.from({ length: 12 }, (_, i) =>
      review(i, {
        rating: 4,
        sentiment: "NEGATIVE",
        sentimentScore: -0.4,
        topics: [
          {
            key: "wait-time",
            label: "Wait Time",
            sentiment: "NEGATIVE",
            sentimentScore: -0.7,
            confidence: 0.9,
            importance: 0.8,
          },
        ],
      }),
    );

    const result = computeReputationScore(withThemes, { now: NOW });
    const component = result.components.find((c) => c.key === "unresolvedThemes");

    expect(component!.earned).toBeLessThan(component!.max);
    expect(component!.detail).toContain("Wait Time");
  });

  it("rewards responding to negative reviews", () => {
    const base = Array.from({ length: 10 }, (_, i) =>
      review(i, { rating: 2, sentiment: "NEGATIVE", sentimentScore: -0.6 }),
    );
    const responsive = base.map((r) => ({ ...r, hasResponse: true }));

    const without = computeReputationScore(base, { now: NOW });
    const with_ = computeReputationScore(responsive, { now: NOW });

    expect(with_.score!).toBeGreaterThan(without.score!);
  });

  it("names its positive and negative drivers", () => {
    const reviews = [
      ...Array.from({ length: 6 }, (_, i) =>
        review(i, {
          topics: [
            {
              key: "staff",
              label: "Staff",
              sentiment: "POSITIVE",
              sentimentScore: 0.8,
              confidence: 0.9,
              importance: 0.7,
            },
          ],
        }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        review(i + 6, {
          rating: 2,
          sentiment: "NEGATIVE",
          sentimentScore: -0.7,
          topics: [
            {
              key: "wait-time",
              label: "Wait Time",
              sentiment: "NEGATIVE",
              sentimentScore: -0.8,
              confidence: 0.9,
              importance: 0.8,
            },
          ],
        }),
      ),
    ];

    const result = computeReputationScore(reviews, { now: NOW });
    expect(result.positiveDrivers).toContain("Staff");
    expect(result.negativeDrivers).toContain("Wait Time");
  });

  it("ignores reviews outside the scoring window", () => {
    const stale = Array.from({ length: 20 }, (_, i) =>
      review(200 + i, { rating: 1, sentiment: "NEGATIVE", sentimentScore: -1 }),
    );
    const recent = perfect(10);

    const withStale = computeReputationScore([...stale, ...recent], { now: NOW });
    const withoutStale = computeReputationScore(recent, { now: NOW });

    // Reviews from seven months ago say nothing about the business today, so
    // adding them must not move the score at all.
    expect(withStale.reviewCount).toBe(10);
    expect(withStale.score).toBe(withoutStale.score);
  });
});

describe("computeScoreDelta", () => {
  it("compares against the score as it stood a period earlier", () => {
    const reviews = [
      // Older period: excellent.
      ...Array.from({ length: 12 }, (_, i) =>
        review(100 + i, { rating: 5, sentiment: "POSITIVE", sentimentScore: 1 }),
      ),
      // Current period: poor.
      ...Array.from({ length: 12 }, (_, i) =>
        review(i + 1, { rating: 1, sentiment: "NEGATIVE", sentimentScore: -1 }),
      ),
    ];

    const { current, previous, delta } = computeScoreDelta(reviews, {
      windowDays: 90,
      now: NOW,
    });

    expect(current.score).not.toBeNull();
    expect(previous.score).not.toBeNull();
    expect(delta).toBe(current.score! - previous.score!);
    expect(delta).toBeLessThan(0);
  });

  it("returns a null delta when there is no comparable prior period", () => {
    const { delta } = computeScoreDelta(perfect(10), {
      windowDays: 90,
      now: NOW,
    });

    // Nothing existed 90 days ago, so there is no honest comparison to make.
    expect(delta).toBeNull();
  });
});
