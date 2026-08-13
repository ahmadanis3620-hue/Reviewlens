import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";

export const SESSION_COOKIE = "reputeiq_session";
export const ACTIVE_BUSINESS_COOKIE = "reputeiq_business";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** Refresh the expiry only when less than this much of the TTL remains. */
const SLIDING_REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Creates a session and returns the raw token. Only the hash is persisted, so
 * read access to the sessions table does not yield usable credentials.
 */
export async function createSession(
  userId: string,
  userAgent?: string,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      userAgent: userAgent?.slice(0, 255),
    },
  });
  log.info("session created", { userId });
  return token;
}

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  organizationId: string;
  organizationName: string;
  role: string;
};

/**
 * Resolves the session cookie to a user. Returns null rather than throwing so
 * that public pages can render a signed-out state.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          memberships: {
            include: { organization: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // Sliding expiry, written only when it would actually move, to keep reads
  // from turning every page view into a write.
  const remaining = session.expiresAt.getTime() - Date.now();
  if (remaining < SLIDING_REFRESH_THRESHOLD_MS) {
    await prisma.session
      .update({
        where: { id: session.id },
        data: {
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
          lastSeenAt: new Date(),
        },
      })
      .catch(() => {});
  }

  const membership = session.user.memberships[0];
  if (!membership) {
    // A user with no organization cannot do anything meaningful; treat as
    // signed out rather than crashing downstream on a missing tenant.
    log.warn("session user has no membership", { userId: session.user.id });
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    role: membership.role,
  };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => {});
  }
  store.delete(SESSION_COOKIE);
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

/** Constant-time string comparison for bearer tokens (cron, webhooks). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Removes expired rows. Invoked by the maintenance job. */
export async function pruneExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
