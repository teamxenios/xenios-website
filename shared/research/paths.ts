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

export function normalizeResearchPath(pathname: string): string {
  const rawPath = pathname.split(/[?#]/, 1)[0] || "/";
  let decoded: string;
  try {
    decoded = decodeURI(rawPath); // mirrors wouter's unescape()
  } catch {
    decoded = rawPath; // wouter's fail-safe branch: leave it as-is
  }
  const lower = decoded.toLowerCase();
  return lower.length > 1 ? lower.replace(/\/$/u, "") : lower;
}

const PUBLIC_RESEARCH_DOCUMENT_PATHS = new Set([
  "/research",
  "/research/access-hub",
  "/research/supplier-access",
  "/research/organizations",
  "/research/partners",
  "/research/affiliates",
  "/research/support",
  "/research/about",
  "/research/how-it-works",
  "/research/faq",
  "/research/policies",
  "/research/policies/research-use",
  "/research/policies/shipping",
  "/research/policies/returns",
  "/research/contact",
  "/research/privacy",
  "/research/terms",
]);

/** Public, read-only document paths that may omit private-document headers. */
export function isPublicResearchDocumentPath(pathname: string): boolean {
  return PUBLIC_RESEARCH_DOCUMENT_PATHS.has(normalizeResearchPath(pathname));
}

export function isResearchPath(pathname: string): boolean {
  const p = normalizeResearchPath(pathname);
  return p === "/research" || p.startsWith("/research/");
}

export function isResearchAdminPath(pathname: string): boolean {
  const p = normalizeResearchPath(pathname);
  return p === "/admin/research" || p.startsWith("/admin/research/");
}

export function isResearchResetPasswordPath(pathname: string): boolean {
  // Tolerate the optional trailing slash, mirroring the wouter route pattern
  // ^/research/reset-password/?$ — the router renders the reset page at
  // /research/reset-password/ too, so the sensitive-page headers must apply
  // there as well.
  const p = normalizeResearchPath(pathname);
  return p === "/research/reset-password";
}

export function isResearchActivatePath(pathname: string): boolean {
  // Activation links are opened from email in a fresh browser. The page must
  // render without the shared review cookie, while its API remains protected
  // by the member's own Bearer token.
  const p = normalizeResearchPath(pathname);
  return p === "/research/activate";
}

export function isResearchAccessStatePath(pathname: string): boolean {
  // The distinct screens for server-issued member-access denial codes
  // (billing, inactive membership, recovery-purpose session). Their audience
  // is exactly the visitor who is NOT an authenticated member — often in a
  // fresh browser mid password-recovery — so the page must render in the
  // isolated account chrome, never behind the shared review password.
  const p = normalizeResearchPath(pathname);
  return p === "/research/access-state";
}

export function isResearchApplicationStatusPath(pathname: string): boolean {
  // All three registered status aliases can carry a signed status or
  // account-claim token. Keep them in the same isolated account-access chrome.
  const p = normalizeResearchPath(pathname);
  return (
    p === "/research/apply/status" ||
    p === "/research/application/status" ||
    p === "/research/application-status"
  );
}
