# Bounded durable recovery operation — implementation contract

Parent 0fcac22c9a0861e3b4fa89be6f56c20dcbef5692. Main is integration owner.
Preparation only: no provider, managed database, notification or production effects.
CLI 2.116.0 generated candidate name in an isolated local scaffold:
`20260910220129_research_checkout_recovery_operation.sql`.

Use existing private research_idempotency_keys storage with new fixed scopes
`checkout_recovery_control_v1` (key singleton) and
`checkout_recovery_outcome_v1` (key intent UUID). No financial state moves here;
canonical executions/orders/credit/reservations remain sole financial authority.
Do not use the old once() producer helper for this metadata.

One SECURITY INVOKER RPC research_checkout_recovery_operation receives p_action
text, p_owner uuid (nullable only for read), p_fence bigint (decimal-string wire)
and p_data JSONB. Supported actions: read, claim, renew, begin, complete, exhaust,
release. Default data {}. All errors are static codes, never payload values.
Revoke EXECUTE from PUBLIC/anon/authenticated, grant only service_role. Explicit
underlying minimum table grants; preserve existing RLS and financial functions.
No network call or session lock inside the transaction.

Wire result: read returns {status:absent} or {status:read,state}; claim returns
{status:busy} or {status:acquired,state}; each other action returns
{status:ok,state}. Fields and interfaces are in checkout-recovery-operation-contract.ts.
State is fixed schemaVersion 1 with owner, decimal fence, leaseUntil, cycleId,
before, after, exhausted and pending. Enforce shape, not permissive defaults.

Claim initializes only an absent exact namespace, otherwise validates existing
state. Active different owner returns busy without mutation. Active same owner
is idempotent. Expiry/release acquisition increments the fencing counter and
retains pending intent/cursor. Lease is 120 seconds of database time. A completed
cycle starts a new cycle with before = date_trunc(milliseconds, clock_timestamp
minus five minutes), preserving the sweep's shortest unchanged grace period.
Renew extends the same owner/fence. Every mutation verifies owner/fence and an
unexpired lease under a row lock. Never hold that lock across a provider call.

Begin requires exact input fields: intentId, executionId, observedUpdatedAt,
observedPhase, decision (settle or skip). Read the canonical execution to bind
memberId/orderId/requestKey; do not accept those identities from the caller.
Keep observedUpdatedAt's original string, validate it against horizon/cursor and
the canonical updated_at, preserve six fractional digits. Save pending before
any coordinator call. A different pending intent refuses; exact begin retry
replays. Persist skip decisions too, so resuming a skipped row cannot settle it.

Complete accepts intentId/code only. Atomically append an immutable outcome
and advance cursor to the pending observed position, then clear pending.
Outcome stores schemaVersion, cycleId, intent, code, recordedAt, not free-form
provider/error text or notification payloads. Exact completion retry confirms
its immutable outcome; mismatch refuses. Terminal/missing codes must agree with
canonical terminal/absence facts. Other codes are the existing closed recovery
entry set. An uncertainty never becomes successful completion.

Exhaust requires no pending intent and a fresh database discovery proving no
remaining rows after the cursor within the fixed horizon. It sets exhausted
explicitly. Release clears owner/lease but preserves pending/cycle/cursor and
history. No DELETE, reset, automatic retention cleanup or migration replay.

The TypeScript operation runs one bounded pass and receives only strict
execution reads plus executor.settleUnattended. No run/recover/authorize/confirm/
capture, outbox, receipt hook, worker start or timer is provided. Effects must be
explicitly enabled before even acquiring a lease; defaults refuse. First resolve
any pending intent by exact canonical identities, including already-terminal
rows that no longer appear in discovery. Persisted skip means skip on resume.
New work uses existing shouldAttempt/default grace. Preserve lease owner/fence,
exact cursor and fixed horizon across every state response. Persist failure
stops the pass; an ordinary report must not hide missing durable outcomes.
Output counts/status only, not member/order/payment/private payload data.

Main owns SQL candidate/pre/postchecks, contract and eventual entry-point wiring.
Worker product_review_filters owns checkout-recovery-operation.ts and its test
only. Main will review and control heavy tests. No schema/adapter/other edits are
delegated. Independent review and real local SQL proof are required before this
is accepted; connected qualification and activation need applicable authority.
