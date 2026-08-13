"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { saveReportSchedule, type MutationState } from "@/lib/reports/actions";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

export function ReportScheduleForm({
  businessId,
  frequency,
  defaults,
}: {
  businessId: string;
  frequency: "WEEKLY" | "MONTHLY";
  defaults: {
    recipientEmail: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
    hour?: number;
    enabled?: boolean;
  };
}) {
  const [state, action] = useActionState(saveReportSchedule, {} as MutationState);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="frequency" value={frequency} />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">
          {frequency === "WEEKLY" ? "Weekly report" : "Monthly report"}
        </h3>
        <label className="flex items-center gap-1.5 text-sm text-ink-secondary">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={defaults.enabled ?? frequency === "MONTHLY"}
            className="accent-[var(--accent)]"
          />
          Enabled
        </label>
      </div>

      <Field label="Send to">
        <Input
          type="email"
          name="recipientEmail"
          defaultValue={defaults.recipientEmail}
          required
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        {frequency === "WEEKLY" ? (
          <Field label="Day">
            <Select
              name="dayOfWeek"
              defaultValue={String(defaults.dayOfWeek ?? 1)}
              className="w-full"
            >
              {DAYS.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field
            label="Day of month"
            hint="Capped at 28 so the schedule fires every month."
          >
            <Select
              name="dayOfMonth"
              defaultValue={String(defaults.dayOfMonth ?? 1)}
              className="w-full"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Hour (business local time)">
          <Select
            name="hour"
            defaultValue={String(defaults.hour ?? 8)}
            className="w-full"
          >
            {Array.from({ length: 24 }, (_, i) => i).map((hour) => (
              <option key={hour} value={hour}>
                {String(hour).padStart(2, "0")}:00
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <Submit />
        {state.error ? (
          <span role="alert" className="text-sm text-critical">
            {state.error}
          </span>
        ) : null}
        {state.message ? (
          <span className="text-sm text-good">{state.message}</span>
        ) : null}
      </div>
    </form>
  );
}
