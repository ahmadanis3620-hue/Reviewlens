"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/primitives";

const SAMPLE = `external_id,rating,text,date,reviewer_name
r-001,5,"Great cleaning, the hygienist was gentle and thorough.",2026-06-14,Sarah M.
r-002,2,"Waited 45 minutes past my appointment time.",2026-06-18,James T.`;

export function CsvUpload({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setNote(null);

    try {
      const body = new FormData();
      body.set("businessId", businessId);
      body.set("file", file);

      const response = await fetch("/api/sources/csv", { method: "POST", body });
      const payload = (await response.json()) as {
        error?: string;
        created?: number;
        duplicates?: number;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Upload failed.");
      }

      setNote({
        text: `Imported ${payload.created ?? 0} review${payload.created === 1 ? "" : "s"}. ${payload.duplicates ?? 0} were already known. Analysis is running.`,
        error: false,
      });
      setFile(null);
      router.refresh();
    } catch (error) {
      setNote({
        text: error instanceof Error ? error.message : "Upload failed.",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-ink-secondary">Required columns:</p>
        <pre className="mt-2 overflow-x-auto rounded-[var(--radius)] border border-line bg-sunken px-3 py-2 text-xs text-ink-secondary">
          {SAMPLE}
        </pre>
        <p className="mt-2 text-xs text-ink-muted">
          Optional: <code>url</code>, <code>response_text</code>. Any other column
          is ignored — ReputeIQ deliberately does not store reviewer contact
          details.
        </p>
      </div>

      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        className="block w-full text-sm text-ink-secondary file:mr-3 file:rounded-[var(--radius)] file:border file:border-line-strong file:bg-raised file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
      />

      <Button onClick={upload} disabled={!file || busy}>
        {busy ? "Importing…" : "Import reviews"}
      </Button>

      {note ? (
        <p
          role="status"
          className={`text-sm ${note.error ? "text-critical" : "text-good"}`}
        >
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
