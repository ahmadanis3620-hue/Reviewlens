import { createHash } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, pruneExpiredSessions, safeEqual } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { createTenant, disconnect, resetDb, type TestTenant } from "../helpers/db";

/**
 * Authentication.
 *
 * `getSessionUser` reads the request cookie via next/headers and is exercised
 * by the browser-driven check rather than here; what these tests cover is the
 * part that must hold regardless of transport — hashing, token storage, expiry,
 * and revocation.
 */

let tenant: TestTenant;

beforeAll(async () => {
  await resetDb();
  tenant = await createTenant();
});

afterAll(async () => {
  await disconnect();
});

describe("password hashing", () => {
  it("does not store the password", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(hash).not.toContain("correct-horse-battery");
    expect(hash.startsWith("$2")).toBe(true);
  });

  it("accepts the right password and rejects the wrong one", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(await verifyPassword("correct-horse-battery", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("salts, so the same password hashes differently each time", async () => {
    const a = await hashPassword("same-password-here");
    const b = await hashPassword("same-password-here");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same-password-here", b)).toBe(true);
  });
});

describe("sessions", () => {
  it("stores only the hash of the token", async () => {
    const token = await createSession(tenant.userId, "vitest");

    const stored = await prisma.session.findFirst({
      where: { userId: tenant.userId },
      orderBy: { createdAt: "desc" },
    });

    // A database read must not yield a usable session.
    expect(stored).not.toBeNull();
    expect(stored!.tokenHash).not.toBe(token);
    expect(stored!.tokenHash).toBe(
      createHash("sha256").update(token).digest("hex"),
    );
  });

  it("issues a distinct token per session", async () => {
    const a = await createSession(tenant.userId);
    const b = await createSession(tenant.userId);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(30);
  });

  it("sets an expiry in the future", async () => {
    await createSession(tenant.userId);
    const session = await prisma.session.findFirstOrThrow({
      where: { userId: tenant.userId },
      orderBy: { createdAt: "desc" },
    });

    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("prunes expired sessions", async () => {
    const token = await createSession(tenant.userId);
    const tokenHash = createHash("sha256").update(token).digest("hex");

    await prisma.session.update({
      where: { tokenHash },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const pruned = await pruneExpiredSessions();
    expect(pruned).toBeGreaterThanOrEqual(1);
    expect(await prisma.session.findUnique({ where: { tokenHash } })).toBeNull();
  });

  it("deletes a user's sessions with the user", async () => {
    const doomed = await createTenant();
    await createSession(doomed.userId);

    await prisma.user.delete({ where: { id: doomed.userId } });

    expect(
      await prisma.session.count({ where: { userId: doomed.userId } }),
    ).toBe(0);
  });
});

describe("safeEqual", () => {
  it("matches identical secrets", () => {
    expect(safeEqual("a-cron-secret", "a-cron-secret")).toBe(true);
  });

  it("rejects different secrets, including different lengths", () => {
    expect(safeEqual("a-cron-secret", "a-cron-secre")).toBe(false);
    expect(safeEqual("a-cron-secret", "b-cron-secret")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });
});

describe("account uniqueness", () => {
  it("refuses a duplicate email", async () => {
    const email = `dupe-${Date.now()}@example.test`;
    await prisma.user.create({
      data: { email, passwordHash: await hashPassword("password-one-two") },
    });

    await expect(
      prisma.user.create({
        data: { email, passwordHash: await hashPassword("password-one-two") },
      }),
    ).rejects.toThrow();
  });
});
