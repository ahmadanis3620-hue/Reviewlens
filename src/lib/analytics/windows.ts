import type { AnalyzedReview } from "@/lib/analytics/types";

/** Date-window helpers. All arithmetic is UTC to keep results reproducible. */

export const DAY_MS = 24 * 60 * 60 * 1000;

export type Window = { start: Date; end: Date };

export function daysAgo(days: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - days * DAY_MS);
}

/** The current window of `days` ending now, and the equal window before it. */
export function comparisonWindows(
  days: number,
  now: Date = new Date(),
): { current: Window; previous: Window } {
  const currentEnd = now;
  const currentStart = new Date(now.getTime() - days * DAY_MS);
  const previousEnd = currentStart;
  const previousStart = new Date(currentStart.getTime() - days * DAY_MS);
  return {
    current: { start: currentStart, end: currentEnd },
    previous: { start: previousStart, end: previousEnd },
  };
}

/**
 * Membership test for a window, as the half-open interval `(start, end]`.
 *
 * Exclusive at the start and inclusive at the end, so that:
 *   - adjacent windows never double-count (a review exactly on the boundary
 *     between "previous 30 days" and "current 30 days" belongs to the previous
 *     one, since that boundary is the previous window's `end`), and
 *   - a review posted at this instant is inside the current window, whose
 *     `end` is `now`. Closing the interval at the start instead would silently
 *     drop the newest review from every current-period figure.
 */
export function inWindow(review: AnalyzedReview, window: Window): boolean {
  const t = review.reviewedAt.getTime();
  return t > window.start.getTime() && t <= window.end.getTime();
}

export function filterWindow(
  reviews: AnalyzedReview[],
  window: Window,
): AnalyzedReview[] {
  return reviews.filter((r) => inWindow(r, window));
}

/** Calendar month containing `date`, in UTC. */
export function monthWindow(date: Date): Window {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
}

export function previousMonthWindow(date: Date): Window {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return { start, end };
}

/** Week containing `date`, Monday-based, in UTC. */
export function weekWindow(date: Date): Window {
  const day = date.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysFromMonday),
  );
  return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

export function previousWeekWindow(date: Date): Window {
  const current = weekWindow(date);
  return {
    start: new Date(current.start.getTime() - 7 * DAY_MS),
    end: current.start,
  };
}

export function formatWindowLabel(window: Window): string {
  const start = window.start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  // `end` is exclusive; show the last included day.
  const lastDay = new Date(window.end.getTime() - DAY_MS);
  const end = lastDay.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${start} – ${end}`;
}
