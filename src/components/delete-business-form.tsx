"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Input } from "@/components/ui/primitives";
import { deleteBusiness, type MutationState } from "@/lib/business/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" size="sm" disabled={pending}>
      {pending ? "Deleting…" : "Delete permanently"}
    </Button>
  );
}

export function DeleteBusinessForm({
  businessId,
  businessName,
}: {
  businessId: string;
  businessName: string;
}) {
  const [state, action] = useActionState(deleteBusiness, {} as MutationState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Delete this business
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="businessId" value={businessId} />
      <p className="text-sm text-ink-secondary">
        Type <span className="font-medium text-ink">{businessName}</span> to
        confirm. This deletes every review, analysis, competitor, alert, and
        report belonging to it.
      </p>
      <Input name="confirmation" placeholder={businessName} autoComplete="off" />
      <div className="flex items-center gap-2">
        <Submit />
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} type="button">
          Cancel
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-critical">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
