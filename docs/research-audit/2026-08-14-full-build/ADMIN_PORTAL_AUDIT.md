# Research admin portal forensic audit

## Audit coordinates

- **Candidate code basis:** `f3cb2088d36c87561ec58455ccf126341fc9789a`
- **Known live production:** `ROMAN_RELEASE_0_4` at `8c8ce358263a041f13fb270d7034164a66a04896`
- **Audit date:** 2026-08-14
- **Evidence boundary:** static route/composition/persistence inspection and focused local tests; no authenticated production smoke, direct Supabase query, Storage inspection, or provider call.

## Executive verdict

**Mixed readiness.** The Research admin shell and inventory/lot/exact-COA stack are genuinely composed and fail closed. The fulfillment page is mounted but its matching server read endpoint is absent. CRM/supplier operations has UI, adapter, service, and proposed routes, but no production mount or durable repository.

Admin route count is high—39 classified client routes and 158 overlapping admin-classified API registrations in the generated static inventory—but counts are not completeness. Each surface must be traced through client mount, bearer acquisition, server guard, persistence, feature capability, and live dependency.

## Shell and session wiring

The app lazily mounts `/admin/research` and `/admin/research/*`, and `client/src/research/adminx-section.tsx` code-splits the admin screens. `AdminScreen` waits for a Supabase session and passes the bearer token to page adapters. Session lifecycle and bearer handling live in the existing Research auth/API utilities.

Browser state is not authorization. Server-side authority currently has two principal forms:

1. `requireSupabaseAdmin` — canonical Supabase verification plus the configured `ADMIN_EMAIL`, with recovery-session rejection;
2. durable prelaunch roles — server-resolved active roles with access audit and granular role sets.

The mixed model can be a deliberate migration state, but it needs an explicit authorization matrix. A page being inside the admin shell does not grant its API permissions.

## Surface matrix

| Surface | Client | Server | Persistence/capability verdict |
|---|---|---|---|
| Inventory lots | Mounted | Mounted | Production repository/RPC, fail-closed |
| Inventory movements/disposition | Mounted | Mounted | Granular operations roles, command RPCs |
| Exact-lot COAs | Mounted | Mounted | Private Storage, audited grants/review |
| Fulfillment queue | Mounted | **No matching GET route found** | Honest unavailable UI |
| Fulfillment commands | Controls omitted | No candidate portal composition | Not implemented |
| CRM/supplier operations | Not in admin route registry; component exists | Proposed routes unmounted | No durable production repository |
| General commerce/order/admin queues | Mounted families | Mounted conditionally by their domain compositions | Must be evaluated against commerce readiness |
| Product Control admin | Mounted | Mounted | Canonical Product Control service/RPCs |
| Required-input/readiness | Mounted | Mounted | Durable prelaunch role guards |

## Inventory, lots, and exact-lot COAs

This is the strongest operations slice.

### Client routes

- `/admin/research/inventory/lots`
- `/admin/research/inventory/coas`
- `/admin/research/inventory` redirecting to lots

### Server composition

`server/index.ts:575-605` unconditionally registers `registerInventoryLotAdminApi(...)`. Missing persistence produces stable unavailable responses rather than route absence.

The composition root injects this role matrix:

| Capability | Durable roles |
|---|---|
| Read | `super_admin`, `operations_admin`, `product_admin`, `approved_internal_reviewer` |
| Inventory mutation | `super_admin`, `operations_admin` |
| Quality review/read access | `super_admin`, `product_admin`, `approved_internal_reviewer` |

The route module covers lot list/create, movement list/apply, disposition, quality-document list, upload prepare/cancel/confirm, review, and file access. The generated scanner marks mutations for parent/runtime trace because the guards are injected; direct composition review confirms the parent guard matrix above.

### Persistence and file safety

The production layer:

- checks Product Control product/variant/SKU readiness before allocatable mutation;
- uses command RPCs for lot creation, movement, and disposition;
- keeps exact-lot COAs in a private bucket;
- prepares constrained upload grants;
- verifies object existence, content type, PDF/image signature, size, and SHA-256 before confirmation;
- records audited review decisions;
- issues short-lived signed read grants only after audited authorization.

This supports a **wired, fail-closed** source verdict. It does not prove that the deployed RPCs, role assignments, migrations, or Storage bucket/policies are healthy.

## Fulfillment admin gap

The client mounts `/admin/research/fulfillment` and its adapter requests `GET /api/admin/research/fulfillment`. No matching candidate server route was found. The page consequently renders its explicit unavailable state.

Even if data were returned, the page renders `MitchPortal` without command wiring and is read-only. The correct next step is to mount the existing canonical fulfillment port behind a reviewed admin guard, not to create a second fulfillment repository in the page adapter.

## CRM/supplier operations gap

The Pack 05 component and adapter propose two admin endpoints, and the server module proposes guarded routes. The route source explicitly requires a storage-scoped repository and `requireSupabaseAdmin` before mounting. Only a repository interface exists in the candidate.

Its service has a useful invariant: consequential actions are queued for review rather than directly executed, even under an automatic Trust Dial setting. The mailbox intake bridge also accepts only the canonical Research mailbox, writes audited intake, and creates no outbound reply. Neither is production-composed.

Do not mount this slice until it has:

- one durable repository;
- canonical actor resolution;
- an atomic queue/audit transaction;
- retry and idempotency rules;
- the chosen existing admin guard;
- explicit ownership relative to the current admin queues and supplier services.

## Authorization convergence risk

General admin APIs protected only by `ADMIN_EMAIL` and operations APIs protected by durable roles may produce surprising partial access for the same signed-in user. The platform needs a reviewed matrix mapping every admin route to one of:

- sole production integrator/super-admin;
- internal team;
- operations admin;
- product admin;
- clinical admin;
- approved internal reviewer;
- narrowly scoped legacy `ADMIN_EMAIL` compatibility.

The long-term authority should be durable roles from the same Supabase identity. The compatibility allowlist should be explicit, time-bounded, audited, and incapable of bypassing granular safety domains.

## Focused test evidence

A supplier/admin specialist ran 17 focused test files—143 tests passed—covering supplier operations, fulfillment service/persistence/provider, inventory/COA routes/persistence/integration/UI, CRM routes/service/intake/UI, prelaunch authorization, and admin sign-out. This was not the full repository suite.

The specialist found no targeted supplier/admin source difference between the known live tag and candidate. These source-level findings are therefore relevant to both revisions if production actually runs the recorded tag, but runtime availability remains unverified.

## P0 remediation

1. **Prove inventory/COA live behavior.** Smoke every route and required role, then verify RPCs, Product Control bindings, private bucket policy, upload/confirm/review, audited short-lived read, and cross-role denial on the deployed SHA.
2. **Mount the fulfillment read path over the canonical port.** Implement `GET /api/admin/research/fulfillment`; either wire reviewed transition commands or keep the screen explicitly read-only.
3. **Keep CRM/supplier operations unmounted until durable.** Compose a real repository, actor, atomic queue/audit write, and existing guard before adding its client route.
4. **Publish an admin authorization matrix.** Cover every client route and server endpoint, including `ADMIN_EMAIL` compatibility versus durable prelaunch roles.
5. **Add route-level browser integration.** Prove App → AdminScreen → Supabase session → bearer API → 401/403/503/success and correct sign-out/re-entry behavior.

## P1 completion

- Add UI coverage for lot disposition, COA review/publication/withdrawal, and file access.
- Add live Supabase contract tests for cross-role denial, idempotency replay, private Storage policy, and audit-row creation.
- Converge general admin authority onto durable roles while preserving a controlled rollback path.
- Surface capability/runtime metadata—deployed SHA, migration state, feature flags, role source, provider readiness—without exposing secrets.
- Remove or fold unmounted admin components only after their unique invariants are assigned to a canonical service.

## Release gate

The admin portal should be described per surface, not as one blanket “complete” portal. Inventory/COA may be called production-ready only after live role/RPC/Storage proof. Fulfillment remains incomplete until its server read path exists. CRM/supplier operations remains a prepared slice until it has durable persistence, guard composition, and operator-visible queue/retry behavior.
