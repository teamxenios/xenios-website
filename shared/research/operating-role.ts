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
 * than assert the absence of something unnamed. Every entry here maps to a real
 * surface in this repository; the mapping is `OPERATING_SURFACE_POLICY` below.
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

/**
 * Returns the dotted paths of every confidential field found in a payload.
 * Used by tests and by the delivery helper to prove a payload is clean before
 * it is written to the response.
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
  if (!isPlainObject(value)) return [];
  const found: string[] = [];
  for (const [key, entry] of Object.entries(value)) {
    const here = path ? `${path}.${key}` : key;
    if (isConfidentialOperatingKey(key)) {
      found.push(here);
      continue;
    }
    found.push(...findConfidentialOperatingFields(entry, here));
  }
  return found;
}

/**
 * Removes every confidential field from a payload. Structure is preserved, so a
 * caller sees a partner or organization record with the commercial fields
 * absent rather than a record it cannot parse. Missing stays missing: nothing
 * is substituted, and no zero is written in place of a removed amount.
 */
export function redactOperatingPayload<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => redactOperatingPayload(entry)) as unknown as T;
  }
  if (!isPlainObject(value)) return value;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isConfidentialOperatingKey(key)) continue;
    output[key] = redactOperatingPayload(entry);
  }
  return output as unknown as T;
}

// ---------------------------------------------------------------------------
// Surface policy: the real routes, and the decision for each
// ---------------------------------------------------------------------------

export type OperatingSurfaceDecision =
  | { kind: "allow"; permission: OperatingPermission }
  | { kind: "deny"; capability: OperatingDeniedCapability };

export interface OperatingSurfacePolicyEntry {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** The express route path exactly as it is registered in this repository. */
  surface: string;
  decision: OperatingSurfaceDecision;
}

/**
 * The authoritative answer for every surface this role could plausibly be
 * pointed at. Deny entries name the capability refused, so the negative tests
 * enumerate this table rather than a hand written list that can drift from it.
 */
export const OPERATING_SURFACE_POLICY: readonly OperatingSurfacePolicyEntry[] = [
  // Allowed: the partner and organization pipeline, and the KPI reads.
  {
    method: "GET",
    surface: "/api/admin/research/partners",
    decision: { kind: "allow", permission: "operating:partner_pipeline_read" },
  },
  {
    method: "POST",
    surface: "/api/admin/research/partners/:partnerId/review",
    decision: { kind: "allow", permission: "operating:partner_workflow" },
  },
  {
    method: "GET",
    surface: "/api/admin/research/organizations",
    decision: {
      kind: "allow",
      permission: "operating:organization_pipeline_read",
    },
  },
  {
    method: "GET",
    surface: "/api/admin/research/growth/kpis",
    decision: { kind: "allow", permission: "operating:growth_kpis_read" },
  },
  {
    method: "GET",
    surface: "/api/admin/research/operating/kpis",
    decision: { kind: "allow", permission: "operating:operating_kpis_read" },
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
    method: "PATCH",
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
  {
    method: "GET",
    surface: "/api/care/messages",
    decision: { kind: "deny", capability: "patient_data" },
  },

  // Refused: supplier cost, margin, and audit search over other actors.
  {
    method: "GET",
    surface: "/api/admin/research/products/:productId/cost-basis",
    decision: { kind: "deny", capability: "supplier_cost" },
  },
  {
    method: "GET",
    surface: "/api/admin/research/pricing/margin",
    decision: { kind: "deny", capability: "margin" },
  },
  {
    method: "GET",
    surface: "/api/care/audit",
    decision: { kind: "deny", capability: "audit_search_other_actors" },
  },
];

export function operatingSurfaceDecision(
  method: OperatingSurfacePolicyEntry["method"],
  surface: string,
): OperatingSurfaceDecision | null {
  return (
    OPERATING_SURFACE_POLICY.find(
      (entry) => entry.method === method && entry.surface === surface,
    )?.decision ?? null
  );
}
