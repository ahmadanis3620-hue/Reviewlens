import { ReviewProviderKey, ReportType } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  assertAlertAccess,
  assertBusinessAccess,
  assertCompetitorAccess,
  assertRecommendationAccess,
  assertReportAccess,
  assertReviewAccess,
  assertSourceAccess,
  listAccessibleBusinesses,
} from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";
import { ingestReviews } from "@/lib/ingestion/ingest";
import {
  createTenant,
  disconnect,
  makeReview,
  resetDb,
  type TestTenant,
} from "../helpers/db";

/**
 * Tenant isolation.
 *
 * The invariant under test: an organization id only ever comes from a session,
 * and every id that arrives from a request is verified against it. These tests
 * seed two organizations and assert that every guarded accessor refuses to
 * cross the boundary.
 */

let alpha: TestTenant;
let beta: TestTenant;

beforeAll(async () => {
  await resetDb();
  alpha = await createTenant({ name: "Alpha Dental" });
  beta = await createTenant({ name: "Beta Plumbing", industry: "Plumber" });

  await ingestReviews(alpha.businessId, alpha.sourceId, [
    makeReview({ externalReviewId: "alpha-1", text: "Alpha staff were great." }),
  ]);
  await ingestReviews(beta.businessId, beta.sourceId, [
    makeReview({ externalReviewId: "beta-1", text: "Beta staff were great." }),
  ]);
});

afterAll(async () => {
  await disconnect();
});

describe("business access", () => {
  it("allows an organization to reach its own business", async () => {
    const business = await assertBusinessAccess(
      alpha.businessId,
      alpha.organizationId,
    );
    expect(business.id).toBe(alpha.businessId);
  });

  it("refuses another organization's business", async () => {
    await expect(
      assertBusinessAccess(beta.businessId, alpha.organizationId),
    ).rejects.toThrow(ForbiddenError);
  });

  it("reports a foreign id as not found, not as forbidden", async () => {
    // The API must not confirm that another tenant's record exists.
    await expect(
      assertBusinessAccess(beta.businessId, alpha.organizationId),
    ).rejects.toMatchObject({ status: 404 });

    await expect(
      assertBusinessAccess("does-not-exist", alpha.organizationId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("lists only the organization's own businesses", async () => {
    const businesses = await listAccessibleBusinesses(alpha.organizationId);
    expect(businesses.map((b) => b.id)).toEqual([alpha.businessId]);
  });
});

describe("review access", () => {
  it("refuses a review belonging to another organization", async () => {
    const betaReview = await prisma.review.findFirstOrThrow({
      where: { businessId: beta.businessId },
    });

    await expect(
      assertReviewAccess(betaReview.id, alpha.organizationId),
    ).rejects.toThrow(ForbiddenError);

    // And permits it for its own owner, so the test is not passing vacuously.
    await expect(
      assertReviewAccess(betaReview.id, beta.organizationId),
    ).resolves.toMatchObject({ id: betaReview.id });
  });
});

describe("every child resource is scoped", () => {
  it("refuses a competitor across the boundary", async () => {
    const competitor = await prisma.competitor.create({
      data: {
        businessId: beta.businessId,
        name: "Beta Competitor",
        provider: ReviewProviderKey.DEMO,
      },
    });

    await expect(
      assertCompetitorAccess(competitor.id, alpha.organizationId),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      assertCompetitorAccess(competitor.id, beta.organizationId),
    ).resolves.toBeTruthy();
  });

  it("refuses a recommendation across the boundary", async () => {
    const rec = await prisma.recommendation.create({
      data: {
        businessId: beta.businessId,
        title: "Beta recommendation",
        problem: "p",
        action: "a",
        rationale: "r",
        priority: "MEDIUM",
        expectedImpact: "Moderate",
        metrics: {},
        periodStart: new Date(),
        periodEnd: new Date(),
      },
    });

    await expect(
      assertRecommendationAccess(rec.id, alpha.organizationId),
    ).rejects.toThrow(ForbiddenError);
  });

  it("refuses an alert across the boundary", async () => {
    const alert = await prisma.alert.create({
      data: {
        businessId: beta.businessId,
        type: "RATING_DROP",
        severity: "HIGH",
        title: "Beta alert",
        message: "m",
        metrics: {},
        dedupeKey: "beta-test-alert",
      },
    });

    await expect(
      assertAlertAccess(alert.id, alpha.organizationId),
    ).rejects.toThrow(ForbiddenError);
  });

  it("refuses a report across the boundary", async () => {
    const report = await prisma.report.create({
      data: {
        businessId: beta.businessId,
        type: ReportType.MONTHLY,
        periodStart: new Date("2026-06-01"),
        periodEnd: new Date("2026-07-01"),
      },
    });

    await expect(
      assertReportAccess(report.id, alpha.organizationId),
    ).rejects.toThrow(ForbiddenError);
  });

  it("refuses a review source across the boundary", async () => {
    await expect(
      assertSourceAccess(beta.sourceId, alpha.organizationId),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("ingestion is scoped", () => {
  it("refuses to write reviews through another business's source", async () => {
    // Defence in depth: even inside an already-authorized request, mixing ids
    // must not write across businesses.
    await expect(
      ingestReviews(alpha.businessId, beta.sourceId, [makeReview()]),
    ).rejects.toThrow(/does not belong/i);
  });

  it("keeps each organization's review counts separate", async () => {
    const [alphaCount, betaCount] = await Promise.all([
      prisma.review.count({
        where: { business: { organizationId: alpha.organizationId } },
      }),
      prisma.review.count({
        where: { business: { organizationId: beta.organizationId } },
      }),
    ]);

    expect(alphaCount).toBe(1);
    expect(betaCount).toBe(1);
  });
});

describe("cascade deletion", () => {
  it("removes an organization's entire data tree", async () => {
    const doomed = await createTenant({ name: "Doomed Co" });
    await ingestReviews(doomed.businessId, doomed.sourceId, [
      makeReview({ externalReviewId: "doomed-1" }),
    ]);

    await prisma.organization.delete({ where: { id: doomed.organizationId } });

    expect(
      await prisma.business.count({ where: { id: doomed.businessId } }),
    ).toBe(0);
    expect(
      await prisma.review.count({ where: { businessId: doomed.businessId } }),
    ).toBe(0);
    expect(
      await prisma.reviewSource.count({ where: { id: doomed.sourceId } }),
    ).toBe(0);

    // The other tenants are untouched.
    expect(
      await prisma.review.count({ where: { businessId: alpha.businessId } }),
    ).toBe(1);
  });
});
