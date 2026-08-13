import { createHash } from "node:crypto";

import type { ReviewProviderKey } from "@prisma/client";

import type { NormalizedReview } from "@/lib/providers/types";
import { clamp } from "@/lib/utils";

/**
 * Normalization and privacy scrubbing.
 *
 * This runs on every review from every provider, before a row is constructed.
 * A chattier provider adapter therefore cannot widen what we retain — the
 * narrowing happens here, once, on the way in.
 */

const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g;
/** Deliberately broad: over-redacting a phone number costs analysis nothing. */
const PHONE_RE = /(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

export type ScrubbedReview = Omit<NormalizedReview, "reviewerName"> & {
  reviewerName: string | null;
  contentHash: string;
};

/**
 * Reduces a reviewer identity to a public display name, or nothing.
 *
 * Anything that looks like contact information is discarded rather than
 * shortened — a name field containing an email is not a name.
 */
export function dropReviewerIdentity(name: string | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (EMAIL_RE.test(trimmed)) {
    EMAIL_RE.lastIndex = 0;
    return null;
  }
  EMAIL_RE.lastIndex = 0;
  return trimmed.slice(0, 80);
}

/**
 * Removes contact details a reviewer volunteered in the body.
 *
 * Reviewers do write "call me at 614-555-0142" in complaints. Storing that
 * serves no analytical purpose and creates an obligation we would rather not
 * have, so it is replaced before the text is persisted.
 */
export function scrubText(text: string): string {
  return text
    .replace(EMAIL_RE, "[email removed]")
    .replace(PHONE_RE, "[phone removed]")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fingerprint used to notice that a provider has reissued a review under a new
 * external id. Intentionally excludes the external id and the review URL.
 */
export function computeContentHash(input: {
  provider: ReviewProviderKey;
  text: string;
  rating: number;
  reviewedAt: Date;
  reviewerName?: string | null;
}): string {
  const canonical = [
    input.provider,
    input.rating,
    // Day granularity: providers routinely shift the timestamp on re-issue.
    input.reviewedAt.toISOString().slice(0, 10),
    input.reviewerName?.toLowerCase() ?? "",
    input.text.toLowerCase().replace(/\s+/g, " ").trim(),
  ].join("|");

  return createHash("sha256").update(canonical).digest("hex");
}

export function normalizeReview(
  raw: NormalizedReview,
  provider: ReviewProviderKey,
): ScrubbedReview {
  const reviewerName = dropReviewerIdentity(raw.reviewerName);
  const text = scrubText(raw.text ?? "");
  const rating = clamp(Math.round(raw.rating), 1, 5);

  return {
    externalReviewId: raw.externalReviewId,
    reviewerName,
    rating,
    text,
    reviewedAt: raw.reviewedAt,
    url: raw.url,
    responseText: raw.responseText ? scrubText(raw.responseText) : undefined,
    respondedAt: raw.respondedAt,
    language: raw.language ?? "en",
    contentHash: computeContentHash({
      provider,
      text,
      rating,
      reviewedAt: raw.reviewedAt,
      reviewerName,
    }),
  };
}
