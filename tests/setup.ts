/**
 * Test environment.
 *
 * Points the Prisma client at TEST_DATABASE_URL before any module imports it,
 * and supplies the minimum environment the app validates at boot. Integration
 * tests truncate this database, so it must never be the development one.
 */

import { config } from "dotenv";

config({ path: ".env", quiet: true });

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Copy .env.example to .env and point it at a database the tests may truncate.",
  );
}
if (testUrl === process.env.DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL must differ from DATABASE_URL — the tests truncate every table.",
  );
}

process.env.DATABASE_URL = testUrl;
process.env.DIRECT_URL = testUrl;
// NODE_ENV is typed readonly, so assign through the record rather than the
// narrowed property.
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.LOG_LEVEL = "error";

// Tests exercise the deterministic analyzer so results are stable and no
// network call is made.
process.env.AI_PROVIDER = "local";
process.env.EMAIL_PROVIDER = "console";
process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters-long";
process.env.CRON_SECRET ??= "test-cron-secret";
process.env.APP_URL ??= "http://localhost:3000";
