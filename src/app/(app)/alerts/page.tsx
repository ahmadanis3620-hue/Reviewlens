import Link from "next/link";

import { AlertActions } from "@/components/alert-actions";
import { AlertRuleForm } from "@/components/alert-rule-form";
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

export const metadata = { title: "Alerts" };

const SEVERITY_TONE = {
  CRITICAL: "critical",
  HIGH: "serious",
  MEDIUM: "warning",
  LOW: "neutral",
} as const;

const RULE_LABELS: Record<string, { title: string; unit: string; help: string }> = {
  NEGATIVE_SPIKE: {
    title: "Negative reviews spike",
    unit: "percentage points",
    help: "Fires when the share of negative reviews rises by more than this against the previous 30 days.",
  },
  RATING_DROP: {
    title: "Rating drop",
    unit: "rating points",
    help: "Fires when the 30-day average rating falls by more than this.",
  },
  NEW_RECURRING_COMPLAINT: {
    title: "New recurring complaint",
    unit: "mentions",
    help: "Fires when a theme reaches this many negative mentions and is growing.",
  },
  CRITICAL_REVIEW: {
    title: "Critical review flagged",
    unit: "reviews",
    help: "Fires when this many reviews mentioning a potential safety, legal, or regulatory issue appear.",
  },
  VOLUME_DROP: {
    title: "Review volume drop",
    unit: "percent",
    help: "Fires when new review volume falls by more than this against the previous 30 days.",
  },
};

export default async function AlertsPage() {
  const user = await requireUserOrRedirect();
  const business = await getActiveBusiness(user.organizationId);
  if (!business) return null;

  const [alerts, rules] = await Promise.all([
    prisma.alert.findMany({
      where: { businessId: business.id },
      orderBy: [{ status: "asc" }, { triggeredAt: "desc" }],
      take: 50,
      select: {
        id: true,
        type: true,
        severity: true,
        title: true,
        message: true,
        status: true,
        triggeredAt: true,
        evidenceReviewIds: true,
        metrics: true,
      },
    }),
    prisma.alertRule.findMany({
      where: { businessId: business.id },
      orderBy: { type: "asc" },
      select: {
        id: true,
        type: true,
        enabled: true,
        threshold: true,
        emailEnabled: true,
      },
    }),
  ]);

  const open = alerts.filter((a) => a.status === "NEW");
  const resolved = alerts.filter((a) => a.status !== "NEW");

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Fired when something changes enough to be worth your attention — and only when the underlying counts support it."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title={`Open alerts (${open.length})`}
            />
            <CardBody className="space-y-4">
              {open.length === 0 ? (
                <p className="text-sm text-ink-secondary">
                  Nothing needs your attention right now.
                </p>
              ) : (
                open.map((alert) => (
                  <div
                    key={alert.id}
                    className="rounded-[var(--radius)] border border-line p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={SEVERITY_TONE[alert.severity]}>
                            <span aria-hidden>
                              {alert.severity === "CRITICAL" ? "▲" : "•"}
                            </span>
                            {alert.severity.charAt(0)}
                            {alert.severity.slice(1).toLowerCase()}
                          </Badge>
                          <span className="text-xs text-ink-muted">
                            {formatDate(alert.triggeredAt)}
                          </span>
                        </div>
                        <h3 className="mt-2 text-[15px] font-semibold text-ink">
                          {alert.title}
                        </h3>
                        <p className="mt-1 text-sm leading-relaxed text-ink-secondary">
                          {alert.message}
                        </p>
                      </div>
                      <AlertActions id={alert.id} />
                    </div>

                    {alert.evidenceReviewIds.length > 0 ? (
                      <Link
                        href="/reviews?days=30&sentiment=NEGATIVE"
                        className="mt-3 inline-block text-sm text-accent hover:underline"
                      >
                        See the {alert.evidenceReviewIds.length} review
                        {alert.evidenceReviewIds.length === 1 ? "" : "s"} behind
                        this →
                      </Link>
                    ) : null}
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          {resolved.length > 0 ? (
            <Card>
              <CardHeader title="Acknowledged and resolved" />
              <CardBody>
                <ul className="divide-y divide-line">
                  {resolved.map((alert) => (
                    <li
                      key={alert.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-ink">{alert.title}</p>
                        <p className="text-xs text-ink-muted">
                          {formatDate(alert.triggeredAt)}
                        </p>
                      </div>
                      <Badge>{alert.status.toLowerCase()}</Badge>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <Card className="h-fit">
          <CardHeader
            title="Alert rules"
            description="Thresholds are per business. Alerts are deduplicated so the same condition does not fire repeatedly."
          />
          <CardBody className="space-y-5">
            {rules.length === 0 ? (
              <EmptyState
                title="No rules yet"
                description="Default rules are created the first time alerts are evaluated."
              />
            ) : (
              rules.map((rule) => (
                <AlertRuleForm
                  key={rule.id}
                  rule={rule}
                  meta={
                    RULE_LABELS[rule.type] ?? {
                      title: rule.type,
                      unit: "",
                      help: "",
                    }
                  }
                />
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
