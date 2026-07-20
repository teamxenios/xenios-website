// Canonical "is this the private Research surface?" test, shared by the
// client tracking guard and the server page gate so they can never drift
// from the router's own matching (PR #25 correction pass).
//
// The client router (wouter) matches routes case-INSENSITIVELY (regexparam
// compiles every pattern with the 'i' flag) AND against the DECODED pathname
// (wouter's unescape = decodeURI with a fail-safe fallback, paths.js). So
// /Research/... and /%72esearch/... both render the research surface. A guard
// that compares the raw, case-sensitive pathname misses those variants and
// lets tracking load / drops security headers. Normalize exactly as wouter
// does — decodeURI (fail-safe to raw on a malformed sequence) then lowercase —
// before comparing. The root homepage ("/") never matches, so it is never
// misclassified as research.

function normalize(pathname: string): string {
  let decoded: string;
  try {
    decoded = decodeURI(pathname); // mirrors wouter's unescape()
  } catch {
    decoded = pathname; // wouter's fail-safe branch: leave it as-is
  }
  return decoded.toLowerCase();
}

export function isResearchPath(pathname: string): boolean {
  const p = normalize(pathname);
  return p === "/research" || p.startsWith("/research/");
}

export function isResearchResetPasswordPath(pathname: string): boolean {
  return normalize(pathname) === "/research/reset-password";
}
