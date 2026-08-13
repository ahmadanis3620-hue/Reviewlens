import { ReportStatus, ReportType } from "@prisma/client";

import { prisma } from "@/lib/db";
import { getEmailService } from "@/lib/email/service";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import { generateReport } from "@/lib/reports/generate";
import {
  renderReportHtml,
  renderReportText,
  reportSubject,
} from "@/lib/reports/render";

/** Sends an already-generated report to an address. */
export async function deliverReport(
  reportId: string,
  recipientEmail: string,
): Promise<void> {
  const report = await prisma.report.findUniqueOrThrow({
    where: { id: reportId },
    include: {
      sections: { orderBy: { order: "asc" } },
      business: { select: { name: true, organizationId: true, id: true } },
    },
  });

  if (report.status !== ReportStatus.READY) {
    throw new Error("Report is not ready to send");
  }

  const appUrl = getEnv().APP_URL;

  await getEmailService().send(
    {
      to: recipientEmail,
      subject: reportSubject(report, report.business),
      html: renderReportHtml(report, report.business, appUrl),
      text: renderReportText(report, report.business),
    },
    { organizationId: report.business.organizationId, businessId: report.business.id },
  );

  await prisma.report.update({
    where: { id: report.id },
    data: { deliveredAt: new Date() },
  });

  log.info("report delivered", { reportId: report.id });
}

/**
 * Whether a schedule is due.
 *
 * Compares against the business's local time, and refuses to fire twice in the
 * same period regardless of how often the job runs.
 */
export function isScheduleDue(
  schedule: {
    frequency: ReportType;
    dayOfWeek: number;
    dayOfMonth: number;
    hour: number;
    lastRunAt: Date | null;
  },
  now: Date,
  timezone: string,
): boolean {
  const local = new Date(
    now.toLocaleString("en-US", { timeZone: timezone || "UTC" }),
  );

  if (local.getHours() < schedule.hour) return false;

  if (schedule.frequency === ReportType.WEEKLY) {
    if (local.getDay() !== schedule.dayOfWeek) return false;
    if (!schedule.lastRunAt) return true;
    // Already ran within the last six days — this is the same week's slot.
    return now.getTime() - schedule.lastRunAt.getTime() > 6 * 24 * 60 * 60 * 1000;
  }

  if (local.getDate() !== schedule.dayOfMonth) return false;
  if (!schedule.lastRunAt) return true;
  return now.getTime() - schedule.lastRunAt.getTime() > 27 * 24 * 60 * 60 * 1000;
}

export type ScheduleStats = { considered: number; sent: number; failed: number };

export async function runDueSchedules(now: Date = new Date()): Promise<ScheduleStats> {
  const schedules = await prisma.reportSchedule.findMany({
    where: { enabled: true },
    include: { business: { select: { id: true, timezone: true } } },
  });

  const stats: ScheduleStats = { considered: schedules.length, sent: 0, failed: 0 };

  for (const schedule of schedules) {
    if (!isScheduleDue(schedule, now, schedule.business.timezone)) continue;

    try {
      const { reportId } = await generateReport(
        schedule.businessId,
        schedule.frequency,
        now,
      );
      await deliverReport(reportId, schedule.recipientEmail);
      await prisma.reportSchedule.update({
        where: { id: schedule.id },
        data: { lastRunAt: now },
      });
      stats.sent += 1;
    } catch (error) {
      stats.failed += 1;
      log.error("scheduled report failed", {
        scheduleId: schedule.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return stats;
}
