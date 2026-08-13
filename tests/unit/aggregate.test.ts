import { describe, expect, it } from "vitest";

import {
  aggregateTopics,
  bucketByMonth,
  summarizePeriod,
  topNegativeTopics,
  topPositiveTopics,
} from "@/lib/analytics/aggregate";
import type { AnalyzedReview } from "@/lib/analytics/types";

/** Builds a review fixture with sensible defaults. */
function review(overrides: Partial<AnalyzedReview> = {}): AnalyzedReview {
  return {
    id: overrides.id ?? `r-${Math.random()}`,
    rating: overrides.rating ?? 5,
    reviewedAt: overrides.reviewedAt ?? new Date("2026-06-15T12:00:00Z"),
    hasResponse: overrides.hasResponse ?? false,
    // `??` would swallow an explicit null, which is exactly the case these
    // tests need to express ("ingested but not yet analyzed").
    sentiment: "sentiment" in overrides ? overrides.sentiment! : "POSITIVE",
    sentimentScore:
      "sentimentScore" in overrides ? overrides.sentimentScore! : 0.8,
    urgency: overrides.urgency ?? "LOW",
    topics: overrides.topics ?? [],
  };
}

function mention(
  key: string,
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE",
  extra: { confidence?: number; importance?: number; excerpt?: string } = {},
) {
  return {
    key,
    label: key.replace(/-/g, " "),
    sentiment,
    sentimentScore: sentiment === "POSITIVE" ? 0.7 : sentiment === "NEGATIVE" ? -0.7 : 0,
    confidence: extra.confidence ?? 0.8,
    importance: extra.importance ?? 0.6,
    excerpt: extra.excerpt,
  };
}

describe("summarizePeriod", () => {
  it("computes rating, distribution, and sentiment rates", () => {
    const summary = summarizePeriod([
      review({ rating: 5, sentiment: "POSITIVE", sentimentScore: 0.9 }),
      review({ rating: 4, sentiment: "POSITIVE", sentimentScore: 0.5 }),
      review({ rating: 3, sentiment: "NEUTRAL", sentimentScore: 0 }),
      review({ rating: 1, sentiment: "NEGATIVE", sentimentScore: -0.8 }),
    ]);

    expect(summary.count).toBe(4);
    expect(summary.averageRating).toBe(3.25);
    expect(summary.ratingDistribution).toEqual({ 1: 1, 2: 0, 3: 1, 4: 1, 5: 1 });
    expect(summary.positive).toBe(2);
    expect(summary.negative).toBe(1);
    expect(summary.positiveRate).toBe(0.5);
    expect(summary.negativeRate).toBe(0.25);
    expect(summary.averageSentiment).toBeCloseTo(0.15, 5);
  });

  it("computes sentiment rates over analyzed reviews only", () => {
    // An unanalyzed review is not evidence of neutrality. Counting it as one
    // would understate both the positive and the negative rate.
    const summary = summarizePeriod([
      review({ sentiment: "NEGATIVE", sentimentScore: -0.9 }),
      review({ sentiment: null, sentimentScore: null }),
      review({ sentiment: null, sentimentScore: null }),
    ]);

    expect(summary.count).toBe(3);
    expect(summary.analyzedCount).toBe(1);
    expect(summary.negativeRate).toBe(1);
  });

  it("returns zeroes rather than NaN for an empty period", () => {
    const summary = summarizePeriod([]);
    expect(summary.count).toBe(0);
    expect(summary.averageRating).toBe(0);
    expect(summary.negativeRate).toBe(0);
    expect(Number.isNaN(summary.averageSentiment)).toBe(false);
  });

  it("measures response rate against negative reviews only", () => {
    const summary = summarizePeriod([
      review({ sentiment: "NEGATIVE", hasResponse: true }),
      review({ sentiment: "NEGATIVE", hasResponse: false }),
      review({ sentiment: "POSITIVE", hasResponse: true }),
    ]);

    expect(summary.negativeResponseRate).toBe(0.5);
  });
});

describe("aggregateTopics", () => {
  it("rolls mentions up by topic with per-sentiment counts", () => {
    const topics = aggregateTopics([
      review({ id: "a", topics: [mention("wait-time", "NEGATIVE")] }),
      review({ id: "b", topics: [mention("wait-time", "NEGATIVE")] }),
      review({ id: "c", topics: [mention("wait-time", "POSITIVE")] }),
      review({ id: "d", topics: [mention("staff", "POSITIVE")] }),
    ]);

    const wait = topics.find((t) => t.key === "wait-time");
    expect(wait?.mentions).toBe(3);
    expect(wait?.negativeMentions).toBe(2);
    expect(wait?.positiveMentions).toBe(1);
    expect(wait?.shareOfReviews).toBe(0.75);
    expect(wait?.evidenceReviewIds.sort()).toEqual(["a", "b", "c"]);
  });

  it("discards low-confidence mentions", () => {
    const topics = aggregateTopics([
      review({ topics: [mention("pricing", "NEGATIVE", { confidence: 0.1 })] }),
    ]);
    expect(topics).toHaveLength(0);
  });

  it("keeps the most emphatic excerpts as sample quotes", () => {
    const topics = aggregateTopics([
      review({
        topics: [
          mention("wait-time", "NEGATIVE", {
            importance: 0.2,
            excerpt: "mild remark",
          }),
        ],
      }),
      review({
        topics: [
          mention("wait-time", "NEGATIVE", {
            importance: 1,
            excerpt: "waited an hour",
          }),
        ],
      }),
    ]);

    expect(topics[0]?.sampleQuotes[0]).toBe("waited an hour");
  });

  it("supports topics the catalog has never seen", () => {
    // Topics are discovered, not enumerated — nothing downstream may branch on
    // a fixed list of keys.
    const topics = aggregateTopics([
      review({ topics: [mention("parking-validation", "NEGATIVE")] }),
    ]);

    expect(topics[0]?.key).toBe("parking-validation");
    expect(topics[0]?.negativeMentions).toBe(1);
  });

  it("counts a review once per topic when ranking share of reviews", () => {
    const topics = aggregateTopics([
      review({
        id: "a",
        topics: [mention("wait-time", "NEGATIVE"), mention("staff", "POSITIVE")],
      }),
    ]);

    expect(topics.every((t) => t.shareOfReviews === 1)).toBe(true);
  });
});

describe("topic ranking", () => {
  const topics = aggregateTopics([
    review({ id: "1", topics: [mention("wait-time", "NEGATIVE")] }),
    review({ id: "2", topics: [mention("wait-time", "NEGATIVE")] }),
    review({ id: "3", topics: [mention("pricing", "NEGATIVE")] }),
    review({ id: "4", topics: [mention("staff", "POSITIVE")] }),
    review({ id: "5", topics: [mention("staff", "POSITIVE")] }),
    review({ id: "6", topics: [mention("cleanliness", "POSITIVE")] }),
  ]);

  it("ranks negative topics by negative volume", () => {
    const ranked = topNegativeTopics(topics);
    expect(ranked[0]?.key).toBe("wait-time");
    expect(ranked.map((t) => t.key)).not.toContain("staff");
  });

  it("ranks positive topics by positive volume", () => {
    const ranked = topPositiveTopics(topics);
    expect(ranked[0]?.key).toBe("staff");
    expect(ranked.map((t) => t.key)).not.toContain("wait-time");
  });
});

describe("bucketByMonth", () => {
  it("includes months with no reviews so a quiet period is visible", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    const buckets = bucketByMonth(
      [review({ reviewedAt: new Date("2026-06-02T00:00:00Z") })],
      3,
      now,
    );

    expect(buckets).toHaveLength(3);
    expect(buckets.at(-1)?.reviewCount).toBe(1);
    expect(buckets[0]?.reviewCount).toBe(0);
    // A month with no reviews has no rating — not a zero, which would plot as
    // a catastrophic drop.
    expect(buckets[0]?.averageRating).toBeNull();
  });
});
