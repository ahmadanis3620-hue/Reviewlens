import { ReportType } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { analyzeBusinessReviews } from "@/lib/analysis/analyze";
import { evaluateAlerts } from "@/lib/alerts/evaluate";
import { prisma } from "@/lib/db";
import { provisionDemoBusiness } from "@/lib/demo/provision";
import { buildInsights } from "@/lib/insights/build";
import { ingestReviews } from "@/lib/ingestion/ingest";
import { generateRecommendations } from "@/lib/recommendations/generate";
import { generateReport } from "@/lib/reports/generate";
import { renderReportHtml, renderReportText } from "@/lib/reports/render";
import {
  createTenant,
  daysAgo,
  disconnect,
  resetDb,
  type TestTenant,
} from "../helpers/db";

/**
 * The full pipeline against a real database.
 *
 * Uses a purpose-built corpus with a known story — wait-time complaints that
 * appear only in the recent window — so the assertions test whether the
 * pipeline finds what is genuinely there, not merely that it produced output.
 */

let tenant: TestTenant;

const WAIT_COMPLAINT =
  "I waited almost an hour past my appointment time before anyone came to get me.";
const STAFF_PRAISE =
  "The hygienist was wonderful and the whole team was so kind and welcoming.";

beforeAll(async () => {
  await resetDb();
  tenant = await createTenant();

  const reviews = [
    // Recent window: wait-time complaints plus steady staff praise.
    ...Array.from({ length: 8 }, (_, i) => ({
      externalReviewId: `recent-wait-${i}`,
      rating: 2,
      text: `${WAIT_COMPLAINT} Visit ${i}.`,
      reviewedAt: daysAgo(2 + i),
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      externalReviewId: `recent-staff-${i}`,
      rating: 5,
      text: `${STAFF_PRAISE} Visit ${i}.`,
      reviewedAt: daysAgo(3 + i),
    })),
    // Previous window: praise only, so wait time is genuinely a new problem.
    ...Array.from({ length: 14 }, (_, i) => ({
      externalReviewId: `older-staff-${i}`,
      rating: 5,
      text: `${STAFF_PRAISE} Earlier visit ${i}.`,
      reviewedAt: daysAgo(35 + i),
    })),
  ];

  await ingestReviews(tenant.businessId, tenant.sourceId, reviews);
  await analyzeBusinessReviews(tenant.businessId, { limit: 500 });
}, 120_000);

afterAll(async () => {
  await disconnect();
});

describe("analysis", () => {
  it("analyzes every ingested review", async () => {
    const [reviews, analyses] = await Promise.all([
      prisma.review.count({ where: { businessId: tenant.businessId } }),
      prisma.reviewAnalysis.count({ where: { businessId: tenant.businessId } }),
    ]);

    expect(reviews).toBe(34);
    expect(analyses).toBe(reviews);
  });

  it("is idempotent — re-running analyzes nothing new", async () => {
    const stats = await analyzeBusinessReviews(tenant.businessId, { limit: 500 });
    expect(stats.considered).toBe(0);
    expect(stats.analyzed).toBe(0);
  });

  it("records which model produced each analysis", async () => {
    const analysis = await prisma.reviewAnalysis.findFirstOrThrow({
      where: { businessId: tenant.businessId },
    });

    expect(analysis.modelProvider).toBe("local-heuristic");
    expect(analysis.promptVersion).toBeTruthy();
  });

  it("writes topic mentions linked back to their reviews", async () => {
    const mentions = await prisma.reviewTopicMention.count({
      where: { businessId: tenant.businessId },
    });
    expect(mentions).toBeGreaterThan(0);
  });

  it("adds discovered topics to the business dictionary", async () => {
    const topics = await prisma.reviewTopic.findMany({
      where: { businessId: tenant.businessId, mentions: { some: {} } },
      select: { key: true },
    });

    expect(topics.map((t) => t.key)).toContain("wait-time");
  });
});

describe("insights", () => {
  it("identifies the complaint the corpus actually contains", async () => {
    const insights = await buildInsights(tenant.businessId);

    expect(insights.negativeTopics[0]?.key).toBe("wait-time");
    expect(insights.negativeTopics[0]?.negativeMentions).toBeGreaterThanOrEqual(6);
  });

  it("identifies the strength the corpus actually contains", async () => {
    const insights = await buildInsights(tenant.businessId);
    expect(insights.positiveTopics.map((t) => t.key)).toContain("staff");
  });

  it("marks wait time as a new or growing problem", async () => {
    const insights = await buildInsights(tenant.businessId);
    const trend = insights.comparison30.topics.find((t) => t.key === "wait-time");

    expect(["new", "growing"]).toContain(trend?.status);
  });

  it("produces a score with a full component breakdown", async () => {
    const insights = await buildInsights(tenant.businessId);

    expect(insights.score.score).not.toBeNull();
    expect(insights.score.score).toBeGreaterThan(0);
    expect(insights.score.score).toBeLessThanOrEqual(100);
    expect(insights.score.components).toHaveLength(6);
  });
});

describe("recommendations", () => {
  it("generates recommendations tied to evidence", async () => {
    const stats = await generateRecommendations(tenant.businessId);
    expect(stats.generated).toBeGreaterThan(0);

    const recommendations = await prisma.recommendation.findMany({
      where: { businessId: tenant.businessId },
    });

    const wait = recommendations.find((r) => r.topicKey === "wait-time");
    expect(wait).toBeDefined();
    expect(wait!.evidenceReviewIds.length).toBeGreaterThan(0);

    // The metrics rendered by the UI come from the analytics layer, not from
    // generated prose.
    const metrics = wait!.metrics as Record<string, unknown>;
    expect(metrics.negativeMentions).toBeGreaterThan(0);
  });

  it("never claims a guaranteed financial outcome", async () => {
    const recommendations = await prisma.recommendation.findMany({
      where: { businessId: tenant.businessId },
    });

    for (const rec of recommendations) {
      expect(["Limited", "Moderate", "Potentially significant"]).toContain(
        rec.expectedImpact,
      );
      const prose = `${rec.problem} ${rec.action} ${rec.rationale}`.toLowerCase();
      expect(prose).not.toMatch(/guarantee|will increase revenue|will boost sales/);
    }
  });

  it("replaces open recommendations rather than accumulating them", async () => {
    const before = await prisma.recommendation.count({
      where: { businessId: tenant.businessId, status: "OPEN" },
    });
    await generateRecommendations(tenant.businessId);
    const after = await prisma.recommendation.count({
      where: { businessId: tenant.businessId, status: "OPEN" },
    });

    expect(after).toBe(before);
  });
});

describe("alerts", () => {
  it("fires on the recurring complaint present in the data", async () => {
    const stats = await evaluateAlerts(tenant.businessId);
    expect(stats.created).toBeGreaterThan(0);

    const alerts = await prisma.alert.findMany({
      where: { businessId: tenant.businessId },
    });

    const recurring = alerts.find((a) => a.type === "NEW_RECURRING_COMPLAINT");
    expect(recurring).toBeDefined();
    expect(recurring!.message).toContain("Wait Time");
    expect(recurring!.evidenceReviewIds.length).toBeGreaterThan(0);
  });

  it("deduplicates — a second evaluation creates nothing new", async () => {
    const second = await evaluateAlerts(tenant.businessId);
    expect(second.created).toBe(0);
    expect(second.suppressed).toBeGreaterThan(0);
  });
});

describe("report generation", () => {
  it("produces every section with data attached", async () => {
    const { reportId } = await generateReport(tenant.businessId, ReportType.MONTHLY);

    const report = await prisma.report.findUniqueOrThrow({
      where: { id: reportId },
      include: { sections: { orderBy: { order: "asc" } } },
    });

    expect(report.status).toBe("READY");
    expect(report.reputationScore).not.toBeNull();
    expect(report.summary).toBeTruthy();

    const keys = report.sections.map((s) => s.key);
    expect(keys).toEqual([
      "executive-summary",
      "reputation-score",
      "review-performance",
      "customers-love",
      "biggest-problems",
      "emerging-issues",
      "competitor-comparison",
      "recommended-actions",
      "trends",
      "appendix",
    ]);
  });

  it("describes the week in a weekly report, not the trailing 30 days", async () => {
    // Regression: every section used to read from the 30-day window whatever
    // the report type, so a weekly report quoted a 30-day review count as
    // though it were the week's — a real number attached to the wrong period.
    const [weekly, monthly] = await Promise.all([
      generateReport(tenant.businessId, ReportType.WEEKLY),
      generateReport(tenant.businessId, ReportType.MONTHLY),
    ]);

    const sectionFor = async (reportId: string) =>
      prisma.reportSection.findFirstOrThrow({
        where: { reportId, key: "review-performance" },
      });

    const weeklySection = await sectionFor(weekly.reportId);
    const monthlySection = await sectionFor(monthly.reportId);

    const weeklyCount = (weeklySection.data as { count: number }).count;
    const monthlyCount = (monthlySection.data as { count: number }).count;

    // The corpus spans 50 days, so a week must cover strictly fewer reviews.
    expect(weeklyCount).toBeLessThan(monthlyCount);
    expect(weeklySection.body).toContain(String(weeklyCount));
  }, 60_000);

  it("is idempotent on the same period", async () => {
    const first = await generateReport(tenant.businessId, ReportType.MONTHLY);
    const second = await generateReport(tenant.businessId, ReportType.MONTHLY);

    expect(second.reportId).toBe(first.reportId);

    const sections = await prisma.reportSection.count({
      where: { reportId: first.reportId },
    });
    expect(sections).toBe(10);
  });

  it("renders to HTML and text without losing its figures", async () => {
    const { reportId } = await generateReport(tenant.businessId, ReportType.MONTHLY);

    const report = await prisma.report.findUniqueOrThrow({
      where: { id: reportId },
      include: { sections: { orderBy: { order: "asc" } } },
    });

    const html = renderReportHtml(report, { name: "Test Business" }, "http://x");
    const text = renderReportText(report, { name: "Test Business" });

    expect(html).toContain("Test Business");
    expect(html).toContain(String(report.reputationScore));
    expect(html).toContain("Biggest problems");
    expect(text).toContain("EXECUTIVE SUMMARY");
    // The disclaimer travels with the report wherever it is rendered.
    expect(html).toContain("does not provide legal or medical advice");
  });

  it("escapes review text rather than injecting it into the email markup", async () => {
    const injected = await createTenant();
    await ingestReviews(injected.businessId, injected.sourceId, [
      {
        externalReviewId: "xss",
        rating: 1,
        text: '<script>alert("x")</script> The wait was terrible and staff were rude.',
        reviewedAt: daysAgo(2),
      },
      ...Array.from({ length: 6 }, (_, i) => ({
        externalReviewId: `filler-${i}`,
        rating: 4,
        text: `The staff were friendly and helpful. Visit ${i}.`,
        reviewedAt: daysAgo(3 + i),
      })),
    ]);
    await analyzeBusinessReviews(injected.businessId, { limit: 100 });

    const { reportId } = await generateReport(injected.businessId, ReportType.MONTHLY);
    const report = await prisma.report.findUniqueOrThrow({
      where: { id: reportId },
      include: { sections: { orderBy: { order: "asc" } } },
    });

    const html = renderReportHtml(report, { name: "Injected" }, "http://x");
    expect(html).not.toContain("<script>alert");
  }, 60_000);
});

describe("demo provisioning", () => {
  it("creates a labelled demo business and is idempotent", async () => {
    const org = await createTenant();

    const first = await provisionDemoBusiness(org.organizationId);
    const second = await provisionDemoBusiness(org.organizationId);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.businessId).toBe(first.businessId);

    const business = await prisma.business.findUniqueOrThrow({
      where: { id: first.businessId },
    });
    expect(business.isDemo).toBe(true);

    // Competitors come with their own corpora so the comparison view has
    // something real to compare.
    const competitors = await prisma.competitor.findMany({
      where: { businessId: first.businessId },
      include: { _count: { select: { reviews: true } } },
    });
    expect(competitors.length).toBe(2);
    expect(competitors.every((c) => c._count.reviews > 0)).toBe(true);
    expect(competitors.every((c) => c.isDemo)).toBe(true);
  }, 60_000);
});
