import type { ReviewProviderKey } from "@prisma/client";

/**
 * Review source abstraction.
 *
 * Every source of reviews — an official API, a file the owner uploads, or the
 * demo generator — implements this. Nothing in the application is written
 * against a specific provider.
 *
 * There is deliberately no scraping adapter and no interface affordance for
 * one: `fetchReviews` receives a configured source, not a URL to go and parse.
 */

export type NormalizedReview = {
  /** Stable id from the provider. The ingestion idempotency key. */
  externalReviewId: string;
  /** Public display name only; omit entirely when the provider is anonymous. */
  reviewerName?: string;
  rating: number;
  text: string;
  reviewedAt: Date;
  url?: string;
  responseText?: string;
  respondedAt?: Date;
  language?: string;
};

export type FetchContext = {
  /** Non-secret provider settings from ReviewSource.config. */
  config: Record<string, unknown>;
  /** OAuth tokens / API credentials from ReviewSource.credentials. */
  credentials: Record<string, unknown>;
  /** Only fetch reviews newer than this, when the provider supports it. */
  since?: Date;
  /** Opaque pagination cursor carried over from the previous sync. */
  cursor?: string | null;
  limit?: number;
};

export type FetchResult = {
  reviews: NormalizedReview[];
  nextCursor?: string | null;
  /** Provider-published aggregate, when available. Never recomputed by us. */
  aggregate?: { rating: number | null; reviewCount: number | null };
};

export interface ReviewProvider {
  readonly key: ReviewProviderKey;
  readonly label: string;
  /** Short description shown on the integrations screen. */
  readonly description: string;
  /**
   * Whether the credentials this provider needs are present. A provider that
   * returns false cannot be connected in the UI — the honest behaviour when
   * there is no legal path to the data.
   */
  isConfigured(): boolean;
  fetchReviews(ctx: FetchContext): Promise<FetchResult>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(label: string) {
    super(
      `${label} is not configured. Add the required credentials to your environment to connect it.`,
    );
    this.name = "ProviderNotConfiguredError";
  }
}
