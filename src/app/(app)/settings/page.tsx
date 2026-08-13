import Link from "next/link";

import { DeleteBusinessForm } from "@/components/delete-business-form";
import { ReportScheduleForm } from "@/components/report-schedule-form";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
} from "@/components/ui/primitives";
import { Meter } from "@/components/ui/stat";
import { requireUserOrRedirect } from "@/lib/auth/guards";
import {
  getMonthlyAnalysisUsage,
  getPlanForOrganization,
} from "@/lib/billing/plans";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getActiveBusiness } from "@/lib/session/business";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUserOrRedirect();
  const business = await getActiveBusiness(user.organizationId);
  if (!business) return null;

  const env = getEnv();

  const [plan, usage, schedules, counts] = await Promise.all([
    getPlanForOrganization(user.organizationId),
    getMonthlyAnalysisUsage(user.organizationId),
    prisma.reportSchedule.findMany({
      where: { businessId: business.id },
      select: {
        frequency: true,
        recipientEmail: true,
        dayOfWeek: true,
        dayOfMonth: true,
        hour: true,
        enabled: true,
      },
    }),
    prisma.business.findUniqueOrThrow({
      where: { id: business.id },
      select: {
        _count: {
          select: { reviews: true, competitors: true, reviewSources: true },
        },
      },
    }),
  ]);

  const weekly = schedules.find((s) => s.frequency === "WEEKLY");
  const monthly = schedules.find((s) => s.frequency === "MONTHLY");

  return (
    <>
      <PageHeader
        title="Settings"
        description={`${business.name} · ${user.organizationName}`}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Report delivery"
            description="Generated and emailed automatically on this schedule."
          />
          <CardBody className="space-y-6">
            <ReportScheduleForm
              businessId={business.id}
              frequency="MONTHLY"
              defaults={monthly ?? { recipientEmail: user.email }}
            />
            <div className="border-t border-line pt-6">
              <ReportScheduleForm
                businessId={business.id}
                frequency="WEEKLY"
                defaults={weekly ?? { recipientEmail: user.email }}
              />
            </div>
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Plan and usage"
              action={<Badge tone="accent">{plan.name}</Badge>}
            />
            <CardBody className="space-y-4">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-ink">AI analyses this month</span>
                  <span className="tnum text-sm text-ink-secondary">
                    {usage} / {plan.maxAnalysesPerMonth}
                  </span>
                </div>
                <Meter
                  value={usage}
                  max={plan.maxAnalysesPerMonth}
                  className="mt-1.5"
                />
              </div>

              <dl className="grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm">
                <div>
                  <dt className="text-ink-muted">Businesses</dt>
                  <dd className="tnum text-ink">
                    1 of {plan.maxBusinesses} allowed
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Competitors</dt>
                  <dd className="tnum text-ink">
                    {counts._count.competitors} of{" "}
                    {plan.maxCompetitorsPerBusiness}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Reviews stored</dt>
                  <dd className="tnum text-ink">{counts._count.reviews}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Connected sources</dt>
                  <dd className="tnum text-ink">{counts._count.reviewSources}</dd>
                </div>
              </dl>

              <p className="border-t border-line pt-4 text-xs text-ink-muted">
                {env.BILLING_ENABLED
                  ? "Billing is enabled."
                  : "Billing is not connected in this deployment. Plan limits are enforced, but no payment is taken."}
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Review sources"
              action={
                <Link
                  href="/settings/sources"
                  className="text-sm text-accent hover:underline"
                >
                  Manage
                </Link>
              }
            />
            <CardBody>
              <p className="text-sm text-ink-secondary">
                {counts._count.reviewSources === 0
                  ? "No sources connected yet."
                  : `${counts._count.reviewSources} source${counts._count.reviewSources === 1 ? "" : "s"} connected.`}
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Analysis engine"
              description="Which provider analyzed your reviews."
            />
            <CardBody className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-secondary">AI provider</span>
                <Badge tone={env.AI_PROVIDER === "openai" ? "good" : "neutral"}>
                  {env.AI_PROVIDER === "openai" && env.OPENAI_API_KEY
                    ? `OpenAI · ${env.OPENAI_MODEL}`
                    : "Built-in analyzer"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-secondary">Email provider</span>
                <Badge>
                  {env.EMAIL_PROVIDER === "resend" && env.RESEND_API_KEY
                    ? "Resend"
                    : "Local outbox"}
                </Badge>
              </div>
              <p className="pt-2 text-xs leading-relaxed text-ink-muted">
                The built-in analyzer reads your review text directly and needs
                no external credentials. Setting OPENAI_API_KEY switches to a
                language model for deeper analysis; the statistics are computed
                the same way either way.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Data and deletion"
              description="Deleting a business removes its reviews, analyses, competitors, alerts, and reports. This cannot be undone."
            />
            <CardBody>
              <DeleteBusinessForm
                businessId={business.id}
                businessName={business.name}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
