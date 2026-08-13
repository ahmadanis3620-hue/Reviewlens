import Link from "next/link";
import { redirect } from "next/navigation";

import { AppNav } from "@/components/app-nav";
import { Badge } from "@/components/ui/primitives";
import { signOut } from "@/lib/auth/actions";
import { listAccessibleBusinesses, requireUserOrRedirect } from "@/lib/auth/guards";
import { getActiveBusiness } from "@/lib/session/business";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUserOrRedirect();
  const business = await getActiveBusiness(user.organizationId);

  // Nothing to show without a business; onboarding is the only sensible place.
  if (!business) redirect("/onboarding");

  const businesses = await listAccessibleBusinesses(user.organizationId);

  return (
    <div className="min-h-screen bg-sunken">
      <header className="sticky top-0 z-20 border-b border-line bg-surface no-print">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-5">
          <Link href="/dashboard" className="text-[15px] font-semibold tracking-[-0.01em]">
            ReputeIQ
          </Link>

          <span aria-hidden className="h-4 w-px bg-line" />

          <AppNav
            businesses={businesses}
            activeBusinessId={business.id}
          />

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-ink-secondary sm:block">
              {user.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-[var(--radius)] border border-line-strong px-3 py-1.5 text-sm font-medium text-ink hover:bg-hover"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {business.isDemo ? (
        <div className="border-b border-line bg-accent-soft">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-5 py-2">
            <Badge tone="accent">Demo data</Badge>
            <p className="text-sm text-accent-ink">
              {business.name} is a generated sample business. Every figure below
              is really computed from that sample — no real customer reviews are
              involved.
            </p>
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-[1400px] px-5 py-8">{children}</main>
    </div>
  );
}
