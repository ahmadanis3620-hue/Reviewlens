import {
  DIMINISHERS,
  INTENSIFIERS,
  NEGATIONS,
  NEGATIVE_TERMS,
  POSITIVE_TERMS,
  RISK_PATTERNS,
  normalizeText,
  splitSentences,
  tokenize,
} from "@/lib/ai/lexicon";
import { reviewAnalysisSchema } from "@/lib/ai/schemas";
import type {
  AIProvider,
  CompetitorContext,
  RecommendationContext,
  RecommendationDraft,
  ReviewAnalysisInput,
  ReviewAnalysisResult,
  SuggestedResponseInput,
  SummaryContext,
  TopicFact,
} from "@/lib/ai/types";
import { STARTER_TOPICS } from "@/lib/topics/catalog";
import { clamp, round } from "@/lib/utils";

/**
 * Deterministic local analyzer.
 *
 * This is not a random data generator — it reads the review text and produces
 * defensible output from it. That distinction is what makes demo mode a real
 * demonstration of the product rather than a mockup, and it makes the analysis
 * tests deterministic.
 *
 * Where it is weaker than a frontier model: sarcasm, implicit topics, and
 * unusual phrasings. It compensates by blending the star rating into the
 * sentiment estimate, which is a strong independent signal.
 */

const RATING_WEIGHT = 0.55;
const TEXT_WEIGHT = 0.45;

/** Scores one sentence, applying negation, intensifiers, and diminishers. */
function scoreSentence(sentence: string): { score: number; hits: number } {
  const tokens = tokenize(sentence);
  let total = 0;
  let hits = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    const polarity = POSITIVE_TERMS[token] ?? NEGATIVE_TERMS[token];
    if (polarity === undefined) continue;

    let value = polarity;

    // Look back up to three tokens for modifiers.
    let negated = false;
    for (let back = 1; back <= 3 && i - back >= 0; back++) {
      const prev = tokens[i - back];
      if (!prev) continue;
      if (NEGATIONS.has(prev)) negated = true;
      if (back === 1) {
        const intensifier = INTENSIFIERS[prev];
        const diminisher = DIMINISHERS[prev];
        if (intensifier) value *= intensifier;
        else if (diminisher) value *= diminisher;
      }
    }

    if (negated) {
      // "not great" is mildly negative, not strongly so; flipping outright
      // overstates it.
      value = -value * 0.75;
    }

    total += value;
    hits += 1;
  }

  if (hits === 0) return { score: 0, hits: 0 };
  // Average rather than sum, so a long sentence isn't automatically stronger,
  // then allow a modest boost for repeated signal.
  const avg = total / hits;
  const boosted = avg * (1 + Math.min(hits - 1, 3) * 0.1);
  return { score: clamp(boosted, -1, 1), hits };
}

function scoreText(text: string): { score: number; hits: number } {
  const sentences = splitSentences(text);
  let weighted = 0;
  let weight = 0;
  let hits = 0;

  for (const sentence of sentences) {
    const { score, hits: sentenceHits } = scoreSentence(sentence);
    if (sentenceHits === 0) continue;
    // Sentences carrying more polarity terms count for more.
    const w = 1 + sentenceHits * 0.25;
    weighted += score * w;
    weight += w;
    hits += sentenceHits;
  }

  if (weight === 0) return { score: 0, hits: 0 };
  return { score: clamp(weighted / weight, -1, 1), hits };
}

function ratingToScore(rating: number): number {
  return clamp((rating - 3) / 2, -1, 1);
}

function labelFor(score: number): "POSITIVE" | "NEUTRAL" | "NEGATIVE" {
  if (score >= 0.2) return "POSITIVE";
  if (score <= -0.2) return "NEGATIVE";
  return "NEUTRAL";
}

function countPhrase(haystack: string, phrase: string): number {
  if (!phrase) return 0;
  // Word-boundary match for single words; substring for multi-word phrases.
  if (!phrase.includes(" ")) {
    const re = new RegExp(`\\b${escapeRegex(phrase)}\\b`, "g");
    return (haystack.match(re) ?? []).length;
  }
  let count = 0;
  let index = haystack.indexOf(phrase);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(phrase, index + phrase.length);
  }
  return count;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type DetectedTopic = {
  key: string;
  label: string;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  sentimentScore: number;
  confidence: number;
  importance: number;
  excerpt?: string;
};

function detectTopics(
  text: string,
  overallScore: number,
): DetectedTopic[] {
  const normalized = normalizeText(text);
  const sentences = splitSentences(text);
  const detected: DetectedTopic[] = [];

  for (const topic of STARTER_TOPICS) {
    let cueHits = 0;
    for (const cue of topic.cues) {
      cueHits += countPhrase(normalized, cue);
    }
    if (cueHits === 0) continue;

    // Find the sentence that triggered it — this becomes the excerpt and the
    // basis for the topic's own sentiment.
    let bestSentence: string | undefined;
    let bestSentenceHits = 0;
    for (const sentence of sentences) {
      const lower = normalizeText(sentence);
      let hits = 0;
      for (const cue of topic.cues) hits += countPhrase(lower, cue);
      if (hits > bestSentenceHits) {
        bestSentenceHits = hits;
        bestSentence = sentence;
      }
    }

    const context = bestSentence ? normalizeText(bestSentence) : normalized;

    let negativeCueHits = 0;
    for (const cue of topic.negativeCues ?? []) {
      negativeCueHits += countPhrase(context, cue);
    }
    let positiveCueHits = 0;
    for (const cue of topic.positiveCues ?? []) {
      positiveCueHits += countPhrase(context, cue);
    }

    // Topic sentiment combines three signals: the polarity of the sentence the
    // topic appears in, explicit topic-specific cue phrases, and the review's
    // overall tone.
    //
    // The overall tone is always part of the blend, not just a fallback. A
    // complaint like "I waited almost an hour" carries only one mildly negative
    // lexicon term, and weighting the sentence alone lands it in the neutral
    // band — which reads as the analyzer failing to notice a complaint. The
    // review's own negativity is real evidence about what its topics mean, and
    // the sentence still dominates so that a positive remark inside a negative
    // review is not dragged negative with it.
    const sentenceScore = bestSentence ? scoreSentence(bestSentence).score : 0;
    const cueBias = clamp((positiveCueHits - negativeCueHits) * 0.5, -1, 1);
    const hasLocalSignal =
      Math.abs(sentenceScore) > 0.05 || positiveCueHits > 0 || negativeCueHits > 0;

    let topicScore = hasLocalSignal
      ? clamp(sentenceScore * 0.55 + overallScore * 0.45 + cueBias, -1, 1)
      : clamp(overallScore * 0.8, -1, 1);

    // The review's overall tone may *moderate* a topic's sentiment but must not
    // invert an explicit statement. Without this, "nice waiting area" inside a
    // furious one-star review came out as a negative mention of facilities —
    // the analyzer contradicting the sentence it is quoting, which is worse
    // than missing the topic entirely.
    const LOCAL_SIGNAL_IS_CLEAR = 0.35;
    if (sentenceScore >= LOCAL_SIGNAL_IS_CLEAR && cueBias >= 0) {
      topicScore = Math.max(topicScore, 0);
    } else if (sentenceScore <= -LOCAL_SIGNAL_IS_CLEAR && cueBias <= 0) {
      topicScore = Math.min(topicScore, 0);
    }

    const confidence = clamp(
      0.45 + Math.min(cueHits, 4) * 0.1 + (negativeCueHits + positiveCueHits) * 0.08,
      0.3,
      0.95,
    );

    // Central topics are mentioned repeatedly and carry clear polarity.
    const importance = clamp(
      0.3 + Math.min(cueHits, 4) * 0.12 + Math.abs(topicScore) * 0.3,
      0.2,
      1,
    );

    detected.push({
      key: topic.key,
      label: topic.label,
      sentiment: labelFor(topicScore),
      sentimentScore: round(topicScore, 3),
      confidence: round(confidence, 3),
      importance: round(importance, 3),
      excerpt: bestSentence?.slice(0, 300),
    });
  }

  return detected
    .sort((a, b) => b.importance * b.confidence - a.importance * a.confidence)
    .slice(0, 6);
}

function detectRisk(text: string): { flagged: boolean; categories: string[] } {
  const categories = new Set<string>();
  for (const { pattern, category } of RISK_PATTERNS) {
    if (pattern.test(text)) categories.add(category);
  }
  return { flagged: categories.size > 0, categories: [...categories] };
}

function determineUrgency(
  rating: number,
  score: number,
  riskFlagged: boolean,
): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (riskFlagged && rating <= 3) return "CRITICAL";
  if (riskFlagged) return "HIGH";
  if (rating <= 2 && score <= -0.5) return "HIGH";
  if (rating <= 2) return "HIGH";
  if (rating === 3 && score < -0.1) return "MEDIUM";
  if (score <= -0.3) return "MEDIUM";
  return "LOW";
}

/** Sentences whose polarity clears a bar, trimmed for display. */
function extractStatements(text: string, polarity: "positive" | "negative"): string[] {
  const out: string[] = [];
  for (const sentence of splitSentences(text)) {
    const { score, hits } = scoreSentence(sentence);
    if (hits === 0) continue;
    const matches = polarity === "negative" ? score <= -0.25 : score >= 0.25;
    if (!matches) continue;
    const trimmed = sentence.trim().replace(/\s+/g, " ");
    if (trimmed.length < 8) continue;
    out.push(trimmed.length > 220 ? `${trimmed.slice(0, 217)}...` : trimmed);
    if (out.length >= 4) break;
  }
  return out;
}

function buildSummary(
  score: number,
  topics: DetectedTopic[],
  rating: number,
): string {
  const tone =
    score >= 0.2 ? "Positive" : score <= -0.2 ? "Negative" : "Mixed";
  const topicLabels = topics.slice(0, 3).map((t) => t.label.toLowerCase());
  if (topicLabels.length === 0) {
    return `${tone} ${rating}-star review with no specific themes identified.`;
  }
  const list =
    topicLabels.length === 1
      ? topicLabels[0]
      : `${topicLabels.slice(0, -1).join(", ")} and ${topicLabels.at(-1)}`;
  return `${tone} ${rating}-star review focused on ${list}.`;
}

function buildSuggestedReply(input: {
  businessName: string;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  problems: string[];
  topics: DetectedTopic[];
}): string {
  const { businessName, sentiment, topics } = input;
  const negativeTopics = topics
    .filter((t) => t.sentiment === "NEGATIVE")
    .map((t) => t.label.toLowerCase());
  const positiveTopics = topics
    .filter((t) => t.sentiment === "POSITIVE")
    .map((t) => t.label.toLowerCase());

  if (sentiment === "POSITIVE") {
    const praised = positiveTopics[0];
    return [
      "Thank you for taking the time to share this.",
      praised
        ? `We are glad ${praised} stood out — the team works hard at it.`
        : "We appreciate the kind words about the team.",
      `We look forward to seeing you again at ${businessName}.`,
    ].join(" ");
  }

  if (sentiment === "NEGATIVE") {
    const issue = negativeTopics[0];
    return [
      "Thank you for the honest feedback, and we are sorry your experience fell short.",
      issue
        ? `We take concerns about ${issue} seriously and are reviewing what happened here.`
        : "We are reviewing what happened here with the team.",
      "If you are open to it, please contact us directly so we can make this right.",
    ].join(" ");
  }

  return [
    "Thank you for the feedback — we read every review.",
    negativeTopics[0]
      ? `We are looking into the point you raised about ${negativeTopics[0]}.`
      : "We are always working to improve the experience.",
    `Please reach out to us directly if there is anything we can do for you.`,
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Narrative generation from a fact sheet
// ---------------------------------------------------------------------------

function describeTrend(topic: TopicFact): string {
  if (topic.trendPercent === null) {
    return "with no reliable trend yet";
  }
  if (topic.trendPercent > 5) {
    return `and rising versus the previous period`;
  }
  if (topic.trendPercent < -5) {
    return `and falling versus the previous period`;
  }
  return "and roughly flat versus the previous period";
}

function priorityFor(topic: TopicFact): RecommendationDraft["priority"] {
  const rising = (topic.trendPercent ?? 0) > 25;
  if (topic.negativeMentions >= 8 || (topic.negativeMentions >= 5 && rising)) {
    return "CRITICAL";
  }
  if (topic.negativeMentions >= 4 || rising) return "HIGH";
  if (topic.negativeMentions >= 2) return "MEDIUM";
  return "LOW";
}

function impactFor(topic: TopicFact): RecommendationDraft["expectedImpact"] {
  if (topic.shareOfReviews >= 0.2) return "Potentially significant";
  if (topic.shareOfReviews >= 0.08) return "Moderate";
  return "Limited";
}

/**
 * Concrete operational suggestions per topic. Keyed by topic so the advice is
 * specific rather than "look into it", with a generic fallback for topics the
 * catalog doesn't know.
 */
const ACTION_PLAYBOOK: Record<string, string> = {
  "wait-time":
    "Pull appointment start times for the last month and find the hours where actual start slips furthest from scheduled start. Add a buffer slot in the worst window, and set expectations at check-in when you are running behind.",
  pricing:
    "Give a written estimate before work begins and walk through it line by line. Where a price has changed recently, say so proactively rather than letting the invoice deliver the news.",
  billing:
    "Review the last month of invoices for the errors customers flagged, and add a second check before statements go out. Confirm insurance or coverage details at booking, not at checkout.",
  staff:
    "Identify which shifts the negative comments cluster in and sit down with that team. Where the feedback is positive, name the people involved — it is the cheapest retention tool you have.",
  professionalism:
    "Review the specific incidents raised and confirm the current process was followed. If it was, the process needs changing; if it was not, the gap is training or supervision.",
  communication:
    "Define who calls the customer and when, for each stage of the job. Most communication complaints are about the absence of an update, not the content of one.",
  scheduling:
    "Audit how often appointments are moved or cancelled by your side, and by whom. Add a confirmation step the day before, and stop double-booking the slots that generate the complaints.",
  quality:
    "Track how many jobs required a return visit last month. Where a callback happened, review the original work with the person who performed it.",
  cleanliness:
    "Walk the customer-facing areas at the times reviewers mention and set a checklist with named owners per shift.",
  facilities:
    "Address the specific items reviewers named. These are usually cheap fixes with a disproportionate effect on how the whole visit is remembered.",
  availability:
    "Measure how long calls go unanswered during business hours and who is responsible for the queue. Set a same-day callback standard and check it weekly.",
  "follow-up":
    "Add a scheduled check-in after the service is complete, owned by a named person, and log the outcome.",
  value:
    "Make what is included explicit before the work starts. Value complaints usually reflect an expectation gap rather than a price that is genuinely out of line.",
  location:
    "Improve directions and parking guidance in booking confirmations and on your listing.",
};

function actionFor(topic: TopicFact): string {
  return (
    ACTION_PLAYBOOK[topic.key] ??
    `Review the individual reviews mentioning ${topic.label.toLowerCase()}, identify the common thread, and assign a named owner to address it over the next month.`
  );
}

export class LocalHeuristicProvider implements AIProvider {
  readonly name = "local-heuristic";
  readonly model = "reputeiq-local-v1";

  async analyzeReview(input: ReviewAnalysisInput): Promise<ReviewAnalysisResult> {
    const text = input.reviewText.trim();
    const { score: textScore, hits } = scoreText(text);
    const ratingScore = ratingToScore(input.rating);

    // With no polarity terms at all, the rating is the only evidence we have.
    const blended =
      hits === 0
        ? ratingScore
        : clamp(ratingScore * RATING_WEIGHT + textScore * TEXT_WEIGHT, -1, 1);

    const risk = detectRisk(text);
    const topics = detectTopics(text, blended);
    const sentiment = labelFor(blended);

    const problems = extractStatements(text, "negative");
    const strengths = extractStatements(text, "positive");

    const result: ReviewAnalysisResult = {
      sentiment,
      sentimentScore: round(blended, 3),
      urgency: determineUrgency(input.rating, blended, risk.flagged),
      summary: buildSummary(blended, topics, input.rating),
      problems,
      strengths,
      topics,
      riskFlagged: risk.flagged,
      riskCategories: risk.categories,
    };

    // Validate our own output on the same path a vendor's would take, so a
    // regression here surfaces identically to a bad model response.
    return reviewAnalysisSchema.parse(result);
  }

  async generateRecommendations(
    ctx: RecommendationContext,
  ): Promise<RecommendationDraft[]> {
    const { facts, maxRecommendations } = ctx;
    const drafts: RecommendationDraft[] = [];

    for (const topic of facts.topNegativeTopics) {
      if (drafts.length >= maxRecommendations) break;
      if (topic.negativeMentions < 2) continue;

      drafts.push({
        title: `Address ${topic.label.toLowerCase()} complaints`,
        problem: `${topic.label} is a recurring negative theme in ${facts.periodLabel}, ${describeTrend(topic)}.`,
        action: actionFor(topic),
        rationale: `Reviewers raised ${topic.label.toLowerCase()} as a problem repeatedly in this period, which is why it ranks among your top negative themes.`,
        priority: priorityFor(topic),
        expectedImpact: impactFor(topic),
        topicKey: topic.key,
      });
    }

    // A strength worth protecting is a legitimate recommendation, and it keeps
    // the list from reading as a pure list of failures.
    const strength = facts.topPositiveTopics[0];
    if (strength && drafts.length < maxRecommendations && strength.positiveMentions >= 3) {
      drafts.push({
        title: `Protect and promote ${strength.label.toLowerCase()}`,
        problem: `${strength.label} is consistently praised but is not currently reflected in how you present the business.`,
        action: `Use the language reviewers actually use about ${strength.label.toLowerCase()} in your listing description and booking confirmations, and tell the team it is the thing customers single out.`,
        rationale: `${strength.label} is your most frequently praised theme in ${facts.periodLabel}.`,
        priority: "MEDIUM",
        expectedImpact: "Moderate",
        topicKey: strength.key,
      });
    }

    return drafts.slice(0, maxRecommendations);
  }

  async generateExecutiveSummary(ctx: SummaryContext): Promise<string> {
    const { facts } = ctx;
    const parts: string[] = [];

    const direction =
      facts.scoreDelta === null
        ? "This is the first period with enough data to score."
        : facts.scoreDelta > 0
          ? "That is an improvement on the previous period."
          : facts.scoreDelta < 0
            ? "That is a decline from the previous period."
            : "That is unchanged from the previous period.";

    parts.push(
      `${facts.businessName} holds a reputation score of ${facts.reputationScore} out of 100 for ${facts.periodLabel}. ${direction}`,
    );

    const worst = facts.topNegativeTopics[0];
    if (worst) {
      parts.push(
        `The clearest problem is ${worst.label.toLowerCase()}, which reviewers raised negatively more than any other theme ${describeTrend(worst)}.`,
      );
    } else {
      parts.push(
        "No single negative theme dominates this period, which is a healthy position to be in.",
      );
    }

    const best = facts.topPositiveTopics[0];
    if (best) {
      parts.push(
        `Your strongest asset remains ${best.label.toLowerCase()}, the theme customers praise most often.`,
      );
    }

    const emerging = facts.emergingTopics[0];
    if (emerging) {
      parts.push(
        `Worth watching: ${emerging.label.toLowerCase()} is growing as a share of what reviewers talk about.`,
      );
    }

    return parts.join(" ");
  }

  async generateSuggestedResponse(input: SuggestedResponseInput): Promise<string> {
    const analysis = await this.analyzeReview({
      reviewText: input.reviewText,
      rating: input.rating,
      reviewedAt: new Date(),
      businessName: input.businessName,
      industry: "",
      knownTopicKeys: [],
    });

    return buildSuggestedReply({
      businessName: input.businessName,
      sentiment: input.sentiment,
      problems: input.problems,
      topics: analysis.topics.map((t) => ({
        ...t,
        excerpt: t.excerpt,
      })) as DetectedTopic[],
    });
  }

  async compareCompetitors(ctx: CompetitorContext): Promise<string> {
    const { facts, competitors, divergences } = ctx;
    if (competitors.length === 0) {
      return "No competitors have been added yet, so there is nothing to compare against.";
    }

    const rated = competitors.filter((c) => c.averageRating !== null);
    const parts: string[] = [];

    if (rated.length > 0) {
      const avg =
        rated.reduce((sum, c) => sum + (c.averageRating ?? 0), 0) / rated.length;
      const gap = facts.averageRating - avg;
      const verdict =
        Math.abs(gap) < 0.1
          ? "puts you level with the competitor set you track"
          : gap > 0
            ? "puts you ahead of the competitor set you track"
            : "puts you behind the competitor set you track";
      parts.push(`Your average rating ${verdict}.`);
    }

    const worse = divergences
      .filter((d) => d.businessNegativeShare > d.competitorNegativeShare)
      .slice(0, 2);
    const better = divergences
      .filter((d) => d.businessNegativeShare < d.competitorNegativeShare)
      .slice(0, 2);

    if (worse.length > 0) {
      parts.push(
        `You attract proportionally more complaints than they do about ${worse
          .map((d) => d.topicLabel.toLowerCase())
          .join(" and ")}.`,
      );
    }
    if (better.length > 0) {
      parts.push(
        `You attract proportionally fewer complaints about ${better
          .map((d) => d.topicLabel.toLowerCase())
          .join(" and ")}, which is a genuine advantage worth making visible.`,
      );
    }
    if (worse.length === 0 && better.length === 0) {
      parts.push(
        "Topic-level complaint patterns are broadly similar across the set — there is no standout divergence in the current data.",
      );
    }

    return parts.join(" ");
  }
}
