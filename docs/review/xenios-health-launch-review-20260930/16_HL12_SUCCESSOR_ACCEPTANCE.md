# HL-12 successor acceptance matrix (manual and provider payments, one financial authority)

**Prepared:** 2026-09-30 ~15:10 CT, before the successor exists.

**Execution:**
- Each case runs on the **exact successor bytes**.
- Where the case involves persistence, it runs through the composed path: HTTP → service → repository → PostgREST v14.13 → PostgreSQL 17.6 (`sql/composed/`).
- The exact-bytes and state rules, and the PostgREST retry rule, come from `11_…`, `14_…` and `15_…`.

**Pass rule:** HL-12 closes only when every row below passes in **both** the TypeScript layer and the effective SQL.

## A. Identity and invariants to confirm in source before running cases

1. **One authority.** Manual verification and provider verification write the **same** verification record type. Both reach `paid` through the **same** governed transition.
   - There must be no Stripe-only order table and no second paid path.
2. **Quote first.**
   - An accepted, immutable quote (lines, quantities, unit cents, total cents, currency, version) exists before any payment instruction or provider session.
   - Lines are server-owned.
   - No client-sent amount is used anywhere.
3. **Verification record binds:**
   - order id
   - quote id and version
   - expected amount and currency
   - observed amount and currency
   - payment or provider reference
   - provider event id (provider path)
   - method
   - verifier authority (a named actor for manual, the webhook signature for provider)
   - timestamp
   - idempotency key

   The record must be immutable: an update or delete trigger refuses changes.
4. **Uniqueness.**
   - Canonical provider or payment reference is unique across orders.
   - Provider event id is unique.
   - The (order, quote version) paid transition happens at most once.
5. **No retryable refusals.** No deterministic refusal uses SQLSTATE `40001` / `serialization_failure` (HL-26). Every refusal has a stable `P0001` detail, mapped to 409 in the repository.
6. **Grants.**
   - Every new RPC is `SECURITY DEFINER` with a fixed `search_path` and EXECUTE for `service_role` only.
   - Tables have no direct grants, and RLS is forced.
7. **Interim hold.** The `f318859` paid-hold trigger is replaced or superseded **deliberately**: a dropped trigger, or a trigger that admits only a verified-record transition. There must not be two conflicting authorities.

## B. Case matrix

| # | Case | Expected | Layer(s) |
| --- | --- | --- | --- |
| B1 | Exact manual payment: accepted quote, then operator verification with an observed amount and currency equal to the quote, and a unique reference | `paid`; one verification record; one event; one customer notification | HTTP + SQL |
| B2 | Exact provider payment: accepted quote, then a server-created session for exactly the quote total, then a signed webhook | `paid` only after the webhook; the verification record links the provider event | webhook + SQL |
| B3 | Amount mismatch, both over and under by 1¢ | Refused, with an explicit mismatch state; not paid | both |
| B4 | Currency mismatch | Refused | both |
| B5 | Stale quote: repriced after acceptance, or a superseded version | Refused; the session is bound to the version | both |
| B6 | Unaccepted quote | Cannot create a session or instructions; cannot verify | both |
| B7 | Provider payment, or a manual reference, reused on another order | The second order is refused | SQL uniqueness + HTTP |
| B8 | Duplicate webhook (same event id) | Idempotent: one record, no second transition or notification | webhook + SQL |
| B9 | Webhook replay with a valid old signature but an already-processed event | Idempotent no-op | webhook |
| B10 | Out-of-order delivery, such as refund before completion, or `payment_intent.succeeded` before `checkout.session.completed` | A deterministic, explicit state; never paid from a refund or failure event | webhook |
| B11 | Bad or missing signature, or a wrong endpoint secret | 400; nothing stored | webhook |
| B12 | Event for an unknown order, or metadata that does not match the session | Stored as unmatched for operator review; not paid | webhook + SQL |
| B13 | Unauthorized verifier: a non-admin, or a recovery-purpose session | 401 or 403; nothing written | HTTP |
| B14 | Typed id, success URL, redirect, or a client callback claiming paid | Never `paid` | client + HTTP |
| B15 | Two concurrent verifiers, or webhook plus operator at once | Exactly one `paid`; the other gets 409; **no hang** (the HL-26 rollback-delta check) | HTTP + SQL |
| B16 | Interrupted transaction, such as a failure after the verification insert and before the transition | All or nothing; no orphan record, or a reconcilable one | SQL |
| B17 | Historical `paid` rows (pre-authority) | A documented, tested disposition; not silently frozen and not silently trusted (`15_…` H1) | both + runbook |
| B18 | `paid` → fulfillment | Needs the verified record **and** the other gates (supplier assignment and eligibility) | both |
| B19 | Cancellation before payment | Allowed with a reason | both |
| B20 | Cancellation or refund after money was solicited or paid | Requires refund or no-funds evidence. A provider refund event links the provider refund id. The customer state is truthful (`15_…` H2/H3). | both + webhook |
| B21 | Dispute or chargeback event | Explicit state; fulfillment gate re-evaluated; operator alerted | webhook |
| B22 | Partial payment or async method (e.g. ACH) still processing | `processing`, never `paid` until settled | webhook |
| B23 | Manual/provider parity | The same record shape and the same transition function for both paths. A test that swapping the evidence source cannot bypass a check. | source + tests |

## C. Non-functional checks

- **Card data.** Raw card data never reaches Xenios servers; only provider-hosted or embedded fields are used. Check the routes and logs.
- **CSP.** Stripe.js and frames are allowed only where needed. Care pages keep their strict CSP.
- **Service worker.** It never caches payment pages or payment API responses.
- **Customer copy** is truthful for these states:
  - awaiting payment
  - processing
  - verified
  - failed
  - refunded
  - disputed
- **Rollout order is written down:**
  1. Application compatibility.
  2. The managed migration, after M71, the HL-26 guard and the hold, per the DAG.
  3. Verification.
  4. Provider configuration (test keys first).
  5. Smoke.
  6. Activation.
- **Rollback.**
  - A preflight count of `paid` rows is taken.
  - The rollback path is stated.
- **Keys.** No live keys are enabled without separate authorization.

## D. Evidence to be recorded per run

- Exact SHA and tree, and the migration blobs, bytes and SHA-256.
- `pg_proc` (definer, config, grants).
- Case table results.
- The `xact_rollback` delta.
- Unit test counts (single-worker).
- A mutation check.
- `tsc`.
- DAG.
