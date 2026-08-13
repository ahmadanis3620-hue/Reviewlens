import Link from "next/link";
import { notFound } from "next/navigation";

import { ReportSectionView } from "@/components/report-section";
import { SendReportButton } from "@/components/send-report-button";
import {
  Badge,
  Card,
  CardBody,
  PageHeader,
} from "@/components/ui/primitives";
import { assertReportAccess, requireUserOrRedirect } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";
import { formatWindowLabel } from "@/lib/analytics/windows";

export const metadata = { title: "Report" };

export default async function ReportPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUserOrRedirect();
  const { id } = await props.params;

  // The id comes from the URL — verify it belongs to this organization before
  // loading anything.
  try {
    await assertReportAccess(id, user.organizationId);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  const report = await prisma.report.findUnique({
    where: { id },
    include: {
      sections: { orderBy: { order: "asc" } },
      business: { select: { name: true, id: true } },
    },
  });

  if (!report) notFound();

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={`${report.type === "WEEKLY" ? "Weekly" : "Monthly"} report`}
          description={`${report.business.name} · ${formatWindowLabel({ start: report.periodStart, end: report.periodEnd })}`}
          action={
            <div className="flex items-center gap-2">
              <SendReportButton reportId={report.id} defaultEmail={user.email} />
              <Link
                href="/reports"
                className="text-sm text-accent hover:underline"
              >
                All reports
              </Link>
            </div>
          }
        />
      </div>

      {report.status !== "READY" ? (
        <Card>
          <CardBody>
            <Badge tone={report.status === "FAILED" ? "critical" : "warning"}>
              {report.status.toLowerCase()}
            </Badge>
            <p className="mt-2 text-sm text-ink-secondary">
              {report.error ?? "This report is still being generated."}
            </p>
          </CardBody>
        </Card>
      ) : (
        <article className="mx-auto max-w-3xl space-y-5">
          <header className="hidden print:block">
            <h1 className="text-2xl font-semibold">{report.business.name}</h1>
            <p className="text-sm">
              {report.type === "WEEKLY" ? "Weekly" : "Monthly"} reputation report ·{" "}
              {formatWindowLabel({ start: report.periodStart, end: report.periodEnd })}
            </p>
          </header>

          {report.sections.map((section) => (
            <ReportSectionView key={section.id} section={section} />
          ))}

          <p className="text-xs leading-relaxed text-ink-muted">
            Every figure in this report is computed from the reviews in the
            period shown. ReputeIQ flags reviews that may warrant attention but
            does not provide legal, medical, or financial advice, and makes no
            guarantee of any particular business outcome.
          </p>
        </article>
      )}
    </>
  );
}
