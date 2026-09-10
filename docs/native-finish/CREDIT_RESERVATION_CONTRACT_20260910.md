# Execution-bound credit reservation candidate

This is local implementation/qualification, not a production release approval.
It continues the full Xenios Health mission; it does not redefine completion.
Parent: `f43505e7700df506511c8228765936b653085a41`.

## Implemented contract

- Execution creation and its exact canonical-order credit reservation share one
  database transaction. The member lock is acquired before insertion/FK locks.
  Request-key duplicate detection remains 23505 and existing-intent read-back.
- The append-only ledger is the monetary authority. A separate execution/order
  reservation encumbers credit; it is not a ledger grant or `held` referral row.
- Complete, member-serialized database aggregates replace capped history totals
  in the durable adapter, production cart and account balance wiring. History
  remains potentially transport-capped and is not monetary authority.
- Capture exchanges the exact owned hold for one immutable, order-bound debit
  in the same transaction as order, inventory, state-event and execution commit.
  Historical arbitrary negative adjustments are not treated as matching spends.
- Verified zero-capture cancellation releases only its own hold. Unknown/refused
  provider outcomes and captured-but-uncommitted executions retain their holds.
- Legacy spend uses the same lock and an order-idempotent RPC. Negative ledger
  adjustments cannot invalidate active holds; existing debt semantics without
  outstanding holds remain intact.
- An exact database reservation refusal may compensate only this attempt's
  order/inventory after interpretable request/order read-back. Timeouts, malformed
  projections and unavailable read-back are not proof of absent execution.
- The contract requires READ COMMITTED; unsupported transaction isolation stops
  rather than reusing a stale snapshot after waiting for the advisory lock.

## Candidate installation and recovery

Only the proposed new candidate is added; predecessor files are unchanged:

1. Canonical commerce prerequisites.
2. `20260909150000_research_checkout_executions.sql` (existing candidate).
3. `20260910120000_research_checkout_execution_recovery.sql` (existing candidate).
4. `20260910201400_research_checkout_credit_reservations.sql` (new candidate).

Run exact pre/postchecks in the authorized environment. No blanket push, reset,
history repair, production fallback or retrospective hold backfill is included.
The new migration repeats the unsettled-credit-execution gate under a table lock.
Existing unsettled credit checkouts require specific reconciliation; they are not
automatically converted. A partial/existing installation causes a stop.

New schema: nullable ledger `spend_order_id` FK/unique index; private reservation
table/index; member-lock, balance, spend and trigger functions; replacements for
capture/cancellation preserving their predecessor guards. Exact SQL includes
service-role permissions, forced reservation RLS and public-role revocations.
Invoker functions require the explicitly listed underlying table grants, not an
assumption about managed-provider default privileges.

Direct service-role DML is a trusted internal-writer boundary. Application
activation must not permit alternate writers to fabricate reservation state.
No expiry timer releases unresolved credit. Application rollback must disable
checkout writes first and preserve ledger, holds, orders, inventory and evidence.
Do not drop this schema or restore older spending behavior over active holds.
Further database recovery requires an explicit reviewed plan/approval.

## Independent source review

Reviewer `/root/product_review_filters` accepted main-authored source at
`2026-09-10T20:52:38.044Z`, after seven concrete findings were corrected.
This is source acceptance, not managed/concurrency/production acceptance.

| Source | LF SHA-256 |
| --- | --- |
| New SQL | `1196169a2d29cb7bf62e29326ed689bdd9f668d43abe6977d97dd087de70033e` |
| Precheck | `fa6c4b7056927b9b19ae3516a0beb08e5a0933d86291037e8452bba72a641d8c` |
| Postcheck | `b1116b7749ffdf5f21e30a954884679ee8788bbf95707c2b757a6530afe3b53c` |
| cart.ts | `7601f11e3b4d790a1224db5ef69da4fea7f6c7a6211156a4f5bc752d46f23eee` |
| production-deps.ts | `d46cd214dedc97c56f7e06ebade237da6c260d2c864bec2bae492077aff1dd21` |
| durable-checkout-submission.ts | `f50c1b2ca83d08a7c872d1bf62a7aebf8940163a6767064fcb3bd4af5cb33699` |
| checkout-executions-store.ts | `7a544fc1bf985cb7aada995c4b570e5452f1ccfb66027a99c0f81749c06bdff8` |

The main owner separately reviewed the worker-authored store-credit adapter and
tests, including exact RPC keys, the 12-field debit with order binding, safe
numbers, complete-balance/no-history fallback, replay and uncertainty behavior.
Main also reviewed and executed the separately authored local SQL runner. No
worker self-accepted its own required independent review.

## Preserved development evidence

Receipts live outside Git under
`C:/Users/sboad/projects/xenios-native-finish-evidence-20260910/`.
They bind their actual draft bytes, not later successor tests/source.

- `credit-sql-first-run.jsonl`: 23 passed, one failed at the service-role case;
  role-cleanup 25P02 masked its originating error. Retained unchanged.
  SHA-256 `37588636a401cd8813f2f57093093e8b2fbadb7b127746da1456cffffe3c3fc9`.
- `credit-sql-second-run.jsonl`: 49 passed, zero failed; explicit permissions and
  original-error-preserving cleanup; 11 SQL files, 27 scenarios, eight checker
  negatives. SHA-256 `4c723d1b52d049c071dcc175a65029ad999d8c6ed4d496258f4f204e85471b08`.
- `credit-contract-focused-first.json`: 207 passed, zero failed/skipped.
  SHA-256 `d910994c46f6932455bd7d2b68a1f19823c1c8d709cab26895d0fbfebfae9b24`.
- `commerce-credit-reservation-first.json`: 1,367 passed, zero failed, three
  skipped, before the last lookup/member-predicate follow-up qualification.
  SHA-256 `02a99fbac1668e85dee3fc9c7ef067ceebfa2c5f8e48a5d32e89415cf202be0f`.

## Open qualification and product scope

Final frozen-source checks, real independent-session PostgreSQL 17 concurrency,
managed PostgREST/provider/browser contact and production activation remain open
until separately evidenced. PGlite 18 single-connection proof is explicitly not
those proofs. Existing V3 input/scanner policy and historical failures remain.

New expiring-credit writes and allocation remain unqualified; historical expiring
balances remain readable but cannot silently become non-expiring spend debits.
Fully credit-funded zero-provider orders, refund credit restoration, quote/credit
consent, recovery scheduling and operational receipt integration remain part of
the existing build, not features declared complete by this slice.

No real payment, account action, customer notification, shipment, remote schema
write, migration-history operation, deployment or flag activation occurred.
