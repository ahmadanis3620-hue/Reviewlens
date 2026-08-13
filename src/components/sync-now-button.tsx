"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/primitives";
import { syncNow } from "@/lib/business/actions";

export function SyncNowButton({ businessId }: { businessId: string }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);

  return (
    <div className="text-right">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await syncNow(businessId);
            setNote(
              result.error
                ? { text: result.error, error: true }
                : { text: result.message ?? "Done.", error: false },
            );
          })
        }
      >
        {pending ? "Syncing…" : "Sync now"}
      </Button>
      {note ? (
        <p
          role="status"
          className={`mt-1.5 max-w-xs text-xs ${note.error ? "text-critical" : "text-ink-muted"}`}
        >
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
