# ReputeIQ — Architecture

> Status: MVP. This document describes what is actually implemented, and flags
> anything that is deliberately stubbed.

---

## 1. Layout

A standalone Next.js application.

```
.
├── prisma/         # schema + migrations
├── scripts/        # seed, job runner, and sales-tool CLIs
├── src/
│   ├── app/        # Next.js App Router (marketing, auth, dashboard, API)
│   ├── components/ # UI
│   └── lib/        # domain logic (the important part)
├── tests/
└── docs/
```

> Originally built in a subdirectory of another repository and moved here intact;
> the git history for that period lives in `ahmadanis3620-hue/Chore-App` on the
> `claude/reputeiq-mvp-build-tso750` branch.

The deliberate rule of this codebase: **the domain logic in `src/lib/` does not import
React, Next.js, or Prisma models it doesn't need.** Scoring, aggregation, and trend
detection are pure functions over plain data structures. That is what makes them
testable, deterministic, and reusable by the API routes, the job runner, and the report
generator alike.

---

## 2. Stack and why

| Concern | Choice | Reasoning |
|---|---|---|
| Framework | Next.js 16 (App Router) + React 19 | Server Components let the dashboard query Postgres directly with no client-side data layer; API routes cover ingestion/cron. |
| Language | TypeScript (strict) | Domain types are the specification. |
| Styling | Tailwind CSS v4 | v4 is CSS-first configured (`@theme` in `globals.css`), no `tailwind.config.js`. |
| Components | Hand-rolled primitives in `src/components/ui` | shadcn/ui's CLI pulls a Radix tree; for an MVP with this small a component surface, ~200 lines of local primitives is less to maintain and identical in output. Same API shape as shadcn, so swapping in is mechanical. |
| Database | PostgreSQL 16 + Prisma 6 | Relational data with heavy joins and aggregation; `String[]` and `Json` columns are native. |
| Auth | First-party email+password sessions (bcrypt + opaque DB-backed cookie) | See §6 for why this over Clerk/Supabase, and the migration path. |
| AI | Provider interface; OpenAI adapter + deterministic local adapter | See §5. |
| Charts | Recharts | Small, composable, works with the SVG output we need. |
| Jobs | Job registry invoked by HTTP cron endpoints and a CLI | See §7. |
| Email | Provider interface; Resend adapter + console adapter | See §8. |
| Tests | Vitest | Unit tests for pure logic, integration tests against a real Postgres. |

---

## 3. Data model

Full definition: `prisma/schema.prisma`. Shape and the reasoning behind it:

### Tenancy spine

```
Organization ──< Membership >── User ──< Session
     │
     ├──< Business ──< Location
     │        ├──< ReviewSource ──< Review ──1 ReviewAnalysis ──< ReviewTopicMention >── ReviewTopic
     │        ├──< Competitor ──< CompetitorReview
     │        ├──< Recommendation
     │        ├──< AlertRule ──< Alert
     │        ├──< Report ──< ReportSection
     │        ├──< ReportSchedule
     │        └──< ReputationSnapshot
     ├──1 Subscription
     └──< UsageRecord
```

`Organization` is the tenant root. **Every** row that holds customer data reaches an
Organization in at most two hops, and every query in the app is filtered by an
organization id resolved from the session — never from user input. See §6.

### Notable modelling decisions

**`Review` uniqueness is `(reviewSourceId, externalReviewId)`.** This is the idempotency
key for ingestion. Re-running an import is a no-op on rows that already exist. A
secondary `contentHash` (sha256 of provider + normalized text + rating + date) catches
the case where a provider reissues the same review under a new external id, which is
common when a location is re-linked.

**`ReviewAnalysis` is a separate 1:1 table, not columns on `Review`.** Reviews are facts
from a provider and are immutable once ingested. Analyses are derived, versioned
(`promptVersion`, `modelProvider`, `modelName`), and re-runnable. Keeping them apart
means re-analysing the corpus with a better model is a delete-and-recompute on one
table, and it keeps the audit trail of *which* model produced *which* conclusion.

**Topics are normalized per-business (`ReviewTopic`), not a global enum.** The AI is free
to return a topic we've never seen; `topicKey` slugs are upserted into the business's
topic dictionary on first sight. A seeded starter set of ~14 cross-vertical topics
(wait time, pricing, staff, cleanliness, communication, scheduling, quality,
professionalism, billing, facilities, availability, follow-up, value, location) gives
consistent naming across businesses without preventing discovery. `isCustom` marks the
discovered ones. Nothing in the aggregation layer hard-codes a topic key.

**`ReviewTopicMention` carries `sentiment`, `sentimentScore`, `confidence`, `importance`
and `excerpt`.** The excerpt is the span of the review that triggered the topic, which is
what makes an insight clickable back to its source. Uniqueness is
`(reviewAnalysisId, reviewTopicId)` — one review mentions a topic at most once.

**`CompetitorReview` stores `sentiment` / `sentimentScore` / `topicKeys` inline** rather
than reusing the full `ReviewAnalysis` + mention tables. Competitor data is compared in
aggregate only (rating, volume, topic frequency); we never need per-mention drill-down
for a competitor, and the flat shape keeps the comparison queries to a single scan.

**`ReputationSnapshot`** records the score and its components on the day it was computed.
This is what makes "↑ 4 points this month" a fact rather than a guess. The score function
is also pure and re-runnable over a historical window, so a missing snapshot is
backfillable rather than lost.

**`Recommendation` stores `evidenceReviewIds` and `metrics` alongside the prose.** See §5
— this is the mechanism that keeps generated insights traceable.

**`JobRun`** records every background execution with stats and errors. Ingestion and
analysis are the two things most likely to silently degrade; this makes that visible.

### Data minimization

`Review.reviewerDisplayName` is nullable and stores only the display name a platform
publishes publicly. There is no column for reviewer email, phone, address, or platform
user id. `dropReviewerIdentity()` in the ingestion normalizer strips anything a provider
sends beyond a display name before the row is constructed, so a chattier provider adapter
cannot accidentally widen what we retain. Deletion cascades from `Organization` down, so
a tenant delete is one statement.

---

## 4. Data pipeline

```
ReviewProvider adapter
        │  fetchReviews({ since, cursor })
        ▼
   Normalization         src/lib/ingestion/normalize.ts
        │                strips PII, clamps rating, computes contentHash
        ▼
   Deduplication         src/lib/ingestion/ingest.ts
        │                upsert on (reviewSourceId, externalReviewId); contentHash guard
        ▼
   Postgres (Review)
        │
        ▼
   AI analysis           src/lib/analysis/analyze.ts  → AIService
        │                validates against zod schema, upserts ReviewAnalysis + mentions
        ▼
   Aggregation           src/lib/analytics/aggregate.ts   (pure)
        │                topic rollups, sentiment distribution, rating stats
        ▼
   Trend detection       src/lib/analytics/trends.ts      (pure)
        │                current vs previous window, 7/30/90d
        ▼
   Reputation score      src/lib/analytics/score.ts       (pure, deterministic)
        │
        ├──> Recommendations   src/lib/recommendations/
        ├──> Alerts            src/lib/alerts/
        └──> Reports           src/lib/reports/ ──> Email
```

**Idempotency** holds at three points: ingestion upserts on a natural key; analysis
upserts on `reviewId` and skips reviews already analysed at the current `promptVersion`;
report generation upserts on `(businessId, type, periodStart)`. Running the whole
pipeline twice produces the same database state.

---

## 5. AI architecture

### The interface

```ts
interface AIProvider {
  readonly name: string;
  readonly model: string;
  analyzeReview(input: ReviewAnalysisInput): Promise<ReviewAnalysisResult>;
  generateRecommendations(ctx: RecommendationContext): Promise<RecommendationDraft[]>;
  generateExecutiveSummary(ctx: SummaryContext): Promise<string>;
  generateSuggestedResponse(input: SuggestedResponseInput): Promise<string>;
  compareCompetitors(ctx: CompetitorContext): Promise<string>;
}
```

`AIService` (`src/lib/ai/service.ts`) is the only thing the rest of the app talks to. It
owns validation, retry, timeout, logging, usage recording, and fallback. No `fetch` to a
model vendor exists anywhere outside `src/lib/ai/providers/`.

### Two adapters

- **`OpenAIProvider`** — Chat Completions with `response_format: json_schema` and
  `strict: true`, so the model's output is shape-guaranteed before zod ever sees it.
  Requires `OPENAI_API_KEY`. Server-only; the key is read from `process.env` inside a
  module that is never imported by a client component.
- **`LocalHeuristicProvider`** — a deterministic analyzer: a polarity lexicon with
  negation and intensifier handling, phrase-matched topic detection with per-topic
  positive/negative cue terms, urgency rules, and template-driven recommendation prose
  filled from computed metrics. It is *not* a random data generator — it reads the actual
  review text and produces defensible output. This is what makes demo mode genuinely
  functional with zero credentials, and it makes the analysis tests deterministic.

Selection is `AI_PROVIDER=openai|local` (default `local` when no key is present).
`AI_FALLBACK_TO_LOCAL=true` makes a failing OpenAI call degrade to the heuristic
provider with a logged warning rather than failing the job.

### The anti-fabrication rule

This is the part of the design I'd defend hardest.

**The model never produces a statistic.** Every number shown in the product — mention
counts, percentages, trend deltas, rating averages, score components — is computed by the
pure functions in `src/lib/analytics/` from rows in Postgres. The AI receives those
computed facts as input and is asked only for *prose and judgement*: what to call a theme,
what to do about it, how to phrase a summary.

Enforcement, concretely:

1. `RecommendationDraft` from the AI has no numeric fields. The persisted
   `Recommendation` gets its `metrics` JSON and `evidenceReviewIds` from the aggregation
   layer, not from the model.
2. The UI renders counts and deltas from those structured fields, never by parsing
   generated text.
3. `assertNoInventedNumbers()` (`src/lib/ai/guards.ts`) scans generated prose for numeric
   tokens and rejects any that don't appear in the fact set the model was given. A
   violation is logged and the draft is dropped rather than shown.
4. Trend statements are suppressed entirely below `MIN_MENTIONS_FOR_TREND` (3) — a jump
   from 1 mention to 2 is not a 100% increase, it's noise, and the UI says
   "not enough data" instead.

Every insight in the dashboard links back to the reviews that produced it, because the
evidence ids are stored with the insight.

---

## 6. Security model

### Authentication

**Choice: first-party email + password with opaque, database-backed sessions.**

Rationale: the brief's hard requirement is that the product be fully demonstrable with no
external credentials. Clerk and Supabase Auth both require a live project and API keys
before a single page renders, which would make the demo path depend on exactly the thing
we were asked to remove from the critical path. The implementation here is small and
conventional:

- bcrypt (cost 12) password hashing.
- Session token: 32 bytes from `crypto.randomBytes`, returned to the client in an
  `HttpOnly`, `SameSite=Lax`, `Secure`-in-production cookie. Only the **sha256 hash** is
  stored, so a database read does not yield usable sessions.
- 30-day expiry, sliding refresh, server-side revocation on logout (delete the row).
- Timing-safe comparison on lookup; uniform error messages on login failure so the
  endpoint isn't a user enumeration oracle.

Swapping to Clerk/Supabase later touches `src/lib/auth/` and the two auth pages only —
the rest of the app depends on `requireSession()`, not on how the session was minted.

### Tenant isolation

Three layers, because one is not enough:

1. **Resolution.** `requireSession()` reads the session cookie server-side and returns the
   user with memberships. Organization id comes from that record. There is no code path
   where an organization id arrives from a request body, query string, or client header.
2. **Guarded accessors.** `requireBusinessAccess(businessId)` loads the business and
   verifies its `organizationId` is one the session's user is a member of, throwing
   `ForbiddenError` otherwise. Every page and route handler that takes a business id calls
   it — a business id in a URL is treated as a claim to verify, not a fact.
3. **Query scoping.** Repository helpers always include the organization/business filter
   in the `where` clause, so even a missed guard cannot return a foreign row.

`tests/integration/tenant-isolation.test.ts` seeds two organizations and asserts that
every read path returns empty or throws when crossing the boundary.

### Other controls

- Zod validation at every API boundary; parse-then-use, never trust-then-check.
- In-memory sliding-window rate limiting on auth, ingestion, and AI-triggering routes
  (`src/lib/rate-limit.ts`). Documented as needing Redis for multi-instance deploys.
- Cron endpoints require `Authorization: Bearer $CRON_SECRET` and are constant-time
  compared.
- Secrets only in `process.env`, only in server modules. `.env*` is gitignored;
  `.env.example` carries names and no values.
- Structured logging (`src/lib/logger.ts`) with a redaction pass over key names matching
  `password|token|secret|key|authorization|email`.

---

## 7. Background jobs

MVP uses a **job registry + HTTP trigger** rather than a queue, which is the right
complexity for this stage and maps directly onto Vercel Cron.

```
src/lib/jobs/registry.ts   name -> handler
src/app/api/cron/[job]/route.ts   POST, bearer-authenticated
scripts/run-jobs.ts               CLI: npm run jobs:run -- <job>
```

Jobs: `sync-reviews`, `analyze-reviews`, `refresh-insights`, `evaluate-alerts`,
`generate-reports`, `send-scheduled-reports`. Each writes a `JobRun` row with stats.

All handlers are chunked and resumable — they select work by "not yet done" state rather
than by offset, so a timeout mid-run is recovered by the next invocation. Migrating to a
real queue (BullMQ, Inngest, QStash) means replacing the trigger, not the handlers.

---

## 8. Integrations

### Review providers

```ts
interface ReviewProvider {
  readonly key: ReviewProviderKey;
  readonly label: string;
  isConfigured(): boolean;
  fetchReviews(ctx: FetchContext): Promise<FetchResult>;   // cursor-paged, `since`-filtered
}
```

| Key | Status |
|---|---|
| `DEMO` | Implemented. Generates a coherent, seeded corpus (see §9). |
| `GOOGLE_BUSINESS_PROFILE` | Adapter implemented against the Business Profile API review shape; inert without OAuth credentials. |
| `YELP` | Adapter implemented against the Fusion API shape; inert without an API key. |
| `CSV_IMPORT` | Implemented. Upload a CSV of your own reviews — the credential-free path to real data. |
| `FACEBOOK`, `TRIPADVISOR` | Registered as unconfigured placeholders. |

**No scraping.** There is no HTML fetching or parsing anywhere in this codebase. Every
adapter targets an official API with an authenticated account, or ingests a file the
business owner supplies. `isConfigured()` returning false means the source cannot be
connected in the UI at all, which is the honest behaviour when we lack a legal path to the
data.

### Email

`EmailService` with `ResendProvider` (needs `RESEND_API_KEY`) and `ConsoleProvider`
(writes the rendered HTML to the log and to `.mail/` for local inspection). Report emails
are rendered as inline-styled HTML from the same `Report`/`ReportSection` rows the web
view uses, so the email and the app can't drift.

### Billing

`Subscription` and `UsageRecord` are modelled properly with plan limits enforced in
`src/lib/billing/plans.ts` (businesses, competitors, monthly AI analyses). Stripe itself
is stubbed: checkout is a local plan switch behind `BILLING_ENABLED=false`. Per the brief,
billing was explicitly deprioritized below the core product.

---

## 9. Demo mode

Demo mode exists so the product can be evaluated — and sold — before a single integration
is connected.

`scripts/seed-demo.ts` creates **Columbus Dental Care**, a fictional dental practice, with
140 reviews across 14 months from three sources. The generator (`src/lib/demo/`) is seeded
with a fixed PRNG, so the corpus is byte-identical on every run and tests can assert
against it.

The corpus is *composed*, not random: it encodes a deliberate narrative — consistently
strong staff and cleanliness sentiment, a wait-time problem that worsens sharply over the
final two months, and a pricing/billing complaint thread that emerges late. Ratings,
review lengths, and posting cadence vary realistically around that. This means the
analysis pipeline has something true to find, and the recommendations it produces are
defensible rather than decorative.

Two competitors are seeded with their own smaller corpora and a genuinely different topic
profile (better on wait time, weaker on staff), so the comparison view shows a real
contrast.

Everything demo-generated is flagged `isDemo = true` on `Business`, `Competitor`, and
`ReviewSource`, and the UI renders a persistent "Demo data" banner wherever demo rows are
displayed. There is no code path that mixes demo and real reviews in one business.

---

## 10. Deployment

Target: Vercel + managed Postgres (Neon, Supabase, or RDS).

- `prisma migrate deploy` on release; `prisma generate` runs in `build`.
- `vercel.json` declares the cron schedules hitting `/api/cron/<job>`.
- Required env vars are validated at boot by `src/lib/env.ts` (zod), which fails fast with
  a readable message rather than surfacing `undefined` deep in a request.
- Connection pooling: use the pooled connection string (`DATABASE_URL`) for the app and
  the direct one (`DIRECT_URL`) for migrations — both are wired in `schema.prisma`.

---

## 11. Known architectural limits

Honest list; expanded with severity in `docs/mvp-plan.md`.

- Rate limiting is per-instance in-memory. Correct only for a single node.
- Provider OAuth token refresh is modelled (`ReviewSource.credentials`) but the refresh
  loop is not implemented, because it can't be tested without real credentials.
- Analysis is one API call per review. Fine to a few thousand reviews; batching or a
  cheaper first-pass classifier is the next optimization.
- Reports render as HTML. PDF export is a print stylesheet, not a server-rendered PDF.
- No soft delete or audit log on mutations yet.
