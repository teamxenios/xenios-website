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

export function isResearchAdminPath(pathname: string): boolean {
  const p = normalize(pathname);
  return p === "/admin/research" || p.startsWith("/admin/research/");
}

export function isResearchResetPasswordPath(pathname: string): boolean {
  // Tolerate the optional trailing slash, mirroring the wouter route pattern
  // ^/research/reset-password/?$ — the router renders the reset page at
  // /research/reset-password/ too, so the sensitive-page headers must apply
  // there as well.
  const p = normalize(pathname);
  return p === "/research/reset-password" || p === "/research/reset-password/";
}

// FOUNDER DECISION (2026-07-30, "option 1"): the public entry to Research is
// open. Before this, the shared review password gated the gateway itself, so
// the gateway's own "Apply for Membership" button could not be reached and
// /research/apply hit the password wall directly. A prospective member had no
// public path into Xenios at all.
//
// This opens EXACTLY the discover-and-apply lifecycle and nothing else. The
// catalog, product data, orders and every member route keep their existing
// guard: those need the member's own Supabase JWT, which the shared password
// never granted anyway. Opening these paths therefore does not publish the
// catalog, which is the state the review gate exists to protect while COAs and
// legal review are outstanding.
//
// This mirrors the 2026-07-19 recovery decision in shape: an explicit, named,
// exact-match allowlist rather than a prefix, so a future /research/apply-admin
// style route cannot fall through it by accident. Every endpoint behind these
// pages is token-gated and rate-limited server-side.
const PUBLIC_ENTRY_PATHS = new Set([
  "/research", // the gateway itself, which carries the apply and sign-in actions
  "/research/apply",
  "/research/apply/review",
  "/research/apply/success",
  "/research/apply/status",
  "/research/application/status", // alias registered in section.tsx
  "/research/application-status", // alias registered in section.tsx
  // These are the EXACT targets the gateway footer links to
  // (Gateway.tsx:86-87). An earlier draft of this list used /research/privacy
  // and /research/terms, which are real routes but are NOT what the gateway
  // links to, so the public gateway would have shipped with two footer links
  // that hit the password wall. Read the component, not the route table.
  "/research/policies/privacy",
  "/research/policies/terms",
]);

export function isResearchPublicEntryPath(pathname: string): boolean {
  // Strip query and hash first: the status page is reached as
  // /research/apply/status?token=..., and a raw comparison would miss it.
  // Then normalize exactly as wouter does (decodeURI, lowercase) and tolerate
  // a trailing slash, matching isResearchResetPasswordPath's reasoning.
  const raw = pathname.split(/[?#]/, 1)[0];
  const p = normalize(raw).replace(/\/+$/, "");
  return PUBLIC_ENTRY_PATHS.has(p === "" ? "/" : p);
}
