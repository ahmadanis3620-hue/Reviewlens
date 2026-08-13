"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/primitives";
import { regenerateRecommendations } from "@/lib/recommendations/actions";

export function RegenerateButton({ businessId }: { businessId: string }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);

  return (
    <div className="text-right">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await regenerateRecommendations(businessId);
            setNote(
              result.error
                ? { text: result.error, error: true }
                : { text: result.message ?? "Done.", error: false },
            );
          })
        }
      >
        {pending ? "Regenerating…" : "Regenerate"}
      </Button>
      {note ? (
        <p
          role="status"
          className={`mt-1.5 text-xs ${note.error ? "text-critical" : "text-ink-muted"}`}
        >
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
