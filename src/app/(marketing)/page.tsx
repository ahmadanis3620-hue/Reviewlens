import Link from "next/link";

import { Badge } from "@/components/ui/primitives";
import { PLANS, PLAN_ORDER } from "@/lib/billing/plans";

/**
 * Landing page.
 *
 * The claims here are constrained by the same rule as the product: nothing
 * about guaranteed revenue, no invented customer statistics, no fake logos.
 * What it sells is the thing that actually exists — the analysis.
 */

export const metadata = {
  title: "ReputeIQ — Know what your customers are really saying",
};

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Connect your reviews",
    body: "Link an official review source, or upload a CSV export of the reviews you already have. Demo data is available if you want to look around first.",
  },
  {
    step: "02",
    title: "Every review gets analyzed",
    body: "Sentiment, themes, urgency, and the specific problems and strengths a reviewer named — extracted from the text, not guessed from the star rating.",
  },
  {
    step: "03",
    title: "Patterns become priorities",
    body: "Individual reviews roll up into recurring themes, trends against the previous period, and a reputation score you can actually take apart.",
  },
  {
    step: "04",
    title: "You get told what to fix",
    body: "Specific operational recommendations, ranked, each linked back to the reviews that justify it. Plus a weekly or monthly report by email.",
  },
];

const FEATURES = [
  {
    title: "Review intelligence",
    body: "Every review is scored for sentiment and urgency, and tagged with the themes it actually discusses. Topics are discovered from your reviews rather than picked from a fixed list, so the analysis fits a roofing company as well as a dental practice.",
    points: [
      "Sentiment and urgency per review",
      "Themes discovered from your own review text",
      "Problems and strengths quoted from the source",
      "Draft responses you review before posting",
    ],
  },
  {
    title: "Competitor intelligence",
    body: "Track nearby businesses and see where you genuinely differ. Comparisons are expressed as a share of each side's own reviews, so a competitor with more volume does not automatically look worse.",
    points: [
      "Rating and review volume side by side",
      "Topic-level complaint rates, not raw counts",
      "The themes where you lead and where you lag",
    ],
  },
  {
    title: "Actionable recommendations",
    body: "Not a summary of your reviews — a short list of operational changes, ranked by priority, each one tied to the reviews that support it.",
    points: [
      "Specific enough to assign to someone",
      "Ranked by volume and how fast the problem is growing",
      "Every recommendation links to its evidence",
    ],
  },
  {
    title: "Automated reports",
    body: "A weekly or monthly report covering your score, the biggest problems, what customers love, emerging issues, and where you stand against competitors.",
    points: [
      "Delivered by email on your schedule",
      "Same figures as the dashboard, by construction",
      "Print-ready for a team meeting",
    ],
  },
];

const FAQ = [
  {
    q: "Where does the review data come from?",
    a: "Official platform APIs that you authorize, or a CSV export of your own reviews. ReputeIQ does not scrape review sites — there is no HTML fetching anywhere in the product. Sources you have not connected simply are not available.",
  },
  {
    q: "Can I try it without connecting anything?",
    a: "Yes. Demo mode loads a realistic sample business with a full review history and runs the entire analysis pipeline on it. It is clearly labelled as demo data throughout and never mixes with your real reviews.",
  },
  {
    q: "How do I know the numbers are real?",
    a: "Every figure in the product is computed from your review rows. The AI writes the explanations, never the statistics, and generated text containing a number that does not trace back to your data is discarded rather than shown. Insights link to the reviews behind them.",
  },
  {
    q: "How is the reputation score calculated?",
    a: "From six weighted components: average rating, review sentiment, negative review rate, review velocity, whether you respond to unhappy customers, and how many complaints keep recurring. The full breakdown is on your dashboard, and the score is deterministic — same reviews, same score.",
  },
  {
    q: "Will it reply to reviews for me?",
    a: "It drafts replies. Nothing is published automatically. Posting a public response on behalf of a business is not a decision to hand to software.",
  },
  {
    q: "What if a review mentions something serious?",
    a: "Reviews mentioning potential safety, legal, or regulatory issues are flagged for your attention and raised as an alert. ReputeIQ flags them for a human — it does not assess legal or medical claims.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-[15px] font-semibold tracking-[-0.01em]">
            ReputeIQ
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <a href="#how" className="hidden text-ink-secondary hover:text-ink sm:block">
              How it works
            </a>
            <a href="#features" className="hidden text-ink-secondary hover:text-ink sm:block">
              Features
            </a>
            <a href="#pricing" className="hidden text-ink-secondary hover:text-ink sm:block">
              Pricing
            </a>
            <Link href="/login" className="text-ink-secondary hover:text-ink">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-[var(--radius)] bg-accent px-3.5 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Start free
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <div className="max-w-3xl">
            <Badge tone="accent">For local service businesses</Badge>
            <h1 className="mt-5 text-4xl font-semibold tracking-[-0.03em] text-ink sm:text-5xl">
              Know what your customers are really saying.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-secondary">
              ReputeIQ continuously analyzes your reviews, identifies reputation
              problems, tracks competitors, and tells you what to fix next.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="rounded-[var(--radius)] bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
              >
                Start free
              </Link>
              <Link
                href="/signup?demo=1"
                className="rounded-[var(--radius)] border border-line-strong px-5 py-2.5 text-sm font-medium text-ink hover:bg-hover"
              >
                See demo
              </Link>
            </div>
            <p className="mt-4 text-xs text-ink-muted">
              No credit card required. Demo data available without connecting a
              review source.
            </p>
          </div>
        </div>
      </section>

      {/* Illustrative dashboard strip — labelled as an example, not a claim. */}
      <section className="border-b border-line bg-sunken">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="rounded-[var(--radius)] border border-line bg-raised">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
              <p className="text-[13px] font-semibold tracking-[0.04em] text-ink-muted uppercase">
                Example dashboard
              </p>
              <Badge>Illustrative — not real customer data</Badge>
            </div>
            <div className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
              {[
                { label: "Reputation score", value: "82", sub: "out of 100" },
                { label: "Average rating", value: "4.4", sub: "last 30 days" },
                { label: "Positive", value: "82%", sub: "of analyzed reviews" },
                { label: "Top issue", value: "Wait time", sub: "12 mentions" },
              ].map((tile) => (
                <div key={tile.label} className="px-5 py-5">
                  <p className="text-[13px] text-ink-secondary">{tile.label}</p>
                  <p className="tnum mt-1 text-2xl font-semibold tracking-[-0.02em]">
                    {tile.value}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">{tile.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">How it works</h2>
          <div className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} className="flex gap-5">
                <span className="tnum text-sm font-semibold text-accent">
                  {item.step}
                </span>
                <div>
                  <h3 className="text-[15px] font-semibold text-ink">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
                    {item.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-b border-line bg-sunken">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">
            What you actually get
          </h2>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-[var(--radius)] border border-line bg-raised p-6"
              >
                <h3 className="text-[15px] font-semibold text-ink">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
                  {feature.body}
                </p>
                <ul className="mt-4 space-y-2">
                  {feature.points.map((point) => (
                    <li key={point} className="flex gap-2.5 text-sm text-ink-secondary">
                      <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">Pricing</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
            One flat monthly price per plan. Every plan includes the full analysis
            pipeline — the difference is how many locations and competitors you
            track.
          </p>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PLAN_ORDER.map((key) => {
              const plan = PLANS[key];
              const featured = key === "GROWTH";
              return (
                <div
                  key={key}
                  className={
                    featured
                      ? "rounded-[var(--radius)] border-2 border-accent bg-raised p-6"
                      : "rounded-[var(--radius)] border border-line bg-raised p-6"
                  }
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-[15px] font-semibold text-ink">{plan.name}</h3>
                    {featured ? <Badge tone="accent">Most popular</Badge> : null}
                  </div>
                  <p className="mt-4">
                    <span className="tnum text-3xl font-semibold tracking-[-0.02em]">
                      ${plan.priceMonthlyUsd}
                    </span>
                    <span className="text-sm text-ink-muted">/month</span>
                  </p>
                  <ul className="mt-5 space-y-2.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2.5 text-sm text-ink-secondary">
                        <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/signup"
                    className={
                      featured
                        ? "mt-6 block rounded-[var(--radius)] bg-accent px-4 py-2 text-center text-sm font-medium text-white hover:bg-accent-hover"
                        : "mt-6 block rounded-[var(--radius)] border border-line-strong px-4 py-2 text-center text-sm font-medium text-ink hover:bg-hover"
                    }
                  >
                    Start free
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-line bg-sunken">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">
            Frequently asked questions
          </h2>
          <dl className="mt-8 divide-y divide-line">
            {FAQ.map((item) => (
              <div key={item.q} className="py-5">
                <dt className="text-[15px] font-medium text-ink">{item.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-ink-secondary">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-ink-muted">
            ReputeIQ — review intelligence for local businesses.
          </p>
          <div className="flex gap-5 text-sm text-ink-secondary">
            <Link href="/login" className="hover:text-ink">
              Sign in
            </Link>
            <Link href="/signup" className="hover:text-ink">
              Start free
            </Link>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-ink-muted">
          ReputeIQ analyzes publicly available review content obtained through
          official integrations or supplied by the business. It highlights reviews
          that may warrant attention but does not provide legal, medical, or
          financial advice, and makes no guarantee of any particular business
          outcome.
        </p>
      </footer>
    </div>
  );
}
