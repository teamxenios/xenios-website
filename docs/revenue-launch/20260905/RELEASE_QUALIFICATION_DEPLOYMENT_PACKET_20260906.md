# Xenios release qualification and deployment preparation — 2026-09-06

Status: **qualification PASS recorded; awaiting founder exact-SHA production GO**.

Qualification addendum: `ACCESS_RELEASE_QUALIFICATION_ADDENDUM_20260906.md`.

## Candidate and live deployment

- Full deploy candidate: `ff3c496245739233b71e46f9e5d6e26af9d57017`
- Candidate tree: `73734e113e8ef5f9e1f27ae4dae36bdf598abb25`
- Current records tip: `b491764` (records-only successors follow the runtime candidate)
- Current live SHA: `db5a2d447114c1e8a14185a9865ded50ee3f1ac6`
- Render service: `srv-d8s9vej7uimc7384dfcg`
- Current live deploy: `dep-dad08h740ujc73aprfcg`
- Auto-deploy: off

The candidate contains the reviewed partner production-port hardening and the previously qualified account/partner runtime. Later commits contain coordination, evidence, state, and generated records only.

## Included capabilities

- Canonical approved-customer access policy with paid membership removed as an access prerequisite.
- Existing Auth, application, member, approval-history, notification-outbox, partner, and Product Control read authorities.
- Partner production-port truthfulness repairs: malformed agreement/training/money data fails closed, identity and organization scopes are rechecked, and submission success requires a durable returned reference.
- Existing account/partner UI and read-only Product Control/reconciliation review surfaces.

## Explicitly excluded

- Resource Hub publication/delivery and recruiter-only workflows; B must finish and qualify the recovered implementation first.
- Referral V1 rollout, recursive financial downlines, and automatic payout activation.
- Price activation, direct-buy commerce, payment processing, fulfillment, and shipment operations.
- Real account approvals, account claims, partner operations, notifications, and purchases.

## Database changes prepared for an authorized window

Apply only after fresh prechecks, disposable rehearsal, exact approval, and a maintenance/rollback decision:

1. `supabase/candidates/20260905_research_approved_customer_access.sql`  
   LF SHA-256 `026ac29d3e17a86fa19100aa4c712e5d90fd66b2ef5de28774b8032965b171b5`
2. `supabase/candidates/20260905_research_partner_lifecycle.sql`  
   LF SHA-256 `4f10c3e996cbe60e660981dc654e89af2d23e209f8252db067cb9a367b4f5bbb`

Required prechecks/postchecks and rollback notes:

- Approved-customer pre `f275d2d98c3e5349a619952ba0674202f260f85cff6066ace6a46a5ad8287451`; post `e3d9ef340b3059c8810adad9168d96873a0d9a0f35b692a39ff793f3a53fe065`; rollback `6b46bba491af31ed8846f430012f5393d35cf36865fb7959d799275b47e22bbd`.
- Partner-lifecycle pre `04ec1bff31b8363f8e816c22bd8d9ad65bf13fa43604bfd8755af377cdae29e9`; post `43a04ae4eb8a6fb5d07ae3bed5b9e946b658308f3e644d48cf11980ea1b4bcf0`; rollback `01468f2309a769de174068d875e89b3e7de71b907bb1036106a8792368f572b5`.

Dependency order is approved-customer access first, then partner lifecycle. Both migrations require the canonical existing tables, Auth bindings, service-role execution, and verified idempotency/audit structures. They do not require price or commerce activation.

## Fresh read-only production observation

Artifact: `production-refresh-20260906.json`; SHA-256 `eeee4d26f235291bc0da6609018c2cc846990cdc2b2b53f53c6afab845cbd5e4`.

Observed 2026-09-06T14:28:58Z using GET-only allowlisted reads:

- Render service healthy/not suspended; latest live deploy remains `db5a2d4`.
- Production environment includes Supabase service credentials and account/partner feature flags; no secret values were recorded.
- `research_products`: 236 rows; `research_product_variants`: 439; `research_product_prices`: 452.
- Supplier-confirmation RPC returned HTTP 404, so live supplier confirmation could not be established.
- Runtime environment and migration ledger were not marked verified by this read.

## Fresh read-only SQL prechecks

The pinned approved-customer and partner-lifecycle prechecks were executed on
2026-09-06T15:23:19Z through the authorized Supabase management database-query
connection. Each statement was wrapped in a read-only transaction and rolled
back. Full schema, constraint, index, trigger, policy, function, and aggregate
outputs are recorded in `production-account-partner-prechecks-20260906.json`
(SHA-256 `8e94f885842be95a03042f29c154582670bc863bc244786b7f09c9aa865ba658`).
Both prechecks returned HTTP 201 with no duplicate-identity or duplicate-
partner-binding guard failures. The existing production shape is compatible
with the selected idempotent candidates; candidate authority functions and
approval/operation columns are not yet present. The DDL replacement and
post-apply parity checks remain migration-window work.

## Rehearsal and validation

- Disposable PGlite rehearsals: approved-customer **35 checks**, partner lifecycle **57 checks**.
- Post-repair full suite at `372142dca45525445a40145244e46f69fc464ca5`: **876 files passed, 5 skipped; 13,507 tests passed, 59 skipped; 0 failures**.
- Partner repair assertions: **101/101**; existing partner production/portal/route suites: **68/68**; TypeScript check: pass.
- Site System of Record check and Xenios OS validator: pass.
- Browser evidence remains presentation/fixture-backed, not authenticated production proof.

## Rollback configuration and price boundary

No configuration changes were made during qualification. Before reverting
application code, rollback must explicitly set `RESEARCH_FOUNDING_ACTIVATION_ENABLED=false` (currently `true`) and keep `RESEARCH_MEMBERSHIP_BILLING_ENABLED` absent or explicitly `false` (currently absent, effective default `false`). This prevents historical membership activation/billing writers from remounting. Preserve all account, approval, audit, billing, and notification-outbox history; do not delete new workflow records. Commerce remains disabled. No price batch is approved and no SKU is purchasable: canonical reconciliation records **39/39 blocked** by missing supplier confirmation, inventory/capacity, exact release approval, and Seth price approval.

## Rollback and forward recovery

If an authorized migration precheck or postcheck fails, stop before the next migration and preserve the failure evidence. Use the named rollback SQL/notes only after confirming the transaction state and dependency order; never use blanket `db push`, migration repair, or speculative renaming. If a migration commits but the response is uncertain, re-read the postcheck and migration history before retrying. Forward recovery requires a new exact candidate, refreshed prechecks, and a new approval.

## Post-deploy checks requiring separate approval

- Verify service deploy identity and `/api/health`.
- Run authenticated customer approval/claim, partner isolation, and sign-out/account-switching journeys with controlled test identities.
- Verify notification outbox processing without claiming provider delivery.
- Keep purchases, payments, price activation, grants, and shipments separately authorized.

The qualification addendum records the local browser evidence and rollback
settings. The dedicated new-account run passed the continuous admin approval →
generated local claim link → signed-out claim/password → normal login → refresh
→ rendered sign-out → protected denial → sign-in-again sequence over isolated
synthetic Auth/data boundaries. Existing-account and partner-isolation evidence
remain separately recorded. Deployment still requires the founder's exact-SHA
production authorization.

## Remaining external blockers

- Founder exact-SHA deployment and migration approval are absent.
- Production SQL/object parity and exact grants/RLS require fresh authorized pre/postchecks.
- Supplier, inventory/capacity, product documentation, payment, and fulfillment facts remain unavailable for commerce.
- B’s recovered Resource Hub and recruiter workflow are not yet a qualified integrated candidate.
- Authenticated production browser journeys remain unverified.
