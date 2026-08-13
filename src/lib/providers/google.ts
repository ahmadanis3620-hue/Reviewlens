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
 * Google Business Profile adapter.
 *
 * Uses the official Business Profile API with an OAuth access token the
 * business owner granted. There is no scraping fallback: without credentials
 * this provider reports itself unconfigured and cannot be connected in the UI.
 *
 * Untested against the live API — no credentials were available during
 * development. The request shape and response mapping follow the documented
 * `accounts.locations.reviews.list` contract; the token refresh loop is
 * deliberately not implemented rather than written blind (see
 * docs/mvp-plan.md).
 */

const STAR_RATINGS: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

type GoogleReview = {
  reviewId: string;
  reviewer?: { displayName?: string; isAnonymous?: boolean };
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  name?: string;
  reviewReply?: { comment?: string; updateTime?: string };
};

type GoogleReviewsResponse = {
  reviews?: GoogleReview[];
  nextPageToken?: string;
  averageRating?: number;
  totalReviewCount?: number;
};

export class GoogleBusinessProfileProvider implements ReviewProvider {
  readonly key = ReviewProviderKey.GOOGLE_BUSINESS_PROFILE;
  readonly label = "Google Business Profile";
  readonly description =
    "Official Google Business Profile API. Requires the business owner to authorize access via OAuth.";

  isConfigured(): boolean {
    const env = getEnv();
    return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  }

  async fetchReviews(ctx: FetchContext): Promise<FetchResult> {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError(this.label);
    }

    const accessToken = ctx.credentials.accessToken as string | undefined;
    const accountId = ctx.config.accountId as string | undefined;
    const locationId = ctx.config.locationId as string | undefined;

    if (!accessToken || !accountId || !locationId) {
      throw new ProviderNotConfiguredError(this.label);
    }

    const url = new URL(
      `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews`,
    );
    url.searchParams.set("pageSize", String(Math.min(ctx.limit ?? 50, 50)));
    if (ctx.cursor) url.searchParams.set("pageToken", ctx.cursor);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      log.error("google business profile fetch failed", {
        status: response.status,
        locationId,
      });
      throw new Error(`Google Business Profile returned ${response.status}`);
    }

    const payload = (await response.json()) as GoogleReviewsResponse;
    const reviews: NormalizedReview[] = [];

    for (const raw of payload.reviews ?? []) {
      const rating = raw.starRating ? STAR_RATINGS[raw.starRating] : undefined;
      const createdAt = raw.createTime ? new Date(raw.createTime) : undefined;
      if (!rating || !createdAt) continue;
      if (ctx.since && createdAt <= ctx.since) continue;

      const review: NormalizedReview = {
        externalReviewId: raw.reviewId,
        rating,
        text: raw.comment ?? "",
        reviewedAt: createdAt,
        language: "en",
      };

      // Only retain a display name when the platform publishes one and the
      // reviewer is not anonymous.
      if (raw.reviewer?.displayName && !raw.reviewer.isAnonymous) {
        review.reviewerName = raw.reviewer.displayName;
      }
      if (raw.reviewReply?.comment) {
        review.responseText = raw.reviewReply.comment;
        if (raw.reviewReply.updateTime) {
          review.respondedAt = new Date(raw.reviewReply.updateTime);
        }
      }

      reviews.push(review);
    }

    return {
      reviews,
      nextCursor: payload.nextPageToken ?? null,
      aggregate: {
        rating: payload.averageRating ?? null,
        reviewCount: payload.totalReviewCount ?? null,
      },
    };
  }
}
