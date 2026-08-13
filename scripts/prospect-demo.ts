/**
 * Generates a labelled sample report for a named prospect.
 *
 *   npm run demo:prospect
 *
 * This is a sales tool, not a data pipeline. It builds a business profile from
 * *real, publicly verifiable* details (name, address, published rating and
 * review count) and pairs it with a **simulated** review corpus calibrated to
 * that published rating, so a prospect can see what the product would tell them
 * before they connect anything.
 *
 * Two rules this script exists to enforce:
 *
 *  1. The business is flagged `isDemo`, so every screen carries the demo banner
 *     and nothing can be mistaken for the practice's real reviews.
 *  2. The simulated themes are kept proportionate to the real published rating
 *     and to what is already publicly said about the practice. Inventing a
 *     volume of complaints about a real, named business would be both dishonest
 *     and unfair to them.
 *
 * Never present the review-derived figures as the prospect's actual reviews.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { ReviewProviderKey, ReportType, SourceStatus } from "@prisma/client";

import { analyzeBusinessReviews } from "@/lib/analysis/analyze";
import { ensureDefaultAlertRules } from "@/lib/alerts/evaluate";
import { seedStarterTopics } from "@/lib/analysis/topics";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { generateCorpus, type CorpusConfig } from "@/lib/demo/generator";
import { ingestReviews } from "@/lib/ingestion/ingest";
import { runFullPipeline } from "@/lib/jobs/registry";
import { generateReport } from "@/lib/reports/generate";
import { renderReportHtml } from "@/lib/reports/render";
import { slugify } from "@/lib/utils";

// ---------------------------------------------------------------------------
// The prospect. Everything in this block is real and publicly verifiable.
// ---------------------------------------------------------------------------

const PROSPECT = {
  name: "Advance Dentistry - Hilliard",
  industry: "Dentist",
  website: "https://nofeardentist.com/location/oh-hilliard-3325-hilliard-rome-road/",
  timezone: "America/New_York",
  location: {
    label: "Hilliard",
    addressLine1: "3325 Hilliard Rome Rd",
    city: "Hilliard",
    region: "OH",
    postalCode: "43026",
    country: "US",
  },
  /** Published aggregate the simulated corpus is calibrated against. */
  publishedRating: 4.7,
  publishedReviewCount: 137,
} as const;

/**
 * Sentence bank written in the language this practice is actually described in
 * publicly: anxiety-friendly care, thorough hygienists, clear explanation of
 * cost. The negatives mirror the only concerns that appear publicly — feeling
 * rushed at busy times, and treatment-plan communication — and nothing else.
 */
const PROSPECT_SNIPPETS = {
  staff: {
    positive: [
      "I have serious dental anxiety and they made the whole visit completely painless.",
      "They talked me through every step and I never felt panicked once.",
      "The hygienist was gentle and checked in with me the entire time.",
      "First dentist I have not dreaded going to in twenty years.",
      "Everyone from the front desk to the assistant was warm and welcoming.",
      "They were so patient with my son, who is terrified of the dentist.",
    ],
    negative: [
      "Felt a little rushed during my visit and I did not get to ask everything I wanted.",
    ],
  },
  quality: {
    positive: [
      "Most thorough cleaning and exam I have had anywhere.",
      "They caught something early that my previous dentist missed entirely.",
      "The crown fits perfectly and looks completely natural.",
      "My extraction was far easier than I expected and healed without any issues.",
    ],
    negative: [],
  },
  communication: {
    positive: [
      "The dentist explained every option clearly and never pushed me toward anything.",
      "They walked me through the treatment plan step by step before starting.",
      "Really appreciated how clearly everything was explained beforehand.",
    ],
    negative: [
      "I was not clear on what the next step in my treatment plan was and had to call back to find out.",
    ],
  },
  pricing: {
    positive: [
      "They explained exactly what it would cost before starting anything.",
      "No surprise charges — the estimate matched the final bill exactly.",
      "Fair pricing and completely upfront about it.",
    ],
    negative: [],
  },
  cleanliness: {
    positive: [
      "The office is spotless and everything looks brand new.",
      "Very clean, modern practice with up to date equipment.",
    ],
    negative: [],
  },
  professionalism: {
    positive: [
      "Very professional operation from check-in to check-out.",
      "Clearly experienced and I trust their judgment completely.",
    ],
    negative: [],
  },
  "wait-time": {
    positive: ["Taken back right on time, which I appreciated."],
    negative: [
      "Waited a while past my appointment time before being taken back.",
    ],
  },
  scheduling: {
    positive: ["They fit me in quickly when I called with a problem."],
    negative: ["It took a few weeks to get a routine cleaning booked."],
  },
} satisfies CorpusConfig["snippets"];

/**
 * Theme mix calibrated to a 4.7-star practice: overwhelmingly positive, with a
 * small, honest tail of the concerns that are already public.
 */
const PROSPECT_CORPUS: Omit<CorpusConfig, "endDate"> = {
  seed: 43026,
  months: 14,
  reviewsPerMonth: 10,
  monthlyJitter: 3,
  responseRate: 0.4,
  idPrefix: "sample-adh",
  snippets: PROSPECT_SNIPPETS,
  themes: [
    { topicKey: "staff", polarity: "positive", base: 0.66 },
    { topicKey: "quality", polarity: "positive", base: 0.4 },
    { topicKey: "communication", polarity: "positive", base: 0.3 },
    { topicKey: "pricing", polarity: "positive", base: 0.22 },
    { topicKey: "cleanliness", polarity: "positive", base: 0.2 },
    { topicKey: "professionalism", polarity: "positive", base: 0.18 },
    // The only negatives are the ones already voiced publicly, and they tick up
    // slightly in recent months so the trend detection has something to find.
    {
      topicKey: "staff",
      polarity: "negative",
      base: 0.03,
      byRecentMonth: { 0: 0.1, 1: 0.08 },
    },
    {
      topicKey: "communication",
      polarity: "negative",
      base: 0.03,
      byRecentMonth: { 0: 0.09, 1: 0.07 },
    },
    {
      topicKey: "wait-time",
      polarity: "negative",
      base: 0.03,
      byRecentMonth: { 0: 0.09, 1: 0.07 },
    },
    { topicKey: "scheduling", polarity: "negative", base: 0.04 },
  ],
};

// ---------------------------------------------------------------------------
// The buyer-profile sample.
//
// This practice is fictional, and deliberately so. A report for a business at
// this rating necessarily contains a volume of complaints, and attaching
// invented complaints to a real, named practice — then emailing it around —
// would be unfair to them regardless of how it is labelled. The name carries
// "(Sample)" so the marking survives the report being forwarded without its
// covering note.
// ---------------------------------------------------------------------------

const SAMPLE_39 = {
  name: "Riverbend Family Dental (Sample)",
  industry: "Dentist",
  website: null,
  timezone: "America/New_York",
  location: {
    label: "Main office",
    addressLine1: null,
    city: "Columbus",
    region: "OH",
    postalCode: null,
    country: "US",
  },
  publishedRating: 3.9,
  publishedReviewCount: 214,
} as const;

const SAMPLE_39_SNIPPETS = {
  "wait-time": {
    positive: ["Taken back right on time for once, which I appreciated."],
    negative: [
      "I waited almost an hour past my appointment time before anyone came to get me.",
      "My appointment was at 4:30 and I did not get taken back until well after 5.",
      "Third visit in a row where they were running badly behind schedule.",
      "Sat in the waiting room a very long time with no update on when I would be seen.",
      "The wait has gotten noticeably worse over the past few months.",
      "Ended up leaving and rebooking because they were running so far behind.",
    ],
  },
  billing: {
    positive: ["Billing was straightforward and they handled the insurance without any fuss."],
    negative: [
      "I got a surprise bill weeks later for something I was told was covered.",
      "The billing office got my insurance information wrong twice.",
      "Still waiting on a refund for an amount I was overcharged.",
      "Nobody could explain what a line item on my statement was actually for.",
    ],
  },
  pricing: {
    positive: ["Reasonable prices for the quality of the work."],
    negative: [
      "The cost came in a lot higher than what I was quoted on the phone.",
      "Prices have gone up and nobody mentioned the increase beforehand.",
      "The treatment plan they proposed was extremely expensive and felt like an upsell.",
    ],
  },
  staff: {
    positive: [
      "The hygienist was wonderful and made a stressful visit easy.",
      "The whole team is kind, patient, and clearly cares about their patients.",
      "Everyone here is friendly and professional from the moment you walk in.",
      "They were so patient with my son, who is terrified of the dentist.",
      "The front desk staff are lovely and remember you by name.",
    ],
    negative: [
      "The person at the front desk was short with me and seemed annoyed by my questions.",
    ],
  },
  quality: {
    positive: [
      "The work they did was excellent and I have had no issues since.",
      "Best cleaning I have had in years — genuinely thorough.",
      "My crown fits perfectly and looks completely natural.",
    ],
    negative: ["I had to come back twice to get the same filling adjusted properly."],
  },
  cleanliness: {
    positive: [
      "The office is spotless every time I come in.",
      "Very clean facility and the equipment all looks well maintained.",
    ],
    negative: [],
  },
  scheduling: {
    positive: ["They fit me in the same day when I called with a problem."],
    negative: [
      "They rescheduled my appointment twice with very little notice.",
      "It took over two months to get a routine cleaning appointment.",
    ],
  },
  communication: {
    positive: ["The dentist explained every option clearly and never pushed me toward anything."],
    negative: ["No one called me back after I left two messages about my treatment plan."],
  },
} satisfies CorpusConfig["snippets"];

/** Calibrated to ~3.9 stars: a solid practice with real, recurring problems. */
const SAMPLE_39_CORPUS: Omit<CorpusConfig, "endDate"> = {
  seed: 39390,
  months: 14,
  reviewsPerMonth: 18,
  monthlyJitter: 4,
  responseRate: 0.25,
  idPrefix: "sample-rfd",
  snippets: SAMPLE_39_SNIPPETS,
  themes: [
    { topicKey: "staff", polarity: "positive", base: 0.66 },
    { topicKey: "quality", polarity: "positive", base: 0.42 },
    { topicKey: "cleanliness", polarity: "positive", base: 0.3 },
    { topicKey: "communication", polarity: "positive", base: 0.2 },
    // The story: wait times are the entrenched problem and getting worse,
    // with a billing thread emerging over the last quarter.
    {
      topicKey: "wait-time",
      polarity: "negative",
      base: 0.14,
      byRecentMonth: { 0: 0.39, 1: 0.33, 2: 0.24, 3: 0.19 },
    },
    {
      topicKey: "billing",
      polarity: "negative",
      base: 0.06,
      byRecentMonth: { 0: 0.19, 1: 0.16, 2: 0.11 },
    },
    { topicKey: "pricing", polarity: "negative", base: 0.1 },
    { topicKey: "scheduling", polarity: "negative", base: 0.09 },
    { topicKey: "communication", polarity: "negative", base: 0.05 },
    { topicKey: "quality", polarity: "negative", base: 0.05 },
    { topicKey: "staff", polarity: "negative", base: 0.05 },
  ],
};

type Preset = {
  profile: {
    name: string;
    industry: string;
    website: string | null;
    timezone: string;
    location: {
      label: string;
      addressLine1: string | null;
      city: string;
      region: string;
      postalCode: string | null;
      country: string;
    };
    publishedRating: number;
    publishedReviewCount: number;
  };
  corpus: Omit<CorpusConfig, "endDate">;
  /** True when the profile names a real business. */
  realBusiness: boolean;
};

const PRESETS: Record<string, Preset> = {
  "advance-dentistry-hilliard": {
    profile: PROSPECT,
    corpus: PROSPECT_CORPUS,
    realBusiness: true,
  },
  "sample-dentist-39": {
    profile: SAMPLE_39,
    corpus: SAMPLE_39_CORPUS,
    realBusiness: false,
  },
};

const OWNER_EMAIL = process.env.PROSPECT_EMAIL ?? "prospect@reputeiq.local";
const OWNER_PASSWORD = process.env.PROSPECT_PASSWORD ?? "prospect-password-123";

async function main() {
  const now = new Date();

  const presetKey = process.argv[2] ?? "advance-dentistry-hilliard";
  const preset = PRESETS[presetKey];
  if (!preset) {
    console.error(
      `Unknown preset "${presetKey}". Available: ${Object.keys(PRESETS).join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  const PROFILE = preset.profile;
  const slug = slugify(`${PROFILE.name}-sample`);

  const organization = await prisma.organization.upsert({
    where: { slug },
    create: { name: PROFILE.name, slug, subscription: { create: {} } },
    update: {},
  });

  const user = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    create: {
      email: OWNER_EMAIL,
      name: "Prospect Demo",
      passwordHash: await hashPassword(OWNER_PASSWORD),
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

  const existing = await prisma.business.findFirst({
    where: { organizationId: organization.id, name: PROFILE.name },
    select: { id: true },
  });

  const business =
    existing ??
    (await prisma.business.create({
      data: {
        organizationId: organization.id,
        name: PROFILE.name,
        industry: PROFILE.industry,
        website: PROFILE.website,
        timezone: PROFILE.timezone,
        // Non-negotiable: this profile carries simulated reviews, so it is
        // flagged as demo data and bannered on every screen.
        isDemo: true,
        locations: { create: { ...PROFILE.location } },
      },
      select: { id: true },
    }));

  await seedStarterTopics(business.id);
  await ensureDefaultAlertRules(business.id);

  const source = await prisma.reviewSource.upsert({
    where: {
      businessId_provider_externalAccountId: {
        businessId: business.id,
        provider: ReviewProviderKey.DEMO,
        externalAccountId: "prospect-sample",
      },
    },
    create: {
      businessId: business.id,
      provider: ReviewProviderKey.DEMO,
      externalAccountId: "prospect-sample",
      displayName: "Simulated sample feed (not real reviews)",
      status: SourceStatus.CONNECTED,
      isDemo: true,
      // The corpus must be attached to the source, not merely ingested once.
      // The demo provider falls back to its own built-in corpus otherwise, so
      // the next sync would pour an unrelated business's reviews into this one.
      config: { corpus: preset.corpus, endDate: now.toISOString() },
    },
    update: {
      config: { corpus: preset.corpus, endDate: now.toISOString() },
    },
  });

  // Ingest through the provider path so a later sync regenerates the identical
  // corpus and deduplicates to a no-op.
  const corpus = generateCorpus({ ...preset.corpus, endDate: now });
  const stats = await ingestReviews(business.id, source.id, corpus);
  console.log(
    `Ingested ${stats.created} simulated reviews (${stats.duplicates} already present).`,
  );

  await runFullPipeline(business.id, now);
  for (let pass = 0; pass < 20; pass++) {
    const remaining = await prisma.review.count({
      where: { businessId: business.id, analysis: { is: null } },
    });
    if (remaining === 0) break;
    await analyzeBusinessReviews(business.id, { limit: 200 });
  }
  await runFullPipeline(business.id, now);

  const { reportId } = await generateReport(business.id, ReportType.MONTHLY, now);

  const reviews = await prisma.review.findMany({
    where: {
      businessId: business.id,
      reviewedAt: { gte: new Date(now.getTime() - 30 * 86_400_000) },
    },
    select: { rating: true },
  });
  const avg =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  // Export a standalone HTML copy of the report, suitable for attaching.
  const full = await prisma.report.findUniqueOrThrow({
    where: { id: reportId },
    include: {
      sections: { orderBy: { order: "asc" } },
      business: { select: { name: true } },
    },
  });

  const notice = preset.realBusiness
    ? "Illustrative sample. Profile details are public; the individual reviews behind these figures are simulated, not this practice's real reviews."
    : "Illustrative sample for a fictional practice. Every review behind these figures is simulated.";

  const outDir = join(process.cwd(), "exports");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, `${presetKey}-report.html`);
  await writeFile(
    outPath,
    renderReportHtml(full, full.business, "", {
      includeAppLink: false,
      notice,
    }),
    "utf8",
  );

  console.log("");
  console.log(`Sample built for ${PROFILE.name}`);
  console.log(`  Preset:                   ${presetKey}${preset.realBusiness ? " (REAL business)" : " (fictional)"}`);
  console.log(`  Target rating:            ${PROFILE.publishedRating}`);
  console.log(`  Simulated 30-day average: ${avg.toFixed(2)} across ${reviews.length} reviews`);
  console.log(`  Report:                   /reports/${reportId}`);
  console.log(`  Exported:                 ${outPath}`);
  console.log(`  Sign in:                  ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
  console.log("");
  console.log("Every review-derived figure is SIMULATED. Label it as a sample.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
