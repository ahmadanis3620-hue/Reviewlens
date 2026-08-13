import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { NotEnoughData } from "@/components/ui/primitives";

/**
 * Stat tiles.
 *
 * A single number with a label is not a chart, and dressing it up as one costs
 * clarity. Deltas render only when the underlying comparison exists — a null
 * delta shows "Not enough data" rather than a zero that reads like a
 * measurement.
 */

export function Stat({
  label,
  value,
  delta,
  deltaLabel,
  /** Whether an increase in this metric is good. Drives the delta color. */
  higherIsBetter = true,
  footnote,
}: {
  label: string;
  value: ReactNode;
  delta?: number | null;
  deltaLabel?: string;
  higherIsBetter?: boolean;
  footnote?: string;
}) {
  return (
    <div className="px-5 py-4">
      <p className="text-[13px] font-medium text-ink-secondary">{label}</p>
      <p className="tnum mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-ink">
        {value}
      </p>
      {delta !== undefined ? (
        <div className="mt-1.5">
          {delta === null ? (
            <NotEnoughData />
          ) : (
            <Delta
              value={delta}
              label={deltaLabel}
              higherIsBetter={higherIsBetter}
            />
          )}
        </div>
      ) : null}
      {footnote ? (
        <p className="mt-1.5 text-xs text-ink-muted">{footnote}</p>
      ) : null}
    </div>
  );
}

export function Delta({
  value,
  label,
  higherIsBetter = true,
  format = (v: number) => (v > 0 ? `+${v}` : `${v}`),
}: {
  value: number;
  label?: string;
  higherIsBetter?: boolean;
  format?: (value: number) => string;
}) {
  if (value === 0) {
    return (
      <span className="text-xs text-ink-muted">
        No change{label ? ` ${label}` : ""}
      </span>
    );
  }

  const good = higherIsBetter ? value > 0 : value < 0;

  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-1 text-xs font-medium",
        good ? "text-good" : "text-critical",
      )}
    >
      <span aria-hidden>{value > 0 ? "▲" : "▼"}</span>
      {format(value)}
      {label ? <span className="font-normal text-ink-muted">{label}</span> : null}
    </span>
  );
}

/** A labelled progress bar used for score components and topic shares. */
export function Meter({
  value,
  max,
  tone = "accent",
  className,
}: {
  value: number;
  max: number;
  tone?: "accent" | "critical" | "good" | "neutral";
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill = {
    accent: "bg-accent",
    critical: "bg-negative",
    good: "bg-good",
    neutral: "bg-neutral",
  }[tone];

  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-sunken", className)}
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      {/* 4px rounded data-end, anchored at the baseline. */}
      <div
        className={cn("h-full rounded-r-[4px]", fill)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
