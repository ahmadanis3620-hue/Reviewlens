import "server-only";

import { cookies } from "next/headers";

import { ACTIVE_BUSINESS_COOKIE } from "@/lib/auth/session";
import { assertBusinessAccess, type ScopedBusiness } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";

/**
 * Active business selection.
 *
 * The cookie is a *preference*, never an authorization: the id it carries is
 * verified against the session's organization on every read, and a stale or
 * forged value silently falls back to the first business the user can see.
 */

export async function setActiveBusiness(businessId: string): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_BUSINESS_COOKIE, businessId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function getActiveBusiness(
  organizationId: string,
): Promise<ScopedBusiness | null> {
  const store = await cookies();
  const preferred = store.get(ACTIVE_BUSINESS_COOKIE)?.value;

  if (preferred) {
    try {
      return await assertBusinessAccess(preferred, organizationId);
    } catch {
      // Cookie points at a business this organization cannot see. Fall through
      // rather than erroring — the user simply gets their own first business.
    }
  }

  const first = await prisma.business.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      industry: true,
      timezone: true,
      isDemo: true,
      organizationId: true,
    },
  });

  return first;
}
