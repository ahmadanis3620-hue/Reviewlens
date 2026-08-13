/**
 * Polarity lexicon for the local heuristic analyzer.
 *
 * Weights are on a -1..1 scale describing how strongly a term signals
 * sentiment on its own. This is a small, hand-tuned lexicon aimed at
 * service-business review language, not a general-purpose one.
 */

export const POSITIVE_TERMS: Record<string, number> = {
  amazing: 0.9, excellent: 0.9, outstanding: 0.9, fantastic: 0.85, wonderful: 0.85,
  perfect: 0.85, superb: 0.85, exceptional: 0.85, incredible: 0.8, phenomenal: 0.9,
  great: 0.7, awesome: 0.8, love: 0.75, loved: 0.75, best: 0.75, impressed: 0.7,
  professional: 0.55, friendly: 0.65, kind: 0.6, courteous: 0.6, welcoming: 0.6,
  helpful: 0.6, knowledgeable: 0.6, thorough: 0.55, attentive: 0.6, caring: 0.65,
  patient: 0.5, gentle: 0.55, honest: 0.65, transparent: 0.6, fair: 0.5,
  clean: 0.55, spotless: 0.75, immaculate: 0.8, modern: 0.4, comfortable: 0.5,
  quick: 0.45, fast: 0.45, prompt: 0.55, efficient: 0.55, punctual: 0.6,
  reasonable: 0.5, affordable: 0.55, recommend: 0.7, recommended: 0.65,
  pleased: 0.6, satisfied: 0.55, happy: 0.6, comfortable_with: 0.5,
  good: 0.5, nice: 0.45, solid: 0.4, reliable: 0.6, trustworthy: 0.7,
  smooth: 0.5, easy: 0.45, painless: 0.6, worth: 0.5, appreciated: 0.6,
  responsive: 0.6, accommodating: 0.6, respectful: 0.55, seamless: 0.6,
  lovely: 0.7, terrific: 0.8, delightful: 0.8, pleasant: 0.55, thoughtful: 0.6,
  compassionate: 0.7, understanding: 0.55, meticulous: 0.65, warm: 0.55,
  flexible: 0.5, straightforward: 0.5, effortless: 0.6, informative: 0.5,
};

export const NEGATIVE_TERMS: Record<string, number> = {
  terrible: -0.9, awful: -0.9, horrible: -0.9, worst: -0.95, appalling: -0.9,
  disgusting: -0.85, unacceptable: -0.8, disappointing: -0.65, disappointed: -0.65,
  frustrating: -0.65, frustrated: -0.65, annoyed: -0.55, angry: -0.7, furious: -0.85,
  rude: -0.8, dismissive: -0.7, condescending: -0.75, unprofessional: -0.8,
  unfriendly: -0.65, uncaring: -0.7, careless: -0.75, sloppy: -0.7, incompetent: -0.85,
  overpriced: -0.7, expensive: -0.4, ripoff: -0.9, gouging: -0.85, scam: -0.95,
  dirty: -0.7, filthy: -0.85, unsanitary: -0.85, outdated: -0.4, cramped: -0.4,
  slow: -0.5, late: -0.5, delayed: -0.5, waited: -0.3, wait: -0.2, forever: -0.55,
  rushed: -0.5, ignored: -0.7, confusing: -0.5, unclear: -0.45, misleading: -0.75,
  broken: -0.6, botched: -0.85, failed: -0.65, useless: -0.75, poor: -0.6,
  bad: -0.55, mediocre: -0.45, mistake: -0.5, error: -0.5, problem: -0.4,
  wrong: -0.55, incorrect: -0.5, unresolved: -0.5, misplaced: -0.45,
  overcharged: -0.75, surprised: -0.3, unhelpful: -0.6, dismissed: -0.6,
  complaint: -0.45, refuse: -0.6, refused: -0.6, denied: -0.5, cancel: -0.35,
  canceled: -0.45, cancelled: -0.45, avoid: -0.7, never_again: -0.85,
  regret: -0.7, waste: -0.7, painful: -0.55, uncomfortable: -0.45, hassle: -0.5,
  surprise: -0.3, unexpected: -0.3, nightmare: -0.85, disaster: -0.85,
};

/** Multiplies the polarity of the term that follows. */
export const INTENSIFIERS: Record<string, number> = {
  very: 1.5, extremely: 1.8, really: 1.4, incredibly: 1.7, absolutely: 1.6,
  completely: 1.5, totally: 1.5, so: 1.3, super: 1.4, quite: 1.15,
  highly: 1.5, truly: 1.4, deeply: 1.5, utterly: 1.7, thoroughly: 1.4,
};

/** Reduces the polarity of the term that follows. */
export const DIMINISHERS: Record<string, number> = {
  somewhat: 0.6, slightly: 0.5, a: 1, bit: 0.5, little: 0.6, kind: 0.6,
  sort: 0.6, fairly: 0.75, relatively: 0.7, mostly: 0.8, mildly: 0.5,
};

export const NEGATIONS = new Set([
  "not", "no", "never", "none", "nobody", "nothing", "neither", "nowhere",
  "cannot", "cant", "cann't", "can't", "couldnt", "couldn't", "wouldnt",
  "wouldn't", "shouldnt", "shouldn't", "wont", "won't", "dont", "don't",
  "doesnt", "doesn't", "didnt", "didn't", "isnt", "isn't", "wasnt", "wasn't",
  "arent", "aren't", "werent", "weren't", "hardly", "barely", "rarely",
  "without", "lacks", "lacked", "failed",
]);

/**
 * Phrases that suggest a review may touch on safety, legal, or regulatory
 * exposure. These set a flag for human attention only — the product draws no
 * legal or medical conclusion, and the UI says so wherever the flag appears.
 */
export const RISK_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /\b(lawyer|attorney|legal action|sue|suing|lawsuit|litigation)\b/i, category: "legal threat" },
  { pattern: /\b(malpractice|negligence|negligent)\b/i, category: "negligence claim" },
  { pattern: /\b(infection|infected|sepsis|contaminat\w*|unsanitary|not sterile|unsterile)\b/i, category: "hygiene or infection concern" },
  { pattern: /\b(injur\w+|hurt me|harmed|wound\w*|bleeding|permanent damage)\b/i, category: "reported injury" },
  { pattern: /\b(gas leak|carbon monoxide|electrical fire|fire hazard|caught fire|flooded my|water damage)\b/i, category: "safety hazard" },
  { pattern: /\b(discriminat\w+|racist|racial|sexist|harass\w+)\b/i, category: "discrimination or harassment allegation" },
  { pattern: /\b(reported (them|this|it) to|state board|licensing board|health department|better business bureau|bbb)\b/i, category: "regulatory escalation" },
  { pattern: /\b(fraud|fraudulent|scam|stole|theft|overcharged me)\b/i, category: "financial misconduct allegation" },
  { pattern: /\b(refus\w+ to (refund|fix|honor)|wouldn'?t honor)\b/i, category: "unresolved dispute" },
];

const CONTRACTION_MAP: Record<string, string> = {
  "n't": " not",
  "'re": " are",
  "'ve": " have",
  "'ll": " will",
  "'m": " am",
};

export function normalizeText(input: string): string {
  let out = input.toLowerCase();
  for (const [from, to] of Object.entries(CONTRACTION_MAP)) {
    out = out.split(from).join(to);
  }
  return out;
}

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
