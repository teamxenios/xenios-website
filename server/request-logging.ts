import type { NextFunction, Request, RequestHandler, Response } from "express";
import { randomUUID } from "crypto";

// API response bodies are private by default. Request logs may include a body
// only for these deliberately small, non-sensitive diagnostics.
const SAFE_API_RESPONSE_BODY_PATHS = new Set([
  "/api/health",
  "/api/counter",
  "/api/waitlist/count",
]);

export function shouldLogApiResponseBody(path: string): boolean {
  return SAFE_API_RESPONSE_BODY_PATHS.has(path);
}

// Log declared route templates when Express provides one (for example,
// `/api/care/appointments/:appointmentId`). A template preserves useful
// route-level health and latency evidence without putting the member's actual
// record identifier in a log line. Unknown, nested-router, and fallback paths
// are reduced to a coarse API bucket instead of ever echoing req.path.
const SAFE_DECLARED_API_ROUTE =
  /^\/api(?:\/(?:[A-Za-z0-9][A-Za-z0-9._~-]{0,63}|:[A-Za-z][A-Za-z0-9_]{0,63}))*$/;

function isAtOrUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function apiLogPath(req: Pick<Request, "path" | "route">): string | null {
  const rawPath = typeof req.path === "string" ? req.path : "";
  if (!isAtOrUnder(rawPath, "/api")) return null;

  const declaredPath = req.route?.path;
  if (typeof declaredPath === "string" && SAFE_DECLARED_API_ROUTE.test(declaredPath)) {
    return declaredPath;
  }

  // These exact paths are already approved for bounded diagnostic response
  // logging, so their static path labels are safe as well.
  if (SAFE_API_RESPONSE_BODY_PATHS.has(rawPath)) return rawPath;

  if (isAtOrUnder(rawPath, "/api/care") || isAtOrUnder(rawPath, "/api/tebra")) {
    return "/api/care/[redacted]";
  }
  if (isAtOrUnder(rawPath, "/api/admin")) return "/api/admin/[redacted]";
  if (isAtOrUnder(rawPath, "/api/research")) return "/api/research/[redacted]";
  return "/api/[redacted]";
}

export function safeHttpErrorStatus(error: unknown): number {
  if (!error || typeof error !== "object") return 500;
  let candidate: unknown;
  try {
    const value = error as { status?: unknown; statusCode?: unknown };
    candidate = value.status ?? value.statusCode;
  } catch {
    return 500;
  }
  if (
    typeof candidate !== "number"
    || !Number.isInteger(candidate)
    || candidate < 400
    || candidate > 599
  ) {
    return 500;
  }
  return candidate;
}

export function publicHttpErrorMessage(status: number): string {
  return status >= 500 ? "Internal Server Error" : "Request failed";
}

export function httpErrorLogLine(req: Request, status: number): string {
  const category = status >= 500 ? "server_failure" : "request_rejected";
  const route = apiLogPath(req) ?? "[non-api]";
  return formatWithRequestId(
    `request_error category=${category} route=${route} status=${status}`,
    req,
  );
}

// ---------------------------------------------------------------------------
// Request correlation ids.
//
// One fresh server-generated id per request, stamped on the response and
// available to log lines. Inbound X-Request-Id values are never adopted: even
// a syntactically safe value can be a customer, clinical, or external-system
// identifier and therefore must not become durable log content.
//
// server/index.ts mounts this middleware before body parsers so parse failures
// also carry the server id. /api/health echoes the assigned response header.
// ---------------------------------------------------------------------------

export const REQUEST_ID_HEADER = "X-Request-Id";

// Retained as a compatibility validator for callers that need to reject
// hostile header syntax. Request logging deliberately does not use it to
// adopt an external value.
const MAX_REQUEST_ID_LENGTH = 64;
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]+$/;

export function sanitizeRequestId(value: unknown): string | null {
  // Repeated headers arrive as arrays; ambiguous, so reject them.
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > MAX_REQUEST_ID_LENGTH) return null;
  if (!SAFE_REQUEST_ID.test(value)) return null;
  return value;
}

// Module-owned storage keyed by the request object, so no Express type
// augmentation or ad-hoc property writes are needed.
const requestIds = new WeakMap<Request, string>();

// Middleware factory: assigns the request its correlation id and echoes it on
// the response so clients and upstream proxies can correlate too.
export function requestId(): RequestHandler {
  return function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
    const id = randomUUID();
    requestIds.set(req, id);
    res.setHeader(REQUEST_ID_HEADER, id);
    next();
  };
}

export function getRequestId(req: Request): string | undefined {
  return requestIds.get(req);
}

// Formatter helper for the request logger: prefixes the correlation id when
// the middleware assigned one, and leaves the line untouched otherwise, so it
// is safe to adopt before (or without) mounting requestId().
export function formatWithRequestId(line: string, req: Request): string {
  const id = requestIds.get(req);
  return id ? `[rid:${id}] ${line}` : line;
}
