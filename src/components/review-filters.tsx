"use client";

import { useRouter } from "next/navigation";

import { Select } from "@/components/ui/primitives";

/**
 * Filter row. Sits in a single row above the results, per the interaction
 * conventions — changing one filter navigates rather than fetching, so the
 * filtered view is a shareable URL.
 */
export function ReviewFilters({
  sources,
  topics,
  current,
}: {
  sources: Array<{ id: string; displayName: string }>;
  topics: Array<{ key: string; label: string }>;
  current: Record<string, string>;
}) {
  const router = useRouter();

  function update(key: string, value: string) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...current, [key]: value })) {
      if (v) params.set(k, v);
    }
    router.push(params.size > 0 ? `/reviews?${params}` : "/reviews");
  }

  const hasFilters = Object.values(current).some(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Filter
        label="Date"
        value={current.days ?? ""}
        onChange={(v) => update("days", v)}
        options={[
          { value: "", label: "All time" },
          { value: "7", label: "Last 7 days" },
          { value: "30", label: "Last 30 days" },
          { value: "90", label: "Last 90 days" },
          { value: "365", label: "Last 12 months" },
        ]}
      />
      <Filter
        label="Rating"
        value={current.rating ?? ""}
        onChange={(v) => update("rating", v)}
        options={[
          { value: "", label: "Any rating" },
          ...[5, 4, 3, 2, 1].map((r) => ({
            value: String(r),
            label: `${r} star${r === 1 ? "" : "s"}`,
          })),
        ]}
      />
      <Filter
        label="Sentiment"
        value={current.sentiment ?? ""}
        onChange={(v) => update("sentiment", v)}
        options={[
          { value: "", label: "Any sentiment" },
          { value: "POSITIVE", label: "Positive" },
          { value: "NEUTRAL", label: "Neutral" },
          { value: "NEGATIVE", label: "Negative" },
        ]}
      />
      <Filter
        label="Urgency"
        value={current.urgency ?? ""}
        onChange={(v) => update("urgency", v)}
        options={[
          { value: "", label: "Any urgency" },
          { value: "CRITICAL", label: "Critical" },
          { value: "HIGH", label: "High" },
          { value: "MEDIUM", label: "Medium" },
          { value: "LOW", label: "Low" },
        ]}
      />
      <Filter
        label="Topic"
        value={current.topic ?? ""}
        onChange={(v) => update("topic", v)}
        options={[
          { value: "", label: "Any topic" },
          ...topics.map((t) => ({ value: t.key, label: t.label })),
        ]}
      />
      {sources.length > 1 ? (
        <Filter
          label="Source"
          value={current.source ?? ""}
          onChange={(v) => update("source", v)}
          options={[
            { value: "", label: "All sources" },
            ...sources.map((s) => ({ value: s.id, label: s.displayName })),
          ]}
        />
      ) : null}

      {hasFilters ? (
        <button
          type="button"
          onClick={() => router.push("/reviews")}
          className="text-sm text-accent hover:underline"
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="sr-only">{label}</span>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
