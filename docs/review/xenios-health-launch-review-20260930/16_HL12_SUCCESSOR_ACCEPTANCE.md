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

## E. Verified repository traps at `a07e537`

**Method:** read-only workflow, three lenses, each adversarially verified (66 confirmed, 1 refuted).

**How to use this section:** each item is a concrete way an HL-12 successor could pass its own tests yet fail this
matrix.

### Provider plumbing (Stripe)

1. **No Stripe SDK.**
   - Server calls use a hand-written fetch transport, and no `Stripe-Version` is pinned (`server/research/providers/payment.ts:592-627`), so payload shapes follow the account default.
   - The hand-written signature verifier is correct in shape (`payment.ts:635-688`), but it:
     - supports one secret only (no rotation);
     - does not bind `livemode`;
     - does not bind `api_version`.
   - **Require:**
     - a pinned API version;
     - a dedicated endpoint secret;
     - a livemode/key-mode check;
     - an alert on signature failures (today every failure is a silent 400, so Stripe retries until it disables the endpoint).
2. **Webhook reachability depends on an unrelated flag.**
   - `POST /api/research/webhooks/payment` sits behind the `/api/research` gateway.
   - It passes only when `RESEARCH_PUBLIC=true` (`server/research/index.ts:687-757`).
   - **Require:** explicit admission of the exact webhook method and path, independent of that flag, plus a test.
3. **The provider selector is tied to the dormant native-commerce flag** (`payment.ts:1527-1553`, requires `NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED=true`). Enabling it for assisted orders would also enable native commerce. **Require:** a separate flag and resolver.
4. **Only PaymentIntent events are translated** (`payment.ts:1475-1492`).
   - Not translated: `checkout.session.completed`, the `checkout.session.async_payment_*` events, `payment_intent.processing`/`canceled`, and `charge.dispute.*`.
   - These are **acknowledged and durably discarded** (`webhook-execution-binding.ts:60-78`).
   - Under the founder's Checkout Sessions design, that would silently drop the payment evidence.
   - **Require:** every event type the design relies on is translated, and every untranslated type is stored as unhandled, not acknowledged-and-lost.
5. **No applied provider-event inbox.** `research_payment_webhook_inbox` exists only as a candidate (`supabase/candidates/20260909150000_research_checkout_executions.sql:67-220`).
   - Its key `(provider_name, event_id)` is shared by every endpoint, because Stripe sends the same `evt_` to each subscribed endpoint.
   - It has no lease or expiry for concurrent duplicates.
   - **Require:** a forward migration with endpoint or purpose scoping and lease semantics.
6. **Unmatched events are refused with 503 on every redelivery** (for example a `pi_` owned by another system). This is a retry storm, and eventually Stripe disables the endpoint. **Require:** store as unmatched plus 2xx, and raise an operator alert.
7. **Binding is conditional.** Order and member are checked only when metadata is present (`webhook-execution-binding.ts:91-93`). **Require:** binding by server-stored session or payment identity, never by optional metadata.
8. **Native-lane Stripe is a manual-capture PaymentIntent with Card Element** (`payment.ts:891-907`), not Checkout Sessions. **Its durable lane can mark paid from the synchronous capture response reached by the customer's request.** **Require:** `paid` only from verified server-side evidence.
9. **Do not bind to the native commerce SQL.** In `20260923181443` (pending):
   - `research_webhook_order_update` has no expected-state predicate and writes no state event;
   - `research_order_persist` rewrites lines;
   - `research_checkout_executions` grants `service_role` direct DML, and its functions are INVOKER with no pinned `search_path`.

### Existing assisted-order money code (TypeScript only, no SQL twin, unmounted)

10. **No SQL twin.** The TS quote and payment engines (`server/research/assisted-order/quote/**`, `payment/**`) have none. Gaps:
    - a settlement **currency is never compared**;
    - `paid` is reachable only from `under_review`/`exception`, so **a webhook cannot settle a payment that is awaiting payment**;
    - a **partial refund moves to terminal `refunded`**;
    - `open()` does **not** check quote expiry (despite its comment);
    - `issue()` can price **non-direct** lines (provider_request, activation, availability_review);
    - the quote lost-update check compares the commercial version only, **not state**;
    - `paid -> exception` keeps a settlement, which then blocks re-settlement.
11. **M71 floor.** There is no CHECK that `estimated_total_cents = sum(line_estimate_cents)`, the total is taken from the caller payload, and there are no `quantity > 0` floors (bridge `:112,128-129,212-218,583`). The quote must be computed server-side, with SQL checks.
12. **Two unbound state machines:** the 15-state request status and the 8-state payment lifecycle. SQL must bind them, so that a reversal drives or holds the request status.
13. **Currency case differs:** Stripe and native lanes use `usd`, while the bridge and TS use `USD`. Normalize explicitly in the SQL comparisons.
14. **Early Access settlement shapes create supplier releases in the same transaction** (cart completion `:534-590`; legacy `:924-942`). Reusing them as-is couples paid with fulfillment, but the founder requires **separate** fulfillment eligibility.

### Client, config and copy

15. **The guest credential does not survive a payment return.** The status token is in tab-scoped `sessionStorage` (`client/src/research/assisted-order/storage.ts:60-62,102-106`). A Stripe redirect or new tab loses it. **Require:** a recovery path, such as P-17 status recovery, tested across the redirect.
16. **`/api/research/checkout/payment-config` requires an active member.** Guests in the assisted lane cannot load a publishable key, so the guest path needs its own door.
17. **Manual method codes.** Tests pin `card`/`stripe` as invalid manual method codes, and the admin conversion panel defaults to the free-text `wire` (not a registry code). Change these deliberately.
18. **Copy states.**
    - There is no processing, failed, disputed or partially-refunded customer state or copy.
    - Refund copy claims "issued to your original payment method" without evidence.
    - The payment-config 503 copy says "Your cart is kept" (wrong lane).
19. **Headers.** Research pages have no CSP, so Stripe.js loads. Care pages keep a strict CSP. Helmet defaults `COOP: same-origin` and `X-Frame-Options: SAMEORIGIN`. **Require:** a browser check of 3-D Secure / wallet flows under these headers.
20. **Migration hygiene.** The guard and hold migrations have no `begin`/`commit`, preflight or post-condition, unlike M71. A successor migration must include them.

### Follow-up outside this lane (HL-26 class)

21. **More `40001` raisers** exist outside `supabase/migrations` and `supabase/candidates`, for example:
    - `supabase/pack02-candidates/20260813_research_b2b_sponsored_claim.sql:447`;
    - several in `supabase/care-appointments-clinician.sql` (`:1012,1192,1275,1358,1481`).

    Whether they are applied and reachable through PostgREST is UNKNOWN. If any is a deterministic refusal on an applied RPC, it has the same infinite-retry risk. **Recorded for the Care owner; not verified further here.**
