import { ReviewProviderKey } from "@prisma/client";

import { getEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import {
  ProviderNotConfiguredError,
  type FetchContext,
  type FetchResult,
  type NormalizedReview,
  type ReviewProvider,
} from "@/lib/providers/types";

/**
 * Yelp Fusion adapter.
 *
 * Note the real constraint, which shapes how the product uses this source:
 * Fusion's `/businesses/{id}/reviews` endpoint returns a small sample of
 * reviews with excerpted text, not the full corpus. This adapter therefore
 * contributes the published aggregate rating and count — which are reliable —
 * plus whatever excerpts are available. It is not a substitute for a full
 * review feed, and the UI says so on the integrations screen rather than
 * implying completeness it cannot deliver.
 *
 * Untested against the live API — no credentials were available during
 * development.
 */

type YelpReview = {
  id: string;
  rating: number;
  text: string;
  time_created: string;
  url?: string;
  user?: { name?: string };
};

type YelpReviewsResponse = {
  reviews?: YelpReview[];
  total?: number;
  possible_languages?: string[];
};

type YelpBusinessResponse = {
  rating?: number;
  review_count?: number;
};

export class YelpProvider implements ReviewProvider {
  readonly key = ReviewProviderKey.YELP;
  readonly label = "Yelp";
  readonly description =
    "Yelp Fusion API. Provides the published rating and review count plus a sample of review excerpts, not the full review history.";

  isConfigured(): boolean {
    return Boolean(getEnv().YELP_API_KEY);
  }

  async fetchReviews(ctx: FetchContext): Promise<FetchResult> {
    const apiKey = getEnv().YELP_API_KEY;
    if (!apiKey) throw new ProviderNotConfiguredError(this.label);

    const businessId = ctx.config.businessId as string | undefined;
    if (!businessId) throw new ProviderNotConfiguredError(this.label);

    const headers = { Authorization: `Bearer ${apiKey}` };

    const [reviewsRes, businessRes] = await Promise.all([
      fetch(
        `https://api.yelp.com/v3/businesses/${encodeURIComponent(businessId)}/reviews?limit=50&sort_by=newest`,
        { headers },
      ),
      fetch(`https://api.yelp.com/v3/businesses/${encodeURIComponent(businessId)}`, {
        headers,
      }),
    ]);

    if (!reviewsRes.ok) {
      log.error("yelp fetch failed", { status: reviewsRes.status, businessId });
      throw new Error(`Yelp returned ${reviewsRes.status}`);
    }

    const payload = (await reviewsRes.json()) as YelpReviewsResponse;
    const business = businessRes.ok
      ? ((await businessRes.json()) as YelpBusinessResponse)
      : {};

    const reviews: NormalizedReview[] = [];
    for (const raw of payload.reviews ?? []) {
      const reviewedAt = new Date(raw.time_created);
      if (Number.isNaN(reviewedAt.getTime())) continue;
      if (ctx.since && reviewedAt <= ctx.since) continue;

      const review: NormalizedReview = {
        externalReviewId: raw.id,
        rating: raw.rating,
        text: raw.text,
        reviewedAt,
        url: raw.url,
        language: "en",
      };
      if (raw.user?.name) review.reviewerName = raw.user.name;
      reviews.push(review);
    }

    return {
      reviews,
      nextCursor: null,
      aggregate: {
        rating: business.rating ?? null,
        reviewCount: business.review_count ?? payload.total ?? null,
      },
    };
  }
}
