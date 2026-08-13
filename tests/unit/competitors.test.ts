import { describe, expect, it } from "vitest";

import {
  MIN_COMPETITOR_REVIEWS,
  buildCompetitorProfile,
  compareToCompetitors,
  type CompetitorSnapshot,
} from "@/lib/analytics/competitors";
import { summarizePeriod, aggregateTopics } from "@/lib/analytics/aggregate";
import type { AnalyzedReview } from "@/lib/analytics/types";

function businessReview(
  topicKey: string,
  sentiment: "POSITIVE" | "NEGATIVE",
): AnalyzedReview {
  return {
    id: `r-${Math.random()}`,
    rating: sentiment === "POSITIVE" ? 5 : 2,
    reviewedAt: new Date("2026-06-15T00:00:00Z"),
    hasResponse: false,
    sentiment,
    sentimentScore: sentiment === "POSITIVE" ? 0.8 : -0.8,
    urgency: "LOW",
    topics: [
      {
        key: topicKey,
        label: topicKey.replace(/-/g, " "),
        sentiment,
        sentimentScore: sentiment === "POSITIVE" ? 0.8 : -0.8,
        confidence: 0.9,
        importance: 0.7,
      },
    ],
  };
}

function competitorReview(
  topicKeys: string[],
  sentiment: "POSITIVE" | "NEGATIVE",
) {
  return {
    rating: sentiment === "POSITIVE" ? 5 : 2,
    reviewedAt: new Date("2026-06-15T00:00:00Z"),
    sentiment,
    sentimentScore: sentiment === "POSITIVE" ? 0.8 : -0.8,
    topicKeys,
  };
}

describe("buildCompetitorProfile", () => {
  it("keeps the published rating separate from our sample", () => {
    // A rating recomputed from ten sampled reviews would look authoritative
    // and be wrong; the published figure is the one to trust.
    const snapshot: CompetitorSnapshot = {
      id: "c1",
      name: "Grandview Family Dentistry",
      publishedRating: 4.6,
      publishedReviewCount: 480,
      reviews: [competitorReview(["staff"], "NEGATIVE")],
    };

    const profile = buildCompetitorProfile(snapshot);
    expect(profile.publishedRating).toBe(4.6);
    expect(profile.publishedReviewCount).toBe(480);
    expect(profile.sampleSize).toBe(1);
    expect(profile.sampleRating).toBe(2);
  });

  it("reports no rating when the provider supplies none and we hold nothing", () => {
    const profile = buildCompetitorProfile({
      id: "c2",
      name: "Unconnected Competitor",
      publishedRating: null,
      publishedReviewCount: null,
      reviews: [],
    });

    expect(profile.publishedRating).toBeNull();
    expect(profile.sampleRating).toBeNull();
    expect(profile.negativeRate).toBeNull();
  });
});

describe("compareToCompetitors", () => {
  const businessReviews = [
    ...Array.from({ length: 8 }, () => businessReview("wait-time", "NEGATIVE")),
    ...Array.from({ length: 10 }, () => businessReview("staff", "POSITIVE")),
  ];

  const competitors: CompetitorSnapshot[] = [
    {
      id: "c1",
      name: "Grandview",
      publishedRating: 4.6,
      publishedReviewCount: 400,
      reviews: [
        ...Array.from({ length: 14 }, () =>
          competitorReview(["staff"], "NEGATIVE"),
        ),
        ...Array.from({ length: 6 }, () =>
          competitorReview(["wait-time"], "POSITIVE"),
        ),
      ],
    },
  ];

  const comparison = compareToCompetitors({
    businessSummary: summarizePeriod(businessReviews),
    businessTopics: aggregateTopics(businessReviews),
    competitors,
  });

  it("reports the rating gap against the published average", () => {
    expect(comparison.competitorAverageRating).toBe(4.6);
    expect(comparison.ratingGap).toBeCloseTo(
      comparison.businessRating - 4.6,
      2,
    );
  });

  it("identifies where the business attracts more complaints", () => {
    expect(comparison.weaknesses.map((w) => w.topicKey)).toContain("wait-time");
  });

  it("identifies where the business attracts fewer complaints", () => {
    expect(comparison.strengths.map((s) => s.topicKey)).toContain("staff");
  });

  it("compares shares rather than raw counts", () => {
    // The competitor has more absolute staff complaints only because it has
    // more reviews; the comparison must not read that as "they are worse".
    const staff = comparison.divergences.find((d) => d.topicKey === "staff");
    expect(staff?.businessNegativeShare).toBe(0);
    expect(staff?.competitorNegativeShare).toBeGreaterThan(0);
  });

  it("refuses to compare topics when competitor data is too thin", () => {
    const thin = compareToCompetitors({
      businessSummary: summarizePeriod(businessReviews),
      businessTopics: aggregateTopics(businessReviews),
      competitors: [
        {
          id: "c9",
          name: "Barely Tracked",
          publishedRating: 4.1,
          publishedReviewCount: 12,
          reviews: Array.from({ length: MIN_COMPETITOR_REVIEWS - 1 }, () =>
            competitorReview(["wait-time"], "NEGATIVE"),
          ),
        },
      ],
    });

    expect(thin.thin).toBe(true);
    expect(thin.divergences).toHaveLength(0);
    // The rating is still comparable — that figure is published, not sampled.
    expect(thin.competitorAverageRating).toBe(4.1);
  });

  it("handles having no competitors at all", () => {
    const none = compareToCompetitors({
      businessSummary: summarizePeriod(businessReviews),
      businessTopics: aggregateTopics(businessReviews),
      competitors: [],
    });

    expect(none.profiles).toHaveLength(0);
    expect(none.competitorAverageRating).toBeNull();
    expect(none.ratingGap).toBeNull();
  });
});
