import type { ReportSection } from "@prisma/client";

import { Card, CardBody, CardHeader, NotEnoughData } from "@/components/ui/primitives";
import { Meter } from "@/components/ui/stat";
import { formatPercent } from "@/lib/utils";

/**
 * Renders one stored report section.
 *
 * The narrative comes from `body` (generated prose that already passed the
 * numeric guard); every figure comes from `data` (computed by the analytics
 * layer). The two are never mixed, which is why nothing here parses numbers out
 * of text.
 */

type SectionData = Record<string, unknown>;

export function ReportSectionView({ section }: { section: ReportSection }) {
  const data = (section.data as SectionData | null) ?? {};

  return (
    <Card>
      <CardHeader title={section.title} />
      <CardBody className="space-y-4">
        {section.body ? (
          <p className="text-sm leading-relaxed text-ink">{section.body}</p>
        ) : null}
        <SectionExtras sectionKey={section.key} data={data} />
      </CardBody>
    </Card>
  );
}

function SectionExtras({
  sectionKey,
  data,
}: {
  sectionKey: string;
  data: SectionData;
}) {
  switch (sectionKey) {
    case "reputation-score":
      return <ScoreExtras data={data} />;
    case "review-performance":
      return <PerformanceExtras data={data} />;
    case "customers-love":
      return <TopicExtras data={data} tone="positive" />;
    case "biggest-problems":
      return <TopicExtras data={data} tone="negative" />;
    case "emerging-issues":
      return <EmergingExtras data={data} />;
    case "recommended-actions":
      return <RecommendationExtras data={data} />;
    case "trends":
      return <TrendExtras data={data} />;
    default:
      return null;
  }
}

function ScoreExtras({ data }: { data: SectionData }) {
  const components =
    (data.components as Array<{
      key: string;
      label: string;
      earned: number;
      max: number;
      detail: string;
    }>) ?? [];

  if (components.length === 0) return null;

  return (
    <dl className="space-y-3">
      {components.map((component) => (
        <div key={component.key}>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-sm text-ink">{component.label}</dt>
            <dd className="tnum text-sm text-ink-secondary">
              {component.earned.toFixed(1)}
              <span className="text-ink-muted"> / {component.max}</span>
            </dd>
          </div>
          <Meter value={component.earned} max={component.max} className="mt-1.5" />
          <p className="mt-1 text-xs text-ink-muted">{component.detail}</p>
        </div>
      ))}
    </dl>
  );
}

function PerformanceExtras({ data }: { data: SectionData }) {
  const stats = [
    { label: "Reviews", value: String(data.count ?? 0) },
    {
      label: "Average rating",
      value:
        typeof data.averageRating === "number"
          ? data.averageRating.toFixed(2)
          : "—",
    },
    {
      label: "Positive",
      value:
        typeof data.positiveRate === "number"
          ? formatPercent(data.positiveRate)
          : "—",
    },
    {
      label: "Negative",
      value:
        typeof data.negativeRate === "number"
          ? formatPercent(data.negativeRate)
          : "—",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label}>
          <p className="text-xs text-ink-muted">{stat.label}</p>
          <p className="tnum mt-0.5 text-lg font-semibold text-ink">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}

function TopicExtras({
  data,
  tone,
}: {
  data: SectionData;
  tone: "positive" | "negative";
}) {
  const topics =
    (data.topics as Array<{
      label: string;
      mentions: number;
      negativeMentions?: number;
      positiveMentions?: number;
      trendPercent?: number | null;
      previousNegativeMentions?: number | null;
      quotes?: string[];
    }>) ?? [];

  if (topics.length === 0) return null;

  return (
    <div className="space-y-4">
      {topics.map((topic) => {
        const relevant =
          tone === "negative"
            ? (topic.negativeMentions ?? 0)
            : (topic.positiveMentions ?? 0);

        return (
          <div
            key={topic.label}
            className={`border-l-2 pl-3 ${tone === "negative" ? "border-negative" : "border-positive"}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-ink">{topic.label}</span>
              <span className="tnum text-sm text-ink-secondary">
                {relevant} {tone} of {topic.mentions} mention
                {topic.mentions === 1 ? "" : "s"}
              </span>
            </div>

            {tone === "negative" ? (
              <p className="mt-0.5 text-xs text-ink-muted">
                {typeof topic.trendPercent === "number" ? (
                  <>
                    {topic.trendPercent > 0 ? "Up" : "Down"}{" "}
                    {Math.abs(topic.trendPercent).toFixed(0)}% versus the previous
                    period
                    {typeof topic.previousNegativeMentions === "number"
                      ? ` (${topic.previousNegativeMentions} negative mentions then)`
                      : ""}
                  </>
                ) : (
                  <NotEnoughData />
                )}
              </p>
            ) : null}

            {topic.quotes?.[0] ? (
              <p className="mt-1.5 text-sm italic text-ink-secondary">
                &ldquo;{topic.quotes[0]}&rdquo;
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function EmergingExtras({ data }: { data: SectionData }) {
  const emerging =
    (data.emerging as Array<{
      label: string;
      negativeMentions: number;
      previousNegativeMentions: number;
    }>) ?? [];
  const improving =
    (data.improving as Array<{
      label: string;
      negativeMentions: number;
      previousNegativeMentions: number;
    }>) ?? [];

  if (emerging.length === 0 && improving.length === 0) return null;

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {emerging.length > 0 ? (
        <div>
          <p className="text-xs font-medium tracking-[0.04em] text-ink-muted uppercase">
            Growing
          </p>
          <ul className="mt-2 space-y-1.5">
            {emerging.map((item) => (
              <li key={item.label} className="text-sm text-ink-secondary">
                <span className="font-medium text-ink">{item.label}</span> —{" "}
                {item.negativeMentions} negative, was {item.previousNegativeMentions}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {improving.length > 0 ? (
        <div>
          <p className="text-xs font-medium tracking-[0.04em] text-ink-muted uppercase">
            Improving
          </p>
          <ul className="mt-2 space-y-1.5">
            {improving.map((item) => (
              <li key={item.label} className="text-sm text-ink-secondary">
                <span className="font-medium text-ink">{item.label}</span> —{" "}
                {item.negativeMentions} negative, was {item.previousNegativeMentions}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function RecommendationExtras({ data }: { data: SectionData }) {
  const items =
    (data.recommendations as Array<{
      title: string;
      action: string;
      rationale: string;
      priority: string;
      expectedImpact: string;
    }>) ?? [];

  if (items.length === 0) return null;

  return (
    <ol className="space-y-4">
      {items.map((item, index) => (
        <li key={item.title} className="flex gap-3">
          <span className="tnum text-sm font-semibold text-accent">{index + 1}</span>
          <div>
            <p className="text-sm font-medium text-ink">
              {item.title}
              <span className="ml-2 text-xs font-normal text-ink-muted">
                {item.priority.toLowerCase()} priority · {item.expectedImpact}
              </span>
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-secondary">
              {item.action}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function TrendExtras({ data }: { data: SectionData }) {
  const windows =
    (data.windows as Array<{
      label: string;
      currentCount: number;
      previousCount: number;
      volumePercent: number | null;
      currentRating: number;
      previousRating: number;
      ratingDelta: number | null;
    }>) ?? [];

  if (windows.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-ink-secondary">
            <th className="py-2 pr-4 font-medium">Window</th>
            <th className="py-2 pr-4 font-medium">Reviews</th>
            <th className="py-2 pr-4 font-medium">Volume</th>
            <th className="py-2 pr-4 font-medium">Rating</th>
            <th className="py-2 font-medium">Change</th>
          </tr>
        </thead>
        <tbody>
          {windows.map((window) => (
            <tr key={window.label} className="border-b border-line last:border-0">
              <td className="py-2 pr-4 text-ink">{window.label}</td>
              <td className="tnum py-2 pr-4 text-ink">
                {window.currentCount}
                <span className="text-ink-muted"> / {window.previousCount}</span>
              </td>
              <td className="tnum py-2 pr-4 text-ink">
                {window.volumePercent === null
                  ? "—"
                  : `${window.volumePercent > 0 ? "+" : ""}${window.volumePercent.toFixed(0)}%`}
              </td>
              <td className="tnum py-2 pr-4 text-ink">
                {window.currentCount > 0 ? window.currentRating.toFixed(2) : "—"}
              </td>
              <td className="tnum py-2 text-ink">
                {window.ratingDelta === null
                  ? "—"
                  : `${window.ratingDelta > 0 ? "+" : ""}${window.ratingDelta.toFixed(2)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
