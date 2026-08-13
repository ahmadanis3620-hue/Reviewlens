import { ReviewProviderKey } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  computeContentHash,
  dropReviewerIdentity,
  normalizeReview,
  scrubText,
} from "@/lib/ingestion/normalize";
import { parseCsv, rowsToReviews } from "@/lib/providers/csv";

describe("privacy scrubbing", () => {
  it("removes an email address volunteered in the body", () => {
    const scrubbed = scrubText("Call me at jane.doe@example.com to sort this out.");
    expect(scrubbed).not.toContain("jane.doe@example.com");
    expect(scrubbed).toContain("[email removed]");
  });

  it("removes phone numbers in several formats", () => {
    for (const phone of ["614-555-0142", "(614) 555-0142", "+1 614 555 0142"]) {
      const scrubbed = scrubText(`Reach me on ${phone} please.`);
      expect(scrubbed).toContain("[phone removed]");
      expect(scrubbed).not.toContain("555-0142");
    }
  });

  it("keeps a public display name", () => {
    expect(dropReviewerIdentity("Sarah M.")).toBe("Sarah M.");
  });

  it("discards a name field that is actually contact information", () => {
    expect(dropReviewerIdentity("sarah@example.com")).toBeNull();
  });

  it("treats a missing or blank name as no name", () => {
    expect(dropReviewerIdentity(undefined)).toBeNull();
    expect(dropReviewerIdentity("   ")).toBeNull();
  });
});

describe("normalizeReview", () => {
  it("clamps an out-of-range rating", () => {
    const normalized = normalizeReview(
      {
        externalReviewId: "x",
        rating: 9,
        text: "Great",
        reviewedAt: new Date("2026-06-01"),
      },
      ReviewProviderKey.DEMO,
    );

    expect(normalized.rating).toBe(5);
  });

  it("strips contact details before the row is built", () => {
    const normalized = normalizeReview(
      {
        externalReviewId: "x",
        rating: 2,
        text: "Terrible. Call me on 614-555-0142.",
        reviewedAt: new Date("2026-06-01"),
        reviewerName: "someone@example.com",
      },
      ReviewProviderKey.DEMO,
    );

    expect(normalized.reviewerName).toBeNull();
    expect(normalized.text).not.toContain("555-0142");
  });
});

describe("computeContentHash", () => {
  const base = {
    provider: ReviewProviderKey.DEMO,
    text: "The staff were friendly.",
    rating: 5,
    reviewedAt: new Date("2026-06-01T10:00:00Z"),
    reviewerName: "Sarah M.",
  };

  it("is stable for the same content", () => {
    expect(computeContentHash(base)).toBe(computeContentHash(base));
  });

  it("ignores whitespace and casing differences", () => {
    expect(
      computeContentHash({ ...base, text: "  The  Staff were FRIENDLY.  " }),
    ).toBe(computeContentHash(base));
  });

  it("ignores a timestamp shift within the same day", () => {
    // Providers routinely move the timestamp when they reissue a review.
    expect(
      computeContentHash({
        ...base,
        reviewedAt: new Date("2026-06-01T22:30:00Z"),
      }),
    ).toBe(computeContentHash(base));
  });

  it("differs when the rating or text differs", () => {
    expect(computeContentHash({ ...base, rating: 4 })).not.toBe(
      computeContentHash(base),
    );
    expect(computeContentHash({ ...base, text: "Different." })).not.toBe(
      computeContentHash(base),
    );
  });
});

describe("CSV import", () => {
  const csv = `external_id,rating,text,date,reviewer_name
r-1,5,"Great cleaning, very thorough.",2026-06-14,Sarah M.
r-2,2,"Waited 45 minutes past my appointment.",2026-06-18,James T.`;

  it("parses rows into reviews", () => {
    const reviews = rowsToReviews(parseCsv(csv));

    expect(reviews).toHaveLength(2);
    expect(reviews[0]?.externalReviewId).toBe("r-1");
    expect(reviews[0]?.rating).toBe(5);
    expect(reviews[1]?.text).toContain("45 minutes");
  });

  it("handles quoted fields containing commas", () => {
    const reviews = rowsToReviews(parseCsv(csv));
    expect(reviews[0]?.text).toBe("Great cleaning, very thorough.");
  });

  it("rejects a file missing a required column", () => {
    expect(() => parseCsv("rating,text\n5,Great")).toThrow(/external_id/);
  });

  it("rejects an unparseable rating with a row number", () => {
    expect(() =>
      rowsToReviews(
        parseCsv(`external_id,rating,text,date\nr-1,eleven,Great,2026-06-14`),
      ),
    ).toThrow(/Row 2/);
  });

  it("rejects an unparseable date", () => {
    expect(() =>
      rowsToReviews(
        parseCsv(`external_id,rating,text,date\nr-1,5,Great,not-a-date`),
      ),
    ).toThrow(/date/);
  });

  it("ignores columns it was not asked for", () => {
    const reviews = rowsToReviews(
      parseCsv(
        `external_id,rating,text,date,reviewer_email\nr-1,5,Great,2026-06-14,a@b.com`,
      ),
    );

    expect(reviews[0]).not.toHaveProperty("reviewer_email");
    expect(JSON.stringify(reviews[0])).not.toContain("a@b.com");
  });
});
