import { describe, expect, it } from "vitest";

import { LocalHeuristicProvider } from "@/lib/ai/providers/local";
import { reviewAnalysisSchema } from "@/lib/ai/schemas";

/**
 * The deterministic analyzer.
 *
 * These assertions are the contract demo mode rests on: the analysis has to be
 * derived from the review text, not from the star rating alone, and it has to
 * be stable enough that the same review always produces the same conclusion.
 */

const ai = new LocalHeuristicProvider();

function analyze(text: string, rating = 3) {
  return ai.analyzeReview({
    reviewText: text,
    rating,
    reviewedAt: new Date("2026-06-15T00:00:00Z"),
    businessName: "Columbus Dental Care",
    industry: "Dentist",
    knownTopicKeys: [],
  });
}

describe("sentiment", () => {
  it("reads a clearly positive review as positive", async () => {
    const result = await analyze(
      "The staff were incredibly friendly and the office was spotless. Best cleaning I have had in years.",
      5,
    );

    expect(result.sentiment).toBe("POSITIVE");
    expect(result.sentimentScore).toBeGreaterThan(0.2);
  });

  it("reads a clearly negative review as negative", async () => {
    const result = await analyze(
      "Absolutely terrible experience. The receptionist was rude and dismissive, and the work was sloppy.",
      1,
    );

    expect(result.sentiment).toBe("NEGATIVE");
    expect(result.sentimentScore).toBeLessThan(-0.2);
  });

  it("handles negation rather than matching bare keywords", async () => {
    const positive = await analyze("The staff were friendly.", 4);
    const negated = await analyze("The staff were not friendly.", 4);

    expect(negated.sentimentScore).toBeLessThan(positive.sentimentScore);
  });

  it("responds to intensifiers", async () => {
    const plain = await analyze("The office was clean.", 4);
    const intense = await analyze("The office was extremely clean.", 4);

    expect(intense.sentimentScore).toBeGreaterThan(plain.sentimentScore);
  });

  it("uses the rating when the text carries no polarity terms", async () => {
    const high = await analyze("I came in on Tuesday for an appointment.", 5);
    const low = await analyze("I came in on Tuesday for an appointment.", 1);

    expect(high.sentimentScore).toBeGreaterThan(low.sentimentScore);
  });

  it("is deterministic", async () => {
    const text = "Waited almost an hour past my appointment, but the hygienist was lovely.";
    const a = await analyze(text, 3);
    const b = await analyze(text, 3);

    expect(a).toEqual(b);
  });
});

describe("topic detection", () => {
  it("detects the theme a complaint is actually about", async () => {
    const result = await analyze(
      "I waited almost an hour past my appointment time before anyone came to get me.",
      2,
    );

    const keys = result.topics.map((t) => t.key);
    expect(keys).toContain("wait-time");

    const wait = result.topics.find((t) => t.key === "wait-time");
    expect(wait?.sentiment).toBe("NEGATIVE");
  });

  it("separates sentiment per topic within one review", async () => {
    const result = await analyze(
      "The hygienist was wonderful and so kind. However I waited almost an hour past my appointment time.",
      3,
    );

    const staff = result.topics.find((t) => t.key === "staff");
    const wait = result.topics.find((t) => t.key === "wait-time");

    expect(staff?.sentiment).toBe("POSITIVE");
    expect(wait?.sentiment).toBe("NEGATIVE");
  });

  it("does not invert an explicit statement to match the review's overall tone", async () => {
    // A positive remark inside a furious review must not be recorded as a
    // negative mention of that topic — the analyzer would be contradicting the
    // sentence it is quoting.
    const result = await analyze(
      "Absolutely terrible. Billed me twice and nobody would explain why. The office is spotless, at least.",
      1,
    );

    const cleanliness = result.topics.find((t) => t.key === "cleanliness");
    if (cleanliness) {
      expect(cleanliness.sentiment).not.toBe("NEGATIVE");
    }
  });

  it("quotes a real span of the review as the excerpt", async () => {
    const text =
      "The prices have gone up a lot and nobody mentioned the increase beforehand.";
    const result = await analyze(text, 2);
    const pricing = result.topics.find((t) => t.key === "pricing");

    expect(pricing?.excerpt).toBeDefined();
    expect(text).toContain(pricing!.excerpt!);
  });

  it("finds no topics in text that discusses none", async () => {
    const result = await analyze("Ok.", 3);
    expect(result.topics.length).toBe(0);
  });
});

describe("urgency and risk", () => {
  it("flags a potential legal issue as critical", async () => {
    const result = await analyze(
      "I have contacted an attorney about the injury caused during my procedure.",
      1,
    );

    expect(result.riskFlagged).toBe(true);
    expect(result.urgency).toBe("CRITICAL");
    expect(result.riskCategories.length).toBeGreaterThan(0);
  });

  it("does not flag an ordinary complaint as a risk", async () => {
    const result = await analyze("The wait was long and I was frustrated.", 2);
    expect(result.riskFlagged).toBe(false);
  });

  it("rates a happy review as low urgency", async () => {
    const result = await analyze("Great visit, everyone was lovely.", 5);
    expect(result.urgency).toBe("LOW");
  });

  it("escalates a one-star review", async () => {
    const result = await analyze("Terrible service, would not recommend.", 1);
    expect(["HIGH", "CRITICAL"]).toContain(result.urgency);
  });
});

describe("problems and strengths", () => {
  it("extracts the sentences that state a problem", async () => {
    const result = await analyze(
      "The billing office got my insurance information wrong twice. The hygienist was lovely though.",
      2,
    );

    expect(result.problems.length).toBeGreaterThan(0);
    expect(result.strengths.length).toBeGreaterThan(0);
  });
});

describe("schema conformance", () => {
  it("always produces output that validates", async () => {
    const samples = [
      ["", 3],
      ["!!!", 1],
      ["a".repeat(4000), 5],
      ["Great! Amazing! Wonderful! Best ever!", 5],
      ["Waited. Waited. Waited. Still waiting.", 1],
    ] as const;

    for (const [text, rating] of samples) {
      const result = await analyze(text, rating);
      expect(() => reviewAnalysisSchema.parse(result)).not.toThrow();
    }
  });
});

describe("suggested responses", () => {
  it("drafts a reply that acknowledges the complaint", async () => {
    const response = await ai.generateSuggestedResponse({
      reviewText: "I waited almost an hour past my appointment time.",
      rating: 2,
      businessName: "Columbus Dental Care",
      sentiment: "NEGATIVE",
      problems: ["Long wait"],
    });

    expect(response.length).toBeGreaterThan(20);
    expect(response.toLowerCase()).toContain("sorry");
  });

  it("thanks a happy reviewer without apologising", async () => {
    const response = await ai.generateSuggestedResponse({
      reviewText: "The staff were wonderful and the office was spotless.",
      rating: 5,
      businessName: "Columbus Dental Care",
      sentiment: "POSITIVE",
      problems: [],
    });

    expect(response.toLowerCase()).toContain("thank");
  });
});
