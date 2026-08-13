"use server";

import { RecommendationStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import {
  assertBusinessAccess,
  assertRecommendationAccess,
  requireUser,
} from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { LIMITS, hit } from "@/lib/rate-limit";
import { generateRecommendations } from "@/lib/recommendations/generate";

export type MutationState = { error?: string; message?: string };

const ALLOWED: RecommendationStatus[] = [
  RecommendationStatus.OPEN,
  RecommendationStatus.IN_PROGRESS,
  RecommendationStatus.DONE,
  RecommendationStatus.DISMISSED,
];

export async function setRecommendationStatus(
  id: string,
  status: string,
): Promise<MutationState> {
  const user = await requireUser();

  if (!ALLOWED.includes(status as RecommendationStatus)) {
    return { error: "Unknown status." };
  }

  try {
    // The id came from the client: verify it belongs to this tenant.
    await assertRecommendationAccess(id, user.organizationId);
    await prisma.recommendation.update({
      where: { id },
      data: { status: status as RecommendationStatus },
    });
  } catch (error) {
    return {
      error:
        error instanceof AppError ? error.message : "Could not update that.",
    };
  }

  revalidatePath("/recommendations");
  return { message: "Updated." };
}

/** Recomputes recommendations on demand. Rate limited — it costs AI calls. */
export async function regenerateRecommendations(
  businessId: string,
): Promise<MutationState> {
  const user = await requireUser();

  try {
    await assertBusinessAccess(businessId, user.organizationId);

    if (
      !hit(
        `recommendations:${businessId}`,
        LIMITS.analysis.limit,
        LIMITS.analysis.windowMs,
      ).allowed
    ) {
      return { error: "Please wait a little before regenerating again." };
    }

    const stats = await generateRecommendations(businessId);
    revalidatePath("/recommendations");
    revalidatePath("/dashboard");

    return {
      message:
        stats.generated > 0
          ? `Generated ${stats.generated} recommendation${stats.generated === 1 ? "" : "s"}.`
          : "No recommendations to generate — there is not enough analyzed review data yet.",
    };
  } catch (error) {
    log.error("regenerate recommendations failed", {
      businessId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      error:
        error instanceof AppError
          ? error.message
          : "Could not regenerate recommendations right now.",
    };
  }
}
