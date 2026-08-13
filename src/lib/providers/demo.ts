import { ReviewProviderKey } from "@prisma/client";

import {
  COLUMBUS_DENTAL_CONFIG,
  generateCorpus,
  type CorpusConfig,
} from "@/lib/demo/generator";
import type { FetchContext, FetchResult, ReviewProvider } from "@/lib/providers/types";

/**
 * Demo provider.
 *
 * Serves the seeded corpus through the same interface a real integration uses,
 * so the ingestion, deduplication, and analysis paths exercised in demo mode
 * are exactly the ones a paying customer's data will travel through.
 */
export class DemoProvider implements ReviewProvider {
  readonly key = ReviewProviderKey.DEMO;
  readonly label = "Demo data";
  readonly description =
    "A seeded, clearly-labelled sample corpus for evaluating the product without connecting a real source.";

  isConfigured(): boolean {
    return true;
  }

  async fetchReviews(ctx: FetchContext): Promise<FetchResult> {
    const overrides = (ctx.config.corpus as Partial<CorpusConfig>) ?? {};
    const config: CorpusConfig = {
      ...COLUMBUS_DENTAL_CONFIG,
      ...overrides,
      // A fixed end date in config keeps a seeded corpus stable across runs;
      // without one the timeline slides with the clock, which is what we want
      // for a demo the user is looking at today.
      endDate: ctx.config.endDate ? new Date(ctx.config.endDate as string) : new Date(),
    };

    let reviews = generateCorpus(config);
    if (ctx.since) {
      const since = ctx.since;
      reviews = reviews.filter((r) => r.reviewedAt > since);
    }

    const ratings = reviews.map((r) => r.rating);
    const aggregate =
      ratings.length > 0
        ? {
            rating:
              Math.round(
                (ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10,
              ) / 10,
            reviewCount: ratings.length,
          }
        : { rating: null, reviewCount: 0 };

    return { reviews, nextCursor: null, aggregate };
  }
}
