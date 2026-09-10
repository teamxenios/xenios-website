# Unattended settlement proofs, receipt reconciliation, credit policy

Worker: `fable-durable-payment-20260909` (Claude / Fable)
Branch: `claude/durable-payment-port-20260909`
Preceding source: `370fa9151d2dde1dd90629f2ec4282f8db681df3`

This handoff covers the work done after `370fa915` in response to the
`XENIOS_FINISH_BUILD_20260910` role prompt (`03_CLAUDE_FABLE.md`). The
recovery, pagination and route corrections in `370fa915` are preserved and were
not reimplemented.

## The supplied package was not on this machine

Only the prompt and guide files reached this session:
`README_START_HERE`, `INTEGRATION_GUIDE`, `SAME_DAY_EXECUTION_PLAN`,
`GOALS_TO_PASTE`, `VALIDATION.json` and the four role prompts.

Absent: `00_MASTER_MISSION.md`, `UPSTREAM_UPDATE_370FA.md`,
`INTEGRATION_SELECTION.json`, `SOURCE_BINDINGS.json`, the
`overlay/server/research/commerce/release-acceleration/` modules, the two SQL
read candidates, and `tools/`. No `XENIOS_FINISH_BUILD_20260910` directory or
archive exists under `C:\Users\sboad\Downloads`.

The guide describes the two modules I was asked to adapt in enough behavioural
detail to implement them against this repository's real types, which is what the
prompt asked for anyway ("port/add only missing assertions to the real
repository types and test infrastructure"). Nothing here is a copy of package
source, because there was none to copy. If the archive is delivered later, the
right comparison is invariant-by-invariant against what is described below.

## 1. The eight unattended properties

`server/research/commerce/unattended-settlement.test.ts` (new).

Properties 1 to 4 were already proven in `checkout-recovery-sweep.test.ts` and
were not duplicated. This file proves the five that are only visible when
something goes wrong:

| Property | Proof |
|---|---|
| 5. stale discovery snapshot | Two tests: a row that learns of an attempt between listing and settling escalates and sends no request; a row the customer completes mid-listing commits and is never cancelled. |
| 6. non-terminal cancellation | Five tests: an unfinished release parks in `cancelling` and never captures; an inconclusive answer does not release the holds; `processing` with zero received is NOT a release; `requires_action` with zero received IS releasable; the store refuses to settle without positive zero-capture evidence. |
| 7. lost cancellation response | Three tests: a dropped response resolves from read-back with exactly one cancel request; a cancellation the worker could not read back is left pending even though the guess would have been right; a release attempt that discovers the money was already taken commits. |
| 8. another worker's effect | Two tests: a lost compare-and-swap after a release that really happened reports `contended`, leaves the release standing and fakes nothing locally; the same after reading a capture defers the bookkeeping and does not un-take the money. |

Also added: the port-level guarantee the whole policy rests on, that `inspect`
refuses a record naming no payment rather than falling back to the creation key.

**These tests were mutation-checked.** Four separate mutations of the
implementation were each caught by exactly the intended test, and all three
source files were restored byte-for-byte afterwards:

| Mutation | Caught by |
|---|---|
| No-reference escalation removed | property 5 test |
| Any zero-received snapshot read as released | property 6c test |
| Inconclusive release settled anyway | properties 6a, 6b, 7b tests |
| Version compare-and-swap disabled | both property 8 tests |

## 2. Cursor precision

`microsSinceEpoch` is now exported from
`server/research/commerce/persistence/checkout-executions-store.ts` and the
in-memory `listRecoverable` compares on whole microseconds.

The managed path was already correct: `rowToExecution` passes `updated_at`
through as the raw string and the Supabase reader sends `after.updatedAt`
unchanged, so no JavaScript `Date` round trip happens. The defect was in the
in-memory reference, which used `Date.parse` (milliseconds) while Postgres
`timestamptz` carries six fractional digits.

Concretely: with a cursor at `(…:00.123456Z, "zzz…")`, the SQL returns a row at
`(…:00.123999Z, "aaa…")` and the millisecond comparison did not, because it fell
through to the id tie-break. That row was then never returned again, because
the cursor only moves forward. The reference is the thing that is supposed to
mirror the SQL, so this made local confidence wrong rather than production.

## 3. Recovery cycle semantics

`server/research/commerce/checkout-recovery-sweep.ts`:

* `RecoveryCheckpoint {before, after}` replaces the bare cursor. A cycle keeps
  the horizon it started with; recomputing it lets the eligible set grow under a
  cursor that only moves forward, so a busy platform never reaches the end of
  its own queue.
* `after: null` means the cycle completed, so the next scheduled cycle takes a
  fresh horizon and reconsiders rows this one escalated or deferred.
* An optional `record(entries)` dependency is called for each page **before**
  the cursor advances past it. If it throws, the pass stops and returns the
  previous position, so the page replays. That is safe because
  `settleUnattended` is idempotent and re-reads the authoritative row.
* Each entry now carries a fixed `code` from a closed set, so an operator store
  can index without parsing prose.

The sweep still chooses no store. **A owns the checkpoint and operator-event
storage**, and there is nothing suitable today: no job/checkpoint table exists
anywhere in the repository, and no operator event store is keyed by execution
id. The nearest reviewed precedent is the outbox used as an alert sink with a
deterministic `event_key`, which is what every other job does.

## 4. Receipt reconciliation

`server/research/commerce/receipt-repair.ts` (new). It owns no table, no queue
and no dispatcher, and it does not touch `outbox.ts`.

Findings that shaped it:

* There is no commerce paid/receipt notification today. `server/research/commerce/**`
  contains zero `enqueueNotification` call sites.
* Outbox deduplication is a unique index on `event_key` alone. It is per key,
  never per order. So a new key for an order already mailed under a different
  key sends a SECOND receipt. `priorEventKeys` exists for exactly this: A must
  supply every key a receipt for an order could already have used.
* `templateKey` is the only field dispatch switches on; `eventType` is never
  read at dispatch. An unclaimed key is answered `unknown template`, walks the
  backoff ladder and is recorded permanently failed.

**One line A must add** to `server/research/outbox.ts`, beside the other
renderer probes, or queued receipts will sit failing:

```ts
const receipt = renderCommerceReceiptOutboxEmail(job.template_key, payload);
if (receipt) {
  return await sendFoundingEmail({ to: job.recipient, subject: receipt.subject, text: receipt.text, idempotencyKey: String(job.event_key) });
}
```

Queueing is OFF by default (`mode: "preview"`). An unreachable queue is
reported as `queue_unavailable`, never as a clean pass. The renderer says a
payment was received and explicitly says it is not a shipping confirmation.

## 5. Credit policy

`shared/research/checkout-credit-policy.ts` (new). Arithmetic and consent only.
It reserves nothing, debits nothing and chooses no policy.

The repository currently computes the applied credit in five places, and two of
them disagree on purpose:

* `cart.ts:295-299` caps credit at the **subtotal**.
* `checkout.ts:388-395` decides whether a payment method is required by
  subtracting the client's `applyStoreCreditCents` from **subtotal + shipping**.

`coversShipping` is a required field so that question is settled by a decision
rather than by whichever expression runs. `evaluateCreditQuote` refuses rather
than clamps, and derives `payableCents` and `paymentMethodRequired` from the
same result so a gate and a charge cannot disagree. `validateCreditConsent`
refuses a changed policy version or a changed payable total.

## Findings for the integration owner, not fixed here

These are in A's files and are reported rather than changed.

1. **The assisted door's payment-method gate trusts a client number.**
   `server/research/commerce/checkout.ts:388-395` computes
   `payableCents = subtotal + shipping - (req.applyStoreCreditCents ?? 0)` and
   skips `payment_method_required` when that reaches zero, while the charge at
   `:522` uses the server's own `cart.storeCreditAppliedCents`. A request
   carrying a large `applyStoreCreditCents` therefore passes the gate while the
   order still owes money. This is the only server read of that field anywhere.

2. **The durable door never debits the credit ledger.**
   `durable-checkout-submission.ts` has no `storeCredit` seam and never calls
   `recordSpend`. The debit exists only in the unapplied candidate SQL
   (`20260909150000…:305-314`), and the in-memory store that documents itself as
   mirroring that function omits it. `CanonicalCheckoutExecutionStore.commitCaptured`
   is documented as including a credit debit.

3. **Nothing prevents two concurrent orders spending one balance.**
   `store-credit-store.ts:347-352` is a read-then-insert with no lock and no
   constraint covering spend rows; the candidate SQL's insert performs no
   balance check at all, so the database and the application disagree about
   whether an overdraw is possible. A's own prompt names this test.

4. **A refund never returns store credit**, and refunds are bounded by
   `capturedAmountCents`, which is the amount after credit.

## The one precise external prerequisite

A real provider test-mode qualification cannot run, and the blocker is not a
credential. **No managed `JourneySurface` implementation exists anywhere in the
repository.** `server/research/commerce/qualification/` contains only the
707-line runner and its local-binding test, and the only implementation is
`localBinding()` inside that test.

Writing one is blocked on three artifacts that are not mine:

| Artifact | Owner |
|---|---|
| The durable surface mounted through `production-deps.ts` and `server/index.ts`, and `createWebhookHandler` given its `executions` processor | Codex A. The patch is written and unapplied at `docs/research-commerce/DURABLE_CHECKOUT_COMPOSITION_PATCH_20260909.md`. |
| `20260909150000_research_checkout_executions.sql` installed on the authorized staging project | Codex A, under founder scope confirmation naming that exact candidate for project `tetynodzrtmdbuzgboro`. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `STRIPE_PUBLISHABLE_KEY` in test mode | Founder. `STRIPE_PUBLISHABLE_KEY` is required by `payment-client-config.ts:53` and is absent from `.env.example` and both readiness documents. |

Two further facts about qualification, so nobody plans around them wrongly:

* `authentication_challenge_and_return` can only be satisfied by a browser
  driving the provider's hosted challenge. There is no server call that
  completes it. The repository's CDP harness could be extended, but it has no
  mouse-click primitive in `PageSession`, no cross-origin frame input, and three
  independent hard blocks on external network access. Driving a real challenge
  means new code plus a deliberate relaxation of the evidence harness network
  boundary, which is a decision, not an implementation detail.
* A binding that declares `browserDrivenChallenge: true` makes **two** required
  scenarios depend on the browser driver, because `process_restart_recovery`
  prefers the challenge method whenever one is declared.

## Evidence class

Local deterministic tests against the real store, the real port, the real
coordinator and a model of the provider's HTTP API. No Stripe call, no
PostgreSQL query, no managed project write, no deployment, no email queued or
sent. The SQL candidates remain unapplied and unauthorized.
