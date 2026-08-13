import { CsvUpload } from "@/components/csv-upload";
import { SourceActions } from "@/components/source-actions";
import { SyncNowButton } from "@/components/sync-now-button";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
} from "@/components/ui/primitives";
import { requireUserOrRedirect } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { listProviderSummaries } from "@/lib/providers/registry";
import { getActiveBusiness } from "@/lib/session/business";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Review sources" };

export default async function SourcesPage() {
  const user = await requireUserOrRedirect();
  const business = await getActiveBusiness(user.organizationId);
  if (!business) return null;

  const sources = await prisma.reviewSource.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      provider: true,
      displayName: true,
      status: true,
      isDemo: true,
      lastSyncedAt: true,
      lastError: true,
      _count: { select: { reviews: true } },
    },
  });

  const providers = listProviderSummaries();

  return (
    <>
      <PageHeader
        title="Review sources"
        description="ReputeIQ reads reviews through official APIs you authorize or files you upload. It does not scrape review sites."
        action={<SyncNowButton businessId={business.id} />}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Connected sources" />
            <CardBody>
              {sources.length === 0 ? (
                <p className="text-sm text-ink-secondary">
                  No sources connected yet.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {sources.map((source) => (
                    <li
                      key={source.id}
                      className="flex flex-wrap items-start justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-ink">
                            {source.displayName}
                          </span>
                          {source.isDemo ? <Badge tone="accent">Demo</Badge> : null}
                          <Badge
                            tone={
                              source.status === "CONNECTED"
                                ? "good"
                                : source.status === "ERROR"
                                  ? "critical"
                                  : "neutral"
                            }
                          >
                            {source.status.toLowerCase()}
                          </Badge>
                        </div>
                        <p className="tnum mt-0.5 text-xs text-ink-muted">
                          {source._count.reviews} review
                          {source._count.reviews === 1 ? "" : "s"}
                          {source.lastSyncedAt
                            ? ` · last synced ${formatDate(source.lastSyncedAt)}`
                            : " · never synced"}
                        </p>
                        {source.lastError ? (
                          <p className="mt-1 text-xs text-critical">
                            {source.lastError}
                          </p>
                        ) : null}
                      </div>
                      <SourceActions sourceId={source.id} status={source.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Available integrations"
              description="A provider without credentials configured cannot be connected. That is deliberate — there is no scraping fallback."
            />
            <CardBody>
              <ul className="divide-y divide-line">
                {providers.map((provider) => (
                  <li
                    key={provider.key}
                    className="flex flex-wrap items-start justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {provider.label}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-secondary">
                        {provider.description}
                      </p>
                    </div>
                    <Badge tone={provider.configured ? "good" : "neutral"}>
                      {provider.configured ? "Available" : "Not configured"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader
            title="Upload a CSV"
            description="The credential-free path to real data. Export your reviews from wherever they live and upload them here."
          />
          <CardBody>
            <CsvUpload businessId={business.id} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
