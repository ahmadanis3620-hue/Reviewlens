/**
 * Runs a background job from the command line.
 *
 *   npm run jobs:run -- sync-reviews
 *   npm run jobs:run -- analyze-reviews --business <id>
 *   npm run jobs:run -- all
 *
 * The same handlers the cron endpoints invoke, so what you test locally is
 * what runs in production.
 */

import { prisma } from "@/lib/db";
import { listJobNames, runJob } from "@/lib/jobs/registry";

async function main() {
  const args = process.argv.slice(2);
  const name = args[0];

  if (!name) {
    console.error("Usage: npm run jobs:run -- <job> [--business <id>]");
    console.error(`Jobs: ${listJobNames().join(", ")}, all`);
    process.exitCode = 1;
    return;
  }

  const businessIndex = args.indexOf("--business");
  const businessId = businessIndex >= 0 ? args[businessIndex + 1] : undefined;

  const jobs = name === "all" ? listJobNames() : [name];

  for (const job of jobs) {
    const result = await runJob(job, { businessId });
    console.log(`${job}: ${result.status}`);
    if (result.error) console.error(`  ${result.error}`);
    if (result.stats) console.log(`  ${JSON.stringify(result.stats)}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
