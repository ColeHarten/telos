import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";
import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/services/auth";
import { logError } from "@/lib/services/logging";
import { checkRateLimit, type RateLimitRule } from "@/lib/services/rateLimit";

/** An error with an HTTP status and a message that is safe to show the user. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function badRequest(message: string): ApiError {
  return new ApiError(400, "bad_request", message);
}

/** Every API error response has the same shape: { error, message }. */
export function errorResponse(status: number, code: string, message: string, headers?: Record<string, string>): Response {
  return NextResponse.json({ error: code, message }, { status, headers });
}

export async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw badRequest("Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
}

export function requireString(body: Record<string, unknown>, key: string, maxLength = 512): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim() === "" || value.length > maxLength) {
    throw badRequest(`"${key}" must be a non-empty string.`);
  }
  return value.trim();
}

// Firestore document ids sent by the browser. No slashes, so an id can't
// point at a different path.
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function requireId(body: Record<string, unknown>, key: string): string {
  const value = requireString(body, key, 128);
  if (!ID_PATTERN.test(value)) throw badRequest(`"${key}" is not a valid id.`);
  return value;
}

type RouteContext = { req: Request; user: DecodedIdToken };

type RouteOptions = {
  /** Short route name for logs. */
  name: string;
  rateLimit?: RateLimitRule;
};

/**
 * Wraps an API route: verifies the Firebase ID token (401), applies the
 * per-user rate limit (429), and turns errors into the standard shape.
 * Unexpected errors return a generic 500 and are logged without payloads.
 */
export function withUser(options: RouteOptions, handler: (ctx: RouteContext) => Promise<Response>) {
  return async function route(req: Request): Promise<Response> {
    try {
      const user = await requireUser(req);

      if (options.rateLimit) {
        const limit = await checkRateLimit(user.uid, options.rateLimit);
        if (!limit.allowed) {
          return errorResponse(429, "rate_limited", "Too many requests. Please wait a moment and try again.", {
            "Retry-After": String(limit.retryAfterSeconds),
          });
        }
      }

      return await handler({ req, user });
    } catch (err) {
      if (err instanceof AuthError) {
        return errorResponse(401, "unauthorized", "Your session has expired. Please sign in again.");
      }
      if (err instanceof ApiError) {
        if (err.status >= 500) logError(options.name, err);
        return errorResponse(err.status, err.code, err.message);
      }
      logError(options.name, err);
      return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
    }
  };
}
