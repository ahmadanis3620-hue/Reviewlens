"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import { switchBusiness } from "@/lib/session/actions";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/reviews", label: "Reviews" },
  { href: "/insights", label: "Insights" },
  { href: "/competitors", label: "Competitors" },
  { href: "/recommendations", label: "Recommendations" },
  { href: "/alerts", label: "Alerts" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

export function AppNav({
  businesses,
  activeBusinessId,
}: {
  businesses: Array<{ id: string; name: string; isDemo: boolean }>;
  activeBusinessId: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex min-w-0 flex-1 items-center gap-4">
      {businesses.length > 1 ? (
        <select
          aria-label="Active business"
          value={activeBusinessId}
          disabled={pending}
          onChange={(event) => {
            const id = event.target.value;
            startTransition(async () => {
              await switchBusiness(id);
              router.refresh();
            });
          }}
          className="h-8 max-w-44 rounded-[var(--radius)] border border-line-strong bg-surface px-2 text-sm"
        >
          {businesses.map((business) => (
            <option key={business.id} value={business.id}>
              {business.name}
              {business.isDemo ? " (demo)" : ""}
            </option>
          ))}
        </select>
      ) : null}

      <nav className="min-w-0 flex-1 overflow-x-auto">
        <ul className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block whitespace-nowrap rounded-[var(--radius)] px-2.5 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-hover font-medium text-ink"
                      : "text-ink-secondary hover:bg-hover hover:text-ink",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
