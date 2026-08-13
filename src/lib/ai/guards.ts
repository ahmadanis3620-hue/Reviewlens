import type { FactSheet } from "@/lib/ai/types";

/**
 * The anti-fabrication guard.
 *
 * A language model asked to describe review data will, given the chance,
 * produce a number that sounds right. This checks generated prose for numeric
 * tokens and rejects any that cannot be traced to the fact sheet the model was
 * given.
 *
 * It is applied to text that makes *claims about the data* — summaries,
 * problem statements, rationales — and deliberately not to recommended actions,
 * where a proposed operational parameter ("add a 15-minute buffer") is a
 * suggestion rather than an assertion about what the reviews say.
 */

const NUMBER_TOKEN = /\d+(?:,\d{3})*(?:\.\d+)?/g;

/** Numbers that carry no factual claim on their own. */
const ALWAYS_ALLOWED = new Set([0, 1, 2, 3, 4, 5]);

export type NumericGuardResult = {
  ok: boolean;
  violations: number[];
};

/**
 * Collects every number the model is permitted to restate.
 *
 * That is the union of two things: the computed metrics, and any number that
 * appeared in the *text* it was shown — the period label, topic labels, and
 * the review quotes. A model repeating "waited 45 minutes" from a quote it was
 * given is not fabricating; the number is traceable to a specific review.
 */
export function allowedNumbersFromFacts(facts: FactSheet): Set<number> {
  const allowed = new Set<number>();

  const add = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    allowed.add(round(value));
    // Percentages are commonly restated both as a rate and as a whole number.
    allowed.add(round(value * 100));
    allowed.add(Math.round(value));
    allowed.add(Math.round(value * 100));
  };

  /** Numbers embedded in text we handed the model. */
  const addFromText = (text: string | null | undefined) => {
    if (!text) return;
    for (const token of text.match(NUMBER_TOKEN) ?? []) {
      const parsed = Number.parseFloat(token.replace(/,/g, ""));
      if (Number.isFinite(parsed)) allowed.add(parsed);
    }
  };

  addFromText(facts.periodLabel);
  addFromText(facts.businessName);
  addFromText(facts.industry);

  add(facts.totalReviews);
  add(facts.averageRating);
  add(facts.positiveRate);
  add(facts.negativeRate);
  add(facts.reputationScore);
  add(facts.scoreDelta);
  add(Math.abs(facts.scoreDelta ?? 0));

  for (const group of [
    facts.topNegativeTopics,
    facts.topPositiveTopics,
    facts.emergingTopics,
  ]) {
    for (const topic of group) {
      add(topic.mentions);
      add(topic.negativeMentions);
      add(topic.positiveMentions);
      add(topic.shareOfReviews);
      if (topic.trendPercent !== null) {
        add(topic.trendPercent);
        add(Math.abs(topic.trendPercent));
      }
      addFromText(topic.label);
      for (const quote of topic.sampleQuotes) addFromText(quote);
    }
  }

  return allowed;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A stated number matches a fact if it is equal after rounding to whole
 * numbers, which tolerates the model writing "13%" for 12.7% while still
 * catching an invented "43%" that appears nowhere in the data.
 */
function isSupported(candidate: number, allowed: Set<number>): boolean {
  if (ALWAYS_ALLOWED.has(candidate)) return true;
  if (allowed.has(candidate)) return true;
  if (allowed.has(round(candidate))) return true;
  for (const value of allowed) {
    if (Math.abs(value - candidate) < 0.51) return true;
  }
  return false;
}

export function checkNumbers(text: string, allowed: Set<number>): NumericGuardResult {
  const violations: number[] = [];
  const matches = text.match(NUMBER_TOKEN) ?? [];

  for (const raw of matches) {
    const parsed = Number.parseFloat(raw.replace(/,/g, ""));
    if (!Number.isFinite(parsed)) continue;
    if (!isSupported(parsed, allowed)) violations.push(parsed);
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Convenience wrapper over several fields at once. Returns the union of
 * violations so a caller can log exactly what the model made up.
 */
export function checkClaims(
  claims: Array<string | undefined>,
  facts: FactSheet,
): NumericGuardResult {
  const allowed = allowedNumbersFromFacts(facts);
  const violations: number[] = [];

  for (const claim of claims) {
    if (!claim) continue;
    violations.push(...checkNumbers(claim, allowed).violations);
  }

  return { ok: violations.length === 0, violations: [...new Set(violations)] };
}
