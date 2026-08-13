import { describe, expect, it } from "vitest";

import {
  MIN_MENTIONS_FOR_TREND,
  compareTopics,
  compareWindows,
  emergingIssues,
  improvingIssues,
  percentChange,
} from "@/lib/analytics/trends";
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
    hasResponse: false,
    sentiment: overrides.sentiment ?? "POSITIVE",
    sentimentScore: overrides.sentimentScore ?? 0.8,
    urgency: "LOW",
    topics: overrides.topics ?? [],
  };
}

function negativeMention(key: string) {
  return {
    key,
    label: key,
    sentiment: "NEGATIVE" as const,
    sentimentScore: -0.7,
    confidence: 0.8,
    importance: 0.7,
  };
}

describe("percentChange", () => {
  it("computes a normal change", () => {
    expect(percentChange(13, 10)).toBe(30);
    expect(percentChange(7, 10)).toBe(-30);
  });

  it("returns null when the baseline is zero", () => {
    // Growth from nothing has no defined percentage; callers render this as
    // "new" rather than dividing by zero or inventing a baseline.
    expect(percentChange(5, 0)).toBeNull();
  });
});

describe("compareTopics", () => {
  it("suppresses a percentage when both periods are too sparse", () => {
    // Going from one mention to two is not a 100% increase, it is noise.
    const current = [review(5, { topics: [negativeMention("pricing")] })];
    const previous = [
      review(40, { topics: [negativeMention("pricing")] }),
      review(41, { topics: [negativeMention("pricing")] }),
    ];

    const trends = compareTopics(current, previous);
    const pricing = trends.find((t) => t.key === "pricing");

    expect(pricing?.trendPercent).toBeNull();
    expect(pricing?.status).toBe("insufficient-data");
  });

  it("reports a percentage once the counts clear the threshold", () => {
    const current = Array.from({ length: 6 }, (_, i) =>
      review(i + 1, { topics: [negativeMention("wait-time")] }),
    );
    const previous = Array.from({ length: 3 }, (_, i) =>
      review(35 + i, { topics: [negativeMention("wait-time")] }),
    );

    const trends = compareTopics(current, previous);
    const wait = trends.find((t) => t.key === "wait-time");

    expect(wait?.trendPercent).toBe(100);
    expect(wait?.status).toBe("growing");
    expect(wait?.current.mentions).toBeGreaterThanOrEqual(MIN_MENTIONS_FOR_TREND);
  });

  it("marks a theme with no history as new", () => {
    const current = Array.from({ length: 4 }, (_, i) =>
      review(i + 1, { topics: [negativeMention("billing")] }),
    );

    const trends = compareTopics(current, []);
    const billing = trends.find((t) => t.key === "billing");

    expect(billing?.status).toBe("new");
    expect(billing?.trendPercent).toBeNull();
  });

  it("marks a theme that stopped being mentioned as resolved", () => {
    const previous = Array.from({ length: 4 }, (_, i) =>
      review(35 + i, { topics: [negativeMention("scheduling")] }),
    );

    const trends = compareTopics([], previous);
    const scheduling = trends.find((t) => t.key === "scheduling");

    expect(scheduling?.status).toBe("resolved");
    expect(scheduling?.current.mentions).toBe(0);
  });

  it("escalates priority for a high-volume, rising complaint", () => {
    const current = Array.from({ length: 9 }, (_, i) =>
      review(i + 1, { topics: [negativeMention("wait-time")] }),
    );
    const previous = Array.from({ length: 3 }, (_, i) =>
      review(35 + i, { topics: [negativeMention("wait-time")] }),
    );

    const trends = compareTopics(current, previous);
    expect(trends.find((t) => t.key === "wait-time")?.priority).toBe("CRITICAL");
  });
});

describe("compareWindows", () => {
  const reviews = [
    // Current 30 days: three reviews, average 3.
    review(2, { rating: 3, sentiment: "NEGATIVE", sentimentScore: -0.5 }),
    review(5, { rating: 3, sentiment: "NEUTRAL", sentimentScore: 0 }),
    review(10, { rating: 3, sentiment: "POSITIVE", sentimentScore: 0.5 }),
    // Previous 30 days: two reviews, average 5.
    review(35, { rating: 5 }),
    review(40, { rating: 5 }),
  ];

  it("compares the window against the equal window before it", () => {
    const comparison = compareWindows(reviews, 30, "Last 30 days", NOW);

    expect(comparison.current.count).toBe(3);
    expect(comparison.previous.count).toBe(2);
    expect(comparison.current.averageRating).toBe(3);
    expect(comparison.previous.averageRating).toBe(5);
    expect(comparison.ratingDelta).toBe(-2);
    expect(comparison.volumeDelta).toBe(1);
    expect(comparison.volumePercent).toBe(50);
  });

  it("returns null deltas when the previous window had no reviews", () => {
    const comparison = compareWindows(
      [review(2, { rating: 4 })],
      30,
      "Last 30 days",
      NOW,
    );

    expect(comparison.ratingDelta).toBeNull();
    expect(comparison.volumePercent).toBeNull();
  });

  it("does not double-count a review on the window boundary", () => {
    // Windows are half-open, so a review exactly 30 days old belongs to the
    // previous period only.
    const boundary = [review(30, { rating: 4 })];
    const comparison = compareWindows(boundary, 30, "Last 30 days", NOW);

    expect(comparison.current.count).toBe(0);
    expect(comparison.previous.count).toBe(1);
  });
});

describe("issue classification", () => {
  it("surfaces growing negative themes as emerging", () => {
    const current = Array.from({ length: 6 }, (_, i) =>
      review(i + 1, { topics: [negativeMention("wait-time")] }),
    );
    const previous = Array.from({ length: 3 }, (_, i) =>
      review(35 + i, { topics: [negativeMention("wait-time")] }),
    );

    const trends = compareTopics(current, previous);
    expect(emergingIssues(trends).map((t) => t.key)).toContain("wait-time");
  });

  it("surfaces shrinking negative themes as improving", () => {
    const current = [review(1, { topics: [negativeMention("pricing")] })];
    const previous = Array.from({ length: 5 }, (_, i) =>
      review(35 + i, { topics: [negativeMention("pricing")] }),
    );

    const trends = compareTopics(current, previous);
    expect(improvingIssues(trends).map((t) => t.key)).toContain("pricing");
  });
});
