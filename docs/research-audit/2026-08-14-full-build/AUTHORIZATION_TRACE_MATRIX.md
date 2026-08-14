# Authorization trace matrix

## Audit coordinates

- **Candidate code basis:** `f3cb2088d36c87561ec58455ccf126341fc9789a`
- **Known live production:** `ROMAN_RELEASE_0_4` at `8c8ce358263a041f13fb270d7034164a66a04896`
- **Source evidence commit:** `2cabbf49f424d80c600e5893b7f35ccc3fa03ad6`
- **Purpose:** resolve the 20 `MUTATION_GUARD_TRACE_REQUIRED` static-review rows without mistaking file-local token scanning for an authorization verdict.
- **Runtime caveat:** a source-level trace does not prove deployed SHA, active role rows, migrations, provider configuration, or live denial behavior.

## Result

| Classification | Count | Meaning |
|---|---:|---|
| Injected guard resolved in candidate composition | 12 | Route receives a named guard from `server/index.ts`; runtime role/data verification remains required. |
| Service authorization resolved in candidate | 7 | Exact wall admission is followed by canonical bearer/email/tenant authorization inside the account service; production schema/readiness remains a blocker. |
| Unmounted and authorization contract unresolved | 1 | Factory is not reachable in production composition and must not be mounted until its guest-versus-authenticated policy is explicit. |
| Proven unguarded reachable mutation | 0 | No review row met this definition in the audited candidate. |

The static generator intentionally leaves these rows as review items. Its file-level scan cannot safely infer a composition-root injection or service-layer authorization. This matrix supplies that manual trace while preserving the need for runtime tests.

## Effective boundary shared by injected admin guards

`buildPrelaunchGuard(...)` in `server/research/prelaunch.ts:135-228`:

1. requires a bearer token;
2. rejects recovery-purpose sessions;
3. verifies the user through the canonical Supabase dependency;
4. loads active persisted roles;
5. restricts the route to an allowed role list;
6. disables seed-context access for these production mounts;
7. appends an allow/deny access-audit record;
8. attaches the verified actor and access context to the request;
9. fails closed on missing auth, role, context, or dependency failure.

The route module is still responsible for validation, canonical actor use, persistence atomicity, and object-level policy. A browser/admin shell never supplies the effective role.

## Inventory and exact-lot COA mutations — 8 rows

Production registration is unconditional at `server/index.ts:575-605`; absent persistence produces a stable unavailable response. Guard injection is explicit at `server/index.ts:584-603`.

| Method and path | Route guard | Effective candidate roles | Static verdict | Residual release proof |
|---|---|---|---|---|
| `POST /api/admin/research/inventory/lots` | `guards.mutateInventory` (`server/research/inventory-admin/routes.ts:174`) | `super_admin`, `operations_admin` | Resolved injected guard | Live wrong-role denial; command RPC; new lot starts quarantined/non-allocatable; audit actor matches token. |
| `POST /api/admin/research/inventory/lots/:lotId/movements` | `guards.mutateInventory` (`:204-207`) | `super_admin`, `operations_admin` | Resolved injected guard | UUID validation; Product Control binding; optimistic/idempotent movement; cross-role denial. |
| `POST /api/admin/research/inventory/lots/:lotId/disposition` | `guards.mutateInventory` (`:225-228`) | `super_admin`, `operations_admin` | Resolved injected guard | Canonical product/variant/SKU readiness; invalid transition/replay denial; audit row. |
| `POST /api/admin/research/lot-quality-documents/upload` | `guards.mutateInventory` (`:255-258`) | `super_admin`, `operations_admin` | Resolved injected guard | Private bucket, exact lot binding, constrained grant, content-length/type policy. |
| `POST /api/admin/research/lot-quality-documents/upload/cancel` | `guards.mutateInventory` (`:273-276`) | `super_admin`, `operations_admin` | Resolved injected guard | Only the expected pending object is abandoned; replay-safe cancellation; audit row. |
| `POST /api/admin/research/lot-quality-documents/:documentId/confirm` | `guards.mutateInventory` (`:293-296`) | `super_admin`, `operations_admin` | Resolved injected guard | Object existence, signature/type/size/hash verification, expected version, idempotency. |
| `POST /api/admin/research/lot-quality-documents/:documentId/review` | `guards.reviewQuality` (`:319-322`) | `super_admin`, `product_admin`, `approved_internal_reviewer` | Resolved injected guard | Mutation-role user denied; reviewer actor and reason persisted; transition constraints proven live. |
| `POST /api/admin/research/lot-quality-documents/:documentId/file-access` | `guards.reviewQuality` (`:340-343`) | `super_admin`, `product_admin`, `approved_internal_reviewer` | Resolved injected guard | Every grant audited with purpose; private object; short expiry; wrong role/document denied. |

Route tests already distinguish inventory mutation from quality review authority in `server/research/inventory-admin/routes.test.ts:160-215`. Production persistence tests cover canonical binding, command RPCs, private-object verification, and audit failure. The remaining gate is authenticated execution against the real project.

## Required-input and readiness mutations — 4 rows

`registerRequiredInputApi(...)` receives four guards at `server/index.ts:534-572`. All use durable prelaunch roles with `allowSeedContext: false`.

| Method and path | Route guard | Effective candidate roles | Static verdict | Residual release proof |
|---|---|---|---|---|
| `POST /api/admin/research/required-inputs` | `guards.edit` (`server/research/required-inputs.ts:465-468`) | `super_admin`, `internal_team`, `product_admin`, `operations_admin`, `clinical_admin` | Resolved injected guard | Live non-editor denial; definition command/audit; no secret value accepted where only a reference is allowed. |
| `POST /api/admin/research/required-inputs/:id/transition` | Dynamic `guards.review` for `verified`, `rejected`, `not_applicable`; otherwise `guards.edit` (`:486-497`) | Review: `super_admin`, `approved_internal_reviewer`; other transitions: edit roles above | Resolved state-dependent injected guard | Independent reviewer cannot be bypassed by body shape/case; actor separation enforced by RPC; stale transition rejected. |
| `PUT /api/admin/research/readiness/:domain/manifest` | `guards.release` (`:521-524`) | `super_admin`, `internal_team` | Resolved injected guard | Exact domain validation; immutable/hash-bound manifest; wrong role and stale manifest denial. |
| `POST /api/admin/research/readiness/:domain/transition` | `guards.release` (`:572-575`) | `super_admin`, `internal_team` | Resolved injected guard | Required facts and independent review gate launch transition; replay/audit behavior proven live. |

The dynamic transition guard is important: scanning only the route line cannot see that reviewer terminal states take a narrower guard than editor states. Tests in `server/research/required-inputs.test.ts:188-204` prove the distinct reviewer actor in the local harness; SQL assertions require independent verification.

### Injected-admin test gap

The inventory and required-input route tests mostly inject simplified fake guards, while the real generic prelaunch guard is tested separately. No current suite composes the exact production role arrays from `server/index.ts` with every route in these two families.

A single table-driven composition test should cover all 17 injected inventory/required-input routes, including the five non-mutating reads that did not become mutation review items. For every route, test: no/invalid/recovery token, expired/revoked/no role, every allowed and disallowed role, forbidden seed header, audit-write failure, settings failure, and an allowed request; assert zero repository calls on denial. In particular, prove operations admin cannot review/read a private COA, approved reviewer cannot mutate inventory or edit a required input, and editor-only roles cannot select reviewer terminal states.

Both route families are source-mounted without a feature-flag branch. `buildPrelaunchProductionDependencies()` still needs the canonical Supabase admin dependency during startup; source mount is not proof that a deployed process, role rows, or RPCs are healthy.

## Account and organization mutations — 7 rows

These routes intentionally do not carry Express guard middleware. `server/research/index.ts:540-560` grants **path-exact wall admission only** so the legacy Research review wall cannot shadow the Pack02 boundary. Admission grants no account or organization authority.

Every operation calls `verifiedUser(...)` in `server/research/account-identity/service.ts:120-130`. The production resolver in `server/research/account-identity/production-deps.ts:131-150` requires an exact bearer token, rejects recovery-purpose sessions, verifies it through Supabase Auth, requires an email, and records whether that email is confirmed. The service then requires confirmed email.

`privateAccountHeaders` in `server/research/account-identity/routes.ts:38-42` is privacy/cache middleware only. It must not be cited as an auth guard. Production mounts the registrar once at `server/index.ts:269-274`; the exact-nine mount is covered by `server/research/account-identity/production-mount.test.ts:39-57`.

| Method and path | Effective service authorization | Static verdict | Operational blocker / residual proof |
|---|---|---|---|
| `POST /api/research/account/claims/request` | Verified email; no Research-member guard by design; personal account must resolve from Auth UID or organization target requires active owner/admin/business-buyer; customer email must match verified email (`service.ts:218-252`) | Resolved intentional bootstrap service guard | Body validation currently precedes auth. Prove malformed/valid requests with absent/invalid/recovery bearer cause no store/mail call; decide whether all unauthenticated shapes must normalize to 401 instead of exposing a 400 validation distinction; add rate/delivery/production-store proof. |
| `POST /api/research/account/claims/confirm` | Verified email; no member guard by design; challenge scoped to user/email; target subject re-authorized; atomic one-time token-hash commit (`:255-300`) | Resolved intentional bootstrap service guard | Validation precedes auth. Prove no lookup/RPC for bad bearer plus expired/tampered/replayed/concurrent/cross-user challenge denial against the real RPC/schema. |
| `POST /api/research/account/security/password-change-complete` | Verified email; only caller's password-required memberships; server evidence must show password changed after the latest requirement (`:429-455`) | Resolved service guard, **capability blocked** | Production evidence provider returns unavailable/null; password-required users cannot clear the gate until canonical evidence exists. |
| `POST /api/research/account/organization-invitations/accept` | Verified email; no existing membership guard by design; invitation scoped to user; stored invitation email must equal verified email; atomic one-time token-hash commit (`:393-426`) | Resolved intentional invitation-bootstrap service guard | Validation precedes auth. Prove no RPC for bad bearer plus real-schema wrong-email/token/expiry/revocation/concurrency/replay behavior; stored organization/roles—not browser input—must win. |
| `PATCH /api/research/account/organizations/:organizationId/profile` | Verified email; active path-tenant membership; owner/admin; password-change gate; store updates the service-authorized path ID (`:334-362`) | Resolved service/tenant guard, **schema blocked** | Validation precedes auth. Prove bad bearer causes no store call; forged body tenant cannot redirect; two-tenant/role matrix; keep fail-closed until additive schema reconciliation. |
| `POST /api/research/account/organizations/:organizationId/users/invitations` | Verified email; active path-tenant membership; owner/admin; password-change gate; route overwrites body organization with path ID (`routes.ts:97-99`; `service.ts:365-390`) | Resolved service/tenant guard, **schema/operations/policy blocked** | Validation precedes auth. Current enum permits an `organization_admin` to invite `organization_owner`; explicitly approve or restrict that role-assignment ceiling. Add outbox/retry, truthful `deliveryAccepted`, and two-tenant tests. |
| `POST /api/research/account/organizations/:organizationId/orders/request-again` | Verified email; active path-tenant membership; owner/admin/business-buyer; password gate; route overwrites body tenant; order must remain organization-owned/eligible (`routes.ts:101-103`; `service.ts:458-494`) | Resolved service/tenant guard, **schema/contract blocked** | Validation precedes auth. Shared input accepts three sources while production store currently returns null unless source is `research_order`; accept/test or narrow that contract. Prove foreign order 404, one intent under concurrency, and quantity-policy consistency. |

The schema blocker changes operability, not the source-level authorization verdict. Against an incompatible production table, the routes should return a redacted 503 rather than bypassing tenant scope.

### Account boundary hardening before portal exposure

- Do **not** add `requireMember` merely to satisfy the scanner. Organization-only users, customer-history bootstrap, and first-time invitation acceptance intentionally exist before a Research member row.
- Decide one auth-versus-validation response policy. Five body-bearing operations currently validate before calling `verifiedUser`; route-level tests must at minimum prove absent, malformed, recovery, and unverified bearer never reaches a store, RPC, or provider for either valid or invalid bodies.
- Prefer a named verified-account middleware/context or an invariant suite over seven independent, implicit service calls. A future handler added to the registrar must not be able to omit the common boundary silently.
- Explicitly decide the organization-admin role-assignment ceiling before invitation activation.
- Reconcile the request-again source enum with the production store's `research_order`-only behavior.
- Review the non-warning dashboard read: any active organization role currently passes, so acceptance must decide whether billing viewers and buyers may receive the full user-email/order/profile projection.
- Add one production-shaped full-composition test across wall → registrar → Supabase verifier → service → store/RPC. Current evidence is distributed across wall, service, dependency, and store suites.

### Quantity-policy dependency

`server/research/account-identity/service.ts:136-149` defines a request-again/dashboard “normal” quantity band of 1 through 50, consumed at line 318 and pinned by `server/research/account-identity/pack02-boundaries.test.ts:53`. The active quantity-authority lane has separately reported a current operational ceiling of 20. This is not a checkout authorization guard, but it must be reconciled so account history does not call a quantity normal when canonical commerce routes it differently. This audit lane did not edit the owned account or quantity files.

## Buyer order-request factory — 1 row

| Method and path | Candidate state | Existing controls | Static verdict | Required decision before mount |
|---|---|---|---|---|
| `POST /api/research/buyer/order-requests` | Factory only; no production registration found (`server/research/buyer-commerce/routes.ts:21-29`) | Content-length cap, IP-hash rate limit, schema validation, idempotency conflict handling, Product Control/release adapters in candidate dependencies | **Unmounted; authorization contract unresolved** | Decide whether this is an intentionally public guest request or an authenticated organization-buyer action. Public mode needs an explicit guest identity/abuse/privacy contract; authenticated mode must use the canonical account context. Neither may trust browser-selected organization authority. |

The route's lack of member middleware is not a reachable vulnerability while the factory remains unmounted. It is a release blocker against naïve mounting. `server/research/buyer-commerce/identity-adapter.ts:25-45` resolves an existing Early Access customer solely from normalized email, and `server/research/buyer-commerce/production-deps.ts:197-239` can then promote stored `customer.userId` state to `pack02_member` context without an HTTP bearer subject to compare. If mounted unchanged, an anonymous caller could submit an account-bound email and reach a stored member context without proving control of that identity.

Required disposition: authenticated direct-cart behavior belongs in the canonical member cart with an exact verified-subject-to-stored-binding match. Guest intake may create only a request-workflow intent; it must never read or mutate a bound member's cart, orders, organization, pricing, or history. The body `company` field cannot select organization authority. Product Control identity, current price, inventory, eligibility, and fulfillment must be revalidated at the commit boundary, and same-key replay must return one durable outcome while changed intent conflicts. Keep this factory unregistered until those canonical ports and negative controls exist, or retire it after transferring its input/idempotency invariants.

## Runtime acceptance suite

Before any report changes these rows from “source-resolved” to “production-verified,” run against the actual deployed SHA and production-shaped disposable database:

1. unauthenticated, malformed, recovery-purpose, unverified-email, expired-role, revoked-role, and wrong-role requests;
2. two-tenant cross-organization and two-supplier cross-assignment attempts;
3. body/path identity mismatch and valid foreign object identifiers;
4. idempotent replay with the same body and conflict replay with a changed body;
5. missing migration/table/RPC/bucket/provider dependency, expecting stable fail-closed responses;
6. audit-row failure, expecting the consequential action to fail where audit is mandatory;
7. exact live feature-flag off/on behavior;
8. sign-out and token-revocation behavior from a clean browser.

No runtime file, role, migration, flag, or production system was changed by this trace.
