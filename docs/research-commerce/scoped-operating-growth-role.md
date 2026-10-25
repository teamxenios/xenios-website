# The scoped operating and growth role

Status: role and guards defined. Not assigned to any person. Not wired to any
production route. Assignment is a founder action and requires the database step
listed at the end of this document.

## 1. How roles are defined and enforced today

There are three separate authorization models in this repository, and only one
of them has any granularity.

### Care rail: role to permission mapping, genuinely scoped

- `shared/care/contracts.ts:15` `CARE_ROLES` names seven roles.
- `shared/care/contracts.ts:27` `CARE_PERMISSIONS` names eleven permissions.
- `shared/care/contracts.ts:43` `CARE_ROLE_PERMISSIONS` maps each role to an
  explicit permission list. `clinical_admin` holds only `care:administer`;
  `care_security_admin` holds only `care:security_audit`.
- `shared/care/contracts.ts:122` `hasCarePermission` returns true only when one
  of the principal's roles is a known Care role whose list contains the
  permission. A non-Care role name grants nothing.
- `server/care/access.ts:34` `requireCarePermission` is the express guard. It
  checks capability state, resolves the principal through an injected resolver,
  denies with 401 or 403, records every decision, and puts the principal on
  `res.locals.carePrincipal`. It fails closed to 503 on any adapter error.

This is the model worth extending. It is deny by default and it never reads
identity from the request payload.

### Research rail, prelaunch: role list with a widening default

- `shared/research/prelaunch.ts:8` `PRELAUNCH_ROLES` names six roles:
  `super_admin`, `internal_team`, `product_admin`, `operations_admin`,
  `clinical_admin`, `approved_internal_reviewer`.
- `server/research/prelaunch.ts:135` `buildPrelaunchGuard(deps, allowedRoles?, options?)`
  is the guard. Callers that pass an explicit `allowedRoles` are scoped
  correctly (see `server/index.ts:317` through `server/index.ts:380`, where
  read, edit, review, release, and inventory each name their own list).
- The hazard: at `server/research/prelaunch.ts:174` the guard selects a role
  with `roles.find((candidate) => !allowedRoles || allowedRoles.includes(candidate))`.
  When `allowedRoles` is omitted, **any** prelaunch role passes.
  `server/research/prelaunch.ts:355` mounts exactly one such bare guard
  (`/api/internal/prelaunch/status`). Adding a new name to `PRELAUNCH_ROLES`
  therefore widens that surface by default.
- There is no permission layer. A prelaunch role is checked by name at the
  route, so what a role can do is spread across call sites rather than written
  down in one place.

### Research rail, administration: one binary super admin

- `server/routes.ts:119` `requireSupabaseAdmin` is the guard on essentially
  every `/api/admin/**` route. It verifies a Supabase bearer token and then
  compares `data.user.email` against a single `ADMIN_EMAIL` environment value.
  Match means full access. No match means 403.
- Everything downstream inherits that binary decision, including
  `POST /api/admin/research/products/:productId/prices/:priceId/approve`
  (`server/research/products-diagnostics/product-admin-routes.ts:269`), the role
  grant and revoke routes (`server/research/prelaunch.ts:384` and
  `server/research/prelaunch.ts:410`), the admin queues
  (`server/research/admin-queues.ts:888`), blueprints
  (`server/research/blueprint.ts:540`), and the capability and system status
  reads (`server/research/capabilities.ts:166`).

**The finding that motivates this lane:** on the research side there is no
setting between "no access" and "the identity that approves prices, approves
products and images, grants roles, and reads every audited action." Giving a new
operating and growth team member the partner pipeline today means giving them
`ADMIN_EMAIL`, which is a duplicate super admin.

## 2. What was added

Two new files. No existing file was modified.

### `shared/research/operating-role.ts`

- `OPERATING_GROWTH_ROLE = "operating_growth"`.
- `OPERATING_PERMISSIONS`, five entries and no more:
  `operating:partner_pipeline_read`, `operating:partner_workflow`,
  `operating:organization_pipeline_read`, `operating:growth_kpis_read`,
  `operating:operating_kpis_read`. Only one of the five can change state, and
  what it changes is partner pipeline progress.
- `OPERATING_ROLE_PERMISSIONS`, the single explicit map.
- `OPERATING_DENIED_CAPABILITIES`, twelve named refusals: price approval,
  product approval, product image approval, super admin surfaces, user and role
  administration, database migration, environment configuration, Care clinical
  data, patient data, supplier cost, margin, and audit search over other actors.
- `OPERATING_PERMISSION_CAPABILITY`, mapping each granted permission to what it
  reaches. A test asserts no value in this map appears in the refused list, so a
  future permission cannot quietly reach a refused surface.
- `hasOperatingPermission`, deny first. An unknown permission string is refused
  rather than treated as a new capability. A principal that also claims
  `super_admin` gains nothing here, because this module is not an authority for
  that role.
- `redactOperatingPayload` and `findConfidentialOperatingFields`, which remove
  and report any key matching wholesale, cost, margin, supplier, vendor, cogs,
  landed, buy price, or markup, at any depth. A removed key is absent, not
  present with a zero. `expense` is deliberately not matched, because an
  organization's own event and print spend is operating data this role is meant
  to see and is not supplier cost.
- `OPERATING_SURFACE_POLICY`, the table of real routes with an allow or deny
  decision on each. The negative tests enumerate this table rather than a
  hand written list, so the tests cannot drift from the policy.

### `server/research/operating-access.ts`

- `requireOperatingPermission(permission, deps)`, the express guard. Order is
  deliberate: an unknown permission is refused before anyone is resolved, an
  unresolved principal is 401, a principal without the permission is 403. On
  every refusal `next()` is never called, so the handler and everything it would
  touch stays unreached.
- The acting principal comes only from `deps.resolvePrincipal`. Nothing in the
  body, query string, path parameters, headers, or `req.user` is read as
  identity. The guard clears `res.locals.operatingPrincipal` and
  `req.operatingPrincipal` before resolving, so a value planted by upstream
  middleware cannot survive.
- `scopedPrincipal` narrows the resolved principal to `["operating_growth"]`
  before it reaches the handler. If the identity source ever returns the
  operating role beside a more powerful name, downstream code cannot see or
  branch on the elevated claim.
- `readOperatingPrincipal(res)` is the only supported accessor and throws if the
  guard did not run.
- `refuseOperatingRole(capability, deps)` is defense in depth: mounted ahead of a
  refused surface it denies the operating role explicitly and names the
  capability in the audit record, so a future wiring mistake is loud rather than
  silent. A principal without the operating role passes through untouched.
- `sendOperatingJson(res, payload)` redacts before writing, so wholesale source
  cost, landed cost, margin, markup, and supplier or vendor identity never leave
  through this helper whatever the upstream service included.
- Failure is closed: an identity provider error or an unrecordable access
  decision returns 503 and never authorizes, and no adapter error text reaches
  the caller.

## 3. Why the role is deliberately not a `PrelaunchRole`

`shared/research/prelaunch.ts` asks domains not to build a parallel role system.
This role still stays out of `PRELAUNCH_ROLES`, for two reasons.

1. Membership would widen the bare guard at
   `server/research/prelaunch.ts:355` by default, which is the exact
   escalation-by-default shape this lane exists to close.
2. The database enumerates the prelaunch roles in check constraints
   (`supabase/research-prelaunch-foundation.sql:44` and `:113`,
   `supabase/research-required-input-readiness.sql:34`). Adding the name in
   TypeScript without a migration would make the type a claim the database
   rejects.

`shared/research/operating-role.test.ts` asserts `isPrelaunchRole("operating_growth")`
is false and that the name is absent from `PRELAUNCH_ROLES`, so this stays true.

## 4. The negative tests

`server/research/operating-access.test.ts` and
`shared/research/operating-role.test.ts`, 84 tests. Every refusal asserts both a
403 and that the repository spy was never called, because a guard that refuses
after touching the repository has already leaked the read.

Proven refusals, each driven off the surface policy table:

- cannot approve a price, with a real approval body and an idempotency key
- cannot approve a product, and cannot upload or confirm a product image
- cannot administer users or roles, including a self grant of `super_admin`
- cannot reach a super admin surface, environment configuration, or a readiness
  transition
- cannot read Care patient data or clinical data, and carries no Care permission
  at all
- cannot read supplier cost or margin, and an authorized payload that contains
  them has them stripped
- cannot search the audit trail of other actors
- any permission string outside the closed set is refused

Proven anti-escalation:

- a forged role, roles array, principal object, or permission list in the body
- a forged role in the query string, including the `roles[]` array form
- a forged role or admin email in a header
- a principal planted on `res.locals.operatingPrincipal` by upstream middleware
- a session-style principal planted on `req.user` and `req.adminEmail`
- a resolver that returns `operating_growth` beside `super_admin`: the handler
  sees only `operating_growth`, and a refused capability is still refused
- a forged request and a clean request produce byte-identical audit decisions,
  which is the direct evidence that no caller-supplied surface influences the
  guard

## 5. What is required before this role can be used

These are founder actions. This lane created no account, assigned no role, and
touched no authentication configuration.

1. **A migration adding `operating_growth` to the role check constraints.** The
   prelaunch role tables enumerate role names in SQL check constraints. Until a
   migration adds the value, no assignment row can exist. `supabase/**` is
   outside this lane's scope, so the migration was not written. Until it lands,
   the role is inert by construction, which is the correct default.
2. **A production principal resolver.** `OperatingAccessDependencies.resolvePrincipal`
   is injected and has no production implementation yet. It must resolve the
   subject from the verified bearer token only, exactly as
   `server/research/prelaunch.ts:340` does, and must never read a role from a
   request payload.
3. **Route wiring, which needs seams this lane may not edit.** Mounting the
   guard on the partner and organization surfaces requires
   `server/research/partners/**` and `server/research/index.ts`, both of which
   are prohibited to this lane. The guard, the permission set, and the surface
   policy are ready; the wiring is a separate approved change.
4. **Samuel's decision on the exact partner workflow steps.** The role holds
   `operating:partner_workflow`, which today is scoped to advancing a partner
   through pipeline stages. Which specific transitions Kris may perform, and
   which still require founder approval, is a business decision that should be
   recorded before the route is wired.
