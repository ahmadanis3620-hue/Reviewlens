import { AddCompetitorForm } from "@/components/add-competitor-form";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Stars,
} from "@/components/ui/primitives";
import { Meter } from "@/components/ui/stat";
import { requireUserOrRedirect } from "@/lib/auth/guards";
import { compareToCompetitors } from "@/lib/analytics/competitors";
import { loadCompetitorSnapshots } from "@/lib/analytics/load";
import { buildInsights } from "@/lib/insights/build";
import { getActiveBusiness } from "@/lib/session/business";
import { formatPercent } from "@/lib/utils";

export const metadata = { title: "Competitors" };

export default async function CompetitorsPage() {
  const user = await requireUserOrRedirect();
  const business = await getActiveBusiness(user.organizationId);
  if (!business) return null;

  const [insights, competitors] = await Promise.all([
    buildInsights(business.id),
    loadCompetitorSnapshots(business.id),
  ]);

  const comparison = compareToCompetitors({
    businessSummary: insights.summary30,
    businessTopics: insights.topics30,
    competitors,
  });

  return (
    <>
      <PageHeader
        title="Competitors"
        description="Comparisons use each side's own review base, so a competitor with more volume does not automatically look worse."
      />

      <Card className="mb-5">
        <CardHeader title="Add a competitor" />
        <CardBody>
          <AddCompetitorForm businessId={business.id} />
        </CardBody>
      </Card>

      {comparison.profiles.length === 0 ? (
        <EmptyState
          title="No competitors tracked"
          description="Add one or two nearby businesses to see where your reputation genuinely differs from theirs."
        />
      ) : (
        <>
          <Card className="mb-5">
            <CardHeader
              title="Ratings"
              description="Published rating where the provider supplies one; otherwise the average over the reviews we hold, labelled as a sample."
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-ink-secondary">
                    <th className="px-5 py-2.5 font-medium">Business</th>
                    <th className="px-5 py-2.5 font-medium">Rating</th>
                    <th className="px-5 py-2.5 font-medium">Reviews</th>
                    <th className="px-5 py-2.5 font-medium">Negative rate</th>
                    <th className="px-5 py-2.5 font-medium">Praised for</th>
                    <th className="px-5 py-2.5 font-medium">Criticized for</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-line bg-accent-soft/40">
                    <td className="px-5 py-3 font-medium text-ink">
                      {business.name}
                      <Badge tone="accent" className="ml-2">
                        You
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      {insights.summary30.count > 0 ? (
                        <Stars rating={insights.summary30.averageRating} />
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="tnum px-5 py-3 text-ink">
                      {insights.summary30.count}
                      <span className="text-ink-muted"> in 30d</span>
                    </td>
                    <td className="tnum px-5 py-3 text-ink">
                      {insights.summary30.analyzedCount > 0
                        ? formatPercent(insights.summary30.negativeRate)
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">
                      {insights.positiveTopics
                        .slice(0, 2)
                        .map((t) => t.label)
                        .join(", ") || "—"}
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">
                      {insights.negativeTopics
                        .slice(0, 2)
                        .map((t) => t.label)
                        .join(", ") || "—"}
                    </td>
                  </tr>

                  {comparison.profiles.map((profile) => (
                    <tr key={profile.id} className="border-b border-line last:border-0">
                      <td className="px-5 py-3 font-medium text-ink">
                        {profile.name}
                      </td>
                      <td className="px-5 py-3">
                        {profile.publishedRating !== null ? (
                          <Stars rating={profile.publishedRating} />
                        ) : profile.sampleRating !== null ? (
                          <span className="flex items-center gap-2">
                            <Stars rating={profile.sampleRating} />
                            <Badge>sample</Badge>
                          </span>
                        ) : (
                          <span className="text-sm text-ink-muted">
                            No source connected
                          </span>
                        )}
                      </td>
                      <td className="tnum px-5 py-3 text-ink">
                        {profile.publishedReviewCount ?? profile.sampleSize ?? "—"}
                      </td>
                      <td className="tnum px-5 py-3 text-ink">
                        {profile.negativeRate !== null
                          ? formatPercent(profile.negativeRate)
                          : "—"}
                      </td>
                      <td className="px-5 py-3 text-ink-secondary">
                        {profile.topPositiveTopics.join(", ") || "—"}
                      </td>
                      <td className="px-5 py-3 text-ink-secondary">
                        {profile.topNegativeTopics.join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {comparison.thin ? (
            <Card>
              <CardBody>
                <p className="text-sm text-ink-secondary">
                  There is not yet enough competitor review data to compare
                  themes reliably. Topic comparisons appear once a competitor
                  source is connected and has enough reviews to be worth
                  reading — showing a comparison built on a handful of reviews
                  would be worse than showing none.
                </p>
              </CardBody>
            </Card>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader
                  title="Where you lag"
                  description="Topics you attract proportionally more complaints about than the competitor set."
                />
                <CardBody className="space-y-4">
                  {comparison.weaknesses.length === 0 ? (
                    <p className="text-sm text-ink-secondary">
                      No topic where you attract materially more complaints.
                    </p>
                  ) : (
                    comparison.weaknesses.map((divergence) => (
                      <DivergenceRow
                        key={divergence.topicKey}
                        divergence={divergence}
                        tone="critical"
                      />
                    ))
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Where you lead"
                  description="Topics you attract proportionally fewer complaints about."
                />
                <CardBody className="space-y-4">
                  {comparison.strengths.length === 0 ? (
                    <p className="text-sm text-ink-secondary">
                      No topic where you attract materially fewer complaints.
                    </p>
                  ) : (
                    comparison.strengths.map((divergence) => (
                      <DivergenceRow
                        key={divergence.topicKey}
                        divergence={divergence}
                        tone="good"
                      />
                    ))
                  )}
                </CardBody>
              </Card>
            </div>
          )}
        </>
      )}
    </>
  );
}

function DivergenceRow({
  divergence,
  tone,
}: {
  divergence: {
    topicKey: string;
    topicLabel: string;
    businessNegativeShare: number;
    competitorNegativeShare: number;
  };
  tone: "critical" | "good";
}) {
  const max = Math.max(
    divergence.businessNegativeShare,
    divergence.competitorNegativeShare,
    0.01,
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{divergence.topicLabel}</span>
        <Badge tone={tone}>
          {tone === "critical" ? "You complain-rate higher" : "You complain-rate lower"}
        </Badge>
      </div>

      <div className="mt-2 space-y-1.5">
        <div className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-xs text-ink-secondary">You</span>
          <Meter
            value={divergence.businessNegativeShare}
            max={max}
            tone={tone === "critical" ? "critical" : "accent"}
          />
          <span className="tnum w-12 shrink-0 text-right text-xs text-ink">
            {formatPercent(divergence.businessNegativeShare, 1)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-xs text-ink-secondary">
            Competitors
          </span>
          <Meter
            value={divergence.competitorNegativeShare}
            max={max}
            tone="neutral"
          />
          <span className="tnum w-12 shrink-0 text-right text-xs text-ink">
            {formatPercent(divergence.competitorNegativeShare, 1)}
          </span>
        </div>
      </div>
    </div>
  );
}
