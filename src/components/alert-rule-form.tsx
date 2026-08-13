"use client";

import { useState, useTransition } from "react";

import { Button, Input } from "@/components/ui/primitives";
import { updateAlertRule } from "@/lib/alerts/actions";

export function AlertRuleForm({
  rule,
  meta,
}: {
  rule: {
    id: string;
    type: string;
    enabled: boolean;
    threshold: number;
    emailEnabled: boolean;
  };
  meta: { title: string; unit: string; help: string };
}) {
  const [threshold, setThreshold] = useState(String(rule.threshold));
  const [enabled, setEnabled] = useState(rule.enabled);
  const [emailEnabled, setEmailEnabled] = useState(rule.emailEnabled);
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const dirty =
    Number(threshold) !== rule.threshold ||
    enabled !== rule.enabled ||
    emailEnabled !== rule.emailEnabled;

  return (
    <div className="border-b border-line pb-5 last:border-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{meta.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
            {meta.help}
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-secondary">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          On
        </label>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <Input
          type="number"
          step="0.1"
          min="0"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          className="h-8 w-24"
          aria-label={`${meta.title} threshold`}
        />
        <span className="text-xs text-ink-muted">{meta.unit}</span>
      </div>

      <label className="mt-2.5 flex items-center gap-1.5 text-xs text-ink-secondary">
        <input
          type="checkbox"
          checked={emailEnabled}
          onChange={(e) => setEmailEnabled(e.target.checked)}
          className="accent-[var(--accent)]"
        />
        Also email me
      </label>

      {dirty ? (
        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await updateAlertRule({
                ruleId: rule.id,
                threshold: Number(threshold),
                enabled,
                emailEnabled,
              });
              setNote(result.error ?? result.message ?? null);
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      ) : null}

      {note ? <p className="mt-2 text-xs text-ink-muted">{note}</p> : null}
    </div>
  );
}
