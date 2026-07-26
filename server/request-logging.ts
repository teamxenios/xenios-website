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
