/**
 * xenios research: FULL_CATALOG_VISIBILITY, the named member visibility grant.
 *
 * The problem this solves: the default member catalog lists the records a
 * member can actually act on. A founder, an operator, or a named early member
 * sometimes needs to see the whole displayable range, including the records
 * that are request access only today. Doing that with a code change per person
 * is not a mechanism; doing it with a query parameter would let the browser
 * choose its own breadth. So the grant is a server side allowlist, read from
 * the environment, compared the same way ADMIN_EMAIL is compared in
 * server/routes.ts requireSupabaseAdmin (lowercased, trimmed, exact match).
 *
 * WHAT THE GRANT DOES AND DOES NOT DO, precisely:
 *
 *   It changes WHICH PRODUCTS ARE LISTED. Nothing else.
 *
 *   It does NOT change a product's offer mode. A record that is
 *   REQUEST_ACCESS_ONLY stays REQUEST_ACCESS_ONLY for an allowlisted member, so
 *   the grant can never turn a look into a purchase. The offer readiness state
 *   machine remains the single authority on that, and it never reads this file.
 *
 *   It does NOT reveal the regulatory hold tier. Those three products are
 *   excluded from the customer projection in peptide-catalog.ts itself, by a
 *   code path that returns null before this module is consulted. No allowlist
 *   entry, no audience, and no flag can put them in a member view.
 *
 *   It does NOT reveal an internal field. Breadth selects records out of the
 *   already sanitized projection; it never selects fields.
 *
 * FAIL CLOSED: the variable is unset by default, an unset or blank variable
 * grants nobody, an unparsable entry is dropped rather than widened, and an
 * unknown or blank viewer email resolves to `standard`.
 */

import {
  type CatalogVisibilityBreadth,
} from "@shared/research/catalog-display/contract";

/**
 * The environment variable that carries the grant.
 *
 * Format: a comma separated list of member email addresses. Whitespace around
 * each entry is trimmed and comparison is lowercased, so
 * " Sboadu1212@Gmail.com , ops@example.com " and
 * "sboadu1212@gmail.com,ops@example.com" are the same allowlist.
 *
 * Default: unset, which grants nobody. This is the only safe default: a typo
 * in the variable name must mean "nobody has the grant", never "everybody
 * does".
 */
export const FULL_CATALOG_VISIBILITY_ENV_VAR = "RESEARCH_FULL_CATALOG_MEMBERS";

/** The environment shape this module reads. Injected so tests need no globals. */
export type VisibilityEnv = Record<string, string | undefined>;

/**
 * Normalize one identity for comparison: lowercased and trimmed, exactly the
 * transformation requireSupabaseAdmin applies to ADMIN_EMAIL and to the
 * Supabase user's email before comparing them.
 */
export function normalizeMemberIdentity(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().trim() : "";
}

/**
 * Parse the allowlist out of the environment.
 *
 * Blank entries are dropped, so a trailing comma or a double comma cannot
 * produce an empty string entry that would then match a caller with no email.
 * A wildcard is NOT supported on purpose: "grant everyone" is a product
 * decision, not an environment value, and an accidental "*" must grant nobody.
 */
export function fullCatalogVisibilityAllowlist(
  env: VisibilityEnv = process.env,
): ReadonlySet<string> {
  const raw = env[FULL_CATALOG_VISIBILITY_ENV_VAR];
  if (typeof raw !== "string" || raw.trim() === "") return new Set<string>();
  const entries = raw
    .split(",")
    .map((entry) => normalizeMemberIdentity(entry))
    .filter((entry) => entry.length > 0);
  return new Set<string>(entries);
}

/**
 * Whether this identity holds the FULL_CATALOG_VISIBILITY grant.
 *
 * Exact match only. A substring, a domain, or a prefix never matches, so
 * "sboadu1212@gmail.com.attacker.example" and "@gmail.com" are both denied.
 */
export function hasFullCatalogVisibility(
  email: unknown,
  env: VisibilityEnv = process.env,
): boolean {
  const identity = normalizeMemberIdentity(email);
  if (identity === "") return false;
  return fullCatalogVisibilityAllowlist(env).has(identity);
}

/**
 * The breadth for one identity via the allowlist alone. Total: every input
 * resolves to one of the two closed values, and anything unrecognized
 * resolves to `standard`.
 */
export function resolveVisibilityBreadth(
  email: unknown,
  env: VisibilityEnv = process.env,
): CatalogVisibilityBreadth {
  return hasFullCatalogVisibility(email, env) ? "full" : "standard";
}

/**
 * The viewer facts the breadth policy reads. `memberStatus` is optional so an
 * authorizer that has not been taught to supply it keeps exactly the old
 * allowlist behaviour; absence is never treated as active. The status is a
 * grant only when it is bound to the exact member audience.
 */
export interface VisibilityViewer {
  email: unknown;
  audience?: string;
  memberStatus?: string | null;
}

/**
 * The breadth for one authenticated viewer, as POLICY rather than a per-email
 * allowlist.
 *
 * The founder scope decision this encodes: every legitimate offering is
 * visible to every member in good standing, each behind its honest pathway.
 * Breadth widens WHICH RECORDS ARE LISTED and nothing else; the offer
 * readiness state machine never reads this file, so a wider view can never
 * become a wider purchase.
 *
 *   - an admin viewer sees the full displayable range;
 *   - a member whose verified status is exactly "active" sees the full
 *     displayable range (the production authorizer only admits active
 *     members, and it states the status it verified rather than this module
 *     inferring it);
 *   - everyone else falls through to the named-email allowlist, which stays
 *     ADDITIVE during the transition: removing it here could revoke a named
 *     operator grant mid-flight, and retiring it is a deliberate later
 *     release, not a side effect of this policy.
 *
 * `applicantType` (individual versus professional) is deliberately NOT a
 * breadth input: the two differ in pathways and pricing, not in what they may
 * see, and a fake differentiation here would be a policy nobody decided.
 */
export function resolveViewerVisibilityBreadth(
  viewer: VisibilityViewer,
  env: VisibilityEnv = process.env,
): CatalogVisibilityBreadth {
  if (viewer.audience === "admin") return "full";
  if (viewer.audience === "member" && viewer.memberStatus === "active") return "full";
  return resolveVisibilityBreadth(viewer.email, env);
}
