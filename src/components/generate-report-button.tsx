"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, Select } from "@/components/ui/primitives";
import { createReport } from "@/lib/reports/actions";

export function GenerateReportButton({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [type, setType] = useState<"WEEKLY" | "MONTHLY">("MONTHLY");
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);

  return (
    <div className="text-right">
      <div className="flex items-center gap-2">
        <Select
          value={type}
          onChange={(e) => setType(e.target.value as "WEEKLY" | "MONTHLY")}
          aria-label="Report type"
        >
          <option value="MONTHLY">Monthly</option>
          <option value="WEEKLY">Weekly</option>
        </Select>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await createReport(businessId, type);
              setNote(
                result.error
                  ? { text: result.error, error: true }
                  : { text: result.message ?? "Done.", error: false },
              );
              if (result.reportId) router.push(`/reports/${result.reportId}`);
            })
          }
        >
          {pending ? "Generating…" : "Generate report"}
        </Button>
      </div>
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
