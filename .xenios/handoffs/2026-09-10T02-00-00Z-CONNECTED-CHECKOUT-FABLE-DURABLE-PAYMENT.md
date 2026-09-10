# Connected card checkout: what is built, what is proven, what is not

Session `fable-durable-payment-20260909` (Claude, optional capacity, not the
production executor). Branch `claude/durable-payment-port-20260909`, worktree
`C:/Users/sboad/projects/fable-probes-20260908`, pinned Node 20.19.0.

**Take `b7f91ad3e8be085c1eca7a7490fb0ff9d5217d92` or later.** The integration
owner cherry-picked this lane at `df5396b11b863322fd513c3691e5b3fd5279bdb0`.
Three adversarial rounds have run since, and each found real money defects,
including two rounds where a fix introduced a narrower version of the defect it
was closing. Do not qualify `df5396b`, `316a67c` or `7fb98d8`.

## The chain

| SHA | Unit |
| --- | --- |
| `30e8b7a` | Provider-verified idempotent payment port over the canonical adapter |
| `8baaead` | Webhook evidence bound to durable executions |
| `4a7463e` | Payment-authentication continuation (owner-checked status/continue) |
| `d0d6096` | Canonical execution store: SQL candidate and adapters |
| `c70b77e` | First review round: retention, identity trigger, reservation completeness, cancellation settlement |
| `5c52abb` | Durable submission path over the execution store |
| `7d180f8` | Composition builder, cancel door, bounded recovery, browser payment config |
| `70ab791` | The member checkout page connected to the durable card door |
| `1372969` | Composition patch proposal for the integration owner |
| `df5396b` | Executable rehearsal package for the SQL candidate |
| `316a67c` | First review round: nine defects closed |
| `fbdd08f` | SQL-faithful zero-capture evidence check |
| `7fb98d8` | Two self-introduced regressions closed; connected-journey runner |
| `af0743f` | The journey skips a customer challenge it cannot complete |
| `b7f91ad` | Second review round: fifteen defects closed (read this one) |

## What a buyer actually gets

The canonical page `/research/member/checkout` asks the server once for a
payment configuration. While that answers `payment_disabled` (production
today, because the resolver returns Disabled) the page uses the ordering door
exactly as before: manual and assisted ordering are untouched, and the legacy
tests pass unchanged.

With a configuration published, the card is collected inside the provider's own
element (a `pm_` reference; no card data anywhere in the app), the buyer must
quote shipping for the service they chose so the figure they consent to is the
figure charged, and one logical submission keeps one request key. A retry
resends the identical body; a lost answer keeps the request frozen and the
resume pointer is written *before* the request leaves, so a refresh resumes the
same key through the owner-checked door instead of paying twice. Bank
authentication, uncertainty, cancellation and completion each render the state
the server actually reported, and the completed view shows the order reference
and says plainly that payment received is not shipment.

## What is proven, and by what

Local only, on Node 20.19.0: 2362 tests across commerce, providers, payments,
member pages, adapters and lib; full `tsc --noEmit` exit 0. The provider in
every test is the REAL `StripePaymentAdapter` driven over an in-test model of
Stripe request idempotency, with deliberate faults (lost responses, 5xx, rate
limits, declines). The browser provider surfaces are injected doubles.

That is scripted-transport qualification. It is **not** evidence about the SQL,
the managed database, or the real provider. Nothing in this lane has executed a
single statement against any PostgreSQL, made a Stripe test-mode call, or
touched a managed project.

## What is NOT done, and who owns it

1. **SQL rehearsal** (integration owner). The candidate
   `supabase/candidates/20260909150000_research_checkout_executions.sql` is
   unchanged since `c70b77e` and unexecuted. The runnable package is
   `.rehearsal.sql` (57 assertions, one transaction, ends in ROLLBACK) plus
   `.rehearsal.md` (where each step may run, the two-session concurrency probe,
   the receipt to record). One scope question is open and stated there: the
   staging authorization named a different candidate, so installing this one on
   the shared project needs the founder to confirm that scope. A throwaway
   rehearsal database needs nothing further.
2. **Composition mounting** (integration owner; `production-deps.ts` and
   `server/index.ts` are inside their lease). Exact patch in
   `docs/research-commerce/DURABLE_CHECKOUT_COMPOSITION_PATCH_20260909.md`,
   with one change at `316a67c`: drop `expectedProviderAccountId` from the
   `composeDurableCheckout` call, it now comes from the provider itself.
   Mounting changes nothing in production behaviour: with the Disabled provider
   every durable door answers a precise 503 and the browser is told
   `payment_disabled`.
3. **Connected provider qualification** (integration owner). Needs the
   authorized staging project, Stripe test-mode credentials including the new
   `STRIPE_PUBLISHABLE_KEY`, and a webhook endpoint. The journey to prove is
   ordinary payment, required authentication and return, decline, duplicate
   submission, lost response, restart recovery, provider success with a failed
   local commit, webhook redelivery and out-of-order events, cancellation and
   settlement, owner-only reads, account-switch isolation.
4. **Independent acceptance** (a non-author reviewer). Scope
   `5c52abb..316a67c`. Nothing here is self-accepted.
5. **Recovery sweep and downstream outbox** (open). A scheduler that calls
   `executor.recover` for old parked executions needs a member-agnostic list
   function the SQL does not yet have. `onCommitted` now fires on the commit
   transition for every door, but no commerce-lane order notifier exists to
   attach; that decision is the integration owner's.

## The connected-journey runner

`server/research/commerce/qualification/` is one runner with two bindings:
LOCAL (in-memory stores and the scripted provider model) and MANAGED (the
composed managed surface and the provider's test mode). The scenarios and their
reconciliation are identical; only the binding changes, so the qualification run
is a call rather than a hand-written journey. `assertQualificationTarget`
refuses a live publishable or secret key, the production project, a malformed
project ref, a missing webhook secret, absent or duplicate or non-uuid synthetic
identities, and a missing owner approval, before any surface is constructed and
with no override. A local receipt always reports `qualified: false` and
`evidenceClass: local_scripted_transport`, and a scenario the binding cannot
exercise is SKIPPED naming the missing capability rather than passed. Two are
skipped by default: the local-commit-failure case, and the customer challenge,
because the provider has no server-side API that finishes a 3DS challenge, so a
managed binding needs a browser driver or a non-challenge test method.

## Known and deliberate, for the integration owner to decide

An order-level precondition violation at commit (order not capturable, total
mismatch, a different payment reference) RAISES rather than parking, in both the
SQL and the in-memory reference. A captured payment then waits in `captured` and
the door answers 503 until an operator looks. A reviewer argued it should park
with `local_commit_failure`. That is a change to the migration now frozen for
rehearsal, so it is recorded here rather than diverged on one side.

The cart applies ALL spendable store credit up to the subtotal regardless of the
amount the buyer types, and `checkout.ts` uses the typed amount for the
payment-method gate while the charge uses the cart's. The page now displays the
server's figure so consent matches the charge, but the underlying inconsistency
is a server contract question, not a display one.

## The three review rounds

Five independent lenses raised eighteen findings on the checkpoint; every
finding that reached a verifier came back real, none refuted. All were fixed.
The three that moved money:

- `executor.cancel()` on an execution parked in `authorizing` fell through to
  `run()`, which reconciled, authorized and **captured** the payment the buyer
  had asked to release, then told them the provider had already completed it.
  Reproduced against the real adapter. `authorizing` is now cancellable under
  the version compare-and-swap.
- The lost-reference cancel branch treated a *refused replay* as proof no
  payment existed and settled "cancelled", releasing holds while an
  authorization could still stand at the provider. Only the provider's own
  cancelled read-back settles now.
- The client wrote its resume pointer only after a server answer, so a refresh
  while the answer was in flight minted a new key and let one cart be paid
  twice. The pointer is now written before the request leaves.

A second pass over those fixes found fifteen more, including that the first
round's headline fix did not close its own defect: `cancel()` still ended with
`run()`, so an "it is still authorized" answer from a failed provider cancel was
recorded and immediately captured. The rule is now absolute: a claimed
cancellation records exactly two truths, cancelled or captured, and every other
answer leaves the row in `cancelling`, which nothing advances to a capture. The
same pass found that a downstream notifier failure could answer 503 for a
captured, recorded purchase; that the amount shown at consent deducted the
credit the buyer typed while the server deducts the cart's; and that two paths
minted a new idempotency key on a continuation 404, which is not proof nothing
was created because the durable door persists the execution last.

A third pass over `b7f91ad` is running. Anything it confirms lands on this
branch, and the pattern so far says to expect something.

## Next command

```
node ./node_modules/vitest/vitest.mjs run server/research/commerce server/research/providers client/src/research/payments client/src/research/pages/member client/src/research/adapters client/src/research/lib
```
