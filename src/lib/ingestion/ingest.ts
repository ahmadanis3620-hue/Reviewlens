import { SourceStatus, UsageKind } from "@prisma/client";

import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";
import { normalizeReview } from "@/lib/ingestion/normalize";
import { getProvider } from "@/lib/providers/registry";
import type { NormalizedReview } from "@/lib/providers/types";

/**
 * Ingestion.
 *
 * Idempotent by construction: reviews are keyed on
 * (reviewSourceId, externalReviewId), and a secondary content fingerprint
 * catches providers that reissue the same review under a new id. Running an
 * import twice produces the same database state.
 */

export type IngestStats = {
  fetched: number;
  created: number;
  duplicates: number;
  /** Existing reviews whose owner response appeared or changed. */
  updated: number;
};

/**
 * Writes a batch of already-fetched reviews. Separated from `syncSource` so
 * tests can drive it directly with fixtures, and so the CSV upload path can
 * reuse it without going through a provider.
 */
export async function ingestReviews(
  businessId: string,
  reviewSourceId: string,
  raw: NormalizedReview[],
): Promise<IngestStats> {
  const source = await prisma.reviewSource.findUniqueOrThrow({
    where: { id: reviewSourceId },
    select: { id: true, businessId: true, provider: true },
  });

  if (source.businessId !== businessId) {
    // Defence in depth: a caller that mixed up ids must not write across
    // businesses, even inside an already-authorized request.
    throw new Error("Review source does not belong to the given business");
  }

  const normalized = raw.map((r) => normalizeReview(r, source.provider));
  const stats: IngestStats = {
    fetched: normalized.length,
    created: 0,
    duplicates: 0,
    updated: 0,
  };
  if (normalized.length === 0) return stats;

  // Pull both keys in bulk rather than probing per review.
  const [existingBySource, existingHashes] = await Promise.all([
    prisma.review.findMany({
      where: {
        reviewSourceId,
        externalReviewId: { in: normalized.map((r) => r.externalReviewId) },
      },
      select: { id: true, externalReviewId: true, responseText: true },
    }),
    prisma.review.findMany({
      where: {
        businessId,
        contentHash: { in: normalized.map((r) => r.contentHash) },
      },
      select: { contentHash: true },
    }),
  ]);

  const byExternalId = new Map(existingBySource.map((r) => [r.externalReviewId, r]));
  const knownHashes = new Set(existingHashes.map((r) => r.contentHash));
  // Guards against duplicates *within* one batch as well as against the table.
  const seenInBatch = new Set<string>();

  for (const review of normalized) {
    const existing = byExternalId.get(review.externalReviewId);

    if (existing) {
      // The review is known. The one field that legitimately changes after
      // publication is the owner's response, so that is all we update.
      const incomingResponse = review.responseText ?? null;
      if (incomingResponse && incomingResponse !== existing.responseText) {
        await prisma.review.update({
          where: { id: existing.id },
          data: {
            responseText: incomingResponse,
            respondedAt: review.respondedAt ?? new Date(),
          },
        });
        stats.updated += 1;
      } else {
        stats.duplicates += 1;
      }
      continue;
    }

    if (knownHashes.has(review.contentHash) || seenInBatch.has(review.contentHash)) {
      stats.duplicates += 1;
      continue;
    }

    await prisma.review.create({
      data: {
        businessId,
        reviewSourceId,
        provider: source.provider,
        externalReviewId: review.externalReviewId,
        reviewerName: review.reviewerName,
        rating: review.rating,
        text: review.text,
        reviewedAt: review.reviewedAt,
        url: review.url,
        language: review.language ?? "en",
        responseText: review.responseText,
        respondedAt: review.respondedAt,
        contentHash: review.contentHash,
      },
    });

    seenInBatch.add(review.contentHash);
    stats.created += 1;
  }

  if (stats.created > 0) {
    const business = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { organizationId: true },
    });
    await prisma.usageRecord.create({
      data: {
        organizationId: business.organizationId,
        businessId,
        kind: UsageKind.REVIEW_INGESTED,
        quantity: stats.created,
      },
    });
  }

  log.info("ingestion complete", { businessId, reviewSourceId, ...stats });
  return stats;
}

/** Fetches from the source's provider and ingests the result. */
export async function syncSource(reviewSourceId: string): Promise<IngestStats> {
  const source = await prisma.reviewSource.findUniqueOrThrow({
    where: { id: reviewSourceId },
  });

  const provider = getProvider(source.provider);

  try {
    const result = await provider.fetchReviews({
      config: (source.config as Record<string, unknown>) ?? {},
      credentials: (source.credentials as Record<string, unknown>) ?? {},
      // Re-fetch a short overlap window rather than only what is strictly new:
      // providers backfill, and deduplication makes the overlap free.
      since: source.lastSyncedAt
        ? new Date(source.lastSyncedAt.getTime() - 7 * 24 * 60 * 60 * 1000)
        : undefined,
      cursor: source.syncCursor,
    });

    const stats = await ingestReviews(source.businessId, source.id, result.reviews);

    await prisma.reviewSource.update({
      where: { id: source.id },
      data: {
        lastSyncedAt: new Date(),
        syncCursor: result.nextCursor ?? null,
        status: SourceStatus.CONNECTED,
        lastError: null,
      },
    });

    return stats;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    log.error("source sync failed", { reviewSourceId, error: message });

    await prisma.reviewSource.update({
      where: { id: source.id },
      data: { status: SourceStatus.ERROR, lastError: message.slice(0, 500) },
    });

    throw error;
  }
}

/** Syncs every connected source for a business. */
export async function syncBusiness(businessId: string): Promise<IngestStats> {
  const sources = await prisma.reviewSource.findMany({
    where: { businessId, status: { not: SourceStatus.DISCONNECTED } },
    select: { id: true },
  });

  const total: IngestStats = { fetched: 0, created: 0, duplicates: 0, updated: 0 };

  for (const source of sources) {
    try {
      const stats = await syncSource(source.id);
      total.fetched += stats.fetched;
      total.created += stats.created;
      total.duplicates += stats.duplicates;
      total.updated += stats.updated;
    } catch {
      // One failing source must not stop the others; the failure is already
      // recorded on the source row and logged.
    }
  }

  return total;
}
