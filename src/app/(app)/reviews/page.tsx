import type { Prisma, Sentiment, Urgency } from "@prisma/client";

import { ReviewCard } from "@/components/review-card";
import { ReviewFilters } from "@/components/review-filters";
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { requireUserOrRedirect } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { getActiveBusiness } from "@/lib/session/business";

export const metadata = { title: "Reviews" };

const PAGE_SIZE = 25;

type SearchParams = {
  rating?: string;
  sentiment?: string;
  urgency?: string;
  topic?: string;
  source?: string;
  days?: string;
  page?: string;
};

const SENTIMENTS = new Set(["POSITIVE", "NEUTRAL", "NEGATIVE"]);
const URGENCIES = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

/**
 * Builds the review query from already-validated filter values.
 *
 * Kept out of the component body so the render stays pure — `new Date()` is
 * non-deterministic, and React's purity rules rightly object to calling it
 * during render. The reference time is passed in instead.
 */
function buildReviewWhere(input: {
  businessId: string;
  rating: number | null;
  sentiment: Sentiment | null;
  urgency: Urgency | null;
  topic?: string;
  source?: string;
  days: number | null;
  now: Date;
}): Prisma.ReviewWhereInput {
  const { businessId, rating, sentiment, urgency, topic, source, days, now } =
    input;

  return {
    // The tenant filter is always present, never derived from user input.
    businessId,
    ...(rating && rating >= 1 && rating <= 5 ? { rating } : {}),
    ...(days && days > 0
      ? { reviewedAt: { gte: new Date(now.getTime() - days * 86_400_000) } }
      : {}),
    ...(source ? { reviewSourceId: source } : {}),
    ...(sentiment || urgency || topic
      ? {
          analysis: {
            is: {
              ...(sentiment ? { sentiment } : {}),
              ...(urgency ? { urgency } : {}),
              ...(topic
                ? { mentions: { some: { topic: { key: topic } } } }
                : {}),
            },
          },
        }
      : {}),
  };
}

export default async function ReviewsPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUserOrRedirect();
  const business = await getActiveBusiness(user.organizationId);
  if (!business) return null;

  const params = await props.searchParams;

  // Filters arrive from the query string, so each value is validated against a
  // known set before it reaches the query.
  const rating = params.rating ? Number.parseInt(params.rating, 10) : null;
  const sentiment =
    params.sentiment && SENTIMENTS.has(params.sentiment)
      ? (params.sentiment as Sentiment)
      : null;
  const urgency =
    params.urgency && URGENCIES.has(params.urgency)
      ? (params.urgency as Urgency)
      : null;
  const days = params.days ? Number.parseInt(params.days, 10) : null;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const where = buildReviewWhere({
    businessId: business.id,
    rating,
    sentiment,
    urgency,
    topic: params.topic,
    source: params.source,
    days,
    now: new Date(),
  });

  const [reviews, total, sources, topics] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { reviewedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        rating: true,
        text: true,
        reviewedAt: true,
        reviewerName: true,
        provider: true,
        responseText: true,
        respondedAt: true,
        analysis: {
          select: {
            sentiment: true,
            sentimentScore: true,
            urgency: true,
            summary: true,
            problems: true,
            strengths: true,
            riskFlagged: true,
            riskCategories: true,
            modelProvider: true,
            mentions: {
              select: {
                sentiment: true,
                topic: { select: { key: true, label: true } },
              },
            },
          },
        },
      },
    }),
    prisma.review.count({ where }),
    prisma.reviewSource.findMany({
      where: { businessId: business.id },
      select: { id: true, displayName: true },
    }),
    prisma.reviewTopic.findMany({
      where: { businessId: business.id, mentions: { some: {} } },
      select: { key: true, label: true },
      orderBy: { label: "asc" },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Reviews"
        description={`${total} review${total === 1 ? "" : "s"} matching your filters.`}
      />

      <Card className="mb-5">
        <CardHeader title="Filters" />
        <CardBody>
          <ReviewFilters
            sources={sources}
            topics={topics}
            current={{
              rating: params.rating ?? "",
              sentiment: params.sentiment ?? "",
              urgency: params.urgency ?? "",
              topic: params.topic ?? "",
              source: params.source ?? "",
              days: params.days ?? "",
            }}
          />
        </CardBody>
      </Card>

      {reviews.length === 0 ? (
        <EmptyState
          title="No reviews match"
          description="Try widening the date range or clearing a filter."
        />
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <nav className="mt-6 flex items-center justify-between text-sm">
          <PageLink
            params={params}
            page={page - 1}
            disabled={page <= 1}
            label="← Previous"
          />
          <span className="tnum text-ink-secondary">
            Page {page} of {totalPages}
          </span>
          <PageLink
            params={params}
            page={page + 1}
            disabled={page >= totalPages}
            label="Next →"
          />
        </nav>
      ) : null}
    </>
  );
}

function PageLink({
  params,
  page,
  disabled,
  label,
}: {
  params: SearchParams;
  page: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return <span className="text-ink-muted">{label}</span>;
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") query.set(key, value);
  }
  query.set("page", String(page));

  return (
    <a href={`/reviews?${query.toString()}`} className="text-accent hover:underline">
      {label}
    </a>
  );
}
