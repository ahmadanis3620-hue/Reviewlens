import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { log } from "@/lib/logger";
import type { EmailMessage, EmailProvider, SendResult } from "@/lib/email/types";

/**
 * Local outbox.
 *
 * Writes the rendered message to `.mail/` so the HTML can be opened in a
 * browser during development. Nothing leaves the machine — which is the
 * correct default when the recipient addresses in a dev database are real
 * people's.
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";

  async send(message: EmailMessage): Promise<SendResult> {
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const dir = join(process.cwd(), ".mail");

    try {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${id}.html`), message.html, "utf8");
    } catch (error) {
      // A read-only filesystem must not fail the job that triggered the send.
      log.warn("could not write local mail file", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Subject only — the recipient address is redacted by the logger anyway,
    // and the body may contain customer text.
    log.info("email captured locally", { subject: message.subject, id });

    return { provider: this.name, id, delivered: false };
  }
}
