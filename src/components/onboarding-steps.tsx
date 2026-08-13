"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Select,
} from "@/components/ui/primitives";
import {
  INDUSTRIES,
  addCompetitor,
  connectDemoFeed,
  createBusiness,
  loadDemoData,
  type ActionState,
} from "@/lib/onboarding/actions";
import type { ProviderSummary } from "@/lib/providers/registry";

type BusinessSummary = {
  id: string;
  name: string;
  industry: string;
  isDemo: boolean;
  _count: { reviews: number; competitors: number; reviewSources: number };
};

function Submit({ label, variant = "primary" }: { label: string; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? "Working…" : label}
    </Button>
  );
}

function ErrorNote({ state }: { state: ActionState }) {
  if (!state.error) return null;
  return (
    <p
      role="alert"
      className="mt-3 rounded-[var(--radius)] border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical"
    >
      {state.error}
    </p>
  );
}

export function OnboardingSteps({
  business,
  providers,
}: {
  business: BusinessSummary | null;
  providers: ProviderSummary[];
}) {
  return (
    <div className="mt-8 space-y-6">
      {business ? (
        <ConnectSourceStep business={business} providers={providers} />
      ) : (
        <>
          <DemoStep />
          <CreateBusinessStep />
        </>
      )}
    </div>
  );
}

function DemoStep() {
  const [state, action] = useActionState(
    async () => loadDemoData(),
    {} as ActionState,
  );

  return (
    <Card className="border-accent/40">
      <CardHeader
        title="Option 1 — see it working now"
        description="Loads Columbus Dental Care: a sample dental practice with 14 months of reviews, two competitors, and the full analysis already run. Clearly labelled as demo data everywhere it appears."
      />
      <CardBody>
        <form action={action}>
          <Submit label="Load demo data" />
        </form>
        <ErrorNote state={state} />
        <p className="mt-3 text-xs text-ink-muted">
          This takes a few seconds — the pipeline ingests, analyzes, and scores
          every review before the dashboard loads.
        </p>
      </CardBody>
    </Card>
  );
}

function CreateBusinessStep() {
  const [state, action] = useActionState(createBusiness, {} as ActionState);

  return (
    <Card>
      <CardHeader
        title="Option 2 — set up your business"
        description="Tell us who you are, then connect a review source or upload your own reviews."
      />
      <CardBody>
        <form action={action} className="space-y-4">
          <Field label="Business name">
            <Input name="name" required placeholder="Columbus Dental Care" />
          </Field>

          <Field
            label="Industry"
            hint="Used to tune the analysis. Topics are still discovered from your own reviews."
          >
            <Select name="industry" required defaultValue="" className="w-full">
              <option value="" disabled>
                Choose an industry
              </option>
              {INDUSTRIES.map((industry) => (
                <option key={industry} value={industry}>
                  {industry}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City">
              <Input name="city" placeholder="Columbus" />
            </Field>
            <Field label="State or region">
              <Input name="region" placeholder="OH" />
            </Field>
          </div>

          <Submit label="Create business" variant="secondary" />
        </form>
        <ErrorNote state={state} />
      </CardBody>
    </Card>
  );
}

function ConnectSourceStep({
  business,
  providers,
}: {
  business: BusinessSummary;
  providers: ProviderSummary[];
}) {
  const [demoState, demoAction] = useActionState(connectDemoFeed, {} as ActionState);
  const [competitorState, competitorAction] = useActionState(
    addCompetitor,
    {} as ActionState,
  );

  const connectable = providers.filter(
    (p) => p.key !== "DEMO" && p.key !== "CSV_IMPORT",
  );

  return (
    <>
      <Card>
        <CardHeader
          title={`Connect reviews for ${business.name}`}
          description="ReputeIQ only reads reviews through official integrations or files you supply. Sources without credentials configured cannot be connected."
        />
        <CardBody className="space-y-4">
          <div className="rounded-[var(--radius)] border border-line bg-sunken p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">Upload a CSV export</p>
                <p className="mt-0.5 text-sm text-ink-secondary">
                  The credential-free path to real data. Columns: external_id,
                  rating, text, date.
                </p>
              </div>
              <a
                href="/settings/sources"
                className="rounded-[var(--radius)] border border-line-strong bg-raised px-3 py-1.5 text-sm font-medium hover:bg-hover"
              >
                Upload CSV
              </a>
            </div>
          </div>

          <ul className="divide-y divide-line rounded-[var(--radius)] border border-line">
            {connectable.map((provider) => (
              <li
                key={provider.key}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{provider.label}</p>
                  <p className="mt-0.5 text-sm text-ink-secondary">
                    {provider.description}
                  </p>
                </div>
                {provider.configured ? (
                  <Badge tone="good">Ready to connect</Badge>
                ) : (
                  <Badge>Credentials not configured</Badge>
                )}
              </li>
            ))}
          </ul>

          <div className="rounded-[var(--radius)] border border-dashed border-line-strong p-4">
            <p className="text-sm font-medium text-ink">
              No source available yet?
            </p>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Attach a sample review feed to this business so you can see the
              dashboard working. It is marked as demo data and can be removed
              later.
            </p>
            <form action={demoAction} className="mt-3">
              <input type="hidden" name="businessId" value={business.id} />
              <Submit label="Use sample data" variant="secondary" />
            </form>
            <ErrorNote state={demoState} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Add a competitor"
          description="Optional. Competitors you add without a connected source are tracked by name only until one is available."
          action={
            <Badge>{business._count.competitors} added</Badge>
          }
        />
        <CardBody>
          <form action={competitorAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="businessId" value={business.id} />
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
            <Submit label="Add" variant="secondary" />
          </form>
          <ErrorNote state={competitorState} />
          {competitorState.message ? (
            <p className="mt-3 text-sm text-good">{competitorState.message}</p>
          ) : null}
        </CardBody>
      </Card>
    </>
  );
}
