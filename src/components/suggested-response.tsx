"use client";

import { useState } from "react";

import { Button } from "@/components/ui/primitives";

/**
 * Draft reply generation.
 *
 * Deliberately on demand rather than precomputed for every review: generating
 * a reply to a review nobody is going to answer burns AI budget for nothing.
 *
 * There is no "publish" control here, and there is no API route that posts a
 * response to a platform. The draft is copied by a human who has read it.
 */
export function SuggestedResponse({ reviewId }: { reviewId: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/reviews/${reviewId}/suggested-response`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "Could not generate a draft right now.");
      }
      const body = (await response.json()) as { response: string };
      setDraft(body.response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (!draft) {
    return (
      <div>
        <Button variant="secondary" size="sm" onClick={generate} disabled={loading}>
          {loading ? "Drafting…" : "Draft a response"}
        </Button>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-critical">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius)] border border-line bg-sunken px-3 py-2.5">
      <p className="text-xs font-medium tracking-[0.04em] text-ink-muted uppercase">
        Suggested response · draft only
      </p>
      <p className="mt-1.5 text-sm text-ink">{draft}</p>
      <div className="mt-2.5 flex items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(draft);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="ghost" size="sm" onClick={generate} disabled={loading}>
          Regenerate
        </Button>
        <p className="text-xs text-ink-muted">
          Review before posting. ReputeIQ never publishes on your behalf.
        </p>
      </div>
    </div>
  );
}
