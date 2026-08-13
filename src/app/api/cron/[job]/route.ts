import { NextResponse } from "next/server";

import { safeEqual } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { isJobName, listJobNames, runJob } from "@/lib/jobs/registry";
import { log } from "@/lib/logger";

/**
 * Cron trigger.
 *
 *   GET|POST /api/cron/<job>   with `Authorization: Bearer $CRON_SECRET`
 *
 * Vercel Cron issues GET requests and attaches the bearer token when
 * CRON_SECRET is set in the project, so both verbs run the job. There is no
 * session here by design — this is machine-to-machine.
 *
 * The token is compared in constant time, and an unauthorized request gets a
 * bare 401 rather than the list of job names.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(
  request: Request,
  context: { params: Promise<{ job: string }> },
) {
  const env = getEnv();

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token || !safeEqual(token, env.CRON_SECRET)) {
    // Never log the presented token.
    log.warn("cron request rejected", { hasToken: Boolean(token) });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { job } = await context.params;

  if (!isJobName(job)) {
    return NextResponse.json(
      { error: "Unknown job", jobs: listJobNames() },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const businessId = url.searchParams.get("businessId") ?? undefined;

  const result = await runJob(job, { businessId });

  return NextResponse.json(result, {
    status: result.status === "FAILED" ? 500 : 200,
  });
}

export const GET = handle;
export const POST = handle;
