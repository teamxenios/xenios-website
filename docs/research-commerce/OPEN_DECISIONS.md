---
title: Open Decisions, Commerce and Distribution Lane
owner: Samuel Boadu
status: awaiting decision
last_updated: 2026-07-20
---

# Open decisions

Things the code deliberately holds open because deciding them is not an engineering
call. Each one currently fails closed, so nothing ships wrong while it waits.

## 1. Supplier facts, 32 unconfirmed and 13 disputed

The headline item. Full worklist in `SUPPLIER_FACT_RECONCILIATION.md`.

`products-data.ts` states compositions, strengths, and prices that the catalog content
review recorded as unconfirmed. **KLOW (P003)** is the sharpest case: the legacy file
names a four-component set at exact strengths that no supplier document backs, and the
content review declined to guess even the ingredient set.

**Current position:** every legacy value is preserved and marked `unverified_legacy`,
nothing unconfirmed is member-displayable, and nothing is purchasable. Safe indefinitely,
but nothing can be sold until resolved.

**Resolution:** confirm, correct, or withdraw each fact against a written supplier
document.

## 2. The four program records have no product lane

`foundational-performance-program`, `recovery-routine-program`,
`body-composition-program`, `precision-routine-program`.

A coaching or routine program is not a supplement, a research material, Quantum, or
clinical care. Forcing one of those lanes onto it would mis-apply that lane's
authorization rules, claims rules, and fulfillment owner.

**Current position:** held in an explicit `non_product_program` lane with
`laneDecision: "needs_samuel_decision"`. The pending decision blocks purchase on its own,
independently of every other gate, so the placeholder cannot ship as a quiet default.
They are catalogued rather than dropped, so they stay visible and auditable.

**Resolution:** decide whether programs belong in the product catalogue at all. If they
do, they need a real lane with its own authorization and claims rules. If they do not,
they belong in the plans surface, not here.

## 3. Epitalon versus Epithalon

The legacy catalog slug is `epitalon-10mg`. The Guide content uses `epithalon`. Both
transliterations appear in the literature.

**Current position:** both spellings are preserved as searchable aliases on P011.
Neither is promoted to canonical, because picking a canonical scientific label is a
review decision.

**Resolution:** scientific review picks one canonical label. Keep the other as an alias
so a member searching the spelling they know still finds the record.

## 4. Webhook provider-reference matching

**Raised by the wave 2 adversarial review. Deliberately not fixed in code.**

A verified capture event whose `providerReference` does not match the order's stored
`paymentReference` currently still captures.

This is **not attacker-reachable**, because the webhook body is signature-verified before
it reaches any business logic. The concern is correctness under a real processor, not
security.

Strict equality was **deliberately not added**, because real processors commonly return a
capture identifier that differs from the authorization identifier. Enforcing equality
against the wrong field would reject legitimate captures in production, which is a worse
failure than the one it prevents.

**Resolution:** once the processor is chosen, decide which identifier the webhook
carries and match on that specific field. Until a processor exists there is nothing to
match against, so this stays open by design.

## 5. Partial refunds are unreachable

Also from the wave 2 review, recorded here because the code comment previously described
behavior that did not exist.

`refundedCents` is carried and checked against the capture, but partial refunds cannot
actually happen: the first refund moves the order to a terminal `refunded` state, so a
second is denied by the state machine before the arithmetic is consulted.

**Current position:** fails closed, and the comment now says so plainly. The accumulation
bound is a second line of defence rather than the active one.

**Resolution:** if partial refunds are ever wanted, the terminal transition is what has
to change, not the field.

## Resolved during this build

- **Refund replay durability.** Replay protection lived in a per-process `Map`, which is
  not idempotency once the service restarts or a second instance handles the retry: the
  map is empty, the key looks new, and real money moves twice. Moved onto the repository
  interface so durability is the caller's responsibility and visible in the type. A
  regression test drives a refund through one service, builds a **new** service over the
  same store, replays the key, and asserts the provider was not called a second time.
