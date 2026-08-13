"use client";

import { useState, useTransition } from "react";

import { Button, Input } from "@/components/ui/primitives";
import { sendReport } from "@/lib/reports/actions";

export function SendReportButton({
  reportId,
  defaultEmail,
}: {
  reportId: string;
  defaultEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Email this report
      </Button>
    );
  }

  return (
    <div className="text-right">
      <div className="flex items-center gap-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-8 w-56"
          aria-label="Recipient email"
        />
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await sendReport(reportId, email);
              setNote(
                result.error
                  ? { text: result.error, error: true }
                  : { text: result.message ?? "Sent.", error: false },
              );
            })
          }
        >
          {pending ? "Sending…" : "Send"}
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
