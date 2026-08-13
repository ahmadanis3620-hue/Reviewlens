import { NextResponse } from "next/server";

import { getAIService } from "@/lib/ai/service";
import { assertReviewAccess, requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { NotFoundError, toErrorResponse } from "@/lib/errors";
import { log } from "@/lib/logger";
import { LIMITS, clientKey, enforce } from "@/lib/rate-limit";

/**
 * Drafts a public reply to a review.
 *
 * Generated on demand rather than for every review, because most reviews never
 * get a reply and precomputing them would burn AI budget for nothing.
 *
 * This endpoint returns text. There is no counterpart that publishes it.
 */

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    enforce(
      clientKey(request, "suggest"),
      LIMITS.mutation.limit,
      LIMITS.mutation.windowMs,
    );

    const user = await requireUser();
    const { id } = await context.params;

    // The review id came from the URL: verify it belongs to this tenant.
    await assertReviewAccess(id, user.organizationId);

    const review = await prisma.review.findUnique({
      where: { id },
      select: {
        rating: true,
        text: true,
        business: { select: { name: true } },
        analysis: { select: { sentiment: true, problems: true } },
      },
    });

    if (!review) throw new NotFoundError();

    const response = await getAIService().generateSuggestedResponse({
      reviewText: review.text,
      rating: review.rating,
      businessName: review.business.name,
      sentiment: review.analysis?.sentiment ?? "NEUTRAL",
      problems: review.analysis?.problems ?? [],
    });

    return NextResponse.json({ response });
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    if (status >= 500) {
      log.error("suggested response failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return NextResponse.json(body, { status });
  }
}
