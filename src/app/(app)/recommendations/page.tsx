import Link from "next/link";

import { RecommendationActions } from "@/components/recommendation-actions";
import { RegenerateButton } from "@/components/regenerate-button";
import {
  Badge,
  Card,
  CardBody,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { requireUserOrRedirect } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { getActiveBusiness } from "@/lib/session/business";
import { formatDateRange } from "@/lib/utils";

export const metadata = { title: "Recommendations" };

const PRIORITY_TONE = {
  CRITICAL: "critical",
  HIGH: "serious",
  MEDIUM: "warning",
  LOW: "neutral",
} as const;

type Metrics = {
  mentions?: number | null;
  negativeMentions?: number | null;
  positiveMentions?: number | null;
  trendPercent?: number | null;
  negativeTrendPercent?: number | null;
  previousNegativeMentions?: number | null;
  reviewsInPeriod?: number | null;
};

export default async function RecommendationsPage() {
  const user = await requireUserOrRedirect();
  const business = await getActiveBusiness(user.organizationId);
  if (!business) return null;

  const recommendations = await prisma.recommendation.findMany({
    where: { businessId: business.id },
    orderBy: [{ status: "asc" }, { priority: "desc" }, { generatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      problem: true,
      action: true,
      rationale: true,
      priority: true,
      expectedImpact: true,
      status: true,
      topicKey: true,
      evidenceReviewIds: true,
      metrics: true,
      periodStart: true,
      periodEnd: true,
    },
  });

  return (
    <>
      <PageHeader
        title="Recommendations"
        description="Specific operational changes, ranked. Every one links back to the reviews that justify it."
        action={<RegenerateButton businessId={business.id} />}
      />

      {recommendations.length === 0 ? (
        <EmptyState
          title="No recommendations yet"
          description="Recommendations are generated from analyzed reviews. Once enough reviews carry a recurring theme, they appear here."
        />
      ) : (
        <div className="space-y-4">
          {recommendations.map((rec) => {
            const metrics = (rec.metrics as Metrics | null) ?? {};

            return (
              <Card key={rec.id} className={rec.status !== "OPEN" ? "opacity-70" : ""}>
                <CardBody className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-[15px] font-semibold text-ink">
                        {rec.title}
                      </h2>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {formatDateRange(rec.periodStart, rec.periodEnd)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={PRIORITY_TONE[rec.priority]}>
                        <span aria-hidden>
                          {rec.priority === "CRITICAL" || rec.priority === "HIGH"
                            ? "▲"
                            : "•"}
                        </span>
                        {rec.priority.charAt(0)}
                        {rec.priority.slice(1).toLowerCase()} priority
                      </Badge>
                      {rec.status !== "OPEN" ? (
                        <Badge>{rec.status.replace("_", " ").toLowerCase()}</Badge>
                      ) : null}
                    </div>
                  </div>

                  <Section label="Problem">{rec.problem}</Section>
                  <Section label="Recommendation">{rec.action}</Section>
                  <Section label="Why">{rec.rationale}</Section>

                  {/* Figures come from the analytics layer, never from generated
                      text — this block is rendered from structured fields. */}
                  <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3">
                    <Metric
                      label="Negative mentions"
                      value={metrics.negativeMentions}
                      previous={metrics.previousNegativeMentions}
                    />
                    <Metric label="Total mentions" value={metrics.mentions} />
                    <Metric
                      label="Reviews in period"
                      value={metrics.reviewsInPeriod}
                    />
                    <div>
                      <p className="text-xs text-ink-muted">Expected impact</p>
                      <p className="text-sm text-ink">{rec.expectedImpact}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {rec.evidenceReviewIds.length > 0 && rec.topicKey ? (
                      <Link
                        href={`/reviews?topic=${encodeURIComponent(rec.topicKey)}&days=30`}
                        className="text-sm text-accent hover:underline"
                      >
                        See the {rec.evidenceReviewIds.length} review
                        {rec.evidenceReviewIds.length === 1 ? "" : "s"} behind this
                        →
                      </Link>
                    ) : (
                      <span />
                    )}
                    <RecommendationActions id={rec.id} status={rec.status} />
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-6 max-w-3xl text-xs leading-relaxed text-ink-muted">
        Expected impact is a qualitative judgement about how much of your review
        volume a theme touches. ReputeIQ does not predict revenue and does not
        claim that any action will produce a specific financial outcome.
      </p>
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-[0.04em] text-ink-muted uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-ink">{children}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  previous,
}: {
  label: string;
  value?: number | null;
  previous?: number | null;
}) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="tnum text-sm text-ink">
        {value}
        {previous !== null && previous !== undefined ? (
          <span className="text-ink-muted"> from {previous}</span>
        ) : null}
      </p>
    </div>
  );
}
