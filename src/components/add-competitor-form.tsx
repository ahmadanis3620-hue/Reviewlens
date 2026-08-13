"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Field, Input } from "@/components/ui/primitives";
import { addCompetitor, type ActionState } from "@/lib/onboarding/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "Adding…" : "Add competitor"}
    </Button>
  );
}

export function AddCompetitorForm({ businessId }: { businessId: string }) {
  const [state, action] = useActionState(addCompetitor, {} as ActionState);

  return (
    <>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="businessId" value={businessId} />
        <div className="min-w-48 flex-1">
          <Field label="Competitor name">
            <Input name="name" required placeholder="Grandview Family Dentistry" />
          </Field>
        </div>
        <div className="min-w-32">
          <Field label="City">
            <Input name="city" placeholder="Columbus" />
          </Field>
        </div>
        <Submit />
      </form>

      {state.error ? (
        <p role="alert" className="mt-3 text-sm text-critical">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="mt-3 text-sm text-good">{state.message}</p>
      ) : null}

      <p className="mt-3 text-xs text-ink-muted">
        Competitors added without a connected review source are tracked by name
        only. ReputeIQ will not scrape their reviews — ratings appear once an
        official source is available.
      </p>
    </>
  );
}
