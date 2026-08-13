import "server-only";

import { getEnv } from "@/lib/env";
import { AIUnavailableError } from "@/lib/errors";
import { log } from "@/lib/logger";
import {
  NARRATIVE_JSON_SCHEMA,
  RECOMMENDATIONS_JSON_SCHEMA,
  RESPONSE_JSON_SCHEMA,
  REVIEW_ANALYSIS_JSON_SCHEMA,
  SUMMARY_JSON_SCHEMA,
  competitorNarrativeSchema,
  executiveSummarySchema,
  recommendationListSchema,
  reviewAnalysisSchema,
  suggestedResponseSchema,
} from "@/lib/ai/schemas";
import type {
  AIProvider,
  CompetitorContext,
  FactSheet,
  RecommendationContext,
  RecommendationDraft,
  ReviewAnalysisInput,
  ReviewAnalysisResult,
  SuggestedResponseInput,
  SummaryContext,
} from "@/lib/ai/types";
import { STARTER_TOPICS } from "@/lib/topics/catalog";

/**
 * OpenAI adapter.
 *
 * Uses strict JSON schema structured outputs, so responses are shape-guaranteed
 * before zod validates them. The API key is read here and nowhere else, in a
 * module marked server-only.
 */

type ChatMessage = { role: "system" | "user"; content: string };

const ANALYSIS_SYSTEM_PROMPT = `You analyze customer reviews for local service businesses.

Rules:
- Judge sentiment from what the reviewer actually wrote, not from the star rating alone, though the rating is useful corroboration.
- sentimentScore runs from -1 (very negative) to 1 (very positive).
- Identify the themes the review genuinely discusses. Prefer the provided topic keys when one fits, but introduce a new lowercase-hyphenated key when the review is about something they do not cover. Do not force a topic that is not there.
- For each topic give its own sentiment, a confidence that the topic is present, and an importance reflecting how central it is to the review.
- excerpt must be a verbatim span copied from the review, not a paraphrase.
- problems and strengths must be grounded in specific statements in the review. Do not generalize beyond what was written.
- urgency: CRITICAL for a safety, legal, or regulatory allegation; HIGH for an angry customer with a concrete unresolved problem; MEDIUM for a real but contained complaint; LOW otherwise.
- riskFlagged means the review mentions something that may carry safety, legal, or regulatory exposure and deserves human attention. It is a flag for a person to review. Never state or imply a legal or medical conclusion.
- Invent nothing. If the review does not say it, it is not there.`;

const NARRATIVE_SYSTEM_PROMPT = `You write reputation analysis for owners of local service businesses.

Absolute rule: every statistic you might mention has already been computed and is given to you in the facts. Never state a number that is not in those facts. Never estimate, extrapolate, or round into a new figure. When you want to describe a change, prefer words ("rising sharply", "roughly flat") over restating a number.

Never promise or imply a specific financial outcome. "Potentially significant" is as strong as impact language gets.

Write plainly, the way a competent operations consultant would: direct, specific, no marketing register, no hedging filler.`;

function factsToPrompt(facts: FactSheet): string {
  const topicLine = (t: {
    label: string;
    mentions: number;
    negativeMentions: number;
    positiveMentions: number;
    trendPercent: number | null;
    shareOfReviews: number;
    sampleQuotes: string[];
  }) =>
    `  - ${t.label}: ${t.mentions} mentions (${t.negativeMentions} negative, ${t.positiveMentions} positive), ` +
    `${(t.shareOfReviews * 100).toFixed(1)}% of reviews, ` +
    `trend ${t.trendPercent === null ? "insufficient data" : `${t.trendPercent.toFixed(1)}%`}` +
    (t.sampleQuotes.length > 0
      ? `\n    quotes: ${t.sampleQuotes.map((q) => JSON.stringify(q)).join("; ")}`
      : "");

  return [
    `Business: ${facts.businessName} (${facts.industry})`,
    `Period: ${facts.periodLabel}`,
    `Reviews in period: ${facts.totalReviews}`,
    `Average rating: ${facts.averageRating.toFixed(2)}`,
    `Positive share: ${(facts.positiveRate * 100).toFixed(1)}%`,
    `Negative share: ${(facts.negativeRate * 100).toFixed(1)}%`,
    `Reputation score: ${facts.reputationScore}/100` +
      (facts.scoreDelta === null
        ? " (no prior period to compare)"
        : ` (change vs previous period: ${facts.scoreDelta})`),
    "",
    "Top negative themes:",
    facts.topNegativeTopics.map(topicLine).join("\n") || "  (none)",
    "",
    "Top positive themes:",
    facts.topPositiveTopics.map(topicLine).join("\n") || "  (none)",
    "",
    "Emerging themes:",
    facts.emergingTopics.map(topicLine).join("\n") || "  (none)",
  ].join("\n");
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor() {
    const env = getEnv();
    if (!env.OPENAI_API_KEY) {
      throw new AIUnavailableError("OPENAI_API_KEY is not configured");
    }
    this.apiKey = env.OPENAI_API_KEY;
    this.model = env.OPENAI_MODEL;
    this.baseUrl = env.OPENAI_BASE_URL.replace(/\/$/, "");
    this.timeoutMs = env.AI_TIMEOUT_MS;
  }

  private async complete(
    messages: ChatMessage[],
    schemaName: string,
    jsonSchema: unknown,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.2,
          response_format: {
            type: "json_schema",
            json_schema: { name: schemaName, strict: true, schema: jsonSchema },
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        log.error("openai request failed", {
          status: response.status,
          // Body may echo the request; truncate and never log headers.
          bodyPreview: body.slice(0, 200),
        });
        throw new AIUnavailableError(
          `AI provider returned ${response.status}`,
        );
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new AIUnavailableError("AI provider returned no content");

      try {
        return JSON.parse(content);
      } catch {
        throw new AIUnavailableError("AI provider returned malformed JSON");
      }
    } catch (error) {
      if (error instanceof AIUnavailableError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new AIUnavailableError("AI provider timed out");
      }
      throw new AIUnavailableError(
        error instanceof Error ? error.message : "AI provider request failed",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async analyzeReview(input: ReviewAnalysisInput): Promise<ReviewAnalysisResult> {
    const knownTopics =
      input.knownTopicKeys.length > 0
        ? input.knownTopicKeys
        : STARTER_TOPICS.map((t) => t.key);

    const raw = await this.complete(
      [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `Business: ${input.businessName} (${input.industry})`,
            `Rating: ${input.rating} of 5`,
            `Date: ${input.reviewedAt.toISOString().slice(0, 10)}`,
            `Preferred topic keys: ${knownTopics.join(", ")}`,
            "",
            "Review:",
            input.reviewText,
          ].join("\n"),
        },
      ],
      "review_analysis",
      REVIEW_ANALYSIS_JSON_SCHEMA,
    );

    return reviewAnalysisSchema.parse(raw);
  }

  async generateRecommendations(
    ctx: RecommendationContext,
  ): Promise<RecommendationDraft[]> {
    const raw = await this.complete(
      [
        { role: "system", content: NARRATIVE_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            factsToPrompt(ctx.facts),
            "",
            `Write up to ${ctx.maxRecommendations} recommendations, most important first.`,
            "Each must name a specific operational change the owner could make this month, not a platitude.",
            "problem states what the data shows. action states what to do. rationale states why the data supports it.",
            "Set topicKey to the theme key the recommendation addresses.",
          ].join("\n"),
        },
      ],
      "recommendations",
      RECOMMENDATIONS_JSON_SCHEMA,
    );

    return recommendationListSchema.parse(raw).recommendations;
  }

  async generateExecutiveSummary(ctx: SummaryContext): Promise<string> {
    const raw = await this.complete(
      [
        { role: "system", content: NARRATIVE_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            factsToPrompt(ctx.facts),
            "",
            "Write a four-to-six sentence executive summary of this period for the business owner.",
            "Lead with the overall position, then the clearest problem, then the clearest strength, then anything worth watching.",
          ].join("\n"),
        },
      ],
      "executive_summary",
      SUMMARY_JSON_SCHEMA,
    );

    return executiveSummarySchema.parse(raw).summary;
  }

  async generateSuggestedResponse(input: SuggestedResponseInput): Promise<string> {
    const raw = await this.complete(
      [
        {
          role: "system",
          content: [
            `You draft public replies to customer reviews on behalf of ${input.businessName}.`,
            "Be brief (three sentences at most), specific to what the reviewer said, and human.",
            "Never admit legal fault, never discuss private customer details, never offer compensation.",
            "For complaints, acknowledge the specific issue and invite the customer to make contact directly.",
            "This is a draft for a human to review and post. Nothing is published automatically.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `Rating: ${input.rating} of 5`,
            `Sentiment: ${input.sentiment}`,
            input.problems.length > 0
              ? `Issues raised: ${input.problems.join("; ")}`
              : "Issues raised: none identified",
            "",
            "Review:",
            input.reviewText,
          ].join("\n"),
        },
      ],
      "suggested_response",
      RESPONSE_JSON_SCHEMA,
    );

    return suggestedResponseSchema.parse(raw).response;
  }

  async compareCompetitors(ctx: CompetitorContext): Promise<string> {
    const competitorLines = ctx.competitors
      .map(
        (c) =>
          `  - ${c.name}: rating ${c.averageRating ?? "unknown"}, ` +
          `${c.reviewCount ?? "unknown"} reviews; ` +
          `praised for ${c.topPositiveTopics.join(", ") || "nothing recorded"}; ` +
          `criticized for ${c.topNegativeTopics.join(", ") || "nothing recorded"}`,
      )
      .join("\n");

    const divergenceLines = ctx.divergences
      .map(
        (d) =>
          `  - ${d.topicLabel}: your negative share ${(d.businessNegativeShare * 100).toFixed(1)}%, ` +
          `competitor negative share ${(d.competitorNegativeShare * 100).toFixed(1)}%`,
      )
      .join("\n");

    const raw = await this.complete(
      [
        { role: "system", content: NARRATIVE_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            factsToPrompt(ctx.facts),
            "",
            "Competitors:",
            competitorLines || "  (none)",
            "",
            "Largest topic-level divergences:",
            divergenceLines || "  (none)",
            "",
            "Write three to four sentences on where this business stands against these competitors.",
            "Be explicit about what it does better and what it does worse. If the data is too thin to support a claim, say so instead of making one.",
          ].join("\n"),
        },
      ],
      "competitor_narrative",
      NARRATIVE_JSON_SCHEMA,
    );

    return competitorNarrativeSchema.parse(raw).narrative;
  }
}
