import { afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { ingestReviews, syncSource } from "@/lib/ingestion/ingest";
import {
  createTenant,
  daysAgo,
  disconnect,
  makeReview,
  resetDb,
  type TestTenant,
} from "../helpers/db";

/**
 * Ingestion and deduplication.
 *
 * The property that matters: running an import twice must not create duplicate
 * reviews. Everything downstream — counts, rates, trends, the score — is wrong
 * the moment that fails.
 */

let tenant: TestTenant;

beforeEach(async () => {
  await resetDb();
  tenant = await createTenant();
});

afterEach(async () => {
  // Nothing to do; each test resets in beforeEach.
});

afterAll(async () => {
  await disconnect();
});

describe("ingestReviews", () => {
  it("creates new reviews", async () => {
    const stats = await ingestReviews(tenant.businessId, tenant.sourceId, [
      makeReview({ externalReviewId: "a", text: "Lovely staff." }),
      makeReview({ externalReviewId: "b", text: "Long wait times." }),
    ]);

    expect(stats.created).toBe(2);
    expect(stats.duplicates).toBe(0);
    expect(
      await prisma.review.count({ where: { businessId: tenant.businessId } }),
    ).toBe(2);
  });

  it("is idempotent — the same batch twice creates nothing new", async () => {
    const batch = [
      makeReview({ externalReviewId: "a", text: "Lovely staff." }),
      makeReview({ externalReviewId: "b", text: "Long wait times." }),
    ];

    await ingestReviews(tenant.businessId, tenant.sourceId, batch);
    const second = await ingestReviews(tenant.businessId, tenant.sourceId, batch);

    expect(second.created).toBe(0);
    expect(second.duplicates).toBe(2);
    expect(
      await prisma.review.count({ where: { businessId: tenant.businessId } }),
    ).toBe(2);
  });

  it("deduplicates within a single batch", async () => {
    const stats = await ingestReviews(tenant.businessId, tenant.sourceId, [
      makeReview({ externalReviewId: "a", text: "Identical text here." }),
      makeReview({ externalReviewId: "b", text: "Identical text here." }),
    ]);

    // Same provider, text, rating, and date under two ids is a reissue, not
    // two reviews.
    expect(stats.created).toBe(1);
    expect(stats.duplicates).toBe(1);
  });

  it("catches a review reissued under a new external id", async () => {
    const reviewedAt = daysAgo(3);

    await ingestReviews(tenant.businessId, tenant.sourceId, [
      makeReview({
        externalReviewId: "original",
        text: "The hygienist was gentle.",
        reviewedAt,
      }),
    ]);

    const second = await ingestReviews(tenant.businessId, tenant.sourceId, [
      makeReview({
        externalReviewId: "reissued-under-new-id",
        text: "The hygienist was gentle.",
        reviewedAt,
      }),
    ]);

    expect(second.created).toBe(0);
    expect(second.duplicates).toBe(1);
  });

  it("treats genuinely different reviews as different", async () => {
    const reviewedAt = daysAgo(3);

    await ingestReviews(tenant.businessId, tenant.sourceId, [
      makeReview({ externalReviewId: "a", text: "Great.", rating: 5, reviewedAt }),
    ]);
    const second = await ingestReviews(tenant.businessId, tenant.sourceId, [
      makeReview({ externalReviewId: "b", text: "Great.", rating: 3, reviewedAt }),
    ]);

    expect(second.created).toBe(1);
  });

  it("updates an existing review when an owner response appears", async () => {
    await ingestReviews(tenant.businessId, tenant.sourceId, [
      makeReview({ externalReviewId: "a", text: "Long wait.", rating: 2 }),
    ]);

    const second = await ingestReviews(tenant.businessId, tenant.sourceId, [
      makeReview({
        externalReviewId: "a",
        text: "Long wait.",
        rating: 2,
        responseText: "We are sorry about the wait.",
      }),
    ]);

    expect(second.updated).toBe(1);
    expect(second.created).toBe(0);

    const review = await prisma.review.findFirstOrThrow({
      where: { externalReviewId: "a" },
    });
    expect(review.responseText).toBe("We are sorry about the wait.");
    expect(review.respondedAt).not.toBeNull();
  });

  it("strips contact details on the way in", async () => {
    await ingestReviews(tenant.businessId, tenant.sourceId, [
      makeReview({
        externalReviewId: "pii",
        text: "Call me on 614-555-0142 or email jane@example.com.",
        reviewerName: "Jane D.",
      }),
    ]);

    const review = await prisma.review.findFirstOrThrow({
      where: { externalReviewId: "pii" },
    });

    expect(review.text).not.toContain("555-0142");
    expect(review.text).not.toContain("jane@example.com");
    expect(review.reviewerName).toBe("Jane D.");
  });

  it("records ingestion against the organization's usage", async () => {
    await ingestReviews(tenant.businessId, tenant.sourceId, [
      makeReview({ externalReviewId: "a" }),
      makeReview({ externalReviewId: "b", text: "Different text entirely." }),
    ]);

    const usage = await prisma.usageRecord.findFirst({
      where: { organizationId: tenant.organizationId, kind: "REVIEW_INGESTED" },
    });

    expect(usage?.quantity).toBe(2);
  });

  it("handles an empty batch without touching the database", async () => {
    const stats = await ingestReviews(tenant.businessId, tenant.sourceId, []);
    expect(stats).toEqual({ fetched: 0, created: 0, duplicates: 0, updated: 0 });
  });
});

describe("syncSource", () => {
  it("pulls from the provider and records the sync", async () => {
    const stats = await syncSource(tenant.sourceId);

    expect(stats.created).toBeGreaterThan(0);

    const source = await prisma.reviewSource.findUniqueOrThrow({
      where: { id: tenant.sourceId },
    });
    expect(source.lastSyncedAt).not.toBeNull();
    expect(source.status).toBe("CONNECTED");
    expect(source.lastError).toBeNull();
  });

  it("running twice does not duplicate the corpus", async () => {
    const first = await syncSource(tenant.sourceId);
    const second = await syncSource(tenant.sourceId);

    expect(second.created).toBe(0);
    expect(
      await prisma.review.count({ where: { businessId: tenant.businessId } }),
    ).toBe(first.created);
  });
});
