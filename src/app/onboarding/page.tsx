import Link from "next/link";
import { redirect } from "next/navigation";

import { OnboardingSteps } from "@/components/onboarding-steps";
import { requireUserOrRedirect } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { listProviderSummaries } from "@/lib/providers/registry";

export const metadata = { title: "Get set up" };

export default async function OnboardingPage() {
  const user = await requireUserOrRedirect();

  const businesses = await prisma.business.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      industry: true,
      isDemo: true,
      _count: { select: { reviews: true, competitors: true, reviewSources: true } },
    },
  });

  // Once a business has reviews there is nothing left to onboard.
  const ready = businesses.find((b) => b._count.reviews > 0);
  if (ready) redirect("/dashboard");

  const providers = listProviderSummaries();

  return (
    <div className="min-h-screen bg-sunken">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
          <Link href="/" className="text-[15px] font-semibold tracking-[-0.01em]">
            ReputeIQ
          </Link>
          <p className="text-sm text-ink-secondary">{user.organizationName}</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">
          Let&apos;s get your reputation dashboard running
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-secondary">
          Two ways to start: load a fully-analyzed demo business to see what the
          product does, or set up your own and connect a review source.
        </p>

        <OnboardingSteps
          business={businesses[0] ?? null}
          providers={providers}
        />
      </main>
    </div>
  );
}
