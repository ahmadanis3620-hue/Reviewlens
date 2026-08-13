import { UsageKind } from "@prisma/client";

import { prisma } from "@/lib/db";
import { ConsoleEmailProvider } from "@/lib/email/providers/console";
import { ResendEmailProvider } from "@/lib/email/providers/resend";
import type { EmailMessage, EmailProvider, SendResult } from "@/lib/email/types";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/logger";

/**
 * Email service. Swapping vendors means adding a provider and one line in
 * `resolveProvider` — no call site changes.
 */
export class EmailService {
  private readonly provider: EmailProvider;

  constructor(provider?: EmailProvider) {
    this.provider = provider ?? resolveProvider();
  }

  get providerName(): string {
    return this.provider.name;
  }

  async send(
    message: EmailMessage,
    context?: { organizationId: string; businessId?: string },
  ): Promise<SendResult> {
    const result = await this.provider.send(message);

    if (context) {
      await prisma.usageRecord
        .create({
          data: {
            organizationId: context.organizationId,
            businessId: context.businessId ?? null,
            kind: UsageKind.EMAIL_SENT,
            meta: { provider: result.provider, delivered: result.delivered },
          },
        })
        .catch((error: unknown) => {
          // Usage accounting must never fail a delivery that already happened.
          log.warn("could not record email usage", {
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }

    return result;
  }
}

function resolveProvider(): EmailProvider {
  const env = getEnv();
  if (env.EMAIL_PROVIDER === "resend" && env.RESEND_API_KEY) {
    return new ResendEmailProvider();
  }
  if (env.EMAIL_PROVIDER === "resend") {
    log.warn("EMAIL_PROVIDER=resend but RESEND_API_KEY is unset; using local outbox");
  }
  return new ConsoleEmailProvider();
}

let shared: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!shared) shared = new EmailService();
  return shared;
}

export function resetEmailService(): void {
  shared = null;
}
