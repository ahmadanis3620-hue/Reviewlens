import type { Sentiment, Urgency } from "@prisma/client";

import { SuggestedResponse } from "@/components/suggested-response";
import { Badge, Card, CardBody, Stars } from "@/components/ui/primitives";
import { formatDate } from "@/lib/utils";

/**
 * One review with everything the analysis found in it.
 *
 * The suggested reply is explicitly a draft: it is behind a disclosure, labelled
 * as unpublished, and there is no control anywhere that posts it. Publishing a
 * public statement on a business's behalf is not a decision to automate.
 */

type ReviewWithAnalysis = {
  id: string;
  rating: number;
  text: string;
  reviewedAt: Date;
  reviewerName: string | null;
  provider: string;
  responseText: string | null;
  respondedAt: Date | null;
  analysis: {
    sentiment: Sentiment;
    sentimentScore: number;
    urgency: Urgency;
    summary: string;
    problems: string[];
    strengths: string[];
    riskFlagged: boolean;
    riskCategories: string[];
    modelProvider: string;
    mentions: Array<{
      sentiment: Sentiment;
      topic: { key: string; label: string };
    }>;
  } | null;
};

const SENTIMENT_TONE = {
  POSITIVE: "good",
  NEUTRAL: "neutral",
  NEGATIVE: "critical",
} as const;

const URGENCY_TONE = {
  LOW: "neutral",
  MEDIUM: "warning",
  HIGH: "serious",
  CRITICAL: "critical",
} as const;

export function ReviewCard({ review }: { review: ReviewWithAnalysis }) {
  const analysis = review.analysis;

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Stars rating={review.rating} />
            <span className="text-sm text-ink-secondary">
              {review.reviewerName ?? "Anonymous"}
            </span>
            <span aria-hidden className="text-ink-muted">
              ·
            </span>
            <span className="text-sm text-ink-muted">
              {formatDate(review.reviewedAt)}
            </span>
          </div>
          <Badge>{review.provider.replace(/_/g, " ").toLowerCase()}</Badge>
        </div>

        <p className="text-sm leading-relaxed text-ink">{review.text}</p>

        {analysis ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={SENTIMENT_TONE[analysis.sentiment]}>
                {analysis.sentiment.charAt(0)}
                {analysis.sentiment.slice(1).toLowerCase()}
              </Badge>
              <Badge tone={URGENCY_TONE[analysis.urgency]}>
                <span aria-hidden>
                  {analysis.urgency === "CRITICAL" || analysis.urgency === "HIGH"
                    ? "▲"
                    : "•"}
                </span>
                {analysis.urgency.charAt(0)}
                {analysis.urgency.slice(1).toLowerCase()} urgency
              </Badge>
              {analysis.mentions.map((mention) => (
                <Badge
                  key={mention.topic.key}
                  tone={mention.sentiment === "NEGATIVE" ? "critical" : "neutral"}
                >
                  {mention.topic.label}
                </Badge>
              ))}
            </div>

            {analysis.riskFlagged ? (
              <div className="rounded-[var(--radius)] border border-critical/30 bg-critical-soft px-3 py-2">
                <p className="text-sm font-medium text-critical">
                  <span aria-hidden className="mr-1.5">
                    ▲
                  </span>
                  Flagged for your attention
                </p>
                <p className="mt-1 text-sm text-ink-secondary">
                  This review mentions {analysis.riskCategories.join(", ") || "a potential issue"}.
                  ReputeIQ flags this for a person to read — it does not assess
                  legal or medical claims.
                </p>
              </div>
            ) : null}

            {analysis.problems.length > 0 ? (
              <div>
                <p className="text-xs font-medium tracking-[0.04em] text-ink-muted uppercase">
                  Detected issues
                </p>
                <ul className="mt-1.5 space-y-1">
                  {analysis.problems.map((problem, index) => (
                    <li key={index} className="text-sm text-ink-secondary">
                      &ldquo;{problem}&rdquo;
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {analysis.strengths.length > 0 ? (
              <div>
                <p className="text-xs font-medium tracking-[0.04em] text-ink-muted uppercase">
                  What went well
                </p>
                <ul className="mt-1.5 space-y-1">
                  {analysis.strengths.map((strength, index) => (
                    <li key={index} className="text-sm text-ink-secondary">
                      &ldquo;{strength}&rdquo;
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {review.responseText ? (
              <div className="border-l-2 border-line pl-3">
                <p className="text-xs font-medium tracking-[0.04em] text-ink-muted uppercase">
                  Your published response
                  {review.respondedAt ? ` · ${formatDate(review.respondedAt)}` : ""}
                </p>
                <p className="mt-1 text-sm text-ink-secondary">
                  {review.responseText}
                </p>
              </div>
            ) : (
              <SuggestedResponse reviewId={review.id} />
            )}

            <p className="text-xs text-ink-muted">
              Analyzed by {analysis.modelProvider} · sentiment score{" "}
              <span className="tnum">{analysis.sentimentScore.toFixed(2)}</span>
            </p>
          </>
        ) : (
          <p className="text-xs text-ink-muted">
            Not analyzed yet. Analysis runs in the background.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
