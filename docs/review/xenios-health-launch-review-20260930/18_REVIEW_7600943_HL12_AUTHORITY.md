# Claude independent review: HL-12 quote and payment authority (`c92d7a9..7600943`)

## Identity

- **Pinned checkpoint:** `7600943f9ec7573f0a5cbfe7a7687ba851276a30`, tree `2fd41b918c8d77c5593319a6d921477f789b737e`.
  It mounts default-off quote and finance routes, and is the newest coherent checkpoint at fetch, 16:23 CT.
- **The range includes:**
  - `5c8498c` (tree `b674634a…`), the owner-bound quote read and request-bound verify SQL;
  - `399a1f3`, which registers it;
  - `c92d7a9`, the authority SQL;
  - `8047e39`, which carries the guarded admin Auth UUID;
  - `5d60270`, the concurrency proof;
  - records commits.
- **Classification:**

  | Kind | Commits |
  | --- | --- |
  | Runtime and schema | `c92d7a9`, `8047e39`, `5c8498c`, `7600943` |
  | Test | `5d60270` |
  | Registration | `a59c05b`, `399a1f3` |
  | Records | the rest |

- **Migration bytes** (canonical LF, `git show 7600943:`):

  | Migration | Blob | Bytes | SHA-256 |
  | --- | --- | ---: | --- |
  | `20260930202413_research_assisted_order_quote_payment_authority.sql` | `adee39cd` | 36,069 | `f59dc7d285a7c5714ec1a81ec2e0dfb469ef4434da355f15a85ca1e366c5a894` (equals the writer's recorded checksum) |
  | `20260930205725_research_assisted_order_quote_access_finance_bound.sql` | `97495c60` | 4,328 | `452a94e5acd880a9e02e34681e9844692997d5d7d22802f4efef94b27f30e18f` |

- **Environment:** disposable `supabase/postgres:17.6.1.171` + `supabase/postgrest:v14.13`, local only. Applied, in
  order:
  1. bootstrap
  2. M71
  3. `20260820190000`
  4. `20260921` member history
  5. the HL-26 guard
  6. the paid hold
  7. the authority migration
  8. finance-bound
- **Not done:** no managed database, no live keys, no real email or money.

## Effective state (from `pg_proc` / `pg_class`)

- **Functions.** `quote_issue`, `quote_accept`, `quote_get`, `payment_observe` and `payment_verify_bound` are all
  `SECURITY DEFINER`, `search_path=""`, EXECUTE `service_role` only.
  - The obsolete `payment_verify(uuid,uuid)` has **no grants**.
  - The guard trigger functions have no EXECUTE grants, and they still fire.
- **Tables.** `quotes`, `payment_verifier_grants`, `payment_observations` and `payment_verifications`: RLS enabled
  and **forced**, with no direct grants to `public`/`anon`/`authenticated`/`service_role`.
- **No `40001`.** No deterministic refusal uses `40001`. The run's total `xact_rollback` delta was 23, which is the
  refused calls, with **no loop**.

## Composed evidence

**Path:** HTTP route table → `AssistedOrderFinanceService` / `AssistedOrderService` → `SupabaseAssistedOrderRepository` →
postgrest-js → PostgREST → SQL.

**Substitutions:**
- `requireSupabaseAdmin` → a header stand-in that stamps `adminAuthUserId` exactly as `server/routes.ts:149` does.
- Member Auth → a header stand-in.
- **Manual ledger authority → a SYNTHETIC in-memory ledger.** Production composes `null`.
- Outbox and audit → in-memory capture.
- Verifier grants were inserted directly in SQL; there is no grant route.

### Successful path (synthetic ledger)

| Step | Result |
| --- | --- |
| S1 admin issues the quote | 201. Total 10,000¢ derived server-side from the immutable line snapshot (`priceSource: catalog`). |
| S2 owner reads it | 200. The private `pricing_basis` is not exposed. |
| S3 owner accepts the exact quote | 200, with an `acceptanceId` |
| S4 granted admin records the manual observation (ledger-matched) | 201 |
| S5 verify | 200 `paid`. **1 verification, 1 paid event.** **0 customer notification intents** (see F4). |
| S6 identical retry | 200 `replayed:true`. Still 1/1. |
| N20 two concurrent identical verifies | 200 + 200 (`replayed:true`), 1/1, rollback delta 0, no hang |

### Refusals that PASS

| Case | Result |
| --- | --- |
| Foreign member read or accept; no credential | 404 |
| Status-token holder read | 200 |
| Accept with wrong total | 409 `quote_stale` |
| Superseded v1 | 404 |
| Expired | 409 `quote_stale` |
| Reprice a priced line | 409 |
| Re-issue after acceptance (accepted quote immutable) | 409 |
| Verify against an unaccepted quote | refused; 0/0 |
| 1¢ under, 1¢ over, `EUR`, lowercase `usd` | 409 `payment_mismatch`; stays `payment_review` |
| Guarded admin with no grant | 403 |
| Body-injected verifier id | 403 |
| Valid observation under another request path | 404; no write |
| Direct `service_role` call to the obsolete unbound verify | **42501** |
| `verify_bound` as `anon` / `authenticated` | 42501 |
| `set_status` `paid` carrying **another order's** verification id | refused, `ASSISTED_ORDER_PAYMENT_VERIFICATION_REQUIRED` |
| HTTP PATCH `paid` | 409 |
| Verify while in `payment_pending` | refused; 0/0 (atomic) |
| Historical `paid` without verification → `supplier_processing` | refused, `HISTORICAL_PAID_UNRESOLVED` |
| Cancel a verified paid or `supplier_processing` order (SQL) | refused, `REFUND_AUTHORITY_NOT_READY` |

### Unit and gates at `7600943` (single-worker)

- `server/research/assisted-order`, `client/src/research/assisted-order`, `shared/research/assisted-order`,
  `server/research/status-recovery`, and `server/release-control-plane.test.ts`: **30 files, 495 passed, 1 skipped**.
- `tsc` exit 0.
- Migration DAG accepted, **42 nodes**, canonical checksums verified.

## Findings from Claude's execution

| Id | Severity | Finding | Repro | Smallest correction |
| --- | --- | --- | --- | --- |
| F1 | **P1** (mounted manual workflow) | **No independent manual evidence authority is composed.** `server/index.ts` builds `AssistedOrderFinanceService(getSupabaseAdmin(), null)`, and `observeManual` always refuses. There is also no route to create a verifier grant; grants exist only by direct SQL. | P1 in the production composition: observation → 409 `manual_evidence_unavailable`. | Implement `AssistedOrderManualEvidenceAuthority` over a real, independently authorized ledger record (a bank or processor statement import with durable single use). Compose it behind the finance flag. Define an audited, founder-authorized grant procedure; not a browser action. |
| F2 | **P1** | **A verified paid order cannot move to fulfillment through the mounted route.** The TS hold `service.ts:837` still refuses every exit from `paid`, while the SQL guard now allows it once a verification exists. | S7 HTTP `paid` → `supplier_processing`: 409 `payment_verification_not_ready`. S8: the same transition at the SQL layer is ACCEPTED. | Make the TS refusal conditional on the absence of a verification record (read through the repository), matching `paid_hold_guard`. Add tests for both the historical and the verified case. |
| F3 | **P2** (money liveness) | **One wrong manual observation permanently blocks the order.** A manual `payment_reference` must equal the request's public reference, `(method, payment_reference)` is unique, and observations are immutable, so no corrected observation can ever be recorded. | N8/N9/N10/N10b: a 1¢-off, EUR or `usd` observation is refused at verify (correct). The corrected 10,000¢ USD observation is then 409 `payment_reference_reused`. The order stays in `payment_review` forever; the only exit is a free-text cancel (C2). | Add a governed void/supersede for an unverified observation, with an evidence reason, or key uniqueness on the external evidence id rather than the request reference. Keep the verified record immutable. |
| F4 | **P2** | **No customer notification and no TS audit on verification.** `paid` is set inside SQL (`payment_verify` → `set_status`), which bypasses `AssistedOrderService` effects. | S5: 0 outbox intents. | Enqueue the status-change notification and audit from `AssistedOrderFinanceService.verifyManual` after a non-replay success, idempotently keyed on the verification id. |
| F5 | **P2** | **Cross-order reuse of one bank payment is prevented only by the absent ledger adapter.** `source_evidence_ref` is not unique. | N19b: the SQL observe for a second order with the same `source_evidence_ref` is ACCEPTED. The synthetic ledger refused it at the HTTP layer (N19), but the production ledger does not exist. | A unique `(method, source_evidence_ref)` for manual observations, or a durable single-use ledger record enforced in SQL. |
| F6 | **P2** (carried H3) | **Cancel after money was observed needs only free text.** | C2: `payment_review` with an observation → `cancelled` returns 200 with only `cancellationReason`. C1 (`payment_pending` → cancelled, no money) is acceptable. | Refuse cancel when an observation exists without no-funds, void or refund evidence, in both layers. |
| F7 | **P2** (R-1 inverted) | **The two status pages still disagree, now in the opposite direction.** After a genuine verification, the assisted-order status page shows "Payment record under review. Contact Support before relying on this payment record." (`AssistedOrderStatusPage.tsx:41-42`), while `/status` shows "Payment verified" (`status-copy.ts:21`). Neither renders from verification evidence. | Source at `7600943`, plus the S5 state. | Render the `paid` copy from the existence of a verification record: verified → "Payment verified"; historical unverified → neutral. Apply the same to both surfaces and to the notification template. |
| F8 | P3 | Cancelling a `supplier_processing` order over HTTP returns **500** `assisted_order_unavailable`. SQL `REFUND_AUTHORITY_NOT_READY` is not mapped. | C3 | Map it to 409. |
| F9 | P3 (policy) | **The verifier must be the same person as the observer.** The grant label must equal `observed_by`, so there is no two-person control, and a second granted admin cannot verify. | N12: a different granted admin gets 403. | Founder decision: single named actor, or observer ≠ verifier. Encode whichever is chosen explicitly. |

**Card adapter:** **NOT PRESENT.** No provider route, adapter or webhook exists at this checkpoint. The SQL accepts
`method='provider'` observations, but nothing authenticates provider bytes. Section E traps 1-9 remain the bar.

## Disposition (reported separately)

| Area | Disposition |
| --- | --- |
| Shared financial invariants (SQL) | **PASS** for the covered cases: quote derivation, acceptance, amount/currency/reference, grants, atomicity, replay, concurrency, forged-id refusal, historical freeze, cancel-after-paid refusal. |
| Mounted manual purchase workflow | **FAIL**: F1 (no evidence authority composed; no grant procedure) and F2 (verified paid cannot reach fulfillment). The successful path is proven only with a synthetic ledger. |
| Card adapter | **NOT PRESENT** |
| Historical-order and cancellation handling | **PARTIAL**: historical `paid` is frozen in SQL (no preflight, runbook or rollback plan yet); cancel after money observed is free text (F6); cancel after paid is refused, which is correct pending refunds. |
| Customer status consistency | **FAIL**: F7 |
| Managed or production readiness | **NOT READY**. Pending migrations: the guard, the hold, the authority and finance-bound, in that order after M71. No preflight count, runbook or rollback plan yet. |

**HL-12 remains OPEN (P1).**
