"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Field, Input } from "@/components/ui/primitives";
import type { AuthState } from "@/lib/auth/actions";

type FieldSpec = {
  name: string;
  label: string;
  type: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Working…" : label}
    </Button>
  );
}

export function AuthForm({
  action,
  fields,
  submitLabel,
}: {
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  fields: FieldSpec[];
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {fields.map((field) => (
        <Field key={field.name} label={field.label} hint={field.hint}>
          <Input
            name={field.name}
            type={field.type}
            autoComplete={field.autoComplete}
            required={field.required}
          />
        </Field>
      ))}

      {state.error ? (
        <p
          role="alert"
          className="rounded-[var(--radius)] border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton label={submitLabel} />
    </form>
  );
}
