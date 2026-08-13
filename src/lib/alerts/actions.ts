"use server";

import { AlertStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertAlertAccess, requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

export type MutationState = { error?: string; message?: string };

export async function setAlertStatus(
  id: string,
  status: "ACKNOWLEDGED" | "RESOLVED",
): Promise<MutationState> {
  const user = await requireUser();

  try {
    await assertAlertAccess(id, user.organizationId);
    await prisma.alert.update({
      where: { id },
      data: {
        status: status as AlertStatus,
        resolvedAt: status === "RESOLVED" ? new Date() : null,
      },
    });
  } catch (error) {
    return {
      error: error instanceof AppError ? error.message : "Could not update that.",
    };
  }

  revalidatePath("/alerts");
  revalidatePath("/dashboard");
  return { message: "Updated." };
}

const ruleSchema = z.object({
  ruleId: z.string().min(1),
  threshold: z.coerce.number().min(0).max(1000),
  enabled: z.boolean(),
  emailEnabled: z.boolean(),
});

export async function updateAlertRule(input: {
  ruleId: string;
  threshold: number;
  enabled: boolean;
  emailEnabled: boolean;
}): Promise<MutationState> {
  const user = await requireUser();

  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the values and try again." };

  // Scoped by organization in the query itself, so a foreign rule id matches
  // nothing rather than being updated.
  const rule = await prisma.alertRule.findFirst({
    where: {
      id: parsed.data.ruleId,
      business: { organizationId: user.organizationId },
    },
    select: { id: true },
  });

  if (!rule) return { error: "Not found." };

  await prisma.alertRule.update({
    where: { id: rule.id },
    data: {
      threshold: parsed.data.threshold,
      enabled: parsed.data.enabled,
      emailEnabled: parsed.data.emailEnabled,
    },
  });

  revalidatePath("/alerts");
  return { message: "Saved." };
}
