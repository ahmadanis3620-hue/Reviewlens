import { RateLimitError } from "@/lib/errors";

/**
 * Sliding-window rate limiter, in memory.
 *
 * Correct for a single instance only. On a multi-instance deploy each node
 * keeps its own counters, so the effective limit is N x the configured value.
 * Swapping in Redis means replacing `hit()` — the call sites are unaffected.
 */

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 60_000;

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    const cutoff = now - windowMs;
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
    if (bucket.timestamps.length === 0) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function hit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now, windowMs);

  const bucket = buckets.get(key) ?? { timestamps: [] };
  const cutoff = now - windowMs;
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0] ?? now;
    buckets.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return {
    allowed: true,
    remaining: limit - bucket.timestamps.length,
    retryAfterSeconds: 0,
  };
}

export function enforce(key: string, limit: number, windowMs: number): void {
  const result = hit(key, limit, windowMs);
  if (!result.allowed) {
    throw new RateLimitError(
      "Too many requests. Please slow down.",
      result.retryAfterSeconds,
    );
  }
}

/** Named policies, so limits live in one place rather than at each call site. */
export const LIMITS = {
  login: { limit: 8, windowMs: 15 * 60_000 },
  signup: { limit: 5, windowMs: 60 * 60_000 },
  ingestion: { limit: 20, windowMs: 60 * 60_000 },
  analysis: { limit: 10, windowMs: 60 * 60_000 },
  report: { limit: 10, windowMs: 60 * 60_000 },
  mutation: { limit: 60, windowMs: 60_000 },
} as const;

export function clientKey(request: Request, scope: string): string {
  // Behind a proxy, x-forwarded-for's first entry is the client. Falls back to
  // a constant so a missing header degrades to a global limit rather than to
  // no limit at all.
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return `${scope}:${ip}`;
}

/** Test helper. */
export function resetRateLimits(): void {
  buckets.clear();
}
