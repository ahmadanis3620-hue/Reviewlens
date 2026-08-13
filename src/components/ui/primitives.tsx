import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Local UI primitives.
 *
 * Deliberately hand-rolled rather than pulled from shadcn/ui: the component
 * surface this product needs is small, and ~200 lines of local primitives is
 * less to maintain than a Radix dependency tree. The API shape follows the
 * shadcn conventions, so swapping in the real thing later is mechanical.
 */

export function Card({
  className,
  ...props
}: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius)] border border-line bg-raised",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-line px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold tracking-[0.04em] text-ink-muted uppercase">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-ink-secondary">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-hover border border-transparent",
  secondary:
    "bg-raised text-ink border border-line-strong hover:bg-hover",
  ghost: "bg-transparent text-ink-secondary hover:bg-hover border border-transparent",
  danger:
    "bg-transparent text-critical border border-line-strong hover:bg-critical-soft",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-4 text-sm",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-[var(--radius)] border border-line-strong bg-surface px-3 text-sm",
        "text-ink placeholder:text-ink-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 rounded-[var(--radius)] border border-line-strong bg-surface px-2.5 text-sm text-ink",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cn("block text-sm font-medium text-ink", className)}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

type Tone = "neutral" | "accent" | "good" | "warning" | "serious" | "critical";

const BADGE_TONES: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-secondary border-line",
  accent: "bg-accent-soft text-accent-ink border-transparent",
  good: "bg-good-soft text-good border-transparent",
  warning: "bg-warning-soft text-ink border-transparent",
  serious: "bg-serious-soft text-ink border-transparent",
  critical: "bg-critical-soft text-critical border-transparent",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-ink-secondary">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-secondary">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/**
 * Renders a star rating as text plus an accessible label. Stars alone are a
 * color/shape encoding; the numeric value is always present beside them.
 */
export function Stars({ rating, className }: { rating: number; className?: string }) {
  const rounded = Math.round(rating);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span aria-hidden className="text-[13px] tracking-[0.1em] text-warning">
        {"★".repeat(rounded)}
        <span className="text-line-strong">{"★".repeat(5 - rounded)}</span>
      </span>
      <span className="tnum text-sm text-ink-secondary">{rating.toFixed(1)}</span>
      <span className="sr-only">{rating.toFixed(1)} out of 5 stars</span>
    </span>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-line", className)} />;
}

/**
 * The phrase used everywhere a figure cannot be computed honestly. Having one
 * component for it keeps the product from inventing a zero or a dash that
 * reads like a real measurement.
 */
export function NotEnoughData({ className }: { className?: string }) {
  return (
    <span className={cn("text-xs text-ink-muted", className)}>
      Not enough data
    </span>
  );
}
