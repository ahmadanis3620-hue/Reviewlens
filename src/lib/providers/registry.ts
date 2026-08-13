import { ReviewProviderKey } from "@prisma/client";

import { CsvImportProvider } from "@/lib/providers/csv";
import { DemoProvider } from "@/lib/providers/demo";
import { GoogleBusinessProfileProvider } from "@/lib/providers/google";
import type { ReviewProvider } from "@/lib/providers/types";
import { YelpProvider } from "@/lib/providers/yelp";

/**
 * Provider registry.
 *
 * Adding a source means implementing the interface and adding one line here.
 * Nothing else in the application changes.
 */

class UnimplementedProvider implements ReviewProvider {
  constructor(
    readonly key: ReviewProviderKey,
    readonly label: string,
    readonly description: string,
  ) {}

  isConfigured(): boolean {
    return false;
  }

  async fetchReviews() {
    throw new Error(`${this.label} is not implemented yet.`);
    return { reviews: [] };
  }
}

const REGISTRY: Record<ReviewProviderKey, ReviewProvider> = {
  [ReviewProviderKey.DEMO]: new DemoProvider(),
  [ReviewProviderKey.CSV_IMPORT]: new CsvImportProvider(),
  [ReviewProviderKey.GOOGLE_BUSINESS_PROFILE]: new GoogleBusinessProfileProvider(),
  [ReviewProviderKey.YELP]: new YelpProvider(),
  [ReviewProviderKey.FACEBOOK]: new UnimplementedProvider(
    ReviewProviderKey.FACEBOOK,
    "Facebook Pages",
    "Facebook Page ratings via the Graph API. Not implemented yet.",
  ),
  [ReviewProviderKey.TRIPADVISOR]: new UnimplementedProvider(
    ReviewProviderKey.TRIPADVISOR,
    "Tripadvisor",
    "Tripadvisor Content API. Requires an approved partner agreement. Not implemented yet.",
  ),
};

export function getProvider(key: ReviewProviderKey): ReviewProvider {
  const provider = REGISTRY[key];
  if (!provider) throw new Error(`Unknown review provider: ${key}`);
  return provider;
}

export function listProviders(): ReviewProvider[] {
  return Object.values(REGISTRY);
}

/** Shape the integrations screen renders. Never exposes credentials. */
export type ProviderSummary = {
  key: ReviewProviderKey;
  label: string;
  description: string;
  configured: boolean;
};

export function listProviderSummaries(): ProviderSummary[] {
  return listProviders().map((p) => ({
    key: p.key,
    label: p.label,
    description: p.description,
    configured: safeIsConfigured(p),
  }));
}

/**
 * `isConfigured` reads the environment, which throws when the environment is
 * incomplete. On the integrations screen that should read as "not configured",
 * not as a crashed page.
 */
function safeIsConfigured(provider: ReviewProvider): boolean {
  try {
    return provider.isConfigured();
  } catch {
    return false;
  }
}
