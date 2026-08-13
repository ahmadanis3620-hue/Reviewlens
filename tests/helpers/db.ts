import { Plan, ReviewProviderKey, SourceStatus } from "@prisma/client";

import { seedStarterTopics } from "@/lib/analysis/topics";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";

/**
 * Integration-test fixtures.
 *
 * `resetDb` truncates rather than deletes so tests start from a genuinely
 * clean state without depending on cascade ordering.
 */

export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      organizations, users, sessions, memberships, businesses, locations,
      review_sources, reviews, review_analyses, review_topics,
      review_topic_mentions, competitors, competitor_reviews, recommendations,
      alert_rules, alerts, reports, report_sections, report_schedules,
      reputation_snapshots, subscriptions, usage_records, job_runs
    RESTART IDENTITY CASCADE
  `);
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}

export type TestTenant = {
  organizationId: string;
  userId: string;
  email: string;
  businessId: string;
  sourceId: string;
};

let counter = 0;

/** Creates an organization, an owner, a business, and a review source. */
export async function createTenant(
  overrides: { name?: string; industry?: string } = {},
): Promise<TestTenant> {
  counter += 1;
  const slug = `test-org-${counter}-${Date.now()}`;
  const email = `owner-${counter}-${Date.now()}@example.test`;

  const organization = await prisma.organization.create({
    data: {
      name: overrides.name ?? `Test Org ${counter}`,
      slug,
      subscription: { create: { plan: Plan.GROWTH } },
    },
  });

  const user = await prisma.user.create({
    data: {
      email,
      name: "Test Owner",
      passwordHash: await hashPassword("correct-horse-battery"),
      memberships: {
        create: { organizationId: organization.id, role: "OWNER" },
      },
    },
  });

  const business = await prisma.business.create({
    data: {
      organizationId: organization.id,
      name: overrides.name ?? `Test Business ${counter}`,
      industry: overrides.industry ?? "Dentist",
    },
  });

  await seedStarterTopics(business.id);

  const source = await prisma.reviewSource.create({
    data: {
      businessId: business.id,
      provider: ReviewProviderKey.DEMO,
      externalAccountId: `acct-${counter}`,
      displayName: "Test source",
      status: SourceStatus.CONNECTED,
    },
  });

  return {
    organizationId: organization.id,
    userId: user.id,
    email,
    businessId: business.id,
    sourceId: source.id,
  };
}

/** A review payload in the shape a provider returns. */
export function makeReview(
  overrides: Partial<{
    externalReviewId: string;
    rating: number;
    text: string;
    reviewedAt: Date;
    reviewerName: string;
    responseText: string;
  }> = {},
) {
  return {
    externalReviewId: overrides.externalReviewId ?? `ext-${Math.random()}`,
    rating: overrides.rating ?? 5,
    text: overrides.text ?? "The staff were friendly and the office was spotless.",
    reviewedAt: overrides.reviewedAt ?? new Date(),
    reviewerName: overrides.reviewerName,
    responseText: overrides.responseText,
  };
}

export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
