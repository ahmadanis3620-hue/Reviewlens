/** Application error taxonomy. Each carries the HTTP status it maps to. */

export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Not signed in") {
    super(message, 401, "unauthorized");
  }
}

/**
 * Raised whenever a request references a resource outside the caller's
 * organization. Deliberately indistinguishable from "not found" in the response
 * body so the API does not confirm that a foreign id exists.
 */
export class ForbiddenError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "forbidden");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "not_found");
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Invalid request",
    readonly details?: unknown,
  ) {
    super(message, 400, "validation_error");
  }
}

export class RateLimitError extends AppError {
  constructor(
    message = "Too many requests",
    readonly retryAfterSeconds = 60,
  ) {
    super(message, 429, "rate_limited");
  }
}

export class PlanLimitError extends AppError {
  constructor(message: string) {
    super(message, 402, "plan_limit");
  }
}

/** Raised by the AI layer when a provider is unreachable or returns garbage. */
export class AIUnavailableError extends AppError {
  constructor(message = "AI analysis is temporarily unavailable") {
    super(message, 503, "ai_unavailable");
  }
}

export function toErrorResponse(error: unknown): {
  status: number;
  body: { error: string; code: string; details?: unknown };
} {
  if (error instanceof ValidationError) {
    return {
      status: error.status,
      body: { error: error.message, code: error.code, details: error.details },
    };
  }
  if (error instanceof AppError) {
    return { status: error.status, body: { error: error.message, code: error.code } };
  }
  // Never leak an unexpected error's message to the client.
  return {
    status: 500,
    body: { error: "Something went wrong", code: "internal_error" },
  };
}
