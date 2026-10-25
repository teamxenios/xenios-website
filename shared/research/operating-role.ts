// xenios research: the scoped operating and growth role.
//
// WHY THIS FILE EXISTS
//
// Every research administrative surface in this repository is guarded by one
// binary check: `requireSupabaseAdmin` in server/routes.ts, which compares the
// caller's Supabase email against a single `ADMIN_EMAIL`. There is no middle
// setting. Granting a new operating and growth team member access to the
// partner pipeline today would hand them the same identity that approves
// prices, approves products and images, administers roles, and reads every
// audited action. That is a duplicate super admin, and it is what this role
// exists to avoid.
//
// So this module defines a role by what it is ALLOWED to do, as a short
// explicit list, and by what it is REFUSED, as a separate explicit list that
// the granted list is tested against. A permission that is not written down
// here does not exist for this role. There is no wildcard, no inheritance, and
// no "admin implies everything" path.
//
// WHY THIS ROLE IS DELIBERATELY NOT A PrelaunchRole
//
// `PRELAUNCH_ROLES` in shared/research/prelaunch.ts is the other role
// vocabulary on the research side. It is NOT used here, on purpose.
// `buildPrelaunchGuard(deps, allowedRoles?)` in server/research/prelaunch.ts
// treats an omitted `allowedRoles` as "any prelaunch role passes"
// (server/research/prelaunch.ts, the `roles.find` call inside the guard), and
// `registerPrelaunchApi` mounts one such bare guard. Adding a new name to
// `PRELAUNCH_ROLES` would therefore widen every bare-guard surface by default,
// which is precisely the escalation-by-default shape this lane is meant to
// close. `operating_growth` is kept outside that vocabulary and is asserted to
// stay outside it by test.
//
// Assignment is a founder action. This module defines the role. It creates no
// account, grants nothing to any person, and reads no authentication config.

/** The one role name this module governs. */
export const OPERATING_GROWTH_ROLE = "operating_growth";
export type OperatingGrowthRole = typeof OPERATING_GROWTH_ROLE;

// ---------------------------------------------------------------------------
// Granted permissions: explicit, minimal, closed
// ---------------------------------------------------------------------------

/**
 * The complete set of permissions this role may ever hold. Read surfaces are
 * separated from the workflow surface so a future reviewer can see at a glance
 * that only one of these five can change state, and that the state it changes
 * is partner pipeline progress and nothing else.
 */
export const OPERATING_PERMISSIONS = [
  /** Read the approved partner pipeline: applications, stages, status. */
  "operating:partner_pipeline_read",
  /** Advance a partner through the pipeline stages Samuel has authorized. */
  "operating:partner_workflow",
  /** Read the organization pipeline: organizations, campaigns, events. */
  "operating:organization_pipeline_read",
  /** Read growth KPIs: leads, conversions, attribution rollups. */
  "operating:growth_kpis_read",
  /** Read operating KPIs: throughput, queue ages, SLA attainment. */
  "operating:operating_kpis_read",
] as const;

export type OperatingPermission = (typeof OPERATING_PERMISSIONS)[number];

/**
 * LIVE versus PLANNED, and why the distinction is load bearing.
 *
 * A scoped role is a security artifact. If its allow list names surfaces that
 * do not exist, nobody can reason about what the role actually grants today,
 * and the first real implementation of one of those names inherits a
 * permission nobody reviewed. So the vocabulary above is split by fact, not by
 * intent: a permission is LIVE only when a route registered in this repository
 * uses it, and PLANNED otherwise.
 *
 * `OPERATING_SURFACE_POLICY` below can only carry an allow decision for a live
 * permission, because `OperatingSurfaceDecision["permission"]` is typed
 * `OperatingLivePermission`. Writing an allow entry for a planned permission is
 * a compile error, not a review finding. When a planned surface is built, the
 * permission moves into `OPERATING_LIVE_PERMISSIONS` in the same change that
 * registers the route, and `operating-surface-registry.test.ts` fails until it
 * does.
 */
export const OPERATING_LIVE_PERMISSIONS = [
  // POST /api/admin/research/partners/:partnerId/review is registered in
  // server/research/commerce/routes.ts.
  "operating:partner_workflow",
] as const satisfies readonly OperatingPermission[];

export type OperatingLivePermission =
  (typeof OPERATING_LIVE_PERMISSIONS)[number];

/**
 * Named on purpose, granting nothing today. Each of these is a read the role is
 * meant to hold, and none has a registered route, so holding the permission
 * reaches no handler. They are kept, rather than deleted, because they are the
 * reviewed shape of the role and because deleting them would hide that the
 * partner and organization reads the console already calls are not built on the
 * server. They are typed so they cannot be written into an allow decision.
 */
export const OPERATING_PLANNED_PERMISSIONS = [
  "operating:partner_pipeline_read",
  "operating:organization_pipeline_read",
  "operating:growth_kpis_read",
  "operating:operating_kpis_read",
] as const satisfies readonly OperatingPermission[];

export type OperatingPlannedPermission =
  (typeof OPERATING_PLANNED_PERMISSIONS)[number];

export function isOperatingLivePermission(
  value: unknown,
): value is OperatingLivePermission {
  return (
    typeof value === "string" &&
    (OPERATING_LIVE_PERMISSIONS as readonly string[]).includes(value)
  );
}

/**
 * The role to permission map. One role, one explicit list. A `Record` keyed by
 * the role type means a second role cannot be added here without also being
 * added to the type, and every consumer of the map is forced to see it.
 */
export const OPERATING_ROLE_PERMISSIONS: Readonly<
  Record<OperatingGrowthRole, readonly OperatingPermission[]>
> = {
  operating_growth: [
    "operating:partner_pipeline_read",
    "operating:partner_workflow",
    "operating:organization_pipeline_read",
    "operating:growth_kpis_read",
    "operating:operating_kpis_read",
  ],
};

// ---------------------------------------------------------------------------
// Refused capabilities: the list the granted list is checked against
// ---------------------------------------------------------------------------

/**
 * What this role must never hold, named so a test can assert each one rather
 * than assert the absence of something unnamed.
 *
 * Most of these are mapped onto routes that are registered in this repository
 * today, by `OPERATING_SURFACE_POLICY` below. Two are not, and are named here
 * anyway: `supplier_cost` and `margin` have no registered route at all, so the
 * refusal is pre-committed rather than demonstrated. Those two are listed in
 * `OPERATING_CAPABILITIES_WITHOUT_REGISTERED_SURFACE` and their surfaces sit in
 * `OPERATING_PLANNED_SURFACES`, which carries no decision field, so a reader is
 * never told that a refusal was exercised against a real handler when it was
 * not. Refusing a surface that does not exist grants nothing, which is why it is
 * safe to keep; claiming it exists would not be.
 */
export const OPERATING_DENIED_CAPABILITIES = [
  /** POST /api/admin/research/products/:productId/prices/:priceId/approve */
  "price_approval",
  /** Product create, update, duplicate, and variant administration. */
  "product_approval",
  /** Product media upload and confirm. */
  "product_image_approval",
  /** Any surface reachable only as the single ADMIN_EMAIL identity. */
  "super_admin_surface",
  /** Granting or revoking a role, and any account administration. */
  "user_and_role_administration",
  /** Schema and migration execution. */
  "database_migration",
  /** Reading or changing environment and capability configuration. */
  "environment_configuration",
  /** Anything on the Care rail that carries clinical judgment or content. */
  "care_clinical_data",
  /** Any patient identified record on the Care rail. */
  "patient_data",
  /** Wholesale source cost, landed cost, or supplier identity. */
  "supplier_cost",
  /** Any computed or stored margin. */
  "margin",
  /** Searching the audit trail of another person's actions. */
  "audit_search_other_actors",
] as const;

export type OperatingDeniedCapability =
  (typeof OPERATING_DENIED_CAPABILITIES)[number];

/**
 * What each granted permission actually reaches, as a capability label. The
 * invariant enforced by test: no value in this map appears in
 * `OPERATING_DENIED_CAPABILITIES`. This is the structural guard that stops a
 * later permission from being added that quietly reaches a refused surface.
 */
export const OPERATING_PERMISSION_CAPABILITY: Readonly<
  Record<OperatingPermission, string>
> = {
  "operating:partner_pipeline_read": "partner_pipeline",
  "operating:partner_workflow": "partner_pipeline",
  "operating:organization_pipeline_read": "organization_pipeline",
  "operating:growth_kpis_read": "growth_kpis",
  "operating:operating_kpis_read": "operating_kpis",
};

// ---------------------------------------------------------------------------
// Predicates. Deny first: unknown input is refused, never allowed.
// ---------------------------------------------------------------------------

export function isOperatingPermission(value: unknown): value is OperatingPermission {
  return (
    typeof value === "string" &&
    (OPERATING_PERMISSIONS as readonly string[]).includes(value)
  );
}

export function isOperatingDeniedCapability(
  value: unknown,
): value is OperatingDeniedCapability {
  return (
    typeof value === "string" &&
    (OPERATING_DENIED_CAPABILITIES as readonly string[]).includes(value)
  );
}

/** True only when the principal carries the operating role itself. */
export function isOperatingGrowthPrincipal(principal: {
  roles?: readonly string[];
}): boolean {
  return Array.isArray(principal.roles)
    ? principal.roles.includes(OPERATING_GROWTH_ROLE)
    : false;
}

/**
 * The single authorization predicate for this role.
 *
 * It reads ONLY `operating_growth`'s own list. A principal that also claims
 * `super_admin`, `clinical_admin`, or any other name gains nothing here,
 * because this module is not an authority for those roles and never widens on
 * their behalf. An unknown permission string is refused rather than treated as
 * a new capability.
 */
export function hasOperatingPermission(
  principal: { roles?: readonly string[] },
  permission: unknown,
): boolean {
  if (!isOperatingPermission(permission)) return false;
  if (!isOperatingGrowthPrincipal(principal)) return false;
  return OPERATING_ROLE_PERMISSIONS[OPERATING_GROWTH_ROLE].includes(permission);
}

// ---------------------------------------------------------------------------
// Confidential field redaction
// ---------------------------------------------------------------------------

/**
 * Normalized key fragments that must never reach an operating and growth
 * payload. Keys are lowercased with non alphanumerics removed before matching,
 * so `wholesale_source_cost_cents`, `wholesaleSourceCostCents`, and
 * `WholesaleSourceCost` all match the same fragment.
 *
 * `expense` is deliberately absent: an organization's own event and print spend
 * is operating data this role is meant to see, and it is not supplier cost.
 */
export const OPERATING_CONFIDENTIAL_KEY_FRAGMENTS = [
  "wholesale",
  "cost",
  "margin",
  "supplier",
  "vendor",
  "cogs",
  "landed",
  "buyprice",
  "markup",
] as const;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isConfidentialOperatingKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return OPERATING_CONFIDENTIAL_KEY_FRAGMENTS.some((fragment) =>
    normalized.includes(fragment),
  );
}

/**
 * Traversal rule, and why it is not a plain-object check.
 *
 * An earlier version of this walker only descended into objects whose prototype
 * was `Object.prototype` or `null`. That FAILS OPEN. A repository row, an ORM
 * entity, a `class Money { constructor() { this.unitCostCents = 900 } }`, or
 * anything built with `Object.create(null)` fell straight through the check and
 * was returned unredacted, which is the one outcome this module exists to
 * prevent. Prototype is not a property of the data; it is an accident of how the
 * data was constructed, and a redactor that trusts it is trusting the caller.
 *
 * So the walker descends into ANY non-null object regardless of prototype, over
 * its own enumerable string keys. That is exactly the set `JSON.stringify` will
 * serialise, so nothing that can reach the wire is skipped and nothing that
 * cannot reach the wire is invented.
 *
 * The one carve-out is a value with its own `toJSON`, such as a `Date`. Those
 * serialise to a scalar and expose no own enumerable keys, so recursing would
 * turn a timestamp into `{}` without removing anything. They are returned
 * untouched and reported as carrying no confidential fields, which matches what
 * they actually serialise to.
 */
function isTraversableObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serialisesAsScalar(value: object): boolean {
  return typeof (value as { toJSON?: unknown }).toJSON === "function";
}

/**
 * Returns the dotted paths of every confidential field found in a payload.
 * Used by tests and by the delivery helper to prove a payload is clean before
 * it is written to the response.
 *
 * A confidential key is reported from its NAME alone. The value behind it is
 * never read, so an own enumerable getter named `unitCostCents` is caught
 * without being invoked.
 */
export function findConfidentialOperatingFields(
  value: unknown,
  path = "",
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      findConfidentialOperatingFields(entry, `${path}[${index}]`),
    );
  }
  if (!isTraversableObject(value)) return [];
  if (serialisesAsScalar(value)) return [];
  const found: string[] = [];
  for (const key of Object.keys(value)) {
    const here = path ? `${path}.${key}` : key;
    if (isConfidentialOperatingKey(key)) {
      found.push(here);
      continue;
    }
    found.push(...findConfidentialOperatingFields(value[key], here));
  }
  return found;
}

/**
 * Removes every confidential field from a payload. Structure is preserved, so a
 * caller sees a partner or organization record with the commercial fields
 * absent rather than a record it cannot parse. Missing stays missing: nothing
 * is substituted, and no zero is written in place of a removed amount.
 *
 * The result of redacting an object is always a plain object, whatever the
 * input's prototype was. That is deliberate: the return value is a payload on
 * its way to `res.json`, and a plain projection cannot carry a prototype method
 * or a getter that reads a field this function just removed.
 */
export function redactOperatingPayload<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => redactOperatingPayload(entry)) as unknown as T;
  }
  if (!isTraversableObject(value)) return value;
  if (serialisesAsScalar(value)) return value;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (isConfidentialOperatingKey(key)) continue;
    output[key] = redactOperatingPayload(value[key]);
  }
  return output as unknown as T;
}

// ---------------------------------------------------------------------------
// Surface policy: the real routes, and the decision for each
// ---------------------------------------------------------------------------

export type OperatingHttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * An allow decision can only name a LIVE permission. A planned permission is a
 * different type and does not fit here, so the table cannot bless a route that
 * does not exist yet.
 */
export type OperatingSurfaceDecision =
  | { kind: "allow"; permission: OperatingLivePermission }
  | { kind: "deny"; capability: OperatingDeniedCapability };

/**
 * A surface that IS registered in this repository, and the decision for it.
 * `server/research/operating-surface-registry.test.ts` scans the server sources
 * and fails if any entry in this table does not resolve to a registered route,
 * so the claim in the doc comment below is checked at the commit that breaks it
 * rather than at review.
 */
export interface OperatingSurfacePolicyEntry {
  method: OperatingHttpMethod;
  /** The express route path exactly as it is registered in this repository. */
  surface: string;
  decision: OperatingSurfaceDecision;
}

/**
 * A surface named on purpose that DOES NOT EXIST in this repository.
 *
 * This is a separate type from `OperatingSurfacePolicyEntry` and it has no
 * `decision` field, so it is not assignable to the policy table and no consumer
 * of the policy table can read it as a grant or as a demonstrated refusal. It
 * carries a plain-language note and nothing that is shaped like an
 * authorization: no permission, no capability, no decision kind.
 */
export interface PlannedOperatingSurface {
  method: OperatingHttpMethod;
  surface: string;
  /** Why the surface is named here, and what does not exist yet. */
  note: string;
}

/**
 * The authoritative answer for every REGISTERED surface this role could
 * plausibly be pointed at. Deny entries name the capability refused, so the
 * negative tests enumerate this table rather than a hand written list that can
 * drift from it. Surfaces that do not exist are in `OPERATING_PLANNED_SURFACES`
 * below, never here.
 */
export const OPERATING_SURFACE_POLICY: readonly OperatingSurfacePolicyEntry[] = [
  // Allowed: the one partner workflow route that exists today.
  {
    method: "POST",
    surface: "/api/admin/research/partners/:partnerId/review",
    decision: { kind: "allow", permission: "operating:partner_workflow" },
  },

  // Refused: Product Control price approval.
  {
    method: "POST",
    surface:
      "/api/admin/research/products/:productId/prices/:priceId/approve",
    decision: { kind: "deny", capability: "price_approval" },
  },
  {
    method: "POST",
    surface: "/api/admin/research/products/:productId/prices",
    decision: { kind: "deny", capability: "price_approval" },
  },

  // Refused: product and image approval.
  {
    method: "POST",
    surface: "/api/admin/research/products",
    decision: { kind: "deny", capability: "product_approval" },
  },
  {
    // The registered product update route is PUT, not PATCH. The method is
    // part of the surface: a policy row against a method express never routes
    // proves nothing about the route that exists.
    method: "PUT",
    surface: "/api/admin/research/products/:productId",
    decision: { kind: "deny", capability: "product_approval" },
  },
  {
    method: "POST",
    surface: "/api/admin/research/products/:productId/media/upload",
    decision: { kind: "deny", capability: "product_image_approval" },
  },
  {
    method: "POST",
    surface:
      "/api/admin/research/products/:productId/media/:mediaId/confirm",
    decision: { kind: "deny", capability: "product_image_approval" },
  },

  // Refused: user and role administration.
  {
    method: "GET",
    surface: "/api/admin/research/prelaunch/roles",
    decision: { kind: "deny", capability: "user_and_role_administration" },
  },
  {
    method: "POST",
    surface: "/api/admin/research/prelaunch/roles",
    decision: { kind: "deny", capability: "user_and_role_administration" },
  },
  {
    method: "DELETE",
    surface: "/api/admin/research/prelaunch/roles/:assignmentId",
    decision: { kind: "deny", capability: "user_and_role_administration" },
  },

  // Refused: super admin surfaces and configuration.
  {
    method: "GET",
    surface: "/api/admin/me",
    decision: { kind: "deny", capability: "super_admin_surface" },
  },
  {
    method: "GET",
    surface: "/api/admin/export",
    decision: { kind: "deny", capability: "super_admin_surface" },
  },
  {
    method: "GET",
    surface: "/api/admin/research/capabilities",
    decision: { kind: "deny", capability: "environment_configuration" },
  },
  {
    method: "GET",
    surface: "/api/admin/research/system-status",
    decision: { kind: "deny", capability: "environment_configuration" },
  },
  {
    method: "POST",
    surface: "/api/admin/research/readiness/:domain/transition",
    decision: { kind: "deny", capability: "database_migration" },
  },

  // Refused: the Care rail.
  {
    method: "GET",
    surface: "/api/care/reviews",
    decision: { kind: "deny", capability: "care_clinical_data" },
  },
  {
    method: "GET",
    surface: "/api/care/prescriptions",
    decision: { kind: "deny", capability: "care_clinical_data" },
  },
  {
    method: "GET",
    surface: "/api/care/intake",
    decision: { kind: "deny", capability: "patient_data" },
  },

  // Refused: audit search over other actors. The registered audit surface is
  // the access probe, not a bare /api/care/audit collection.
  {
    method: "GET",
    surface: "/api/care/audit/access",
    decision: { kind: "deny", capability: "audit_search_other_actors" },
  },
];

/**
 * Surfaces this role is meant to cover that DO NOT EXIST in this repository.
 *
 * They are recorded because the intent is real and because a reviewer who finds
 * `operating:growth_kpis_read` in the role's list should be able to see, in one
 * place, that it reaches nothing. They grant nothing and refuse nothing: there
 * is no decision on this type, `operatingSurfaceDecision` never consults it, and
 * the guard tests never mount it. When one of these is built, it moves into
 * `OPERATING_SURFACE_POLICY` in the same change, under review.
 */
export const OPERATING_PLANNED_SURFACES: readonly PlannedOperatingSurface[] = [
  {
    method: "GET",
    surface: "/api/admin/research/partners",
    note:
      "The admin console already calls this (client/src/research/adapters/adminOps.ts listPartners), but no server route registers it. Until one does, operating:partner_pipeline_read reaches no handler.",
  },
  {
    method: "GET",
    surface: "/api/admin/research/organizations",
    note:
      "No organization pipeline route is registered. operating:organization_pipeline_read reaches no handler.",
  },
  {
    method: "GET",
    surface: "/api/admin/research/growth/kpis",
    note:
      "No growth KPI route is registered. operating:growth_kpis_read reaches no handler.",
  },
  {
    method: "GET",
    surface: "/api/admin/research/operating/kpis",
    note:
      "No operating KPI route is registered. operating:operating_kpis_read reaches no handler.",
  },
  {
    method: "GET",
    surface: "/api/care/messages",
    note:
      "Declared in CARE_ROUTE_CONTRACTS in shared/care/contracts.ts but never registered by any Care route module. Patient messaging refusal is pre-committed, not exercised. /api/care/intake covers patient_data against a route that exists.",
  },
  {
    method: "GET",
    surface: "/api/admin/research/products/:productId/cost-basis",
    note:
      "No cost basis route is registered anywhere in this repository. The supplier_cost refusal is pre-committed, not exercised.",
  },
  {
    method: "GET",
    surface: "/api/admin/research/pricing/margin",
    note:
      "No margin route is registered anywhere in this repository. The margin refusal is pre-committed, not exercised.",
  },
];

/**
 * The refused capabilities that no registered route covers, so the refusal is
 * pre-committed rather than demonstrated against a real handler. Asserted to
 * equal the computed set by test: when a real margin or cost basis route lands,
 * the test fails and forces the policy row and this list to be reviewed
 * together.
 */
export const OPERATING_CAPABILITIES_WITHOUT_REGISTERED_SURFACE = [
  "supplier_cost",
  "margin",
] as const satisfies readonly OperatingDeniedCapability[];

/**
 * Resolves the decision for a surface. Only the registered policy table is
 * consulted. A planned surface resolves to `null`, which the guard treats the
 * same way it treats any unknown surface: nothing is granted.
 */
export function operatingSurfaceDecision(
  method: OperatingHttpMethod,
  surface: string,
): OperatingSurfaceDecision | null {
  return (
    OPERATING_SURFACE_POLICY.find(
      (entry) => entry.method === method && entry.surface === surface,
    )?.decision ?? null
  );
}
