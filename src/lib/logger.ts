/**
 * Structured logging with redaction.
 *
 * Anything whose key looks like a credential or a personal identifier is
 * replaced before it reaches the transport, so a careless `log.info("x", ctx)`
 * at a call site cannot leak a token or a reviewer's contact details.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const REDACT_KEY = /pass|token|secret|key|authorization|cookie|credential|email|phone/i;
const REDACTED = "[redacted]";

function currentLevel(): Level {
  const raw = process.env.LOG_LEVEL;
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEY.test(k) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: Level, message: string, context?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel()]) return;
  if (process.env.NODE_ENV === "test" && level !== "error") return;

  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(context ? { ctx: redact(context) as Record<string, unknown> } : {}),
  };

  const serialized = JSON.stringify(line);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

export const log = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
};

/** Times an operation and logs its outcome. Rethrows on failure. */
export async function timed<T>(
  name: string,
  ctx: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    log.info(`${name} ok`, { ...ctx, durationMs: Date.now() - started });
    return result;
  } catch (error) {
    log.error(`${name} failed`, {
      ...ctx,
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
