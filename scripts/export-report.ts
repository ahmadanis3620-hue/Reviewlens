/**
 * Exports a generated report as standalone HTML, a PDF, and an inline preview.
 *
 *   npm run export:report -- <reportId>
 *
 * The three outputs serve different jobs:
 *
 *  - `.preview.html` is a compact block meant to be pasted straight into an
 *    email body. Cold recipients do not open attachments, and an `.html`
 *    attachment in particular reads as a phishing attempt to both people and
 *    spam filters — so the thing that has to persuade them must render in the
 *    message itself.
 *  - `.pdf` is the trusted format for anyone who does want the full document,
 *    or wants to forward it to a partner or office manager.
 *  - `.html` is the full report for viewing in a browser.
 *
 * Playwright is a dev dependency and drives the Chromium already present in
 * this environment. Nothing here runs in the application at request time.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { prisma } from "@/lib/db";
import {
  renderReportHtml,
  renderReportPreview,
} from "@/lib/reports/render";

const CHROMIUM = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

async function main() {
  const reportId = process.argv[2];
  if (!reportId) {
    console.error("Usage: npm run export:report -- <reportId> [notice]");
    process.exitCode = 1;
    return;
  }

  const notice =
    process.argv[3] ??
    "Illustrative sample. Every review behind these figures is simulated.";

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      sections: { orderBy: { order: "asc" } },
      business: { select: { name: true } },
    },
  });

  if (!report) {
    console.error(`No report with id ${reportId}`);
    process.exitCode = 1;
    return;
  }

  const outDir = join(process.cwd(), "exports");
  await mkdir(outDir, { recursive: true });

  const base = join(outDir, `report-${reportId}`);

  const html = renderReportHtml(report, report.business, "", {
    includeAppLink: false,
    notice,
  });
  await writeFile(`${base}.html`, html, "utf8");

  const preview = renderReportPreview(report, report.business, { notice });
  await writeFile(`${base}.preview.html`, preview, "utf8");

  // PDF via headless Chromium. Imported lazily so the script still produces
  // the HTML outputs on a machine without a browser installed.
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ executablePath: CHROMIUM });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({
      path: `${base}.pdf`,
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "12mm", right: "12mm" },
    });
    await browser.close();
    console.log(`PDF:     ${base}.pdf`);
  } catch (error) {
    console.warn(
      `Skipped PDF (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  console.log(`HTML:    ${base}.html`);
  console.log(`Preview: ${base}.preview.html`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
