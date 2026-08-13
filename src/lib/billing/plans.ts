import { Plan, UsageKind } from "@prisma/client";

import { prisma } from "@/lib/db";
import { PlanLimitError } from "@/lib/errors";

/**
 * Plan definitions and limit enforcement.
 *
 * Stripe is stubbed for the MVP — per the brief, billing sits below the core
 * product. The subscription *model* is real though: limits are defined here,
 * enforced at the mutation sites, and metered through UsageRecord, so wiring
 * Stripe up later is a matter of setting `plan` from a webhook.
 */

export type PlanDefinition = {
  plan: Plan;
  name: string;
  priceMonthlyUsd: number;
  maxBusinesses: number;
  maxCompetitorsPerBusiness: number;
  maxAnalysesPerMonth: number;
  features: string[];
};

export const PLANS: Record<Plan, PlanDefinition> = {
  [Plan.STARTER]: {
    plan: Plan.STARTER,
    name: "Starter",
    priceMonthlyUsd: 49,
    maxBusinesses: 1,
    maxCompetitorsPerBusiness: 2,
    maxAnalysesPerMonth: 500,
    features: [
      "1 business location",
      "Review collection and AI analysis",
      "Reputation score and topic insights",
      "2 tracked competitors",
      "Monthly report by email",
    ],
  },
  [Plan.GROWTH]: {
    plan: Plan.GROWTH,
    name: "Growth",
    priceMonthlyUsd: 99,
    maxBusinesses: 3,
    maxCompetitorsPerBusiness: 5,
    maxAnalysesPerMonth: 2000,
    features: [
      "Up to 3 locations",
      "Everything in Starter",
      "5 tracked competitors per location",
      "Weekly and monthly reports",
      "Configurable alerts",
      "Suggested review responses",
    ],
  },
  [Plan.PRO]: {
    plan: Plan.PRO,
    name: "Pro",
    priceMonthlyUsd: 199,
    maxBusinesses: 10,
    maxCompetitorsPerBusiness: 10,
    maxAnalysesPerMonth: 10000,
    features: [
      "Up to 10 locations",
      "Everything in Growth",
      "10 tracked competitors per location",
      "Full topic history and CSV export",
      "Priority support",
    ],
  },
};

export const PLAN_ORDER: Plan[] = [Plan.STARTER, Plan.GROWTH, Plan.PRO];

export async function getPlanForOrganization(
  organizationId: string,
): Promise<PlanDefinition> {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
    select: { plan: true },
  });
  return PLANS[subscription?.plan ?? Plan.STARTER];
}

export async function assertCanAddBusiness(organizationId: string): Promise<void> {
  const [definition, count] = await Promise.all([
    getPlanForOrganization(organizationId),
    prisma.business.count({ where: { organizationId } }),
  ]);

  if (count >= definition.maxBusinesses) {
    throw new PlanLimitError(
      `The ${definition.name} plan includes ${definition.maxBusinesses} business${definition.maxBusinesses === 1 ? "" : "es"}. Upgrade to add another.`,
    );
  }
}

export async function assertCanAddCompetitor(
  organizationId: string,
  businessId: string,
): Promise<void> {
  const [definition, count] = await Promise.all([
    getPlanForOrganization(organizationId),
    prisma.competitor.count({ where: { businessId } }),
  ]);

  if (count >= definition.maxCompetitorsPerBusiness) {
    throw new PlanLimitError(
      `The ${definition.name} plan tracks ${definition.maxCompetitorsPerBusiness} competitors per business. Upgrade to track more.`,
    );
  }
}

/** AI analyses consumed in the current calendar month. */
export async function getMonthlyAnalysisUsage(
  organizationId: string,
  now: Date = new Date(),
): Promise<number> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const result = await prisma.usageRecord.aggregate({
    where: {
      organizationId,
      kind: UsageKind.AI_ANALYSIS,
      occurredAt: { gte: monthStart },
    },
    _sum: { quantity: true },
  });

  return result._sum.quantity ?? 0;
}
