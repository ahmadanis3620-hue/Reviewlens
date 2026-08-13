# Field notes

Findings from running the product against real prospects. This is the context
that does not live in the code: what the analysis actually said, what it got
wrong, and what the go-to-market attempts turned up.

Kept because most of it is not recoverable from the repository — and two of the
entries change what should be built next.

---

## 1. Who this product is actually for

Two prospects were run through the full pipeline. The contrast is the most
useful thing in this document.

**Advance Dentistry — Hilliard** (real practice, ~4.7 stars from ~137 public
reviews). The product produced a reputation score of **91/100**, one negative
mention across 90 days, zero alerts, and a single recommendation — and that
recommendation was "protect a strength", not "fix a problem".

That output is correct and honest. It is also nearly worthless as a sales
argument. A practice at 4.7 stars does not need to be told what to fix, because
the data does not show anything broken.

**A practice at ~3.9 stars** (fictional, see §2). Score **69/100 and falling**,
wait time as a clear and growing top complaint, billing questions emerging over
the last quarter, four recommendations, and a critical rating-drop alert.

**Conclusion: the buyer sits between roughly 3.5 and 4.3 stars.** Below that the
business usually knows it is in trouble and has bigger problems than analytics.
Above it, the product's central promise — "we tell you what to fix next" — has
almost nothing to work with. Prospect lists should be screened on rating before
anyone spends time on them.

A secondary finding from the same run: at ~10 reviews per month, a 30-day window
is too thin for trend detection. The product handles this correctly (it prints
"not enough data" rather than a percentage), but it means **monthly reporting is
the wrong cadence for a small practice.** A 90-day view would have something to
say. Worth exposing as a per-customer setting.

---

## 2. Rules for building a sample report for a named prospect

`scripts/prospect-demo.ts` exists to produce a labelled sample for a prospect
who has not connected anything yet. Two constraints govern it, and both were
arrived at the hard way:

**A report for a real, named business must not contain invented complaints.**
For the 4.7-star practice this was tolerable — the simulated corpus was
calibrated to their real published rating and the only negatives used were ones
already voiced publicly about them. For a 3.9-star profile it is not: a report
at that rating necessarily contains a volume of complaints, and attaching those
to a real practice's name — then emailing it around — is unfair to them however
it is labelled. **The 3.9 sample is therefore a fictional practice**, and the
name carries "(Sample)" so the marking survives the report being forwarded
without its covering note.

**Calibrate on the full corpus, not on the recent window.** A 30-day window of
10–20 reviews is far too noisy to tune against; two runs at identical settings
came out 0.7 stars apart. Tune the all-time average and let the recent window
fall where it falls.

---

## 3. Email is the wrong first channel for this market

Nine independent Columbus-area dental practices were checked for a published
contact email. **One of nine had one.** The rest publish a phone number and a
contact form and nothing else.

This is not bad luck. Dental practices deliberately avoid publishing email —
HIPAA-adjacent caution plus spam avoidance. An email-first outreach motion is
fighting the grain of the market. The phone is the channel these businesses
chose, and a call also yields the owner's name, after which email starts working.

Related, on the sending side:

- **`.html` attachments are a phishing signal** to both people and spam filters,
  and may be stripped before delivery. Anything that has to persuade a cold
  recipient must render in the message body. `renderReportPreview()` exists for
  exactly this — a compact block for inlining, deliberately not the whole report,
  because ten sections inline is a wall of text people scroll past.
- Multi-location groups are bought at HQ, not at the location. Advance Dentistry
  is one site of a Cincinnati-headquartered group; the front desk cannot say yes.
  Longer sale, bigger contract, different pitch.

---

## 4. The bottleneck is the same on both sides

Screening prospects by star rating turned out to be impossible with automated
tooling — Google and Yelp both refuse programmatic access. That is the *same*
wall the product itself hits when it tries to read a customer's reviews, and the
same reason CSV import exists as the credential-free path.

**The prospecting problem and the product's data problem are one problem.**
Whichever data access gets solved first solves both. That argues for putting
real effort into official API access earlier than a feature-priority list would
otherwise suggest.

---

## 5. Analysis defects found by running it on real-shaped data

Every one of these was found by generating a report and looking at it, not by a
test. They are recorded because they share a shape, and the next one probably
will too.

**Topic-cue bleed — four instances.** A cue word that belongs to one theme
appears routinely inside complaints about another:

| Cue | Fired | Actually about |
|---|---|---|
| "waiting room", "chair" | Facilities | wait time |
| "appointment" | Scheduling | wait time |
| "checked in" | Follow-up & Aftercare | staff attentiveness during the visit |
| "recommend" | Overall Value | the visit as a whole |

The fix is always the same: make the cue name the specific act the topic is
about, not a word that merely co-occurs with it. Expect more of these with every
new vertical, and expect to need real review data from that vertical to find
them.

**Sentiment inversion.** The review's overall tone was allowed to flip an
explicit statement, so "the office is spotless" inside a furious one-star review
was recorded as a *negative* mention of cleanliness — the analyzer contradicting
the sentence it was quoting. Overall tone may now moderate a topic's sentiment
but never invert a clear local signal.

**Quotes ignored polarity.** The "biggest problems" section illustrated a theme
with a compliment. Aggregation now keeps positive and negative excerpts
separately and each section quotes the polarity it is describing.

**Fragile percentages.** A theme going from 1 mention to 5 rendered as "+400%".
Arithmetically true and technically traceable, but it reads as a catastrophe
when the underlying change is four reviews. A percentage now requires a baseline
of at least 2 mentions in the previous period as well; below that the theme is
still surfaced, just described in words.

**Wrong window in weekly reports.** Every section read from the 30-day window
regardless of report type, so a weekly report quoted a 30-day review count as
though it were the week's. Real number, wrong period — the exact failure mode
this product exists to eliminate.

**Demo corpus cross-contamination.** The demo provider fell back to its own
built-in corpus when a source carried no corpus config, so syncing a second demo
business poured 309 unrelated reviews into it. Caught only because the resulting
average missed its target. The corpus now travels on the source.
