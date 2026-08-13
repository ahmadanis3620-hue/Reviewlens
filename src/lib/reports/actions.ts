"use server";

import { ReportType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  assertBusinessAccess,
  assertReportAccess,
  requireUser,
} from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { LIMITS, hit } from "@/lib/rate-limit";
import { deliverReport } from "@/lib/reports/deliver";
import { generateReport } from "@/lib/reports/generate";

export type MutationState = { error?: string; message?: string };

export async function createReport(
  businessId: string,
  type: "WEEKLY" | "MONTHLY",
): Promise<MutationState & { reportId?: string }> {
  const user = await requireUser();

  try {
    await assertBusinessAccess(businessId, user.organizationId);

    if (
      !hit(`report:${businessId}`, LIMITS.report.limit, LIMITS.report.windowMs)
        .allowed
    ) {
      return { error: "Please wait a moment before generating another report." };
    }

    const { reportId } = await generateReport(businessId, type as ReportType);
    revalidatePath("/reports");
    return { message: "Report generated.", reportId };
  } catch (error) {
    log.error("report action failed", {
      businessId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      error:
        error instanceof AppError
          ? error.message
          : "Could not generate a report right now.",
    };
  }
}

const emailSchema = z.email("Enter a valid email address");

export async function sendReport(
  reportId: string,
  email: string,
): Promise<MutationState> {
  const user = await requireUser();

  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { error: "Enter a valid email address." };

  try {
    await assertReportAccess(reportId, user.organizationId);
    await deliverReport(reportId, parsed.data);
  } catch (error) {
    log.error("send report failed", {
      reportId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      error:
        error instanceof AppError ? error.message : "Could not send that report.",
    };
  }

  revalidatePath("/reports");
  return { message: `Sent to ${parsed.data}.` };
}

const scheduleSchema = z.object({
  businessId: z.string().min(1),
  frequency: z.enum(["WEEKLY", "MONTHLY"]),
  recipientEmail: z.email("Enter a valid email address"),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  dayOfMonth: z.coerce.number().int().min(1).max(28),
  hour: z.coerce.number().int().min(0).max(23),
  enabled: z.boolean(),
});

export async function saveReportSchedule(
  _prev: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const user = await requireUser();

  const parsed = scheduleSchema.safeParse({
    businessId: formData.get("businessId"),
    frequency: formData.get("frequency"),
    recipientEmail: formData.get("recipientEmail"),
    dayOfWeek: formData.get("dayOfWeek") ?? 1,
    // Capped at 28 so a monthly schedule fires in February too.
    dayOfMonth: formData.get("dayOfMonth") ?? 1,
    hour: formData.get("hour") ?? 8,
    enabled: formData.get("enabled") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  try {
    await assertBusinessAccess(parsed.data.businessId, user.organizationId);

    await prisma.reportSchedule.upsert({
      where: {
        businessId_frequency: {
          businessId: parsed.data.businessId,
          frequency: parsed.data.frequency as ReportType,
        },
      },
      create: {
        businessId: parsed.data.businessId,
        frequency: parsed.data.frequency as ReportType,
        recipientEmail: parsed.data.recipientEmail,
        dayOfWeek: parsed.data.dayOfWeek,
        dayOfMonth: parsed.data.dayOfMonth,
        hour: parsed.data.hour,
        enabled: parsed.data.enabled,
      },
      update: {
        recipientEmail: parsed.data.recipientEmail,
        dayOfWeek: parsed.data.dayOfWeek,
        dayOfMonth: parsed.data.dayOfMonth,
        hour: parsed.data.hour,
        enabled: parsed.data.enabled,
      },
    });
  } catch (error) {
    return {
      error:
        error instanceof AppError ? error.message : "Could not save that schedule.",
    };
  }

  revalidatePath("/settings");
  revalidatePath("/reports");
  return { message: "Schedule saved." };
}
