"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/primitives";
import { setAlertStatus } from "@/lib/alerts/actions";

export function AlertActions({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex shrink-0 items-center gap-2">
      {error ? <span className="text-sm text-critical">{error}</span> : null}
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setAlertStatus(id, "ACKNOWLEDGED");
            setError(result.error ?? null);
          })
        }
      >
        Acknowledge
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setAlertStatus(id, "RESOLVED");
            setError(result.error ?? null);
          })
        }
      >
        Resolve
      </Button>
    </div>
  );
}
