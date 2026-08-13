import { ReviewProviderKey, SourceStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { analyzeBusinessReviews } from "@/lib/analysis/analyze";
import { assertBusinessAccess, requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { ValidationError, toErrorResponse } from "@/lib/errors";
import { ingestReviews } from "@/lib/ingestion/ingest";
import { log } from "@/lib/logger";
import { parseCsv, rowsToReviews } from "@/lib/providers/csv";
import { LIMITS, clientKey, enforce } from "@/lib/rate-limit";

/**
 * CSV import.
 *
 * The upload is parsed and validated here, then handed to the same ingestion
 * path every provider uses — so deduplication, PII scrubbing, and analysis all
 * behave identically regardless of where the reviews came from.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    enforce(
      clientKey(request, "csv"),
      LIMITS.ingestion.limit,
      LIMITS.ingestion.windowMs,
    );

    const user = await requireUser();
    const form = await request.formData();

    const businessId = String(form.get("businessId") ?? "");
    const file = form.get("file");

    if (!businessId) throw new ValidationError("businessId is required");
    if (!(file instanceof File)) throw new ValidationError("A CSV file is required");
    if (file.size === 0) throw new ValidationError("That file is empty");
    if (file.size > MAX_BYTES) {
      throw new ValidationError("That file is larger than the 5 MB limit");
    }

    // The business id came from the request body: verify, do not trust.
    const business = await assertBusinessAccess(businessId, user.organizationId);

    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) throw new ValidationError("No rows found in that file");

    const reviews = rowsToReviews(rows);

    const source = await prisma.reviewSource.upsert({
      where: {
        businessId_provider_externalAccountId: {
          businessId: business.id,
          provider: ReviewProviderKey.CSV_IMPORT,
          externalAccountId: "csv-upload",
        },
      },
      create: {
        businessId: business.id,
        provider: ReviewProviderKey.CSV_IMPORT,
        externalAccountId: "csv-upload",
        displayName: "CSV import",
        status: SourceStatus.CONNECTED,
      },
      update: { status: SourceStatus.CONNECTED, lastError: null },
    });

    const stats = await ingestReviews(business.id, source.id, reviews);

    await prisma.reviewSource.update({
      where: { id: source.id },
      data: { lastSyncedAt: new Date() },
    });

    // Analyze inline so the dashboard is populated when the user navigates
    // back. Bounded, and the scheduled job picks up anything left over.
    if (stats.created > 0) {
      await analyzeBusinessReviews(business.id, { limit: 200 });
    }

    log.info("csv import complete", { businessId: business.id, ...stats });

    return NextResponse.json(stats);
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    if (status >= 500) {
      log.error("csv import failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return NextResponse.json(body, { status });
  }
}
