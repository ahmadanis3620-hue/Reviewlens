import { z } from "zod";

/**
 * Environment validation.
 *
 * Parsed lazily on first access so that importing a module for a unit test does
 * not require a full production environment, but fails fast and readably the
 * moment a server path actually needs a value.
 *
 * Server-only. Nothing here is safe to import from a client component.
 */

const booleanish = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().optional(),

  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),
  APP_URL: z.string().default("http://localhost:3000"),

  AI_PROVIDER: z.enum(["local", "openai"]).default("local"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  AI_FALLBACK_TO_LOCAL: booleanish,
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  YELP_API_KEY: z.string().optional(),

  EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("ReputeIQ <reports@example.com>"),

  CRON_SECRET: z.string().min(8, "CRON_SECRET must be at least 8 characters"),

  BILLING_ENABLED: booleanish,
  STRIPE_SECRET_KEY: z.string().optional(),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\n` +
        `Copy .env.example to .env and fill in the required values.`,
    );
  }

  cached = parsed.data;
  return cached;
}

/** Test helper: forget the memoized environment after mutating process.env. */
export function resetEnvCache(): void {
  cached = null;
}

/**
 * Whether a real AI vendor is reachable. Used to decide between the OpenAI
 * adapter and the deterministic local analyzer, and to tell the user in the UI
 * which one produced an analysis.
 */
export function isOpenAIConfigured(): boolean {
  const env = getEnv();
  return env.AI_PROVIDER === "openai" && !!env.OPENAI_API_KEY;
}
