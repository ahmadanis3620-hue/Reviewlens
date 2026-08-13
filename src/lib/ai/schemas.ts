import { z } from "zod";

/**
 * Validation for everything a model returns. Nothing is persisted before it
 * passes through here, regardless of which provider produced it.
 */

export const sentimentSchema = z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]);
export const urgencySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export const topicMentionSchema = z.object({
  /** Slug form. Free-form: the model may introduce topics we've never seen. */
  key: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "topic key must be a lowercase slug"),
  label: z.string().min(2).max(60),
  sentiment: sentimentSchema,
  sentimentScore: z.number().min(-1).max(1),
  confidence: z.number().min(0).max(1),
  importance: z.number().min(0).max(1),
  excerpt: z.string().max(400).optional(),
});

export const reviewAnalysisSchema = z.object({
  sentiment: sentimentSchema,
  sentimentScore: z.number().min(-1).max(1),
  urgency: urgencySchema,
  summary: z.string().min(1).max(400),
  /** Concrete, actionable problems stated in the review. */
  problems: z.array(z.string().max(300)).max(8),
  /** Concrete strengths stated in the review. */
  strengths: z.array(z.string().max(300)).max(8),
  topics: z.array(topicMentionSchema).max(10),
  /**
   * Flag only. The product surfaces this as "may need a closer look" and
   * explicitly does not draw legal or medical conclusions.
   */
  riskFlagged: z.boolean(),
  riskCategories: z.array(z.string().max(60)).max(6),
});

/**
 * A recommendation as the model writes it — deliberately free of numeric
 * fields. Counts and deltas are attached afterwards from the analytics layer.
 */
export const recommendationDraftSchema = z.object({
  title: z.string().min(4).max(120),
  problem: z.string().min(10).max(500),
  action: z.string().min(10).max(700),
  rationale: z.string().min(10).max(500),
  priority: prioritySchema,
  /**
   * Qualitative only. The product never claims a guaranteed financial outcome,
   * so this is constrained to a small vocabulary rather than free text.
   */
  expectedImpact: z.enum(["Limited", "Moderate", "Potentially significant"]),
  topicKey: z.string().max(60).optional(),
});

export const recommendationListSchema = z.object({
  recommendations: z.array(recommendationDraftSchema).max(10),
});

export const executiveSummarySchema = z.object({
  summary: z.string().min(20).max(1500),
});

export const suggestedResponseSchema = z.object({
  response: z.string().min(20).max(1200),
});

export const competitorNarrativeSchema = z.object({
  narrative: z.string().min(20).max(1500),
});

/**
 * JSON Schema mirrors for OpenAI structured outputs. Kept beside the zod
 * definitions so the two cannot drift unnoticed — `strict: true` requires every
 * property to be listed in `required` and `additionalProperties: false`.
 */
export const REVIEW_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "sentiment",
    "sentimentScore",
    "urgency",
    "summary",
    "problems",
    "strengths",
    "topics",
    "riskFlagged",
    "riskCategories",
  ],
  properties: {
    sentiment: { type: "string", enum: ["POSITIVE", "NEUTRAL", "NEGATIVE"] },
    sentimentScore: { type: "number" },
    urgency: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
    summary: { type: "string" },
    problems: { type: "array", items: { type: "string" } },
    strengths: { type: "array", items: { type: "string" } },
    topics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "key",
          "label",
          "sentiment",
          "sentimentScore",
          "confidence",
          "importance",
          "excerpt",
        ],
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          sentiment: { type: "string", enum: ["POSITIVE", "NEUTRAL", "NEGATIVE"] },
          sentimentScore: { type: "number" },
          confidence: { type: "number" },
          importance: { type: "number" },
          excerpt: { type: "string" },
        },
      },
    },
    riskFlagged: { type: "boolean" },
    riskCategories: { type: "array", items: { type: "string" } },
  },
} as const;

export const RECOMMENDATIONS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["recommendations"],
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "problem",
          "action",
          "rationale",
          "priority",
          "expectedImpact",
          "topicKey",
        ],
        properties: {
          title: { type: "string" },
          problem: { type: "string" },
          action: { type: "string" },
          rationale: { type: "string" },
          priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
          expectedImpact: {
            type: "string",
            enum: ["Limited", "Moderate", "Potentially significant"],
          },
          topicKey: { type: "string" },
        },
      },
    },
  },
} as const;

export const SUMMARY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary"],
  properties: { summary: { type: "string" } },
} as const;

export const RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["response"],
  properties: { response: { type: "string" } },
} as const;

export const NARRATIVE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["narrative"],
  properties: { narrative: { type: "string" } },
} as const;
