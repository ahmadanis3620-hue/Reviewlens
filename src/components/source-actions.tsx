"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/primitives";
import { disconnectSource } from "@/lib/business/actions";

export function SourceActions({
  sourceId,
  status,
}: {
  sourceId: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status === "DISCONNECTED") return null;

  return (
    <div className="shrink-0 text-right">
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await disconnectSource(sourceId);
            setError(result.error ?? null);
          })
        }
      >
        Disconnect
      </Button>
      {error ? <p className="mt-1 text-xs text-critical">{error}</p> : null}
    </div>
  );
}
