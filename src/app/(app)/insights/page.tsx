import {
  RatingDistributionChart,
  TopicBarChart,
  VolumeChart,
} from "@/components/charts/charts";
import { TopicRow } from "@/components/topic-row";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  NotEnoughData,
  PageHeader,
} from "@/components/ui/primitives";
import { Delta } from "@/components/ui/stat";
import { requireUserOrRedirect } from "@/lib/auth/guards";
import { buildInsights } from "@/lib/insights/build";
import { getActiveBusiness } from "@/lib/session/business";
import { formatPercent, formatRating } from "@/lib/utils";

export const metadata = { title: "Insights" };

export default async function InsightsPage() {
  const user = await requireUserOrRedirect();
  const business = await getActiveBusiness(user.organizationId);
  if (!business) return null;

  const insights = await buildInsights(business.id);

  if (insights.reviews.length === 0) {
    return (
      <>
        <PageHeader title="Insights" />
        <EmptyState
          title="Nothing to analyze yet"
          description="Insights appear once reviews have been ingested and analyzed."
        />
      </>
    );
  }

  const topicChartData = insights.topics30
    .slice(0, 8)
    .map((topic) => ({
      label: topic.label,
      negative: topic.negativeMentions,
      positive: topic.positiveMentions,
    }));

  const ratingBars = ([5, 4, 3, 2, 1] as const).map((rating) => ({
    rating: String(rating),
    count: insights.summary30.ratingDistribution[rating],
  }));

  const comparisons = [
    insights.comparison7,
    insights.comparison30,
    insights.comparison90,
  ];

  return (
    <>
      <PageHeader
        title="Insights"
        description="Themes, trends, and how each window compares with the one before it."
      />

      {/* Trend table: three windows, each against its own previous period. */}
      <Card className="mb-5">
        <CardHeader
          title="Period comparisons"
          description="Each window is compared with the equivalent window immediately before it. A change is only shown when the previous period had data to compare against."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-secondary">
                <th className="px-5 py-2.5 font-medium">Window</th>
                <th className="px-5 py-2.5 font-medium">Reviews</th>
                <th className="px-5 py-2.5 font-medium">Volume change</th>
                <th className="px-5 py-2.5 font-medium">Average rating</th>
                <th className="px-5 py-2.5 font-medium">Rating change</th>
                <th className="px-5 py-2.5 font-medium">Negative rate</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((comparison) => (
                <tr key={comparison.label} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 font-medium text-ink">
                    {comparison.label}
                  </td>
                  <td className="tnum px-5 py-3 text-ink">
                    {comparison.current.count}
                    <span className="text-ink-muted">
                      {" "}
                      / {comparison.previous.count} prior
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {comparison.volumePercent === null ? (
                      <NotEnoughData />
                    ) : (
                      <Delta
                        value={comparison.volumePercent}
                        format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
                      />
                    )}
                  </td>
                  <td className="tnum px-5 py-3 text-ink">
                    {comparison.current.count > 0
                      ? formatRating(comparison.current.averageRating)
                      : "—"}
                  </td>
                  <td className="px-5 py-3">
                    {comparison.ratingDelta === null ? (
                      <NotEnoughData />
                    ) : (
                      <Delta
                        value={comparison.ratingDelta}
                        format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`}
                      />
                    )}
                  </td>
                  <td className="tnum px-5 py-3 text-ink">
                    {comparison.current.analyzedCount > 0
                      ? formatPercent(comparison.current.negativeRate)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Topic mix"
            description="Mentions in the last 30 days, by sentiment."
          />
          <CardBody>
            <TopicBarChart data={topicChartData} />
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Rating distribution"
              description="Last 30 days."
            />
            <CardBody>
              <RatingDistributionChart data={ratingBars} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Review volume"
              description="Monthly, last 12 months."
            />
            <CardBody>
              <VolumeChart data={insights.monthly} />
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Emerging issues"
            description="Negative themes that are new or growing versus the previous 30 days."
          />
          <CardBody className="space-y-4">
            {insights.emerging.length === 0 ? (
              <p className="text-sm text-ink-secondary">
                No negative theme is growing fast enough to flag. Themes with
                fewer than three mentions are not trended at all — the
                percentage would not mean anything.
              </p>
            ) : (
              insights.emerging.map((trend) => (
                <div key={trend.key}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink">
                      {trend.label}
                    </span>
                    <Badge tone={trend.status === "new" ? "warning" : "critical"}>
                      {trend.status === "new" ? "New" : "Growing"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-secondary">
                    {trend.current.negativeMentions} negative mention
                    {trend.current.negativeMentions === 1 ? "" : "s"} this
                    period, compared with{" "}
                    {trend.previous?.negativeMentions ?? 0} in the previous 30
                    days.
                  </p>
                  {trend.current.negativeQuotes[0] ? (
                    <p className="mt-1.5 border-l-2 border-line pl-3 text-sm italic text-ink-secondary">
                      &ldquo;{trend.current.negativeQuotes[0]}&rdquo;
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Improving issues"
            description="Themes attracting fewer complaints than they used to."
          />
          <CardBody className="space-y-4">
            {insights.improving.length === 0 ? (
              <p className="text-sm text-ink-secondary">
                No theme has meaningfully improved against the previous period
                yet.
              </p>
            ) : (
              insights.improving.map((trend) => (
                <div key={trend.key}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink">
                      {trend.label}
                    </span>
                    <Badge tone="good">Improving</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-secondary">
                    Down to {trend.current.negativeMentions} negative mention
                    {trend.current.negativeMentions === 1 ? "" : "s"} from{" "}
                    {trend.previous?.negativeMentions ?? 0}.
                  </p>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top complaints" />
          <CardBody className="space-y-3">
            {insights.negativeTopics.length === 0 ? (
              <p className="text-sm text-ink-secondary">None this period.</p>
            ) : (
              insights.negativeTopics.map((topic) => (
                <TopicRow
                  key={topic.key}
                  topic={topic}
                  trend={insights.comparison30.topics.find((t) => t.key === topic.key)}
                  tone="negative"
                  total={insights.summary30.count}
                />
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Top strengths" />
          <CardBody className="space-y-3">
            {insights.positiveTopics.length === 0 ? (
              <p className="text-sm text-ink-secondary">None this period.</p>
            ) : (
              insights.positiveTopics.map((topic) => (
                <TopicRow
                  key={topic.key}
                  topic={topic}
                  trend={insights.comparison30.topics.find((t) => t.key === topic.key)}
                  tone="positive"
                  total={insights.summary30.count}
                />
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
