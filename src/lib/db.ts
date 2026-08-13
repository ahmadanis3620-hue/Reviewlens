import { PrismaClient } from "@prisma/client";

/**
 * Single Prisma client per process. Next.js dev reloads modules on every edit,
 * so the client is stashed on globalThis to avoid exhausting the connection
 * pool with a new client per reload.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? [{ emit: "stdout", level: "warn" }, { emit: "stdout", level: "error" }]
        : [{ emit: "stdout", level: "error" }],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
