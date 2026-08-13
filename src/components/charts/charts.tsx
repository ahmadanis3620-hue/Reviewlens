"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";

/**
 * Charts.
 *
 * Palette: the diverging blue/red pair with a neutral gray midpoint for
 * sentiment polarity, slot-1 blue for single-series charts. Both modes were
 * validated against their own surface rather than flipped automatically.
 *
 * Rules held to throughout: one y-axis per chart (never two scales), thin
 * marks, recessive grid, a legend whenever there is more than one series, a
 * hover tooltip on every chart, and a table view behind a disclosure so the
 * data is reachable without reading color.
 */

const AXIS_STYLE = { fontSize: 11, fill: "var(--ink-muted)" };
const GRID = "var(--viz-grid)";

function TooltipBox({
  label,
  rows,
}: {
  label: ReactNode;
  rows: Array<{ name: string; value: ReactNode; color?: string }>;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-line bg-raised px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-ink">{label}</p>
      <div className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <div key={row.name} className="flex items-center gap-2">
            {row.color ? (
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ background: row.color }}
              />
            ) : null}
            <span className="text-ink-secondary">{row.name}</span>
            <span className="tnum ml-auto font-medium text-ink">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend({
  items,
}: {
  items: Array<{ label: string; color: string }>;
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2 w-2 rounded-[2px]"
            style={{ background: item.color }}
          />
          <span className="text-xs text-ink-secondary">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** The table view every chart carries, so identity never rests on color. */
export function ChartTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Array<string | number | null>>;
}) {
  return (
    <details className="mt-3 group">
      <summary className="cursor-pointer text-xs text-ink-muted hover:text-ink-secondary">
        View as table
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line text-left">
              {columns.map((column) => (
                <th key={column} className="py-1.5 pr-4 font-medium text-ink-secondary">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-line/60 last:border-0">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="tnum py-1.5 pr-4 text-ink">
                    {cell === null ? "—" : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export type MonthPoint = {
  month: string;
  reviewCount: number;
  averageRating: number | null;
  positive: number;
  negative: number;
  averageSentiment: number | null;
};

/** Average rating over time. Single series, so no legend — the title names it. */
export function RatingTrendChart({ data }: { data: MonthPoint[] }) {
  const withRatings = data.filter((d) => d.averageRating !== null);
  if (withRatings.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-ink-muted">
        Not enough history yet to draw a trend.
      </p>
    );
  }

  return (
    <>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="month"
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={{ stroke: GRID }}
            />
            <YAxis
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ stroke: "var(--line-strong)", strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    label={label}
                    rows={[
                      {
                        name: "Average rating",
                        value:
                          payload[0]?.value === null ||
                          payload[0]?.value === undefined
                            ? "No reviews"
                            : Number(payload[0].value).toFixed(2),
                        color: "var(--viz-positive)",
                      },
                    ]}
                  />
                ) : null
              }
            />
            <Line
              type="monotone"
              dataKey="averageRating"
              stroke="var(--viz-positive)"
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: "var(--viz-positive)" }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--viz-surface)" }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartTable
        columns={["Month", "Reviews", "Average rating"]}
        rows={data.map((d) => [
          d.month,
          d.reviewCount,
          d.averageRating === null ? null : d.averageRating.toFixed(2),
        ])}
      />
    </>
  );
}

/** Review volume over time. Separate chart from rating — never a second axis. */
export function VolumeChart({ data }: { data: MonthPoint[] }) {
  return (
    <>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="month"
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={{ stroke: GRID }}
            />
            <YAxis
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-hover)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    label={label}
                    rows={[
                      {
                        name: "Reviews",
                        value: String(payload[0]?.value ?? 0),
                        color: "var(--viz-positive)",
                      },
                    ]}
                  />
                ) : null
              }
            />
            <Bar
              dataKey="reviewCount"
              fill="var(--viz-positive)"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartTable
        columns={["Month", "Reviews"]}
        rows={data.map((d) => [d.month, d.reviewCount])}
      />
    </>
  );
}

export type SentimentPoint = {
  month: string;
  positive: number;
  neutral: number;
  negative: number;
};

/** Sentiment mix over time: polarity, so the diverging pair with a gray middle. */
export function SentimentMixChart({ data }: { data: SentimentPoint[] }) {
  const legend = [
    { label: "Positive", color: "var(--viz-positive)" },
    { label: "Neutral", color: "var(--viz-neutral)" },
    { label: "Negative", color: "var(--viz-negative)" },
  ];

  return (
    <>
      <Legend items={legend} />
      <div className="mt-3 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="month"
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={{ stroke: GRID }}
            />
            <YAxis
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-hover)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    label={label}
                    rows={payload.map((entry) => ({
                      name: String(entry.name),
                      value: String(entry.value ?? 0),
                      color: String(entry.color),
                    }))}
                  />
                ) : null
              }
            />
            {/* 2px surface gap between stacked segments. */}
            <Bar
              dataKey="positive"
              name="Positive"
              stackId="s"
              fill="var(--viz-positive)"
              stroke="var(--viz-surface)"
              strokeWidth={2}
              maxBarSize={28}
            />
            <Bar
              dataKey="neutral"
              name="Neutral"
              stackId="s"
              fill="var(--viz-neutral)"
              stroke="var(--viz-surface)"
              strokeWidth={2}
              maxBarSize={28}
            />
            <Bar
              dataKey="negative"
              name="Negative"
              stackId="s"
              fill="var(--viz-negative)"
              stroke="var(--viz-surface)"
              strokeWidth={2}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartTable
        columns={["Month", "Positive", "Neutral", "Negative"]}
        rows={data.map((d) => [d.month, d.positive, d.neutral, d.negative])}
      />
    </>
  );
}

export type TopicPoint = {
  label: string;
  negative: number;
  positive: number;
};

/** Topic mix. Horizontal because topic labels are words, not dates. */
export function TopicBarChart({ data }: { data: TopicPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-muted">
        No topics detected yet.
      </p>
    );
  }

  const legend = [
    { label: "Negative mentions", color: "var(--viz-negative)" },
    { label: "Positive mentions", color: "var(--viz-positive)" },
  ];

  return (
    <>
      <Legend items={legend} />
      <div className="mt-3" style={{ height: Math.max(180, data.length * 42) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 12, bottom: 0, left: 8 }}
            barGap={2}
          >
            <CartesianGrid stroke={GRID} horizontal={false} />
            <XAxis
              type="number"
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ ...AXIS_STYLE, fill: "var(--ink-secondary)" }}
              tickLine={false}
              axisLine={false}
              width={132}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-hover)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    label={label}
                    rows={payload.map((entry) => ({
                      name: String(entry.name),
                      value: String(entry.value ?? 0),
                      color: String(entry.color),
                    }))}
                  />
                ) : null
              }
            />
            <Bar
              dataKey="negative"
              name="Negative mentions"
              fill="var(--viz-negative)"
              radius={[0, 4, 4, 0]}
              maxBarSize={14}
            />
            <Bar
              dataKey="positive"
              name="Positive mentions"
              fill="var(--viz-positive)"
              radius={[0, 4, 4, 0]}
              maxBarSize={14}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartTable
        columns={["Topic", "Negative", "Positive"]}
        rows={data.map((d) => [d.label, d.negative, d.positive])}
      />
    </>
  );
}

export type RatingBar = { rating: string; count: number };

/** Rating distribution. Single series; sequential emphasis by value, not hue. */
export function RatingDistributionChart({ data }: { data: RatingBar[] }) {
  return (
    <>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
          >
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="rating"
              tick={{ ...AXIS_STYLE, fill: "var(--ink-secondary)" }}
              tickLine={false}
              axisLine={false}
              width={34}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-hover)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    label={`${label} stars`}
                    rows={[
                      { name: "Reviews", value: String(payload[0]?.value ?? 0) },
                    ]}
                  />
                ) : null
              }
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={16}>
              {data.map((entry) => (
                <Cell
                  key={entry.rating}
                  // Low ratings are the ones an owner needs to see; the
                  // diverging pair carries that, not a rainbow.
                  fill={
                    Number(entry.rating) <= 2
                      ? "var(--viz-negative)"
                      : Number(entry.rating) === 3
                        ? "var(--viz-neutral)"
                        : "var(--viz-positive)"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartTable
        columns={["Rating", "Reviews"]}
        rows={data.map((d) => [`${d.rating} stars`, d.count])}
      />
    </>
  );
}
