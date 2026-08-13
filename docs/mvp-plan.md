# ReputeIQ — MVP plan and status

Companion to `docs/architecture.md`. That document describes how the system is
built; this one is an honest account of what is finished, what is not, and what
would break first under load.

Status as of this build: **P0 and P1 complete, P2 deliberately partial.**

---

## 1. Completed

### P0 — the core product

| Feature | State | Notes |
|---|---|---|
| Authentication | Done | Email + password, bcrypt (cost 12), opaque DB-backed sessions, sliding expiry, server-side revocation. Login is not a user-enumeration oracle. |
| Multi-tenancy | Done | Organization-rooted schema; three layers of isolation (§6 of architecture). 13 integration tests assert the boundary holds. |
| Business onboarding | Done | Create a business, or load the demo in one click. Industry, location, competitors. |
| Demo data | Done | 309 reviews across 14 months, seeded and deterministic, plus two competitors with their own corpora. Analysis runs on it for real. |
| Review database | Done | Provider-agnostic ingestion with idempotency on `(source, externalReviewId)` plus a content fingerprint for reissued reviews. |
| Review analysis | Done | Sentiment, sentiment score, urgency, per-topic sentiment, problems, strengths, risk flag. Two providers behind one interface. |
| Topic detection | Done | Seeded cross-vertical catalog, open to discovery. No aggregation code branches on a specific topic key. |
| Dashboard | Done | Overview, Reviews, Insights, Competitors, Recommendations, Alerts, Reports, Settings. |
| Recommendations | Done | Ranked, each with computed metrics and links to its evidence reviews. |

### P1 — the things that make it a product

| Feature | State | Notes |
|---|---|---|
| Competitor analysis | Done | Share-based topic divergence, published-vs-sampled rating handled honestly, refuses to compare on thin data. |
| Reports | Done | Ten-section weekly/monthly reports, idempotent per period, print-ready web view and HTML email from the same rows. |
| Email delivery | Done | Provider interface with Resend and a local outbox. Scheduling with per-business timezone and once-per-period guarantees. |
| Alerts | Done | Five rule types, per-business thresholds, deduplicated so the same condition does not re-fire. |

### P2 — partial, by choice

| Feature | State | Notes |
|---|---|---|
| Subscriptions | Modelled, not charged | Plans, limits, and metering are real and enforced. Stripe checkout is stubbed behind `BILLING_ENABLED`. |
| Additional integrations | Interfaces done | Google Business Profile and Yelp adapters written against the documented API shapes; inert without credentials. CSV import fully working. |
| Multi-location | Schema done | `Location` exists and sources attach to it; the UI treats a business as one location. |
| Review response workflow | Drafting only | Drafts generated on demand. Nothing is published, and no endpoint exists that could publish. |

### Cross-cutting

- **Tests**: 143 across 11 files — unit tests for the pure analytics core, integration tests against a real Postgres. Every area the brief named is covered.
- **Observability**: structured JSON logging with key-based redaction; `JobRun` records every background execution with stats and errors.
- **Security**: zod at every boundary, rate limiting on auth/ingestion/AI paths, constant-time cron auth, no secrets in the client bundle.
- **Docs**: architecture, this plan, and a README covering setup through deployment.

---

## 2. Not built

Listed so nobody discovers them at the wrong moment.

| Gap | Why it was left | Cost to close |
|---|---|---|
| OAuth flows for Google/Yelp | Cannot be written or tested blind — no credentials existed during development. The adapters and token storage are ready. | ~2–3 days per provider once credentials exist. |
| Stripe checkout and webhooks | The brief explicitly deprioritized billing below the core product. | ~2 days; plan limits already exist. |
| Team invitations | `Membership` supports roles; there is no invite UI. Every account is a single owner. | ~1 day. |
| Password reset | No email-based reset flow. | ~half a day once email is verified in production. |
| Server-rendered PDF | Reports print cleanly from the browser; there is no PDF endpoint. | ~1 day with a headless browser, plus the infrastructure to run one. |
| Multi-location UI | Schema supports it; the interface does not surface it. | ~2 days. |
| Data export / deletion self-service | Deleting a business cascades correctly, but there is no "export everything" button. | ~1 day. |

---

## 3. Technical risks

Ordered by how likely they are to bite, not by how dramatic they sound.

### High

**Platform API access is the real bottleneck, not the code.** Google Business
Profile API access requires an approved project and each business owner going
through OAuth; Yelp's Fusion terms restrict review storage and return excerpts
rather than full text. The architecture is right — swap providers, don't rewrite
the app — but no amount of clean abstraction shortens an approval queue. **This
is why CSV import exists**, and why it is the path most early customers should
be pushed down.

**Analysis cost scales linearly with reviews.** One model call per review. At
1,000 reviews per customer per month on a frontier model, inference is a
material fraction of a $49 subscription. Mitigations, roughly in order of
value: batch multiple reviews per call, run the local analyzer as a first pass
and escalate only ambiguous reviews, and cache by content hash across tenants
where the text is identical.

**In-memory rate limiting is per-instance.** On a multi-instance deploy the
effective limit is N times the configured one. Correct for a single node; needs
Redis before serious traffic.

### Medium

**The local analyzer's ceiling.** It handles the review language it was tuned
for well, and it will miss sarcasm, implicit topics, and unusual phrasing. It is
the right default for demos and a reasonable fallback; it is not a substitute
for a real model on a paying customer's data. The provider interface makes that
a config change rather than a rewrite.

**Topic-cue precision needs ongoing tuning.** Three real bleeds were found and
fixed during this build — "waiting room" and "chair" pulling wait-time
complaints into Facilities, and bare "appointment" pulling them into Scheduling.
Others will exist. The fix is always the same shape (make the cue specific to
the act the topic names), but it needs review data from real verticals to find
them.

**Report generation runs inline.** A business with many competitors could
approach the serverless execution limit. The job handlers are chunked and
resumable, but the report path is not.

**No connection pooler configured by default.** Serverless plus Postgres needs
PgBouncer or a driver adapter under real concurrency.

### Low

- No soft delete or audit log on mutations.
- Timezone handling for report schedules uses `toLocaleString` rather than a
  full tz library; correct for whole-hour offsets, imprecise at DST boundaries.
- The demo corpus slides with the current date, so screenshots taken months
  apart will differ.

---

## 4. Future improvements

**Next, in order:**

1. **Batch analysis.** Ten reviews per model call cuts the dominant variable
   cost by roughly an order of magnitude.
2. **Redis-backed rate limiting and a job queue.** Both are the same migration:
   stop keeping state in the process.
3. **Competitor data via an official source.** The competitor framework is
   real, but without a data source it holds names. This is the single biggest
   gap between what the product promises and what it currently delivers.
4. **Team accounts.** Roles exist in the schema; the invite flow does not.
5. **Vertical-specific topic packs.** A dental practice and a roofing company
   share maybe 60% of their themes. Shipping tuned starter catalogs per vertical
   would visibly improve first-run quality.
6. **Response publishing** — with a human approval step, once there is a
   platform integration that permits it.

**Worth considering later:** review-request campaigns (the highest-leverage way
to move a reputation score is more reviews, not better ones), location
benchmarking across a customer's own sites, and a Slack integration for alerts.

---

## 5. What would need to be true before the first paying customer

1. **A real review source they can connect in under five minutes.** Today that
   is CSV. Anything requiring an OAuth approval queue is not a self-serve
   onboarding path.
2. **An AI provider configured with a real key, and a cost model for it.** The
   local analyzer is honest about being a fallback; it should not be silently
   serving a paying customer.
3. **Email verified from a real domain,** with SPF/DKIM. A weekly report that
   lands in spam is a product that does not exist.
