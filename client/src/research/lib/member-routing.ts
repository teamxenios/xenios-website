import type { MemberInfo } from "../core";
import { isAccountOrderDetailPath } from "../account-portal/routes";
import { ACCOUNT_PORTAL_ROUTES, MEMBER_ROUTES } from "./routes";

const MEMBER_ROOT = "/research/member";
const ACCOUNT_ROOT = "/research/account";
const ACTIVATION_ROOT = "/research/activate";
// The closed allowlist: registered member routes plus the nine static
// account-portal routes. The portal set stays enumerated (never a
// startsWith("/research/account") check) so the parked identity/organization
// family under the same prefix remains unreturnable until it is mounted. The
// order-detail family is admitted separately by its bounded one-segment parser
// so case-sensitive opaque references survive without widening the prefix.
const STATIC_MEMBER_PATHS = new Set<string>(
  [...Object.values(MEMBER_ROUTES), ...Object.values(ACCOUNT_PORTAL_ROUTES)].filter(
    (path) => !path.includes(":"),
  ),
);
const DYNAMIC_MEMBER_PATHS = [
  /^\/research\/member\/goals\/[a-z0-9][a-z0-9._-]*$/,
  /^\/research\/member\/products\/[a-z0-9][a-z0-9._-]*$/,
  /^\/research\/member\/guides\/[a-z0-9][a-z0-9._-]*$/,
  /^\/research\/member\/orders\/[a-z0-9][a-z0-9._-]*$/,
  // One v2 catalog product: /research/member/catalog/:family/:slug. Both
  // segments are the address (the detail API is keyed by family AND slug), so
  // Buy Now -> sign-in -> return must carry both. Anchored, exactly two
  // segments, and character classes matching the closed family vocabulary
  // (lowercase words joined by underscores) and the server's own slug shape
  // (lowercase, digits, hyphens). No dot, no slash beyond the two, no escape
  // for a crafted returnTo to widen.
  /^\/research\/member\/catalog\/[a-z0-9]+(?:_[a-z0-9]+)*\/[a-z0-9][a-z0-9-]{0,191}$/,
];

function isRegisteredMemberPath(pathname: string): boolean {
  return STATIC_MEMBER_PATHS.has(pathname) ||
    DYNAMIC_MEMBER_PATHS.some((pattern) => pattern.test(pathname));
}

export function safeResearchReturnTo(value: string | null | undefined): string | null {
  if (!value || value !== value.trim()) return null;
  if (value.includes("\\") || value.includes("#") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const rawPath = value.split("?", 1)[0];
  // Member routes do not require encoded path octets. Rejecting every encoded
  // path byte closes encoded and double-encoded traversal/separator variants.
  if (/%[0-9a-f]{2}/i.test(rawPath)) return null;
  if (!(value === "/research" || value.startsWith("/research/"))) return null;

  try {
    const base = new URL("https://xenios.invalid");
    const parsed = new URL(value, base);
    if (parsed.origin !== base.origin) return null;
    const normalizedPathname = parsed.pathname.toLowerCase();
    const accountOrderDetail = isAccountOrderDetailPath(parsed.pathname);
    if (!accountOrderDetail && parsed.pathname !== normalizedPathname) return null;
    if (
      normalizedPathname !== "/research" &&
      normalizedPathname !== ACTIVATION_ROOT &&
      !isRegisteredMemberPath(normalizedPathname) &&
      !accountOrderDetail
    ) return null;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

const ACCESS_STATE_ROOT = "/research/access-state";

/**
 * The distinct screen for a server-issued member denial code. activation
 * already has its own canonical screen; every other coded refusal renders on
 * the access-state page, which keys one distinct screen per code. The code is
 * carried in the query string as transport only: it always originated
 * server-side, and the page grants nothing (it renders explanations, so a
 * hand-typed code can reveal or unlock nothing).
 */
export function denialDestination(code: string): string {
  if (code === "activation_required") return ACTIVATION_ROOT;
  return `${ACCESS_STATE_ROOT}?code=${encodeURIComponent(code)}`;
}

/**
 * Route a server-verified member by their server-reported status, following
 * the STATUS half of the server guard's classification
 * (server/research/member-auth.ts requireActiveMember): pending_activation ->
 * activation flow, past_due -> the billing screen, anything else non-active ->
 * the inactive-membership screen. The status field is the server's own answer
 * from /api/research/member/me; the client maps it to a screen and decides
 * nothing. The guard's SECOND half (billing_state enforcement for
 * status-active members, emitted as dynamic billing_* codes by member-content
 * APIs) is not visible on /member/me and surfaces in place instead, via
 * ResearchDenialNotice with the billing-family copy in lib/denials.ts.
 */
export function memberDestination(member: MemberInfo, requestedReturnTo?: string | null): string {
  const safeReturnTo = safeResearchReturnTo(requestedReturnTo);
  if (member.status === "active") {
    // The prefix check here is safe ONLY because safeResearchReturnTo has
    // already validated against the closed allowlist above — this branch
    // merely decides which validated destinations an active member may keep.
    return safeReturnTo === MEMBER_ROOT ||
      safeReturnTo?.startsWith(`${MEMBER_ROOT}/`) ||
      safeReturnTo === ACCOUNT_ROOT ||
      safeReturnTo?.startsWith(`${ACCOUNT_ROOT}/`)
      ? safeReturnTo
      : MEMBER_ROOT;
  }
  if (member.status === "pending_activation") return ACTIVATION_ROOT;
  if (member.status === "past_due") return denialDestination("billing_past_due");
  return denialDestination("membership_inactive");
}
