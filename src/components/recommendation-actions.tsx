"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/primitives";
import { setRecommendationStatus } from "@/lib/recommendations/actions";

const NEXT_STATUS: Record<string, Array<{ value: string; label: string }>> = {
  OPEN: [
    { value: "IN_PROGRESS", label: "Start" },
    { value: "DISMISSED", label: "Dismiss" },
  ],
  IN_PROGRESS: [
    { value: "DONE", label: "Mark done" },
    { value: "OPEN", label: "Reopen" },
  ],
  DONE: [{ value: "OPEN", label: "Reopen" }],
  DISMISSED: [{ value: "OPEN", label: "Reopen" }],
};

export function RecommendationActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const options = NEXT_STATUS[status] ?? [];

  return (
    <div className="flex items-center gap-2">
      {error ? <span className="text-sm text-critical">{error}</span> : null}
      {options.map((option) => (
        <Button
          key={option.value}
          size="sm"
          variant={option.value === "DISMISSED" ? "ghost" : "secondary"}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await setRecommendationStatus(id, option.value);
              setError(result.error ?? null);
            })
          }
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
