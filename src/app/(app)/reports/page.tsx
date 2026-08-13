import Link from "next/link";

import { GenerateReportButton } from "@/components/generate-report-button";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { requireUserOrRedirect } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { getActiveBusiness } from "@/lib/session/business";
import { formatDate } from "@/lib/utils";
import { formatWindowLabel } from "@/lib/analytics/windows";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const user = await requireUserOrRedirect();
  const business = await getActiveBusiness(user.organizationId);
  if (!business) return null;

  const [reports, schedules] = await Promise.all([
    prisma.report.findMany({
      where: { businessId: business.id },
      orderBy: { periodStart: "desc" },
      take: 24,
      select: {
        id: true,
        type: true,
        periodStart: true,
        periodEnd: true,
        status: true,
        reputationScore: true,
        scoreDelta: true,
        generatedAt: true,
        deliveredAt: true,
      },
    }),
    prisma.reportSchedule.findMany({
      where: { businessId: business.id },
      select: {
        id: true,
        frequency: true,
        recipientEmail: true,
        enabled: true,
        dayOfWeek: true,
        dayOfMonth: true,
        hour: true,
        lastRunAt: true,
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Reports"
        description="Weekly and monthly summaries built from the same figures as your dashboard."
        action={<GenerateReportButton businessId={business.id} />}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Generated reports" />
          <CardBody>
            {reports.length === 0 ? (
              <EmptyState
                title="No reports yet"
                description="Generate one now, or set up a schedule to have it delivered automatically."
              />
            ) : (
              <ul className="divide-y divide-line">
                {reports.map((report) => (
                  <li key={report.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge>
                            {report.type === "WEEKLY" ? "Weekly" : "Monthly"}
                          </Badge>
                          {report.status !== "READY" ? (
                            <Badge
                              tone={report.status === "FAILED" ? "critical" : "warning"}
                            >
                              {report.status.toLowerCase()}
                            </Badge>
                          ) : null}
                          {report.deliveredAt ? (
                            <Badge tone="good">
                              Emailed {formatDate(report.deliveredAt)}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm font-medium text-ink">
                          {formatWindowLabel({ start: report.periodStart, end: report.periodEnd })}
                        </p>
                        {report.reputationScore !== null ? (
                          <p className="tnum mt-0.5 text-sm text-ink-secondary">
                            Score {report.reputationScore}/100
                            {report.scoreDelta !== null && report.scoreDelta !== 0
                              ? ` · ${report.scoreDelta > 0 ? "+" : ""}${report.scoreDelta} vs previous`
                              : ""}
                          </p>
                        ) : null}
                      </div>

                      {report.status === "READY" ? (
                        <Link
                          href={`/reports/${report.id}`}
                          className="text-sm font-medium text-accent hover:underline"
                        >
                          Open →
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card className="h-fit">
          <CardHeader
            title="Delivery schedule"
            description="Reports are generated and emailed on this schedule."
          />
          <CardBody className="space-y-4">
            {schedules.length === 0 ? (
              <p className="text-sm text-ink-secondary">
                No schedule set up.{" "}
                <Link href="/settings" className="text-accent hover:underline">
                  Configure delivery
                </Link>
              </p>
            ) : (
              schedules.map((schedule) => (
                <div key={schedule.id} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink">
                      {schedule.frequency === "WEEKLY" ? "Weekly" : "Monthly"}
                    </span>
                    <Badge tone={schedule.enabled ? "good" : "neutral"}>
                      {schedule.enabled ? "Enabled" : "Paused"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-ink-secondary">
                    {schedule.frequency === "WEEKLY"
                      ? `Every ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][schedule.dayOfWeek]}`
                      : `Day ${schedule.dayOfMonth} of each month`}{" "}
                    at {String(schedule.hour).padStart(2, "0")}:00
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    To {schedule.recipientEmail}
                    {schedule.lastRunAt
                      ? ` · last sent ${formatDate(schedule.lastRunAt)}`
                      : " · not sent yet"}
                  </p>
                </div>
              ))
            )}

            <Link
              href="/settings"
              className="block text-sm text-accent hover:underline"
            >
              Manage delivery settings →
            </Link>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
