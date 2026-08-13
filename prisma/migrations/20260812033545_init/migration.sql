-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ReviewProviderKey" AS ENUM ('DEMO', 'CSV_IMPORT', 'GOOGLE_BUSINESS_PROFILE', 'YELP', 'FACEBOOK', 'TRIPADVISOR');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('NEGATIVE_SPIKE', 'RATING_DROP', 'NEW_RECURRING_COMPLAINT', 'CRITICAL_REVIEW', 'VOLUME_DROP');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('NEW', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('STARTER', 'GROWTH', 'PRO');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "UsageKind" AS ENUM ('REVIEW_INGESTED', 'AI_ANALYSIS', 'REPORT_GENERATED', 'EMAIL_SENT');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "website" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "addressLine1" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_sources" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT,
    "provider" "ReviewProviderKey" NOT NULL,
    "displayName" TEXT NOT NULL,
    "externalAccountId" TEXT,
    "status" "SourceStatus" NOT NULL DEFAULT 'CONNECTED',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "credentials" JSONB,
    "syncCursor" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "reviewSourceId" TEXT NOT NULL,
    "provider" "ReviewProviderKey" NOT NULL,
    "externalReviewId" TEXT NOT NULL,
    "reviewerName" TEXT,
    "rating" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "url" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "responseText" TEXT,
    "respondedAt" TIMESTAMP(3),
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_analyses" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sentiment" "Sentiment" NOT NULL,
    "sentimentScore" DOUBLE PRECISION NOT NULL,
    "urgency" "Urgency" NOT NULL,
    "summary" TEXT NOT NULL,
    "problems" TEXT[],
    "strengths" TEXT[],
    "suggestedReply" TEXT,
    "riskFlagged" BOOLEAN NOT NULL DEFAULT false,
    "riskCategories" TEXT[],
    "modelProvider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "raw" JSONB NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_topics" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_topic_mentions" (
    "id" TEXT NOT NULL,
    "reviewAnalysisId" TEXT NOT NULL,
    "reviewTopicId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sentiment" "Sentiment" NOT NULL,
    "sentimentScore" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "importance" DOUBLE PRECISION NOT NULL,
    "excerpt" TEXT,

    CONSTRAINT "review_topic_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitors" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "region" TEXT,
    "provider" "ReviewProviderKey" NOT NULL,
    "externalId" TEXT,
    "ratingAvg" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_reviews" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "provider" "ReviewProviderKey" NOT NULL,
    "externalReviewId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "sentiment" "Sentiment",
    "sentimentScore" DOUBLE PRECISION,
    "topicKeys" TEXT[],
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitor_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "priority" "Priority" NOT NULL,
    "expectedImpact" TEXT NOT NULL,
    "topicKey" TEXT,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'OPEN',
    "evidenceReviewIds" TEXT[],
    "metrics" JSONB NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "threshold" DOUBLE PRECISION NOT NULL,
    "windowDays" INTEGER NOT NULL DEFAULT 30,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "alertRuleId" TEXT,
    "type" "AlertType" NOT NULL,
    "severity" "Priority" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "evidenceReviewIds" TEXT[],
    "status" "AlertStatus" NOT NULL DEFAULT 'NEW',
    "dedupeKey" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "reputationScore" INTEGER,
    "scoreDelta" INTEGER,
    "summary" TEXT,
    "metrics" JSONB,
    "error" TEXT,
    "generatedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_sections" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,

    CONSTRAINT "report_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_schedules" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "frequency" "ReportType" NOT NULL,
    "dayOfWeek" INTEGER NOT NULL DEFAULT 1,
    "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "hour" INTEGER NOT NULL DEFAULT 8,
    "recipientEmail" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reputation_snapshots" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "capturedOn" DATE NOT NULL,
    "score" INTEGER NOT NULL,
    "components" JSONB NOT NULL,
    "avgRating" DOUBLE PRECISION NOT NULL,
    "reviewCount" INTEGER NOT NULL,
    "positiveRate" DOUBLE PRECISION NOT NULL,
    "negativeRate" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reputation_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'STARTER',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "businessId" TEXT,
    "kind" "UsageKind" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "meta" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "businessId" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'RUNNING',
    "stats" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "memberships_organizationId_idx" ON "memberships"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_organizationId_key" ON "memberships"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "businesses_organizationId_idx" ON "businesses"("organizationId");

-- CreateIndex
CREATE INDEX "locations_businessId_idx" ON "locations"("businessId");

-- CreateIndex
CREATE INDEX "review_sources_businessId_idx" ON "review_sources"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "review_sources_businessId_provider_externalAccountId_key" ON "review_sources"("businessId", "provider", "externalAccountId");

-- CreateIndex
CREATE INDEX "reviews_businessId_reviewedAt_idx" ON "reviews"("businessId", "reviewedAt");

-- CreateIndex
CREATE INDEX "reviews_businessId_rating_idx" ON "reviews"("businessId", "rating");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_reviewSourceId_externalReviewId_key" ON "reviews"("reviewSourceId", "externalReviewId");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_businessId_contentHash_key" ON "reviews"("businessId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "review_analyses_reviewId_key" ON "review_analyses"("reviewId");

-- CreateIndex
CREATE INDEX "review_analyses_businessId_sentiment_idx" ON "review_analyses"("businessId", "sentiment");

-- CreateIndex
CREATE INDEX "review_analyses_businessId_urgency_idx" ON "review_analyses"("businessId", "urgency");

-- CreateIndex
CREATE INDEX "review_topics_businessId_idx" ON "review_topics"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "review_topics_businessId_key_key" ON "review_topics"("businessId", "key");

-- CreateIndex
CREATE INDEX "review_topic_mentions_businessId_reviewTopicId_idx" ON "review_topic_mentions"("businessId", "reviewTopicId");

-- CreateIndex
CREATE UNIQUE INDEX "review_topic_mentions_reviewAnalysisId_reviewTopicId_key" ON "review_topic_mentions"("reviewAnalysisId", "reviewTopicId");

-- CreateIndex
CREATE INDEX "competitors_businessId_idx" ON "competitors"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "competitors_businessId_provider_externalId_key" ON "competitors"("businessId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "competitor_reviews_competitorId_reviewedAt_idx" ON "competitor_reviews"("competitorId", "reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_reviews_competitorId_externalReviewId_key" ON "competitor_reviews"("competitorId", "externalReviewId");

-- CreateIndex
CREATE INDEX "recommendations_businessId_status_idx" ON "recommendations"("businessId", "status");

-- CreateIndex
CREATE INDEX "recommendations_businessId_priority_idx" ON "recommendations"("businessId", "priority");

-- CreateIndex
CREATE INDEX "alert_rules_businessId_idx" ON "alert_rules"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "alert_rules_businessId_type_key" ON "alert_rules"("businessId", "type");

-- CreateIndex
CREATE INDEX "alerts_businessId_status_idx" ON "alerts"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_businessId_dedupeKey_key" ON "alerts"("businessId", "dedupeKey");

-- CreateIndex
CREATE INDEX "reports_businessId_periodStart_idx" ON "reports"("businessId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "reports_businessId_type_periodStart_key" ON "reports"("businessId", "type", "periodStart");

-- CreateIndex
CREATE INDEX "report_sections_reportId_order_idx" ON "report_sections"("reportId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "report_sections_reportId_key_key" ON "report_sections"("reportId", "key");

-- CreateIndex
CREATE INDEX "report_schedules_businessId_idx" ON "report_schedules"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "report_schedules_businessId_frequency_key" ON "report_schedules"("businessId", "frequency");

-- CreateIndex
CREATE INDEX "reputation_snapshots_businessId_capturedOn_idx" ON "reputation_snapshots"("businessId", "capturedOn");

-- CreateIndex
CREATE UNIQUE INDEX "reputation_snapshots_businessId_capturedOn_key" ON "reputation_snapshots"("businessId", "capturedOn");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organizationId_key" ON "subscriptions"("organizationId");

-- CreateIndex
CREATE INDEX "usage_records_organizationId_kind_occurredAt_idx" ON "usage_records"("organizationId", "kind", "occurredAt");

-- CreateIndex
CREATE INDEX "job_runs_jobName_startedAt_idx" ON "job_runs"("jobName", "startedAt");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_sources" ADD CONSTRAINT "review_sources_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_sources" ADD CONSTRAINT "review_sources_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewSourceId_fkey" FOREIGN KEY ("reviewSourceId") REFERENCES "review_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_analyses" ADD CONSTRAINT "review_analyses_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_topics" ADD CONSTRAINT "review_topics_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_topic_mentions" ADD CONSTRAINT "review_topic_mentions_reviewAnalysisId_fkey" FOREIGN KEY ("reviewAnalysisId") REFERENCES "review_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_topic_mentions" ADD CONSTRAINT "review_topic_mentions_reviewTopicId_fkey" FOREIGN KEY ("reviewTopicId") REFERENCES "review_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_reviews" ADD CONSTRAINT "competitor_reviews_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_alertRuleId_fkey" FOREIGN KEY ("alertRuleId") REFERENCES "alert_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reputation_snapshots" ADD CONSTRAINT "reputation_snapshots_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
