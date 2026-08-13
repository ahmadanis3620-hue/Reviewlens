import { getEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import type { EmailMessage, EmailProvider, SendResult } from "@/lib/email/types";

/**
 * Resend adapter. Called through the plain REST API rather than the SDK — one
 * endpoint does not justify a dependency.
 *
 * Untested against the live API; no credentials were available during
 * development.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";

  async send(message: EmailMessage): Promise<SendResult> {
    const env = getEnv();
    if (!env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      log.error("resend send failed", {
        status: response.status,
        bodyPreview: body.slice(0, 200),
      });
      throw new Error(`Resend returned ${response.status}`);
    }

    const payload = (await response.json()) as { id?: string };
    return { provider: this.name, id: payload.id ?? null, delivered: true };
  }
}
