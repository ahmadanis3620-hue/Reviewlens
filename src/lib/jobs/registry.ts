import { JobStatus, ReportType } from "@prisma/client";

import { analyzeBusinessReviews, analyzeCompetitorReviews } from "@/lib/analysis/analyze";
import { evaluateAlerts } from "@/lib/alerts/evaluate";
import { pruneExpiredSessions } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { syncBusiness } from "@/lib/ingestion/ingest";
import { buildInsights } from "@/lib/insights/build";
import { log } from "@/lib/logger";
import { generateRecommendations } from "@/lib/recommendations/generate";
import { runDueSchedules } from "@/lib/reports/deliver";
import { generateReport } from "@/lib/reports/generate";

/**
 * Background jobs.
 *
 * A registry plus an HTTP trigger, which is the right complexity for this
 * stage and maps onto Vercel Cron with no adapter. Every handler selects its
 * work by "not yet done" state rather than by offset, so a run that times out
 * is resumed by the next invocation rather than losing or repeating work.
 *
 * Migrating to a real queue replaces the trigger, not these handlers.
 */

export type JobContext = {
  /** Restrict the run to one business. Omitted for scheduled sweeps. */
  businessId?: string;
  now?: Date;
};

export type JobResult = Record<string, unknown>;
export type JobHandler = (ctx: JobContext) => Promise<JobResult>;

async function forEachBusiness(
  ctx: JobContext,
  fn: (businessId: string) => Promise<JobResult>,
): Promise<JobResult> {
  const businesses = ctx.businessId
    ? [{ id: ctx.businessId }]
    : await prisma.business.findMany({ select: { id: true } });

  const results: Record<string, JobResult> = {};
  let failed = 0;

  for (const business of businesses) {
    try {
      results[business.id] = await fn(business.id);
    } catch (error) {
      failed += 1;
      // One business failing must not abort the sweep.
      log.error("job failed for business", {
        businessId: business.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { businesses: businesses.length, failed, results };
}

export const JOBS: Record<string, JobHandler> = {
  /** Pull new reviews from every connected source. */
  "sync-reviews": (ctx) =>
    forEachBusiness(ctx, async (businessId) => ({
      ...(await syncBusiness(businessId)),
    })),

  /** Analyze reviews that have no current-version analysis. */
  "analyze-reviews": (ctx) =>
    forEachBusiness(ctx, async (businessId) => {
      const business = await analyzeBusinessReviews(businessId, { limit: 200 });

      const competitors = await prisma.competitor.findMany({
        where: { businessId },
        select: { id: true },
      });
      let competitorAnalyzed = 0;
      for (const competitor of competitors) {
        const stats = await analyzeCompetitorReviews(competitor.id, { limit: 100 });
        competitorAnalyzed += stats.analyzed;
      }

      return { ...business, competitorAnalyzed };
    }),

  /** Recompute recommendations and record today's reputation snapshot. */
  "refresh-insights": (ctx) =>
    forEachBusiness(ctx, async (businessId) => {
      const now = ctx.now ?? new Date();
      const recommendations = await generateRecommendations(businessId, now);
      const snapshot = await captureSnapshot(businessId, now);
      return { ...recommendations, snapshot };
    }),

  "evaluate-alerts": (ctx) =>
    forEachBusiness(ctx, async (businessId) => ({
      ...(await evaluateAlerts(businessId, ctx.now ?? new Date())),
    })),

  /** Generate the current monthly report without sending it. */
  "generate-reports": (ctx) =>
    forEachBusiness(ctx, async (businessId) => {
      const { reportId } = await generateReport(
        businessId,
        ReportType.MONTHLY,
        ctx.now ?? new Date(),
      );
      return { reportId };
    }),

  /** Generate and email whichever scheduled reports are due. */
  "send-scheduled-reports": async (ctx) => ({
    ...(await runDueSchedules(ctx.now ?? new Date())),
  }),

  /** Housekeeping. */
  maintenance: async () => ({ prunedSessions: await pruneExpiredSessions() }),
};

/**
 * Records the day's score so trends over time are read from what was actually
 * computed rather than recalculated from a moving window.
 */
async function captureSnapshot(businessId: string, now: Date): Promise<JobResult> {
  const insights = await buildInsights(businessId, now);
  if (insights.score.score === null) return { captured: false };

  const capturedOn = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  await prisma.reputationSnapshot.upsert({
    where: { businessId_capturedOn: { businessId, capturedOn } },
    create: {
      businessId,
      capturedOn,
      score: insights.score.score,
      components: insights.score.components as unknown as object,
      avgRating: insights.summary30.averageRating,
      reviewCount: insights.summary30.count,
      positiveRate: insights.summary30.positiveRate,
      negativeRate: insights.summary30.negativeRate,
    },
    update: {
      score: insights.score.score,
      components: insights.score.components as unknown as object,
      avgRating: insights.summary30.averageRating,
      reviewCount: insights.summary30.count,
      positiveRate: insights.summary30.positiveRate,
      negativeRate: insights.summary30.negativeRate,
    },
  });

  return { captured: true, score: insights.score.score };
}

export function isJobName(name: string): name is keyof typeof JOBS {
  return Object.hasOwn(JOBS, name);
}

export function listJobNames(): string[] {
  return Object.keys(JOBS);
}

/** Runs a job and records the attempt in JobRun for observability. */
export async function runJob(
  name: string,
  ctx: JobContext = {},
): Promise<{ status: JobStatus; stats?: JobResult; error?: string }> {
  if (!isJobName(name)) throw new Error(`Unknown job: ${name}`);

  const run = await prisma.jobRun.create({
    data: { jobName: name, businessId: ctx.businessId ?? null },
  });

  const started = Date.now();

  try {
    const stats = await JOBS[name]!(ctx);

    await prisma.jobRun.update({
      where: { id: run.id },
      data: {
        status: JobStatus.SUCCEEDED,
        stats: stats as unknown as object,
        finishedAt: new Date(),
      },
    });

    log.info("job succeeded", { job: name, durationMs: Date.now() - started });
    return { status: JobStatus.SUCCEEDED, stats };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await prisma.jobRun.update({
      where: { id: run.id },
      data: {
        status: JobStatus.FAILED,
        error: message.slice(0, 1000),
        finishedAt: new Date(),
      },
    });

    log.error("job failed", { job: name, error: message });
    return { status: JobStatus.FAILED, error: message };
  }
}

/** The full pipeline, in dependency order. Used by onboarding and the CLI. */
export async function runFullPipeline(businessId: string, now?: Date): Promise<void> {
  const ctx: JobContext = { businessId, now };
  await runJob("sync-reviews", ctx);
  await runJob("analyze-reviews", ctx);
  await runJob("refresh-insights", ctx);
  await runJob("evaluate-alerts", ctx);
}
