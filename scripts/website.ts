/**
 * Generates a standalone one-page website for a local business.
 *
 *   npm run website -- --business "Cordova Nails & Spa" --phone "(901) 555-0142" \
 *     --address "1234 Germantown Pkwy, Cordova, TN 38016" --category "Nail Salon"
 *
 * Output is a single self-contained index.html: no build step, no dependencies,
 * no framework. Drag it onto Netlify Drop or into a GitHub Pages repo and it is
 * live. That matters — the businesses that need this are the ones that will
 * never run `npm install`, and a site you cannot hand over in one file is a
 * site that never ships.
 *
 * Mobile-first with a permanent tap-to-call button, because essentially all
 * local-business discovery happens on a phone and the only conversion that
 * matters for a salon or a repair shop is someone calling.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

type Config = {
  business: string;
  category: string;
  tagline: string;
  phone: string;
  address: string;
  city: string;
  services: Array<{ name: string; blurb: string }>;
  hours: Array<{ days: string; time: string }>;
  accent: string;
};

function parseArgs(): Config {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: string) => {
    const i = args.indexOf(`--${flag}`);
    return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
  };

  const business = get("business", "Your Business Name");
  const category = get("category", "Local Service");

  return {
    business,
    category,
    tagline: get("tagline", `${category} in ${get("city", "your neighborhood")}. Walk-ins welcome.`),
    phone: get("phone", "(901) 555-0000"),
    address: get("address", "1234 Example Street"),
    city: get("city", "Cordova, TN"),
    accent: get("accent", "#15803d"),
    services: [
      { name: "Service one", blurb: "Describe the thing customers ask for most." },
      { name: "Service two", blurb: "The one with the best margin." },
      { name: "Service three", blurb: "The one that brings people back." },
    ],
    hours: [
      { days: "Monday – Friday", time: "9:00 am – 6:00 pm" },
      { days: "Saturday", time: "9:00 am – 4:00 pm" },
      { days: "Sunday", time: "Closed" },
    ],
  };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function render(c: Config): string {
  const mapQuery = encodeURIComponent(`${c.business}, ${c.address}, ${c.city}`);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.business)} — ${esc(c.category)} in ${esc(c.city)}</title>
<meta name="description" content="${esc(c.business)} — ${esc(c.category)} in ${esc(c.city)}. Call ${esc(c.phone)}.">
<!-- Local business structured data: this is what puts the phone number and
     hours into a Google result. Most small-business sites omit it entirely. -->
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"LocalBusiness",
 "name":${JSON.stringify(c.business)},
 "telephone":${JSON.stringify(c.phone)},
 "address":{"@type":"PostalAddress","streetAddress":${JSON.stringify(c.address)},"addressLocality":${JSON.stringify(c.city)}}}
</script>
<style>
  :root { --accent: ${c.accent}; --ink:#141715; --muted:#5f6663; --line:#e6e8e7; --bg:#fbfbfa; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
         color:var(--ink); background:#fff; line-height:1.55; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:960px; margin:0 auto; padding:0 20px; }
  header { position:sticky; top:0; z-index:10; background:rgba(255,255,255,.94);
           backdrop-filter:blur(8px); border-bottom:1px solid var(--line); }
  .bar { display:flex; align-items:center; justify-content:space-between; height:62px; }
  .logo { font-weight:800; font-size:17px; letter-spacing:-.02em; }
  .call { background:var(--accent); color:#fff; text-decoration:none; font-weight:700;
          padding:10px 16px; border-radius:6px; font-size:15px; white-space:nowrap; }
  .hero { padding:56px 0 44px; border-bottom:1px solid var(--line); }
  .eyebrow { color:var(--accent); font-weight:700; font-size:13px; letter-spacing:.09em;
             text-transform:uppercase; }
  h1 { font-size:clamp(30px,5.5vw,46px); line-height:1.1; letter-spacing:-.03em; margin-top:10px; }
  .sub { font-size:18px; color:var(--muted); margin-top:14px; max-width:38em; }
  .cta-row { display:flex; flex-wrap:wrap; gap:12px; margin-top:26px; }
  .btn { display:inline-block; text-decoration:none; font-weight:700; padding:13px 22px;
         border-radius:6px; font-size:16px; }
  .btn-primary { background:var(--accent); color:#fff; }
  .btn-ghost { border:1px solid var(--line); color:var(--ink); }
  section { padding:44px 0; border-bottom:1px solid var(--line); }
  h2 { font-size:24px; letter-spacing:-.02em; margin-bottom:20px; }
  .grid { display:grid; gap:18px; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); }
  .card { border:1px solid var(--line); border-radius:8px; padding:20px; background:var(--bg); }
  .card h3 { font-size:17px; margin-bottom:6px; }
  .card p { color:var(--muted); font-size:15px; }
  .rows { border:1px solid var(--line); border-radius:8px; overflow:hidden; }
  .row { display:flex; justify-content:space-between; padding:13px 18px; font-size:15px; }
  .row + .row { border-top:1px solid var(--line); }
  .row span:first-child { color:var(--muted); }
  .row span:last-child { font-weight:600; }
  .split { display:grid; gap:26px; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); }
  footer { padding:36px 0 96px; color:var(--muted); font-size:14px; }
  footer a { color:var(--accent); }
  .sticky-call { position:fixed; left:0; right:0; bottom:0; background:var(--accent);
                 color:#fff; text-align:center; padding:16px; font-weight:800; font-size:17px;
                 text-decoration:none; z-index:20; }
  @media (min-width:721px){ .sticky-call{ display:none; } footer{ padding-bottom:36px; } }
  @media (max-width:720px){ .call{ display:none; } }
</style>
</head>
<body>

<header><div class="wrap bar">
  <div class="logo">${esc(c.business)}</div>
  <a class="call" href="${telHref(c.phone)}">Call ${esc(c.phone)}</a>
</div></header>

<div class="wrap hero">
  <div class="eyebrow">${esc(c.category)} · ${esc(c.city)}</div>
  <h1>${esc(c.business)}</h1>
  <p class="sub">${esc(c.tagline)}</p>
  <div class="cta-row">
    <a class="btn btn-primary" href="${telHref(c.phone)}">Call ${esc(c.phone)}</a>
    <a class="btn btn-ghost" href="https://www.google.com/maps/search/?api=1&query=${mapQuery}">Get directions</a>
  </div>
</div>

<section class="wrap">
  <h2>What we do</h2>
  <div class="grid">
    ${c.services.map((s) => `<div class="card"><h3>${esc(s.name)}</h3><p>${esc(s.blurb)}</p></div>`).join("\n    ")}
  </div>
</section>

<section class="wrap">
  <div class="split">
    <div>
      <h2>Hours</h2>
      <div class="rows">
        ${c.hours.map((h) => `<div class="row"><span>${esc(h.days)}</span><span>${esc(h.time)}</span></div>`).join("\n        ")}
      </div>
    </div>
    <div>
      <h2>Find us</h2>
      <div class="rows">
        <div class="row"><span>Address</span><span>${esc(c.address)}</span></div>
        <div class="row"><span>City</span><span>${esc(c.city)}</span></div>
        <div class="row"><span>Phone</span><span>${esc(c.phone)}</span></div>
      </div>
      <p style="margin-top:14px;">
        <a class="btn btn-ghost" href="https://www.google.com/maps/search/?api=1&query=${mapQuery}">Open in Google Maps</a>
      </p>
    </div>
  </div>
</section>

<footer class="wrap">
  <strong>${esc(c.business)}</strong> · ${esc(c.address)}, ${esc(c.city)} ·
  <a href="${telHref(c.phone)}">${esc(c.phone)}</a>
  <p style="margin-top:10px;">&copy; ${new Date().getFullYear()} ${esc(c.business)}. All rights reserved.</p>
</footer>

<a class="sticky-call" href="${telHref(c.phone)}">Tap to call ${esc(c.phone)}</a>

</body></html>`;
}

async function main() {
  const config = parseArgs();
  const slug = config.business.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const dir = join(process.cwd(), "exports", "sites", slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), render(config), "utf8");

  console.log(`Site: ${join(dir, "index.html")}`);
  console.log("");
  console.log("To publish: drag that folder onto https://app.netlify.com/drop");
  console.log("Edit the services and hours directly in the HTML — they are plain text.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
