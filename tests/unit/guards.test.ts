import { describe, expect, it } from "vitest";

import { allowedNumbersFromFacts, checkClaims, checkNumbers } from "@/lib/ai/guards";
import type { FactSheet } from "@/lib/ai/types";

/**
 * The anti-fabrication guard.
 *
 * This is the mechanism that keeps a generated sentence from asserting a
 * statistic the data does not support, so it is worth testing from both sides:
 * it must catch invented figures, and it must not reject legitimate ones.
 */

const FACTS: FactSheet = {
  businessName: "Columbus Dental Care",
  industry: "Dentist",
  periodLabel: "the last 30 days",
  totalReviews: 25,
  averageRating: 3.64,
  positiveRate: 0.76,
  negativeRate: 0.16,
  reputationScore: 65,
  scoreDelta: -12,
  topNegativeTopics: [
    {
      key: "wait-time",
      label: "Wait Time",
      mentions: 9,
      negativeMentions: 8,
      positiveMentions: 1,
      trendPercent: 60,
      shareOfReviews: 0.32,
      evidenceReviewIds: ["a", "b"],
      sampleQuotes: ["I waited almost 45 minutes past my appointment."],
    },
  ],
  topPositiveTopics: [],
  emergingTopics: [],
};

describe("allowedNumbersFromFacts", () => {
  it("includes the computed metrics", () => {
    const allowed = allowedNumbersFromFacts(FACTS);
    expect(allowed.has(25)).toBe(true);
    expect(allowed.has(65)).toBe(true);
    expect(allowed.has(8)).toBe(true);
  });

  it("includes numbers embedded in the text the model was shown", () => {
    // A model repeating "45 minutes" from a quote it was given is not
    // fabricating — that number traces back to a specific review.
    const allowed = allowedNumbersFromFacts(FACTS);
    expect(allowed.has(45)).toBe(true);
    expect(allowed.has(30)).toBe(true); // from "the last 30 days"
  });
});

describe("checkNumbers", () => {
  const allowed = allowedNumbersFromFacts(FACTS);

  it("accepts a figure that is in the fact sheet", () => {
    expect(checkNumbers("Wait time drew 8 negative mentions.", allowed).ok).toBe(
      true,
    );
  });

  it("rejects a figure that appears nowhere in the data", () => {
    const result = checkNumbers(
      "Wait time complaints increased 43% this month.",
      allowed,
    );
    expect(result.ok).toBe(false);
    expect(result.violations).toContain(43);
  });

  it("tolerates sensible rounding of a computed value", () => {
    // The model writing "16%" for a 0.16 negative rate is restating the fact,
    // not inventing one.
    expect(checkNumbers("Negative reviews are 16% of the total.", allowed).ok).toBe(
      true,
    );
  });

  it("allows small counting numbers that carry no factual claim", () => {
    expect(checkNumbers("There are 3 things to fix.", allowed).ok).toBe(true);
  });

  it("handles prose containing no numbers at all", () => {
    expect(checkNumbers("Wait times are getting worse.", allowed).ok).toBe(true);
  });
});

describe("checkClaims", () => {
  it("passes prose grounded in the fact sheet", () => {
    const result = checkClaims(
      [
        "Wait Time drew 8 negative mentions in the last 30 days.",
        "Your reputation score is 65.",
      ],
      FACTS,
    );
    expect(result.ok).toBe(true);
  });

  it("collects every invented number across the claims", () => {
    const result = checkClaims(
      ["Complaints rose 43%.", "Revenue fell by 22%."],
      FACTS,
    );

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(expect.arrayContaining([43, 22]));
  });

  it("ignores undefined claims", () => {
    expect(checkClaims([undefined, undefined], FACTS).ok).toBe(true);
  });
});
