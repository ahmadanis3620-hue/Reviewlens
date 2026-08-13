import "server-only";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";

/**
 * Tenant isolation.
 *
 * The invariant: an organization id is only ever derived from a session, and
 * any id that arrives from a URL, form, or JSON body is treated as a *claim*
 * that must be checked against that organization before it is used.
 *
 * The `assert*` functions take the organization id explicitly and hold no
 * dependency on cookies, which is what lets the isolation tests drive them
 * directly. The `require*` functions are the ones route handlers and pages use.
 */

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** For pages: send unauthenticated visitors to login instead of throwing. */
export async function requireUserOrRedirect(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export type ScopedBusiness = {
  id: string;
  name: string;
  industry: string;
  timezone: string;
  isDemo: boolean;
  organizationId: string;
};

/**
 * Verifies a business belongs to the given organization.
 *
 * Throws ForbiddenError — which renders as a 404 — for both "does not exist"
 * and "belongs to someone else", so the API cannot be used to probe for the
 * existence of another tenant's records.
 */
export async function assertBusinessAccess(
  businessId: string,
  organizationId: string,
): Promise<ScopedBusiness> {
  const business = await prisma.business.findFirst({
    where: { id: businessId, organizationId },
    select: {
      id: true,
      name: true,
      industry: true,
      timezone: true,
      isDemo: true,
      organizationId: true,
    },
  });
  if (!business) throw new ForbiddenError();
  return business;
}

export async function requireBusinessAccess(
  businessId: string,
): Promise<{ user: SessionUser; business: ScopedBusiness }> {
  const user = await requireUser();
  const business = await assertBusinessAccess(businessId, user.organizationId);
  return { user, business };
}

/** Same contract as assertBusinessAccess, one hop further down the tree. */
export async function assertCompetitorAccess(
  competitorId: string,
  organizationId: string,
): Promise<{ id: string; businessId: string; name: string }> {
  const competitor = await prisma.competitor.findFirst({
    where: { id: competitorId, business: { organizationId } },
    select: { id: true, businessId: true, name: true },
  });
  if (!competitor) throw new ForbiddenError();
  return competitor;
}

export async function assertReviewAccess(
  reviewId: string,
  organizationId: string,
): Promise<{ id: string; businessId: string }> {
  const review = await prisma.review.findFirst({
    where: { id: reviewId, business: { organizationId } },
    select: { id: true, businessId: true },
  });
  if (!review) throw new ForbiddenError();
  return review;
}

export async function assertReportAccess(
  reportId: string,
  organizationId: string,
): Promise<{ id: string; businessId: string }> {
  const report = await prisma.report.findFirst({
    where: { id: reportId, business: { organizationId } },
    select: { id: true, businessId: true },
  });
  if (!report) throw new ForbiddenError();
  return report;
}

export async function assertRecommendationAccess(
  recommendationId: string,
  organizationId: string,
): Promise<{ id: string; businessId: string }> {
  const rec = await prisma.recommendation.findFirst({
    where: { id: recommendationId, business: { organizationId } },
    select: { id: true, businessId: true },
  });
  if (!rec) throw new ForbiddenError();
  return rec;
}

export async function assertAlertAccess(
  alertId: string,
  organizationId: string,
): Promise<{ id: string; businessId: string }> {
  const alert = await prisma.alert.findFirst({
    where: { id: alertId, business: { organizationId } },
    select: { id: true, businessId: true },
  });
  if (!alert) throw new ForbiddenError();
  return alert;
}

export async function assertSourceAccess(
  sourceId: string,
  organizationId: string,
): Promise<{ id: string; businessId: string }> {
  const source = await prisma.reviewSource.findFirst({
    where: { id: sourceId, business: { organizationId } },
    select: { id: true, businessId: true },
  });
  if (!source) throw new ForbiddenError();
  return source;
}

/** Lists the businesses a session may see. Used by the business switcher. */
export async function listAccessibleBusinesses(organizationId: string) {
  return prisma.business.findMany({
    where: { organizationId },
    select: { id: true, name: true, industry: true, isDemo: true },
    orderBy: { createdAt: "asc" },
  });
}
