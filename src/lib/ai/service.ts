import { getEnv } from "@/lib/env";
import { AIUnavailableError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { checkClaims } from "@/lib/ai/guards";
import { LocalHeuristicProvider } from "@/lib/ai/providers/local";
import { OpenAIProvider } from "@/lib/ai/providers/openai";
import type {
  AIProvider,
  CompetitorContext,
  RecommendationContext,
  RecommendationDraft,
  ReviewAnalysisInput,
  ReviewAnalysisResult,
  SuggestedResponseInput,
  SummaryContext,
} from "@/lib/ai/types";

/**
 * The only AI entry point the rest of the application uses.
 *
 * Owns: provider selection, retry, fallback, the anti-fabrication guard, and
 * logging. Callers never construct a provider themselves.
 */

const MAX_ATTEMPTS = 2;

export type AIServiceOptions = {
  provider?: AIProvider;
  fallback?: AIProvider | null;
};

export class AIService {
  private readonly provider: AIProvider;
  private readonly fallback: AIProvider | null;

  constructor(options: AIServiceOptions = {}) {
    this.provider = options.provider ?? resolveProvider();
    this.fallback =
      options.fallback !== undefined ? options.fallback : resolveFallback(this.provider);
  }

  /** Which provider produced the last result — persisted with each analysis. */
  get providerName(): string {
    return this.provider.name;
  }

  get modelName(): string {
    return this.provider.model;
  }

  private async run<T>(
    operation: string,
    fn: (provider: AIProvider) => Promise<T>,
  ): Promise<{ value: T; provider: AIProvider }> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const value = await fn(this.provider);
        return { value, provider: this.provider };
      } catch (error) {
        lastError = error;
        log.warn("ai call failed", {
          operation,
          attempt,
          provider: this.provider.name,
          error: error instanceof Error ? error.message : String(error),
        });
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
        }
      }
    }

    if (this.fallback) {
      log.warn("ai falling back to local analyzer", {
        operation,
        from: this.provider.name,
      });
      const value = await fn(this.fallback);
      return { value, provider: this.fallback };
    }

    throw lastError instanceof AIUnavailableError
      ? lastError
      : new AIUnavailableError(
          lastError instanceof Error ? lastError.message : "AI request failed",
        );
  }

  async analyzeReview(
    input: ReviewAnalysisInput,
  ): Promise<{ result: ReviewAnalysisResult; providerName: string; modelName: string }> {
    const { value, provider } = await this.run("analyzeReview", (p) =>
      p.analyzeReview(input),
    );
    return { result: value, providerName: provider.name, modelName: provider.model };
  }

  /**
   * Recommendations pass through the numeric guard: any draft whose factual
   * claims contain a number not present in the fact sheet is dropped rather
   * than shown. Dropping is the right failure mode — a missing recommendation
   * costs the user nothing, a fabricated statistic costs them trust.
   */
  async generateRecommendations(
    ctx: RecommendationContext,
  ): Promise<RecommendationDraft[]> {
    const { value } = await this.run("generateRecommendations", (p) =>
      p.generateRecommendations(ctx),
    );

    const kept: RecommendationDraft[] = [];
    for (const draft of value) {
      // `action` is exempt: a proposed operational parameter ("a 15-minute
      // buffer") is a suggestion, not a claim about the review data.
      const check = checkClaims([draft.problem, draft.rationale], ctx.facts);
      if (!check.ok) {
        log.warn("dropped recommendation with unsupported numbers", {
          title: draft.title,
          violations: check.violations,
        });
        continue;
      }
      kept.push(draft);
    }

    return kept;
  }

  async generateExecutiveSummary(ctx: SummaryContext): Promise<string> {
    const { value } = await this.run("generateExecutiveSummary", (p) =>
      p.generateExecutiveSummary(ctx),
    );

    const check = checkClaims([value], ctx.facts);
    if (!check.ok) {
      log.warn("executive summary contained unsupported numbers; regenerating locally", {
        violations: check.violations,
      });
      return new LocalHeuristicProvider().generateExecutiveSummary(ctx);
    }

    return value;
  }

  async generateSuggestedResponse(input: SuggestedResponseInput): Promise<string> {
    const { value } = await this.run("generateSuggestedResponse", (p) =>
      p.generateSuggestedResponse(input),
    );
    return value;
  }

  async compareCompetitors(ctx: CompetitorContext): Promise<string> {
    const { value } = await this.run("compareCompetitors", (p) =>
      p.compareCompetitors(ctx),
    );

    const check = checkClaims([value], ctx.facts);
    if (!check.ok) {
      log.warn("competitor narrative contained unsupported numbers; regenerating locally", {
        violations: check.violations,
      });
      return new LocalHeuristicProvider().compareCompetitors(ctx);
    }

    return value;
  }
}

function resolveProvider(): AIProvider {
  const env = getEnv();
  if (env.AI_PROVIDER === "openai" && env.OPENAI_API_KEY) {
    return new OpenAIProvider();
  }

  if (env.AI_PROVIDER === "openai" && !env.OPENAI_API_KEY) {
    log.warn("AI_PROVIDER=openai but OPENAI_API_KEY is unset; using local analyzer");
  }

  return new LocalHeuristicProvider();
}

function resolveFallback(primary: AIProvider): AIProvider | null {
  if (primary.name === "local-heuristic") return null;
  return getEnv().AI_FALLBACK_TO_LOCAL ? new LocalHeuristicProvider() : null;
}

let shared: AIService | null = null;

export function getAIService(): AIService {
  if (!shared) shared = new AIService();
  return shared;
}

/** Test helper. */
export function resetAIService(): void {
  shared = null;
}
