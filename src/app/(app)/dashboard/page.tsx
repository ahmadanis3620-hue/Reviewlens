import Link from "next/link";

import {
  RatingTrendChart,
  SentimentMixChart,
} from "@/components/charts/charts";
import { ScoreBreakdown } from "@/components/score-breakdown";
import { TopicRow } from "@/components/topic-row";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Stars,
} from "@/components/ui/primitives";
import { Stat } from "@/components/ui/stat";
import { requireUserOrRedirect } from "@/lib/auth/guards";
import { compareToCompetitors } from "@/lib/analytics/competitors";
import { loadCompetitorSnapshots } from "@/lib/analytics/load";
import { prisma } from "@/lib/db";
import { buildInsights } from "@/lib/insights/build";
import { getActiveBusiness } from "@/lib/session/business";
import { formatPercent, formatRating } from "@/lib/utils";

export const metadata = { title: "Overview" };

export default async function DashboardPage() {
  const user = await requireUserOrRedirect();
  const business = await getActiveBusiness(user.organizationId);
  if (!business) return null;

  const insights = await buildInsights(business.id);
  const [competitors, recommendations, openAlerts] = await Promise.all([
    loadCompetitorSnapshots(business.id),
    prisma.recommendation.findMany({
      where: { businessId: business.id, status: "OPEN" },
      orderBy: [{ priority: "desc" }, { generatedAt: "desc" }],
      take: 3,
      select: { id: true, title: true, priority: true, action: true },
    }),
    prisma.alert.count({ where: { businessId: business.id, status: "NEW" } }),
  ]);

  const comparison = compareToCompetitors({
    businessSummary: insights.summary30,
    businessTopics: insights.topics30,
    competitors,
  });

  if (insights.summary30.count === 0 && insights.reviews.length === 0) {
    return (
      <>
        <PageHeader title={business.name} />
        <EmptyState
          title="No reviews yet"
          description="Once a review source is connected and synced, your dashboard fills in automatically."
          action={
            <Link
              href="/settings/sources"
              className="text-sm font-medium text-accent hover:underline"
            >
              Connect a review source
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={business.name}
        description={`${business.industry} · last 30 days`}
        action={
          openAlerts > 0 ? (
            <Link href="/alerts">
              <Badge tone="critical">
                {openAlerts} open alert{openAlerts === 1 ? "" : "s"}
              </Badge>
            </Link>
          ) : null
        }
      />

      {/* The score is a single number, so it is a stat, not a chart. The score
          card is tall, so the right column carries the stat row *and* a chart
          to keep the row visually balanced. */}
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Reputation score" />
          <CardBody>
            <ScoreBreakdown score={insights.score} delta={insights.scoreDelta} />
          </CardBody>
        </Card>

        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title="Last 30 days"
              description="Compared with the previous 30 days."
            />
            <div className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
              <Stat
                label="Average rating"
                value={
                  insights.summary30.count > 0
                    ? formatRating(insights.summary30.averageRating)
                    : "—"
                }
                delta={insights.comparison30.ratingDelta}
                deltaLabel="vs previous"
              />
              <Stat
                label="Reviews"
                value={insights.summary30.count}
                delta={
                  insights.comparison30.previous.count > 0
                    ? insights.comparison30.volumeDelta
                    : null
                }
                deltaLabel="vs previous"
              />
              <Stat
                label="Positive"
                value={
                  insights.summary30.analyzedCount > 0
                    ? formatPercent(insights.summary30.positiveRate)
                    : "—"
                }
                footnote={`${insights.summary30.positive} of ${insights.summary30.analyzedCount} analyzed`}
              />
              <Stat
                label="Negative"
                value={
                  insights.summary30.analyzedCount > 0
                    ? formatPercent(insights.summary30.negativeRate)
                    : "—"
                }
                higherIsBetter={false}
                footnote={`${insights.summary30.negative} of ${insights.summary30.analyzedCount} analyzed`}
              />
            </div>
          </Card>

          {/* Rating and volume never share an axis — this chart plots rating
              alone, and volume gets its own on the Insights page. */}
          <Card>
            <CardHeader
              title="Average rating over time"
              description="Monthly average, last 12 months."
            />
            <CardBody>
              <RatingTrendChart data={insights.monthly} />
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Top issues"
            description="Themes drawing the most criticism in the last 30 days."
            action={
              <Link href="/insights" className="text-sm text-accent hover:underline">
                All insights
              </Link>
            }
          />
          <CardBody className="space-y-3">
            {insights.negativeTopics.length === 0 ? (
              <p className="text-sm text-ink-secondary">
                No theme drew sustained criticism this period.
              </p>
            ) : (
              insights.negativeTopics.slice(0, 4).map((topic) => (
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
          <CardHeader
            title="Customers love"
            description="Themes drawing the most praise in the last 30 days."
          />
          <CardBody className="space-y-3">
            {insights.positiveTopics.length === 0 ? (
              <p className="text-sm text-ink-secondary">
                No clearly positive theme stands out this period.
              </p>
            ) : (
              insights.positiveTopics.slice(0, 4).map((topic) => (
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

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Sentiment mix over time"
            description="Analyzed reviews per month by sentiment."
          />
          <CardBody>
            <SentimentMixChart
              data={insights.monthly.map((m) => ({
                month: m.month,
                positive: m.positive,
                neutral: Math.max(0, m.reviewCount - m.positive - m.negative),
                negative: m.negative,
              }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Competitor position"
            action={
              <Link href="/competitors" className="text-sm text-accent hover:underline">
                Compare
              </Link>
            }
          />
          <CardBody>
            {comparison.profiles.length === 0 ? (
              <p className="text-sm text-ink-secondary">
                No competitors added yet. Adding one or two nearby businesses
                shows where your reputation genuinely differs.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink">Your rating</span>
                  <Stars rating={insights.summary30.averageRating} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink-secondary">
                    Competitor average
                  </span>
                  {comparison.competitorAverageRating === null ? (
                    <span className="text-sm text-ink-muted">
                      No rating available
                    </span>
                  ) : (
                    <Stars rating={comparison.competitorAverageRating} />
                  )}
                </div>
                {comparison.weaknesses[0] ? (
                  <p className="border-t border-line pt-3 text-sm text-ink-secondary">
                    You attract proportionally more complaints about{" "}
                    <span className="font-medium text-ink">
                      {comparison.weaknesses[0].topicLabel.toLowerCase()}
                    </span>{" "}
                    than the competitors you track.
                  </p>
                ) : null}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* The conclusion of the page: what to actually do. Full width so the
          actions read as the takeaway rather than a sidebar. */}
      <div className="mt-5">
        <Card>
          <CardHeader
            title="Recommended actions"
            action={
              <Link
                href="/recommendations"
                className="text-sm text-accent hover:underline"
              >
                All recommendations
              </Link>
            }
          />
          <CardBody>
            {recommendations.length === 0 ? (
              <p className="text-sm text-ink-secondary">
                No open recommendations. They are regenerated whenever insights
                refresh.
              </p>
            ) : (
              <ol className="space-y-3">
                {recommendations.map((rec, index) => (
                  <li key={rec.id} className="flex gap-3">
                    <span className="tnum text-sm font-semibold text-accent">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{rec.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-ink-secondary">
                        {rec.action}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
