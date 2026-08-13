import { ReviewProviderKey } from "@prisma/client";

import { ValidationError } from "@/lib/errors";
import type {
  FetchContext,
  FetchResult,
  NormalizedReview,
  ReviewProvider,
} from "@/lib/providers/types";

/**
 * CSV import.
 *
 * The credential-free path to *real* data: a business exports its own reviews
 * and uploads them. Given how long platform API access takes to arrange, this
 * is realistically the first source most customers will use.
 *
 * The parsed rows are placed on the source config by the upload route, so the
 * provider itself stays a pure transformation.
 */

const REQUIRED_HEADERS = ["external_id", "rating", "text", "date"];

export type CsvRow = Record<string, string>;

/** Minimal RFC-4180 parser: quoted fields, escaped quotes, embedded newlines. */
export function parseCsv(input: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else if (char !== "\r") {
      field += char ?? "";
    }
  }
  if (field !== "" || row.length > 0) pushRow();

  const [header, ...body] = rows;
  if (!header) return [];

  const keys = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const missing = REQUIRED_HEADERS.filter((h) => !keys.includes(h));
  if (missing.length > 0) {
    throw new ValidationError(
      `CSV is missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. ` +
        `Expected headers: ${REQUIRED_HEADERS.join(", ")} (optional: reviewer_name, url, response_text).`,
    );
  }

  return body.map((cells) => {
    const record: CsvRow = {};
    keys.forEach((key, index) => {
      record[key] = (cells[index] ?? "").trim();
    });
    return record;
  });
}

export function rowsToReviews(rows: CsvRow[]): NormalizedReview[] {
  const reviews: NormalizedReview[] = [];

  rows.forEach((row, index) => {
    const rating = Number.parseInt(row.rating ?? "", 10);
    const reviewedAt = new Date(row.date ?? "");
    const text = row.text ?? "";
    const externalReviewId = row.external_id ?? "";

    if (!externalReviewId) {
      throw new ValidationError(`Row ${index + 2}: external_id is required.`);
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new ValidationError(
        `Row ${index + 2}: rating must be a whole number from 1 to 5.`,
      );
    }
    if (Number.isNaN(reviewedAt.getTime())) {
      throw new ValidationError(
        `Row ${index + 2}: date could not be parsed. Use an ISO date such as 2026-03-14.`,
      );
    }

    const review: NormalizedReview = {
      externalReviewId,
      rating,
      text,
      reviewedAt,
      language: "en",
    };
    // Only a display name is retained; any other column is ignored on purpose.
    if (row.reviewer_name) review.reviewerName = row.reviewer_name;
    if (row.url) review.url = row.url;
    if (row.response_text) review.responseText = row.response_text;

    reviews.push(review);
  });

  return reviews;
}

export class CsvImportProvider implements ReviewProvider {
  readonly key = ReviewProviderKey.CSV_IMPORT;
  readonly label = "CSV import";
  readonly description =
    "Upload a CSV export of your own reviews. Columns: external_id, rating, text, date (optional: reviewer_name, url, response_text).";

  isConfigured(): boolean {
    return true;
  }

  async fetchReviews(ctx: FetchContext): Promise<FetchResult> {
    const pending = ctx.config.pendingRows as CsvRow[] | undefined;
    if (!pending || pending.length === 0) {
      return { reviews: [], nextCursor: null };
    }
    return { reviews: rowsToReviews(pending), nextCursor: null };
  }
}
