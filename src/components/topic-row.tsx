import Link from "next/link";

import { Badge, NotEnoughData } from "@/components/ui/primitives";
import { Meter } from "@/components/ui/stat";
import type { TopicAggregate, TopicTrend } from "@/lib/analytics/types";

/**
 * One theme, with its counts, its trend, and a link to the reviews behind it.
 *
 * The trend renders as "Not enough data" rather than a percentage whenever the
 * counts are too small for a percentage to mean anything — which is the whole
 * point of the threshold in the trend layer.
 */
export function TopicRow({
  topic,
  trend,
  tone,
  total,
}: {
  topic: TopicAggregate;
  trend?: TopicTrend;
  tone: "positive" | "negative";
  total: number;
}) {
  const relevant =
    tone === "negative" ? topic.negativeMentions : topic.positiveMentions;
  const trendPercent = trend?.trendPercent ?? null;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link
          href={`/reviews?topic=${encodeURIComponent(topic.key)}`}
          className="text-sm font-medium text-ink hover:text-accent hover:underline"
        >
          {topic.label}
        </Link>

        <div className="flex items-center gap-2">
          <span className="tnum text-sm text-ink-secondary">
            {relevant} {tone}
          </span>
          {trendPercent === null ? (
            <NotEnoughData />
          ) : (
            <Badge
              tone={
                // A rising negative theme is bad; a rising positive one is good.
                (tone === "negative" ? trendPercent > 0 : trendPercent < 0)
                  ? "critical"
                  : "good"
              }
            >
              {trendPercent > 0 ? "+" : ""}
              {trendPercent.toFixed(0)}%
            </Badge>
          )}
        </div>
      </div>

      <Meter
        value={relevant}
        max={Math.max(total, 1)}
        tone={tone === "negative" ? "critical" : "accent"}
        className="mt-1.5"
      />

      <p className="mt-1 text-xs text-ink-muted">
        {topic.mentions} total mention{topic.mentions === 1 ? "" : "s"} across{" "}
        {topic.evidenceReviewIds.length} review
        {topic.evidenceReviewIds.length === 1 ? "" : "s"}
        {trend?.previous
          ? ` · ${trend.previous.mentions} in the previous period`
          : ""}
      </p>
    </div>
  );
}
