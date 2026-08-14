# Ownership-safe remediation and acceptance plan

## Coordination basis

- **Audit evidence basis:** `f3cb2088d36c87561ec58455ccf126341fc9789a`
- **Audit evidence commit:** `2cabbf49f424d80c600e5893b7f35ccc3fa03ad6`
- **Known live production:** `ROMAN_RELEASE_0_4` at `8c8ce358263a041f13fb270d7034164a66a04896`
- **Production integrator:** release lead only
- **Rule:** assignments below are recommended ownership boundaries, not permission for this audit lane to edit files already claimed in the live registry.

On 2026-08-14 the founder issued a temporary Kris P0 override: Top Left remains the primary Kris builder; this lane becomes the Kris catalog/pricing/quantity/commerce strike team; Bottom Right remains integration/QA while the release lead remains the sole production writer. Existing quantity-100 and account files stay with their registered owners until an explicit handoff. After the Kris handoff, each strike lane resumes its prior Xenios roadmap automatically.

## Integration order

```text
runtime truth + migration proof
        ↓
canonical product / price / quantity identity
        ↓
general browse → cart → checkout → order convergence
        ↓
organization and affiliate schema/identity readiness
        ↓
role-aware portal activation
        ↓
supplier paid-order fulfillment handoff
        ↓
authenticated cross-tenant release defense
```

Mounting portal pages before the underlying identity/schema/commerce step is ready would convert honest unavailable states into broken or unsafe journeys.

## Task register

| ID | Priority | Outcome | Primary specialist boundary | Integrator / coordination | Dependency |
|---|---|---|---|---|---|
| RC-01 | P0 | Prove deployed SHA, flags, migration history, required tables/RPCs/buckets | QA/release-defense read-only probes | Release lead; founder only where project access/approval is required | None |
| CC-01 | P0 | One Product Control-backed browse/cart/checkout product and price identity | Catalog owner + platform-commerce owner; one writer per file | Release lead owns `server/index.ts` integration | RC-01 and active quantity authority decision |
| CC-02 | P0 | Canonical member browse-to-cart UI handoff or an explicitly disabled purchase CTA | Product/member UI owner with commerce contract owner | Release lead reviews route/flag exposure | CC-01 |
| ORG-01 | P0 | Reconcile partner-reporting and B2B buyer organization schemas additively | Access/identity + platform data owner | Release lead; founder approves production migration | RC-01 |
| ORG-02 | P0 | Canonical password-change proof and durable invitation delivery state | Access/identity owner | Release lead; email provider/runtime proof coordinated with QA | ORG-01 |
| ORG-03 | P0 before portal exposure | Harden the verified-account route invariant and approve role/privacy/source contracts | Access/identity owner | Release lead reviews wall/route composition; QA runs full boundary tests | ORG-01 and ORG-02 |
| AFF-01 | P0 | One affiliate identity/lifecycle/ledger contract and exact wall/flag gate | Platform-commerce/affiliate owner | Release lead owns wall/composition integration | RC-01; canonical organization decision where linked |
| ADM-01 | P0 | Mount read-only admin fulfillment endpoint over canonical fulfillment port | Catalog/supplier/operations owner | Release lead owns composition; QA verifies roles | RC-01 and canonical order projection |
| SUP-01 | P1 until commerce ready | Supplier-authenticated queue and reviewed transitions | Catalog/supplier/operations owner | Release lead integrates auth/route; QA runs two-supplier defense | CC-01, ADM-01, paid-order boundary |
| CRM-01 | P1 | Durable internal CRM/supplier queue with atomic audit and retry | Operations owner | Release lead chooses existing admin guard/queue authority | ADM-01; repository decision |
| CLEAN-01 | P1 | Retire/fold legacy and unmounted duplicate systems | Each canonical domain owner | Release lead sequences compatibility/rollback removal | All relevant canonical replacements live |

## RC-01 — runtime and migration truth

### Scope

- Read the actual Render deploy object and runtime SHA.
- Compare actual Supabase migration history/schema to `supabase/migrations`, standalone SQL, and production bundles.
- Verify Product Control, commerce, product-request, account, inventory, fulfillment, affiliate, and organization tables/RPCs used by the candidate.
- Verify private bucket policies and required provider/feature capability state without exposing secret values.
- Prove zero-to-current disposable bootstrap or publish the immutable applied-base prerequisite.

### Owner boundary

QA/release defense gathers read-only evidence. The release lead owns release conclusions. Founder input is limited to credentials/project access, migration approval, and production mutation.

### Acceptance

- Machine-readable table: expected object, actual object, migration/source, status, last verified UTC, verifier.
- Runtime SHA matches the release being evaluated.
- No later `ALTER TABLE` is accepted without its base table in the proven ledger.
- No production mutation occurs during the audit probe.

## CC-01 — canonical catalog/commerce convergence

### Scope

- Replace general commerce and Product Diagnostics default dependence on `products-data.ts` with a Product Control-backed adapter.
- Preserve master offerings, Kris/Roman, and Early Access as projections/overlays over stable canonical product/variant keys.
- Bind cart and immutable order snapshots to server-resolved product, variant, price version, audience, quantity policy, and eligibility.
- Keep writes fail-closed until database/payment/fulfillment dependencies pass.
- Do not mount the dormant Buyer Commerce factory as a second order path. Authenticated direct purchase must enter the canonical member cart; guest submissions may create only a request intent and must never inherit stored member/organization authority from an email or `company` field.

### File ownership safety

- Platform-commerce owner controls `server/research/commerce/*` and the commerce adapter contract.
- Catalog owner controls Product Control readers/projections and catalog import/reconciliation.
- Release lead alone integrates shared composition-root changes in `server/index.ts`.
- This audit lane must not edit those files under the current registry.

### Acceptance

1. One canonical variant produces the same identifier and server-computed price in browse, cart, checkout, order, admin, and fulfillment projections.
2. Client price/product/organization fields cannot override server authority.
3. Stale price, wrong audience, unpublished product, unavailable quantity, and insufficient exact-lot inventory fail closed.
4. Replayed checkout returns the first receipt and cannot create a second order.
5. Legacy 26-product adaptation is absent from production composition or explicitly isolated behind a time-bounded compatibility flag.
6. Anonymous submission of a bound member email cannot read or mutate that member's cart, orders, organization, pricing, or history; a signed-in subject must exactly match the stored binding.

## CC-02 — member browse-to-cart handoff

### Scope

The current Product Control member pages do not call the general-commerce `addCartLine` adapter. Implement exactly one of:

- a server-authorized Add/Buy action using the converged CC-01 contract; or
- an explicit non-purchasable/request-only state with no misleading CTA.

### Acceptance

- No CTA appears from client data alone.
- Selection uses canonical variant and allowed quantity.
- Server response controls price/eligibility messaging.
- Product request remains demand intake and never creates commerce state.
- Browser test covers signed out, inactive member, stale selection, unavailable inventory, success, and replay.

## ORG-01 — organization schema reconciliation

### Scope

- Do not apply the Pack02 `research_organizations` candidate as written.
- Decide whether partner-reporting organizations and B2B buyer organizations are the same aggregate or linked domains.
- Prefer distinct table names where ownership/lifecycle semantics differ.
- Create an additive migration and repository mapping that preserves existing rows/relationships and establishes RLS/RPC/audit behavior.

### Acceptance

- Production-shaped migration test starts with the documented existing partner table and preserves all rows.
- Two-organization tests deny every foreign read/write and valid foreign identifier.
- Account routes no longer fail because expected columns are absent.
- Rollback/compatibility readers are explicit.
- Founder/release lead approve before any production migration.

## ORG-02 — password and invitation operations

### Scope

- Replace the null password-evidence provider with canonical server-verifiable proof, or remove the requirement from seeds until proof exists.
- Add durable invitation notification/outbox state without persisting raw tokens.
- Make the UI distinguish created, delivery-pending, delivery-failed, resent, accepted, expired, and revoked.

### Acceptance

- Unrelated user metadata updates cannot clear password-change-required.
- Recovery-purpose tokens cannot call account APIs.
- Invitation email must match the verified account email.
- Token replay is idempotent only for the same completed binding; tamper/expiry/revocation fails.
- Provider failure is durable, retryable, and operator-visible.

## ORG-03 — account boundary and policy hardening

### Scope

- Preserve organization-only/bootstrap behavior; do not add a Research-member prerequisite.
- Introduce a named verified-account context or a route invariant proving all nine account endpoints reject absent, malformed, recovery, and unverified bearer before any store/provider effect.
- Decide whether unauthenticated malformed bodies return 400 or normalize to 401; make it consistent and enumeration-resistant.
- Approve or restrict the current ability of an organization admin to invite an organization owner.
- Reconcile the request-again source enum with the production store's current `research_order`-only behavior.
- Decide which roles may receive the complete organization dashboard projection, including user email/order/profile data.

### Acceptance

- Full-composition test traverses exact Research-wall admission, mounted registrar, Supabase verification, service, and a production-shaped store/RPC.
- No bad/recovery/unverified bearer reaches a lookup, insert, RPC, or delivery provider for valid or invalid bodies.
- Route path tenant wins over any body tenant.
- Role-assignment ceiling is explicit and tested.
- Dashboard field visibility is role-reviewed and minimum-necessary.
- Every two-tenant mutation/read case is denied before foreign data is returned or changed.

## AFF-01 — affiliate convergence and activation

### Scope

- Select one canonical partner identity, application lifecycle, link/attribution, commission ledger, payout, and organization relationship.
- Reconcile the prepared 16-route portal with the four mounted commerce partner routes.
- Add exact Research-wall admission and one composition gate requiring affiliate-system + portal flags and persistence readiness.
- Persist or remove application `audience`/`channels`; add durable review/notification lifecycle.

### Acceptance

- Flag-off behavior is explicit and no mutation occurs.
- Clean-browser partner sign-in reaches only canonical guarded APIs.
- Two-partner cross-tenant reads/writes fail.
- Founder-controlled economics remain inactive until versioned approval.
- Historical referrals/commissions/payouts survive convergence.
- Unenforced-flag tests cover `server/research/partners` and commerce partner routes, not only affiliate-v2 files.

## ADM-01 — admin fulfillment read path

### Scope

Implement the missing `GET /api/admin/research/fulfillment` over the existing canonical fulfillment port. Do not create a second repository. Keep the page read-only unless transition commands receive a separate reviewed scope.

### Acceptance

- Supabase admin/durable role decision is explicit and tested.
- Assignment DTO is minimum-necessary and excludes payment, health, affiliate, prior-order, and internal-note data.
- Missing repository returns stable unavailable state.
- Admin page, adapter, API, and canonical port agree on one contract.

## SUP-01 — supplier portal and paid-order boundary

### Scope

- Bind authenticated users to durable active supplier-user relationships server-side.
- Reuse the existing fulfillment service/port and restricted `MitchPortal` projection.
- Complete canonical paid-order → exact-lot allocation → assignment → outbound provider submission → signed/replay-safe status/tracking.

### Acceptance

- Browser cannot choose effective supplier ID.
- Two suppliers deny every cross-assignment read/write.
- Provider submission and webhook replay cannot duplicate fulfillment.
- Terminal transitions, tracking, partial failure, and operator recovery are audited.
- No supplier portal is advertised before an end-to-end paid order succeeds on the deployed SHA.

## CRM-01 — internal CRM/supplier queue

### Scope

Mount Pack 05 only after selecting a durable repository and existing admin queue/guard authority. Consequential actions remain queued and reviewed; the mailbox bridge never sends an unreviewed reply.

### Acceptance

- Intake + audit + queue write is atomic and idempotent.
- Actor comes from canonical admin identity.
- Retry/dead-letter/operator status is visible.
- Trust Dial cannot bypass consequential-action review.

## CLEAN-01 — compatibility retirement

Potential retirement candidates include the legacy 26-product runtime source, Catalog Display v1, unmounted Buyer Commerce, persistent-cart candidate, Pack04 order workflow, redundant affiliate versions, and orphaned portal adapters.

Deletion is last, after the canonical replacement is integrated and durable history/rollback is protected. Each removal needs an import/route/migration/history census and a negative test proving the retired path cannot create state.

## Cross-lane integration packet

Every implementation handoff should include:

1. base SHA, branch, full commit SHA, owned files, and excluded files;
2. exact authority reused—auth, role, product, price, quantity, organization, order, supplier;
3. migrations and runtime flags changed, if any;
4. focused tests plus cross-tenant/replay negative controls;
5. runtime dependencies still unverified;
6. founder-only approvals separated from autonomous work;
7. exact cherry-pick/integration order for the sole release lead;
8. explicit `Production mutated: NO/YES` and `Deployment performed: NO/YES`.

This plan creates no permission for parallel writers to touch an active owner's worktree. Ownership must be re-read from the live registry immediately before each claim and integration.
