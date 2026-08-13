/**
 * Seeds a complete, working demo account.
 *
 *   npm run seed:demo
 *
 * Creates an organization, a user you can sign in as, the Columbus Dental Care
 * demo business with 140+ reviews, two competitors, and then runs the entire
 * pipeline so the dashboard is populated on first load.
 */

import { Plan, ReportType, SubscriptionStatus } from "@prisma/client";

import { analyzeBusinessReviews } from "@/lib/analysis/analyze";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { provisionDemoBusiness } from "@/lib/demo/provision";
import { runFullPipeline } from "@/lib/jobs/registry";
import { generateReport } from "@/lib/reports/generate";

const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@reputeiq.local";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password-123";

async function main() {
  const now = new Date();

  const organization = await prisma.organization.upsert({
    where: { slug: "columbus-dental-demo" },
    create: { name: "Columbus Dental Care", slug: "columbus-dental-demo" },
    update: {},
  });

  await prisma.subscription.upsert({
    where: { organizationId: organization.id },
    create: {
      organizationId: organization.id,
      plan: Plan.GROWTH,
      status: SubscriptionStatus.TRIALING,
    },
    update: {},
  });

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: {
      email: DEMO_EMAIL,
      name: "Demo Owner",
      passwordHash: await hashPassword(DEMO_PASSWORD),
    },
    update: {},
  });

  await prisma.membership.upsert({
    where: {
      userId_organizationId: { userId: user.id, organizationId: organization.id },
    },
    create: { userId: user.id, organizationId: organization.id, role: "OWNER" },
    update: {},
  });

  const { businessId, created } = await provisionDemoBusiness(organization.id, now);
  console.log(
    created
      ? `Created demo business ${businessId}`
      : `Demo business already existed (${businessId})`,
  );

  console.log("Running pipeline: sync -> analyze -> insights -> alerts ...");
  await runFullPipeline(businessId, now);

  // The analysis job is capped per invocation so a scheduled run stays inside
  // its execution budget. Seeding wants the whole corpus analyzed, so drain
  // the backlog before generating reports.
  for (let pass = 0; pass < 20; pass++) {
    const remaining = await prisma.review.count({
      where: { businessId, analysis: { is: null } },
    });
    if (remaining === 0) break;
    console.log(`  analyzing ${remaining} remaining reviews ...`);
    await analyzeBusinessReviews(businessId, { limit: 200 });
  }

  // Recompute recommendations and alerts now the full corpus is analyzed.
  await runFullPipeline(businessId, now);

  console.log("Generating reports ...");
  await generateReport(businessId, ReportType.MONTHLY, now);
  await generateReport(businessId, ReportType.WEEKLY, now);

  await prisma.reportSchedule.upsert({
    where: {
      businessId_frequency: { businessId, frequency: ReportType.MONTHLY },
    },
    create: {
      businessId,
      frequency: ReportType.MONTHLY,
      dayOfMonth: 1,
      hour: 8,
      recipientEmail: DEMO_EMAIL,
      enabled: true,
    },
    update: {},
  });

  const [reviews, analyses, recommendations, alerts] = await Promise.all([
    prisma.review.count({ where: { businessId } }),
    prisma.reviewAnalysis.count({ where: { businessId } }),
    prisma.recommendation.count({ where: { businessId } }),
    prisma.alert.count({ where: { businessId } }),
  ]);

  console.log("");
  console.log("Demo data ready.");
  console.log(`  Reviews:         ${reviews}`);
  console.log(`  Analyses:        ${analyses}`);
  console.log(`  Recommendations: ${recommendations}`);
  console.log(`  Alerts:          ${alerts}`);
  console.log("");
  console.log(`  Sign in at /login as ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
