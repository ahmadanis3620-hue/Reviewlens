# ReputeIQ

> The repository is named **reviewlens**; the product is currently named
> **ReputeIQ** throughout the code and docs. Both are working names — renaming
> is a find-and-replace plus a docs pass whenever the name is settled.

Review intelligence for local service businesses. It continuously analyzes
customer reviews, identifies recurring problems and strengths, compares a
business against its competitors, detects trends, and says what to fix next.

It is not a review scraper. There is no HTML fetching anywhere in the codebase.

---

## What this is

A working MVP with real database persistence, real authentication, a real
analysis pipeline, and a demo mode that runs the entire product end to end with
no external credentials at all.

Running `npm run seed:demo` produces a dental practice with 309 reviews across
14 months, ingests them through the same pipeline a paying customer's reviews
would travel, analyzes every one, computes a reputation score with a full
breakdown, generates ranked recommendations tied to the reviews that justify
them, fires alerts, and builds a ten-section monthly report. Every figure on
screen is computed from those rows.

```
.
├── prisma/schema.prisma       # 22 models, multi-tenant from the root
├── src/lib/                   # the domain logic — pure where it can be
│   ├── ai/                    # provider interface, OpenAI + local analyzer
│   ├── analytics/             # aggregation, trends, score, competitors (pure)
│   ├── providers/             # review source interface + adapters
│   ├── ingestion/             # normalization, PII scrubbing, deduplication
│   ├── analysis/, insights/   # persistence-facing pipeline
│   ├── recommendations/, alerts/, reports/, email/, jobs/, billing/
│   └── auth/                  # sessions, tenant guards
├── src/app/                   # landing, auth, onboarding, dashboard, API
├── tests/                     # 143 tests, unit + integration
└── docs/                      # architecture.md, mvp-plan.md
```

---

## Architecture in one page

Full detail in [`docs/architecture.md`](docs/architecture.md). Honest status and
risks in [`docs/mvp-plan.md`](docs/mvp-plan.md). What running it against real
prospects actually taught us — including who the buyer is and the defects that
only surfaced on real-shaped data — in [`docs/field-notes.md`](docs/field-notes.md).

```
ReviewProvider ──> Normalize ──> Deduplicate ──> Postgres
                   (PII strip)   (idempotent)      │
                                                   ▼
                                            AI analysis
                                                   │
                                                   ▼
                          Aggregation ──> Trends ──> Score
                                                   │
                          ┌────────────────────────┼────────────────────┐
                          ▼                        ▼                    ▼
                   Recommendations              Alerts              Reports ──> Email
```

Three decisions shape everything else:

**The analytics core is pure.** Scoring, aggregation, and trend detection are
functions over plain objects with no database or React dependency. That is what
makes them testable with literal fixtures and reusable by the dashboard, the job
runner, and the report generator alike.

**The model never produces a statistic.** Every number in the product is
computed from Postgres rows. The AI receives those computed facts and is asked
only for prose and judgement. A guard scans generated text for numeric tokens
and drops anything that cannot be traced back to the fact set the model was
given. Insights link to the reviews behind them.

**Providers are swappable, and unconfigured means unavailable.** Review sources
and AI vendors sit behind interfaces. A provider without credentials reports
itself unconfigured and cannot be connected — which is the honest behaviour when
there is no legal path to the data, and the reason CSV import exists.

### Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 ·
PostgreSQL 16 + Prisma 6 · Recharts · Vitest

**Authentication: first-party email + password.** Chosen over Clerk or Supabase
Auth because the hard requirement was that the product be fully demonstrable
with no external credentials, and both of those require a live project before a
single page renders. bcrypt at cost 12; the session cookie carries a random
32-byte token and only its sha256 hash is stored, so database read access does
not yield usable sessions. Swapping to a hosted provider touches `src/lib/auth/`
and two pages — everything else depends on `requireSession()`.

---

## Setup

### Requirements

- Node.js 20+
- PostgreSQL 16+

### Install and run

```bash
npm install

cp .env.example .env
# Edit DATABASE_URL and set SESSION_SECRET (openssl rand -base64 48)

createdb reputeiq_dev
createdb reputeiq_test          # tests truncate this one
npm run db:migrate

npm run seed:demo               # ~30s: seeds, analyzes, scores, reports
npm run dev
```

Open http://localhost:3000 and sign in at `/login`:

```
demo@reputeiq.local / demo-password-123
```

Or sign up fresh at `/signup` and choose **Load demo data** on the onboarding
screen.

### Environment variables

Only four are required. Everything else degrades to a working local default.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | **yes** | Postgres connection (pooled). |
| `DIRECT_URL` | for migrations | Unpooled connection. Same as above locally. |
| `SESSION_SECRET` | **yes** | 32+ random characters. |
| `CRON_SECRET` | **yes** | Bearer token for `/api/cron/*`. |
| `TEST_DATABASE_URL` | for tests | Must differ from `DATABASE_URL` — tests truncate it. |
| `APP_URL` | no | Used in report emails. Defaults to localhost. |
| `AI_PROVIDER` | no | `local` (default) or `openai`. |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | no | Enables the OpenAI analyzer. |
| `AI_FALLBACK_TO_LOCAL` | no | Degrade to the local analyzer on vendor failure. |
| `EMAIL_PROVIDER` / `RESEND_API_KEY` / `EMAIL_FROM` | no | `console` writes to `.mail/`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Enables the Google source. |
| `YELP_API_KEY` | no | Enables the Yelp source. |
| `BILLING_ENABLED` | no | Stripe is stubbed; plan limits apply regardless. |

Env is validated at boot by `src/lib/env.ts` and fails fast with a readable
message rather than surfacing `undefined` deep in a request.

### Commands

```bash
npm run dev            # dev server
npm run build          # prisma generate + next build
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # 143 tests (needs TEST_DATABASE_URL)

npm run db:migrate     # create + apply a migration
npm run db:deploy      # apply migrations (production)
npm run db:studio      # Prisma Studio

npm run seed:demo      # seed the demo account
npm run jobs:run -- sync-reviews
npm run jobs:run -- all --business <id>
```

---

## How demo mode works

Demo mode exists so the product can be evaluated — and sold — before a single
integration is connected.

`src/lib/demo/generator.ts` composes a corpus rather than randomizing one. Each
theme has a probability schedule across the timeline, so the data encodes a
deliberate narrative the analysis genuinely discovers:

- **staff, cleanliness, quality** — consistently praised throughout
- **wait time** — a real problem that worsens sharply over the final quarter
- **pricing and billing** — a complaint thread that emerges late

Ratings fall out of the themes each review contains rather than being drawn
independently, so rating and text always agree. A fixed-seed PRNG makes the
corpus byte-identical on every run, which is why tests can assert against it.

The current demo lands at a reputation score in the mid-60s with wait time as
the clear top complaint and staff as the clear top strength. That is deliberate:
a business with a real, fixable problem demonstrates the product better than a
flawless one, and every number is internally consistent with the corpus.

Everything demo-generated is flagged `isDemo` on `Business`, `Competitor`, and
`ReviewSource`. The UI banners it wherever it appears, and no code path mixes
demo and real reviews inside one business.

The **local analyzer is not a mock**. It reads the review text — polarity
lexicon with negation and intensifier handling, phrase-matched topic detection,
urgency rules — and produces defensible output. That is what makes demo mode a
demonstration rather than a mockup.

---

## Connecting real review providers

### CSV import — works today, no credentials

Settings → Review sources → Upload a CSV.

```csv
external_id,rating,text,date,reviewer_name
r-001,5,"Great cleaning, the hygienist was thorough.",2026-06-14,Sarah M.
r-002,2,"Waited 45 minutes past my appointment time.",2026-06-18,James T.
```

Required: `external_id`, `rating` (1–5), `text`, `date` (ISO).
Optional: `reviewer_name`, `url`, `response_text`. Any other column is ignored —
the product deliberately does not store reviewer contact details.

This goes through the same ingestion, deduplication, scrubbing, and analysis
path as every other source. Re-uploading the same file imports nothing new.

### Google Business Profile

1. Create a Google Cloud project and request Business Profile API access.
2. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
3. The provider then reports itself configured on the integrations screen.

The adapter (`src/lib/providers/google.ts`) is written against the documented
`accounts.locations.reviews.list` shape but is **untested against the live API** —
no credentials were available during development. The OAuth token-refresh loop
is deliberately not implemented rather than written blind.

### Yelp

Set `YELP_API_KEY`. Note the real constraint, which the integrations screen
states plainly: Fusion returns a small sample of reviews with excerpted text,
not the full corpus. The adapter contributes the published rating and count —
which are reliable — plus available excerpts.

### Adding a provider

Implement `ReviewProvider` (`src/lib/providers/types.ts`) and add one line to
the registry. Nothing else changes.

```ts
export interface ReviewProvider {
  readonly key: ReviewProviderKey;
  readonly label: string;
  isConfigured(): boolean;
  fetchReviews(ctx: FetchContext): Promise<FetchResult>;
}
```

---

## Background jobs

A registry plus an HTTP trigger, which maps onto Vercel Cron with no adapter.

```bash
curl -X POST https://your-app/api/cron/sync-reviews \
  -H "Authorization: Bearer $CRON_SECRET"
```

Jobs: `sync-reviews`, `analyze-reviews`, `refresh-insights`, `evaluate-alerts`,
`generate-reports`, `send-scheduled-reports`, `maintenance`. Each writes a
`JobRun` row with stats and errors. Handlers select work by "not yet done"
state, so a run that times out is resumed by the next invocation.

`vercel.json` declares the schedules. Migrating to a real queue replaces the
trigger, not the handlers.

---

## Deployment

Target: Vercel + managed Postgres (Neon, Supabase, RDS).

1. Set every required environment variable.
2. Build command is `npm run build` (runs `prisma generate` first).
3. Run `npm run db:deploy` against the production database on release.
4. Use the pooled connection string for `DATABASE_URL` and the direct one for
   `DIRECT_URL`.
5. `vercel.json` registers the cron schedules; set `CRON_SECRET` in the project
   so Vercel attaches it as a bearer token.

`GET /api/health` reports database reachability.

---

## Testing

```bash
npm test
```

143 tests across 11 files. Unit tests drive the pure analytics core with literal
fixtures; integration tests run against a real Postgres and truncate between
files.

| Area | Covered |
|---|---|
| Authentication | Hashing, salting, token storage, expiry, pruning, cascade, constant-time comparison |
| Tenant isolation | Every guarded accessor across two seeded organizations, plus cascade deletion |
| Ingestion | Creation, idempotency, in-batch dedupe, reissued-id detection, response updates, PII scrubbing |
| Analysis | Sentiment, negation, intensifiers, per-topic sentiment, urgency, risk flags, schema conformance, determinism |
| Aggregation | Rating stats, sentiment rates over analyzed reviews only, topic rollups, evidence ids |
| Trends | Sparse-data suppression, window boundaries, new/growing/improving/resolved classification |
| Reputation score | Determinism, component bounds, window filtering, delta against the prior period |
| Competitor comparison | Published vs sampled ratings, share-based divergence, thin-data refusal |
| Reports | All ten sections, idempotency, HTML/text rendering, HTML escaping |
| Anti-fabrication guard | Catches invented figures, accepts traceable ones |

---

## Known limitations

Expanded, with severity and remediation cost, in
[`docs/mvp-plan.md`](docs/mvp-plan.md).

- **Google and Yelp adapters are untested against live APIs.** No credentials
  existed during development. OAuth token refresh is not implemented.
- **Analysis is one model call per review.** Fine to a few thousand reviews;
  batching is the first optimization that matters.
- **Rate limiting is in-memory, per instance.** Correct on a single node only.
- **Stripe is stubbed.** Plans, limits, and metering are real; no payment is
  taken.
- **Competitors without a connected source hold names only.** The comparison
  framework is complete, but it needs data; the UI says so rather than showing
  a rating it does not have.
- **Reports print rather than export as PDF.**
- **No team invitations or password reset.**
- **The local analyzer will miss sarcasm and unusual phrasing.** It is the right
  default for demos, not for a paying customer's data.

---

## Next recommended steps

1. **Batch review analysis** — the dominant variable cost, reducible by roughly
   an order of magnitude.
2. **Redis-backed rate limiting and a real job queue** — the same migration:
   stop keeping state in the process.
3. **A working competitor data source** — the largest gap between what the
   product promises and what it currently delivers.
4. Team accounts, password reset, vertical-specific topic packs.

---

## Product principles this codebase actually enforces

- Never fabricate a statistic. Generated prose containing an untraceable number
  is dropped, not shown.
- Every insight links back to the reviews that produced it.
- Never claim a guaranteed financial outcome. Impact is a three-value
  qualitative scale.
- No scraping. Official APIs, or files the business owner supplies.
- Multi-tenant from the first migration, not retrofitted.
- Both the AI provider and the review providers are replaceable behind
  interfaces.
- The product is genuinely useful with demo data.
