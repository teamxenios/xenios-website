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

// ---------------------------------------------------------------------------
// Request correlation ids.
//
// One id per request, reused from a trusted-looking inbound X-Request-Id or
// generated fresh, stamped on the response, and available to any log line.
// The id is the ONLY header value this module ever reads or surfaces, and it
// is surfaced only after sanitization, so a hostile header cannot inject log
// content. The response-body allowlist above is unchanged by any of this.
//
// ADOPTION IN server/index.ts (leased to another lane; exactly two one-line
// changes, no other edits needed):
//   1. Immediately after `const app = express();` (before helmet and the body
//      parsers, so every request including parse failures carries an id):
//        app.use(requestId());
//   2. In the request logger's finish handler, swap
//        log(logLine);
//      for
//        log(formatWithRequestId(logLine, req));
// The /api/health endpoint (server/routes.ts) already echoes the id from the
// X-Request-Id response header once the middleware is mounted.
// ---------------------------------------------------------------------------

export const REQUEST_ID_HEADER = "X-Request-Id";

// Reuse an inbound id only when it is unambiguous and log-safe: a single
// value, bounded length, and characters that cannot break a log line, a
// header, or JSON. Everything else gets a fresh UUID instead.
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
    const id = sanitizeRequestId(req.headers["x-request-id"]) ?? randomUUID();
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
