"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assertBusinessAccess, requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { syncBusiness } from "@/lib/ingestion/ingest";
import { runFullPipeline } from "@/lib/jobs/registry";
import { log } from "@/lib/logger";
import { LIMITS, hit } from "@/lib/rate-limit";

export type MutationState = { error?: string; message?: string };

/**
 * Deletes a business and everything under it.
 *
 * The confirmation requires typing the business name — an irreversible delete
 * should not be one misclick away. Cascades handle the rest of the tree, so
 * there is no orphaned customer data left behind.
 */
export async function deleteBusiness(
  _prev: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const user = await requireUser();

  const businessId = String(formData.get("businessId") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "").trim();

  try {
    const business = await assertBusinessAccess(businessId, user.organizationId);

    if (confirmation !== business.name) {
      return { error: "Type the business name exactly to confirm." };
    }

    await prisma.business.delete({ where: { id: business.id } });
    log.info("business deleted", { businessId: business.id });
  } catch (error) {
    return {
      error:
        error instanceof AppError ? error.message : "Could not delete that business.",
    };
  }

  redirect("/onboarding");
}

/** Pulls new reviews and runs the pipeline. Rate limited — it costs AI calls. */
export async function syncNow(businessId: string): Promise<MutationState> {
  const user = await requireUser();

  try {
    await assertBusinessAccess(businessId, user.organizationId);

    if (
      !hit(`sync:${businessId}`, LIMITS.ingestion.limit, LIMITS.ingestion.windowMs)
        .allowed
    ) {
      return { error: "Please wait a moment before syncing again." };
    }

    const stats = await syncBusiness(businessId);
    await runFullPipeline(businessId);

    revalidatePath("/dashboard");
    revalidatePath("/reviews");
    revalidatePath("/settings/sources");

    return {
      message:
        stats.created > 0
          ? `Imported ${stats.created} new review${stats.created === 1 ? "" : "s"} (${stats.duplicates} already known).`
          : `No new reviews. ${stats.duplicates} already known.`,
    };
  } catch (error) {
    log.error("manual sync failed", {
      businessId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      error: error instanceof AppError ? error.message : "Sync failed.",
    };
  }
}

export async function disconnectSource(sourceId: string): Promise<MutationState> {
  const user = await requireUser();

  const source = await prisma.reviewSource.findFirst({
    where: { id: sourceId, business: { organizationId: user.organizationId } },
    select: { id: true },
  });

  if (!source) return { error: "Not found." };

  await prisma.reviewSource.update({
    where: { id: source.id },
    data: { status: "DISCONNECTED", credentials: undefined },
  });

  revalidatePath("/settings/sources");
  return { message: "Source disconnected. Existing reviews are kept." };
}
