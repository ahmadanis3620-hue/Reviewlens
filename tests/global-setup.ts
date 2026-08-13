import { execSync } from "node:child_process";

import { config } from "dotenv";

/** Applies migrations to the test database once, before any test file runs. */
export default function globalSetup() {
  config({ path: ".env", quiet: true });

  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}
