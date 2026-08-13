"use server";

import { ReviewProviderKey, SourceStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ensureDefaultAlertRules } from "@/lib/alerts/evaluate";
import { seedStarterTopics } from "@/lib/analysis/topics";
import { requireUser } from "@/lib/auth/guards";
import { assertBusinessAccess } from "@/lib/auth/guards";
import { assertCanAddBusiness, assertCanAddCompetitor } from "@/lib/billing/plans";
import { prisma } from "@/lib/db";
import { provisionDemoBusiness } from "@/lib/demo/provision";
import { AppError } from "@/lib/errors";
import { runFullPipeline } from "@/lib/jobs/registry";
import { log } from "@/lib/logger";
import { LIMITS, hit } from "@/lib/rate-limit";
import { setActiveBusiness } from "@/lib/session/business";

/**
 * Onboarding actions.
 *
 * Each one re-derives the organization from the session and verifies any id it
 * is handed, because a Server Action is an HTTP endpoint like any other.
 */

export type ActionState = { error?: string; message?: string };

export const INDUSTRIES = [
  "Dentist",
  "HVAC",
  "Plumber",
  "Roofer",
  "Auto repair",
  "Med spa",
  "Salon",
  "Veterinarian",
  "Restaurant",
  "Law firm",
  "Chiropractor",
  "Other",
] as const;

const createBusinessSchema = z.object({
  name: z.string().trim().min(1, "Enter your business name").max(120),
  industry: z.string().trim().min(1, "Choose an industry").max(60),
  city: z.string().trim().max(80).optional(),
  region: z.string().trim().max(80).optional(),
});

function toMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  log.error("onboarding action failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  return "Something went wrong. Please try again.";
}

export async function createBusiness(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = createBusinessSchema.safeParse({
    name: formData.get("name"),
    industry: formData.get("industry"),
    city: formData.get("city"),
    region: formData.get("region"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  let businessId: string;

  try {
    await assertCanAddBusiness(user.organizationId);

    const business = await prisma.business.create({
      data: {
        organizationId: user.organizationId,
        name: parsed.data.name,
        industry: parsed.data.industry,
        locations: {
          create: {
            label: "Main location",
            city: parsed.data.city || null,
            region: parsed.data.region || null,
          },
        },
      },
      select: { id: true },
    });

    businessId = business.id;
    await seedStarterTopics(businessId);
    await ensureDefaultAlertRules(businessId);
    await setActiveBusiness(businessId);
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/onboarding");
  return { message: "Business created." };
}

/** Provisions the demo business and runs the full pipeline on it. */
export async function loadDemoData(): Promise<ActionState> {
  const user = await requireUser();

  if (
    !hit(
      `demo:${user.organizationId}`,
      LIMITS.ingestion.limit,
      LIMITS.ingestion.windowMs,
    ).allowed
  ) {
    return { error: "Please wait a moment before loading demo data again." };
  }

  let businessId: string;

  try {
    const result = await provisionDemoBusiness(user.organizationId);
    businessId = result.businessId;
    await runFullPipeline(businessId);
    await setActiveBusiness(businessId);
  } catch (error) {
    return { error: toMessage(error) };
  }

  redirect("/dashboard");
}

const connectDemoFeedSchema = z.object({
  businessId: z.string().min(1),
});

/**
 * Attaches a demo review feed to a business the user created themselves, so
 * they can see the product working before an integration is available.
 */
export async function connectDemoFeed(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = connectDemoFeedSchema.safeParse({
    businessId: formData.get("businessId"),
  });
  if (!parsed.success) return { error: "Choose a business first." };

  try {
    // The business id came from a form: verify it, do not trust it.
    const business = await assertBusinessAccess(
      parsed.data.businessId,
      user.organizationId,
    );

    await prisma.reviewSource.upsert({
      where: {
        businessId_provider_externalAccountId: {
          businessId: business.id,
          provider: ReviewProviderKey.DEMO,
          externalAccountId: "demo-sample",
        },
      },
      create: {
        businessId: business.id,
        provider: ReviewProviderKey.DEMO,
        externalAccountId: "demo-sample",
        displayName: "Sample review feed (demo)",
        status: SourceStatus.CONNECTED,
        isDemo: true,
        config: { endDate: new Date().toISOString() },
      },
      update: { status: SourceStatus.CONNECTED },
    });

    await prisma.business.update({
      where: { id: business.id },
      data: { isDemo: true },
    });

    await runFullPipeline(business.id);
  } catch (error) {
    return { error: toMessage(error) };
  }

  redirect("/dashboard");
}

const addCompetitorSchema = z.object({
  businessId: z.string().min(1),
  name: z.string().trim().min(1, "Enter a competitor name").max(120),
  city: z.string().trim().max(80).optional(),
});

export async function addCompetitor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = addCompetitorSchema.safeParse({
    businessId: formData.get("businessId"),
    name: formData.get("name"),
    city: formData.get("city"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  try {
    const business = await assertBusinessAccess(
      parsed.data.businessId,
      user.organizationId,
    );
    await assertCanAddCompetitor(user.organizationId, business.id);

    await prisma.competitor.create({
      data: {
        businessId: business.id,
        name: parsed.data.name,
        city: parsed.data.city || null,
        // No review source is attached: without a connected provider we hold
        // the competitor's identity only, and the UI says so rather than
        // showing a rating we do not have.
        provider: ReviewProviderKey.DEMO,
        externalId: null,
      },
    });
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePath("/competitors");
  revalidatePath("/onboarding");
  return { message: "Competitor added." };
}
