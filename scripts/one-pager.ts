/**
 * Generates the walk-in one-pager as print-ready HTML and PDF.
 *
 *   npm run onepager
 *   npm run onepager -- --business "Cordova Nails & Spa" --rating 3.4 --reviews 92
 *
 * Two modes, and the difference matters:
 *
 *  - Generic (no flags): carries no claim about any specific business. Print a
 *    stack of these and hand one to anybody.
 *  - Personalized: prints the business's own name and its *public* Google
 *    rating in a header strip. A published rating is a fact about them that
 *    anyone can look up — it is not an analysis, and this page never pretends
 *    to have read their reviews. The report shown is always labelled a sample.
 *
 * That line is the whole design constraint: walking in and telling an owner
 * what their reviews say, when you have not read them, is a claim you cannot
 * back and they will catch it.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CHROMIUM = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

type Contact = {
  name: string;
  phone: string;
  email: string;
  site?: string;
};

type Options = {
  business?: string;
  rating?: string;
  reviews?: string;
  contact: Contact;
};

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(`--${flag}`);
    return i >= 0 ? args[i + 1] : undefined;
  };

  return {
    business: get("business"),
    rating: get("rating"),
    reviews: get("reviews"),
    contact: {
      name: get("me") ?? process.env.SALES_NAME ?? "[Your name]",
      phone: get("phone") ?? process.env.SALES_PHONE ?? "[Your phone]",
      email: get("email") ?? process.env.SALES_EMAIL ?? "[Your email]",
      site: get("site") ?? process.env.SALES_SITE,
    },
  };
}

function esc(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const ACCENT = "#1d4ed8";
const NEG = "#b91c1c";
const POS = "#047857";

function personalStrip(o: Options): string {
  if (!o.business) return "";
  const rating = o.rating ? `${esc(o.rating)}&#9733;` : "";
  const count = o.reviews ? ` from ${esc(o.reviews)} Google reviews` : "";
  const facts = rating ? `${rating}${count}` : "";

  return `
  <div style="border:1px solid ${ACCENT};background:#eef4fd;padding:10px 14px;margin-bottom:14px;">
    <div style="font-size:9pt;letter-spacing:.08em;text-transform:uppercase;color:${ACCENT};font-weight:700;">Prepared for</div>
    <div style="font-size:15pt;font-weight:700;color:${INK};margin-top:2px;">${esc(o.business)}</div>
    ${facts ? `<div style="font-size:10pt;color:${MUTED};margin-top:2px;">Currently ${facts} &middot; publicly listed, as of today</div>` : ""}
  </div>`;
}

function render(o: Options): string {
  const { contact } = o;

  return `<!doctype html>
<html>
<head><meta charset="utf-8">
<style>
  @page { size: letter; margin: 0.38in; }
  * { box-sizing: border-box; }
  body {
    margin: 0; color: ${INK}; background: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1 { font-size: 20pt; line-height: 1.1; margin: 0; letter-spacing: -0.02em; }
  .lede { font-size: 10.5pt; line-height: 1.4; color: ${MUTED}; margin: 6px 0 0 0; }
  .cols { display: flex; gap: 14px; margin-top: 11px; }
  .card { border: 1px solid ${LINE}; }
  .kicker { font-size: 8.5pt; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: ${MUTED}; }
  .tick { display:flex; gap:8px; font-size:9.5pt; line-height:1.35; margin-bottom:5px; color:${INK}; }
  .tick b { font-weight: 700; }
  .dot { color:${ACCENT}; font-weight:700; }
</style>
</head>
<body>

<div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid ${INK};padding-bottom:7px;">
  <div style="font-size:13pt;font-weight:800;letter-spacing:-0.01em;">Reviewlens</div>
  <div style="font-size:9.5pt;color:${MUTED};">Review intelligence for local business</div>
</div>

<div style="margin-top:13px;">
  ${personalStrip(o)}
  <h1>Your customers already told you<br>exactly what to fix.</h1>
  <p class="lede">
    It is buried in hundreds of reviews nobody has time to read. I read all of them,
    every month, and send you one page: what is going wrong, what is going right,
    and the three things to do about it.
  </p>
</div>

<div class="cols">

  <!-- Sample report: always labelled, never a claim about the reader -->
  <div style="flex:1.15;">
    <div class="card">
      <div style="background:#eef4fd;border-bottom:1px solid ${LINE};padding:6px 12px;font-size:8.5pt;font-weight:700;color:${ACCENT};">
        SAMPLE &middot; a real month of analysis for an example business
      </div>

      <div style="padding:9px 11px 7px 11px;border-bottom:1px solid ${LINE};">
        <div style="font-size:11.5pt;font-weight:700;">Riverbend Family Dental</div>
        <div style="font-size:9pt;color:${MUTED};">Monthly report &middot; August</div>
        <table style="width:100%;margin-top:9px;border-collapse:collapse;"><tr>
          <td><div style="font-size:8.5pt;color:${MUTED};">Score</div><div style="font-size:14pt;font-weight:800;">69<span style="font-size:9pt;color:${MUTED};">/100</span></div></td>
          <td><div style="font-size:8.5pt;color:${MUTED};">Rating</div><div style="font-size:15pt;font-weight:800;">3.50</div></td>
          <td><div style="font-size:8.5pt;color:${MUTED};">Reviews</div><div style="font-size:15pt;font-weight:800;">18</div></td>
          <td><div style="font-size:8.5pt;color:${MUTED};">Negative</div><div style="font-size:15pt;font-weight:800;">17%</div></td>
        </tr></table>
      </div>

      <div style="padding:8px 11px;border-bottom:1px solid ${LINE};">
        <div class="kicker" style="margin-bottom:5px;">Biggest problems</div>
        <div style="border-left:3px solid ${NEG};padding-left:8px;margin-bottom:7px;">
          <div style="font-size:10pt;font-weight:700;">Wait time <span style="font-weight:400;color:${MUTED};">&middot; 4 negative mentions</span></div>
          <div style="font-size:9pt;color:${MUTED};font-style:italic;">&ldquo;I waited almost an hour past my appointment time.&rdquo;</div>
        </div>
        <div style="border-left:3px solid ${NEG};padding-left:8px;margin-bottom:7px;">
          <div style="font-size:10pt;font-weight:700;">Billing <span style="font-weight:400;color:${MUTED};">&middot; 2 negative mentions</span></div>
          <div style="font-size:9pt;color:${MUTED};font-style:italic;">&ldquo;They got my insurance information wrong twice.&rdquo;</div>
        </div>
        <div style="border-left:3px solid ${NEG};padding-left:8px;">
          <div style="font-size:10pt;font-weight:700;">Pricing <span style="font-weight:400;color:${MUTED};">&middot; 2 negative mentions</span></div>
          <div style="font-size:9pt;color:${MUTED};font-style:italic;">&ldquo;Prices went up and nobody mentioned it beforehand.&rdquo;</div>
        </div>
      </div>

      <div style="padding:8px 11px;border-bottom:1px solid ${LINE};">
        <div class="kicker" style="margin-bottom:5px;">What customers love</div>
        <div style="font-size:10pt;border-left:3px solid ${POS};padding-left:8px;margin-bottom:4px;"><b>Staff friendliness</b> <span style="color:${MUTED};">&middot; 7 mentions</span></div>
        <div style="font-size:10pt;border-left:3px solid ${POS};padding-left:8px;margin-bottom:4px;"><b>Professionalism</b> <span style="color:${MUTED};">&middot; 4 mentions</span></div>
        <div style="font-size:10pt;border-left:3px solid ${POS};padding-left:8px;"><b>Cleanliness</b> <span style="color:${MUTED};">&middot; 3 mentions</span></div>
      </div>

      <div style="padding:8px 11px;">
        <div class="kicker" style="margin-bottom:5px;">What to do this month</div>
        <div style="font-size:9.5pt;line-height:1.4;margin-bottom:6px;"><b>1. Fix the 4&ndash;6pm slot.</b> That is where appointments run furthest behind. Add one buffer.</div>
        <div style="font-size:9.5pt;line-height:1.4;margin-bottom:6px;"><b>2. Say the price out loud</b> before work starts, not on the invoice.</div>
        <div style="font-size:9.5pt;line-height:1.4;"><b>3. Put &ldquo;friendly staff&rdquo; in your listing.</b> It is what people already praise.</div>
      </div>
    </div>
  </div>

  <!-- Offer -->
  <div style="flex:0.85;">
    <div class="kicker">What you get, every month</div>
    <div style="margin-top:8px;">
      <div class="tick"><span class="dot">&rarr;</span><span><b>Every review read</b>, not just the angry ones.</span></div>
      <div class="tick"><span class="dot">&rarr;</span><span><b>The recurring complaint</b> named, counted, and quoted.</span></div>
      <div class="tick"><span class="dot">&rarr;</span><span><b>Three specific things to do</b> &mdash; not &ldquo;improve service&rdquo;.</span></div>
      <div class="tick"><span class="dot">&rarr;</span><span><b>An alert</b> the week your rating starts slipping.</span></div>
      <div class="tick"><span class="dot">&rarr;</span><span><b>How you compare</b> to the shop down the road.</span></div>
    </div>

    <div style="border-top:1px solid ${LINE};margin-top:11px;padding-top:11px;">
      <div class="kicker">How it works</div>
      <div style="font-size:10pt;line-height:1.45;margin-top:7px;">
        <div style="margin-bottom:5px;"><b>1.</b> You give me your Google listing. That is it.</div>
        <div style="margin-bottom:5px;"><b>2.</b> I send the first report in 48 hours.</div>
        <div><b>3.</b> If it tells you nothing you did not know, we stop there.</div>
      </div>
      <div style="font-size:9pt;color:${MUTED};margin-top:8px;line-height:1.4;">
        Nothing to install. No contract. I never post replies as you.
      </div>
    </div>

    <div style="border:2px solid ${INK};padding:11px 12px;margin-top:12px;">
      <div style="font-size:10.5pt;font-weight:800;">First report free.</div>
      <div style="font-size:10pt;color:${MUTED};margin-top:3px;line-height:1.4;">
        Then <b style="color:${INK};">$49/month</b> if it is worth it to you.
      </div>
      <div style="border-top:1px dashed ${LINE};margin-top:9px;padding-top:9px;">
        <div style="font-size:10pt;font-weight:700;">No website?</div>
        <div style="font-size:9.5pt;color:${MUTED};line-height:1.4;margin-top:2px;">
          I will build you a simple one-page site &mdash; free with your first month.
        </div>
      </div>
    </div>

    <div style="margin-top:12px;">
      <div class="kicker">Talk to me</div>
      <div style="font-size:12pt;font-weight:800;margin-top:5px;">${esc(contact.name)}</div>
      <div style="font-size:11pt;margin-top:3px;">${esc(contact.phone)}</div>
      <div style="font-size:10.5pt;color:${ACCENT};">${esc(contact.email)}</div>
      ${contact.site ? `<div style="font-size:10pt;color:${MUTED};margin-top:2px;">${esc(contact.site)}</div>` : ""}
    </div>
  </div>
</div>

<div style="margin-top:12px;border-top:2px solid ${INK};padding-top:9px;">
  <div style="font-size:11pt;font-weight:800;">Three things worth checking yourself, today.</div>
  <div style="font-size:9.5pt;color:${MUTED};margin-top:2px;">Free advice, whether or not you ever call me.</div>

  <div style="display:flex;gap:12px;margin-top:9px;">
    <div style="flex:1;border-left:3px solid ${ACCENT};padding-left:9px;">
      <div style="font-size:10pt;font-weight:700;">Read your last ten reviews.</div>
      <div style="font-size:9.5pt;color:${MUTED};line-height:1.4;margin-top:3px;">
        Sort by newest, not by rating. Whatever complaint shows up twice in ten
        is already costing you customers who never wrote anything.
      </div>
    </div>
    <div style="flex:1;border-left:3px solid ${ACCENT};padding-left:9px;">
      <div style="font-size:10pt;font-weight:700;">Count your replies.</div>
      <div style="font-size:9.5pt;color:${MUTED};line-height:1.4;margin-top:3px;">
        How many of your negative reviews got a response? Every future customer
        reads that reply. It is the cheapest thing on this page to fix.
      </div>
    </div>
    <div style="flex:1;border-left:3px solid ${ACCENT};padding-left:9px;">
      <div style="font-size:10pt;font-weight:700;">Check 90 days, not all time.</div>
      <div style="font-size:9.5pt;color:${MUTED};line-height:1.4;margin-top:3px;">
        Your all-time average hides a slide. Two hundred old five-stars will
        mask a bad quarter for a long while.
      </div>
    </div>
  </div>
</div>

<div style="margin-top:11px;background:${INK};color:#fff;padding:11px 15px;display:flex;justify-content:space-between;align-items:center;">
  <div>
    <div style="font-size:12pt;font-weight:800;">Want yours? It takes me 48 hours and costs you nothing.</div>
    <div style="font-size:10pt;color:#c7cbd4;margin-top:3px;">Hand me your Google listing, or just your business name.</div>
  </div>
  <div style="text-align:right;white-space:nowrap;padding-left:16px;">
    <div style="font-size:12.5pt;font-weight:800;">${esc(contact.phone)}</div>
    <div style="font-size:10.5pt;color:#c7cbd4;">${esc(contact.email)}</div>
  </div>
</div>

<div style="margin-top:10px;font-size:7pt;color:${MUTED};line-height:1.35;border-top:1px solid ${LINE};padding-top:5px;">
  The report shown is a sample for an example business, included to show the format.
  Figures in a real report are computed from that business's own reviews. Reviewlens
  highlights reviews that may need attention; it does not provide legal or medical
  advice and makes no guarantee of any particular business outcome.
</div>

</body></html>`;
}

async function main() {
  const options = parseArgs();
  const html = render(options);

  const outDir = join(process.cwd(), "exports");
  await mkdir(outDir, { recursive: true });

  const slug = options.business
    ? options.business.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    : "generic";
  const base = join(outDir, `one-pager-${slug}`);

  await writeFile(`${base}.html`, html, "utf8");

  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ executablePath: CHROMIUM });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({ path: `${base}.pdf`, format: "Letter", printBackground: true });
    await browser.close();
    console.log(`PDF:  ${base}.pdf`);
  } catch (error) {
    console.warn(`Skipped PDF (${error instanceof Error ? error.message : String(error)})`);
  }

  console.log(`HTML: ${base}.html`);
  if (!options.business) {
    console.log("");
    console.log("Generic version. To personalize:");
    console.log('  npm run onepager -- --business "Name" --rating 3.4 --reviews 92');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
