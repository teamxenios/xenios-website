# Handoff — REQUEST → QUOTE → PAYMENT OPERATIONS

TASK: Close the commercial loop after XRR creation — durable quote, payment
state domain, request → canonical order conversion, isolated customer/admin UI,
negative tests.

SESSION: `claude-fable-s6-quote-payment` (Claude Code, Opus 5)

WORKTREE: `C:/xenios-wt/s6-quote-payment` (created for this lane; isolated)

BRANCH: `lane/s6-request-quote-payment-20260820` (pushed)

BASE SHA: `8dabe22208c2d5a8d73e6f385460de936ed913a4`
(exact head of `xenios/launch-integration-20260819`; code-identical to the
published green resume SHA `7b16a2e0` — 8dabe22 adds only `.xenios` fleet docs)

PUSHED SHA (last code commit, the SHA to QA): `9f17132bf72b7934c6bbddbeab0cbb0c346878b0`
BRANCH TIP (adds only this handoff doc): `e7b4840b3ba6342134d716b27f8b6bd9b4b0e278`

COMMITS:

```
9f17132  Refuse a second settlement after a refund instead of reporting success
e7a6936  Give the customer an amount and a next action, and the operator a conversion panel
29d77ea  Gate request -> canonical order conversion on lineage, price and real money
ed51d37  Add the assisted-order payment lifecycle between an accepted quote and money
169440d  Preserve the dormant canonical-order scaffold at the integration SHA
```

---

## FILES

New, owned by this lane:

```
shared/research/assisted-order/payment-contract.ts
server/research/assisted-order/payment/{ports,service,memory-repository,service.test}.ts
server/research/assisted-order/conversion/{gate,gate.test}.ts
client/src/research/payments/{payment-presentation.ts,AssistedPaymentStatus.tsx,
                              AssistedRequestConversionPanel.tsx,payments-ui.test.tsx}
```

Preserved verbatim from the dormant `claude-fable-s7` lane (commit 169440d):

```
server/research/orders/{canonical-order,order-number,memory-repository,service,http}.ts
server/research/orders/canonical-order.test.ts
shared/research/orders/canonical-order.ts
```

NOT touched: `server/index.ts`, `server/research/index.ts`,
`client/src/research/section.tsx`, `client/src/research/adminx-section.tsx`,
any migration, any release manifest, any existing file under
`shared/research/assisted-order/` or `server/research/assisted-order/`,
`shared/research/early-access-quantity.ts` (lead-retained 50→100).

---

## WHAT WAS BUILT

### Quote — already existed; verified, not rebuilt

`server/research/assisted-order/quote/**` (issue → view → accept/decline,
supersession, lazy expiry, server-authorized prices, version + total echo on
acceptance) was already committed and green. Per the dispatch ("do NOT invent a
second quote system") this lane consumed it read-only. Its acceptance mints
`acceptanceId`; nothing consumed that before now.

### Payment state domain — new

Eight states, one transition table, one actor-authority table:

```
payment_required → instructions_presented → proof_submitted
                 → under_review → paid | rejected | exception → refunded
```

Every transition goes through one private `advance` helper that checks the
shape rule AND the authority rule and refuses unless both pass. Adding a method
does not add an edge; adding an edge does not add an actor.

- `paid` is reachable only from `under_review` or a resolved `exception`, and
  only by (a) a named admin holding an explicit verification grant resolved
  through `AssistedOrderPaymentVerificationAuthority` — separate from
  `assisted_orders:manage`, because admission to the admin surface is not
  permission to say a wire landed — or (b) a processor fact carrying the
  provider's own event id.
- A customer can reach exactly one state: `proof_submitted`, a CLAIM.
- Amount owed is copied once from the accepted quote. A verified amount that
  disagrees parks in `exception` carrying both numbers; never a partial payment.
- Settlement key is a pure function of the payment id → duplicate verification
  returns the incumbent; history holds one arrival at `paid`.

### Conversion gate — new, pure

`adjudicateAssistedRequestConversion` decides whether a request earned an order
and builds the exact `CanonicalOrderConversionInput` the existing order engine
already consumes idempotently. It refuses `QUOTE_STALE`, `LINEAGE_MISMATCH`,
`PRICE_MISSING`, `TOTAL_MISMATCH`, `QUANTITY_EXCEEDED`, `PAYMENT_NOT_SETTLED`.
Payment state is DERIVED (settled → `paid` order, unsettled → `awaiting_payment`
order); there is no payment-state parameter. `isRequestFulfillmentReady` is the
one predicate a release decision may consult.

### UI — new, isolated, unmounted

Customer panel (amount + next action + instructions) and operator conversion
panel. Operator affordances are derived from the same two tables the server
enforces, so no button is offered whose call the server would refuse.

---

## MANUAL PAYMENT IS PRODUCTION-CAPABLE

No external processor is available, so the manual lane is the production path,
behind the correct controls: named verification grant, required evidence ref,
exact-amount match, append-only history naming actor and time, idempotent
settlement. The processor route (`recordProcessorSettlement`) exists and is
tested but is inert until a real provider is wired — it cannot be called
without a provider event id.

---

## TESTS

```
server/research/assisted-order/payment/service.test.ts    52 passed
server/research/assisted-order/conversion/gate.test.ts    32 passed
client/src/research/payments/payments-ui.test.tsx         18 passed
lane suite (assisted-order + orders + shared)            179 passed / 9 files
FULL SUITE  662 files passed | 1 failed | 4 skipped (667 files)
            9,889 tests passed | 2 failed | 43 skipped (9,934)
            uncontended run, 341s
```

### The full-suite failures are PRE-EXISTING and not from this lane

Every failure, in every run, is in ONE file this lane does not touch:

```
client/src/research/kris-launch-a/access-presentation.test.tsx
  "renders BOTH the channel notices and the note as supplied, on every item"
  "says provider workflow required on every clinical item"
  Error: Test timed out in 5000ms   (both)
```

Two independent confirmations that it is not this lane:

1. **Reproduced at the base SHA in the lead worktree**, with none of this lane's
   code loaded: 3 failed / 13 passed, same file, same timeouts.
2. **The count moves with machine load, not with code.** Across four runs of the
   identical tree the same file failed 1, 3, 5 and 2 tests — the runs that
   overlapped with a concurrent `tsc` or a second vitest failed more. Nothing
   outside this file ever failed. A correctness regression does not behave that
   way; a 420-item React render loop against vitest's 5s default does.

Flagging it because the 2026-08-20 ownership map records "Full suite GREEN on
this exact SHA: 659 test files, 9,758 tests, 0 failures" for `7b16a2e0`. That
claim does not reproduce on this machine. **Suggested fix (lead's file, not
this lane's): a per-file `testTimeout` on `access-presentation.test.tsx`.** Until
then the fleet should expect this file to be a flaky red and should not read it
as a regression from whichever lane happens to run the suite next.

Requested negative tests, and where each lives:

| Negative test | Where |
|---|---|
| stale quote rejected | gate.test.ts — "a stale quote refuses" (4 cases) |
| cross-customer quote/payment blocked | service.test.ts — "cross-customer access is blocked" (3); gate.test.ts — lineage (2) |
| browser `paid=true` ignored | service.test.ts — "ignores a browser asserting paid: the field does not exist" |
| browser total ignored | service.test.ts — same test (amountDueCents unchanged); gate.test.ts — "smuggles its own total" → `CLIENT_TOTAL_REFUSED` |
| duplicate verification idempotent | service.test.ts — "duplicate verification is idempotent" (4); gate.test.ts — duplicate conversion replays to same order number |
| missing price never zero | service.test.ts — "missing price never becomes zero" (4: zero/null/negative/fractional); gate.test.ts — "missing price never becomes zero" (3) |
| unpaid request cannot become fulfillment-ready | gate.test.ts — "an unpaid request cannot become fulfillment-ready" (7 states + no-payment + refunded) |
| proof ≠ paid | service.test.ts — "a customer claim is not a payment"; UI — "never calls an unverified claim a payment" |
| 100 accepted / 101 refused | gate.test.ts — "quantity" (incl. per-variant summing) |
| refund / exception states | service.test.ts — "refunds" (7, incl. no second settlement after a refund), "amount that disagrees becomes an exception" (3) |

TYPECHECK: `npx tsc --noEmit` — clean.

BUILD: not run (no build-affecting change; nothing mounted).

MIGRATION: none authored. The SQL repositories are the next slice — see below.

FEATURE FLAGS: none added. Nothing is mounted, so nothing is reachable.

PRODUCTION MUTATED: **no**. No deploy, no migration, no env, no flag, no real
email, no real payment marked, no processor event fabricated.

---

## INTEGRATION INSTRUCTIONS (lead-owned seams)

Nothing in this branch is mounted. Four seams remain, all lead-owned:

1. **Composition** — build `AssistedOrderPaymentDependencies` in
   `server/research/assisted-order/production-deps.ts`:
   - `quotes.acceptedQuoteFor` over the EXISTING quote repository (read-only);
   - `requests.byPublicReference` over the EXISTING assisted-order repository —
     do not grow a second copy of request ownership;
   - `verification.verifierFor` over the REAL role store. It must return `null`
     for an admin without the payment-verification grant. If it is wired to
     return non-null for every admin, the lane's central guarantee is gone and
     `service.test.ts` "refuses an admin without the verification grant" is the
     test that would have caught it;
   - `instructions.compose` over configured server-side secrets. Never let an
     account number pass through the engine or an input.

2. **Routes** — `server/research/index.ts` (lead-only). Suggested doors:
   `POST /api/research/assisted-orders/:reference/payment/proof` (customer),
   and admin doors for open / present-instructions / begin-review / mark-paid /
   reject / exception / refund / convert. The service throws typed errors
   carrying `AssistedOrderPaymentRefusalCode`; map code → status at the door.

3. **Persistence** — SQL repositories mirroring the two memory refusals, which
   are load-bearing stand-ins, not defensive code:
   - unique index on `request_id` (makes `open` idempotent under a double click);
   - optimistic-concurrency `WHERE revision = $expected` on update;
   - unique index on `settlement_unique_key`.
   Additive tables only (`assisted_order_payments`, `_proofs`, `_events`).
   EXPAND → MIGRATE → DARK DEPLOY (off) → SMOKE LIVE → ENABLE → SMOKE NEW.

4. **UI mount** — `client/src/research/payments/` is a new unowned directory.
   Mount `AssistedPaymentStatus` on the customer request-status route and
   `AssistedRequestConversionPanel` in the adminx IA. Both are pure
   presentational; the data adapters are the next slice.

**Quantity seam.** `adjudicateAssistedRequestConversion` takes
`maxQuantityPerVariant` as an INJECTED parameter rather than importing the
constant, so this lane follows the lead's canonical quantity authority when
`EARLY_ACCESS_MAX_QUANTITY` moves 50 → 100. Pass the canonical constant at the
composition root. Tests pin 100-accepted / 101-refused against an explicit 100.

**Affiliate seam.** The gate copies `affiliateCode` onto the order exactly as the
affiliate lane stored it — never normalized here, never allowed to influence
price, access, payment or ownership. Session 6 (affiliate) owns normalization.

---

## OWNERSHIP NOTES FOR THE LEAD

### `server/research/orders/**` — RESOLVED, no conflict

At the start of this lane the `CANONICAL-ORDER-HISTORY` lease was `active` for
`claude-fable-s7` but dormant (last heartbeat 2026-08-19T21:48Z), with its
`server/research/orders/**` + `shared/research/orders/**` scaffold living only
as untracked files in `C:/xenios-wt/canonical-order`. This lane **copied** it —
never moved, never edited — into commit 169440d so it was durable and so the
conversion gate could build on the existing order engine rather than inventing a
second one. That worktree was not touched.

**s7 then woke and pushed** at
`cb601c74fc75f6a49ba0916daea7403842472047` on
`fable/canonical-order-history-20260819` (handoff
`2026-08-20T14-15-38-461Z-CANONICAL-ORDER-HISTORY-claude-fable-s7.md`).

Checked, and the outcome is clean:

```
git diff --stat 169440d cb601c7 -- server/research/orders shared/research/orders
  (empty — byte-identical)
```

- The seven files commit 169440d carries are **byte-identical** to s7's, so the
  overlap merges as identical content. Nothing to reconcile, nothing to drop.
- s7's branch additionally carries six files this lane never touched —
  `client/src/research/orders/**` (5) and
  `docs/research-launch/INTEGRATION-LANE-CANONICAL-ORDER.md`. Those are theirs.
- s7 branched from `5bb3fa9`, which is **not** a descendant of the integration
  SHA, so this lane was NOT rebased onto their branch — that would have pulled
  it off the integration base. This lane stays on `8dabe22` and stays
  self-contained and testable standalone.
- **Lead action:** take s7's `cb601c7` as the authority for the orders lane.
  Commit 169440d then contributes nothing and can be dropped or merged
  indifferently; either way the tree is the same. s7 remains the writer for
  `server/research/orders/**` and `client/src/research/orders/**`; this lane
  imports that module and never edits it.
- `claude-fable-s3` holds an active lease on `shared/research/assisted-order/**`
  and `client/src/research/assisted-order/**`. This lane added only NEW files in
  the first glob and used a NEW directory outside the second, and edited no
  existing file in either. No conflict expected.
- Codex 5 is currently assigned as QA/validator for this lane. This branch is
  the exact SHA for it to review.
- No lease was force-claimed. The session is registered as
  `claude-fable-s6-quote-payment`.

---

## KNOWN RISKS

1. **The verification grant is only as real as its wiring.** The whole "a
   browser cannot buy its way to paid" guarantee rests on
   `verification.verifierFor` reflecting a real, narrow role. Wiring it to
   "any admin" silently removes the control.
2. **No SQL yet.** The memory repositories enforce the constraints the durable
   store must enforce; if the SQL implementation is laxer, tests pass on a
   guarantee production does not make.
3. **Two order-lane payment vocabularies now coexist, on purpose.** The
   canonical order carries `awaiting_payment | paid` — the right answer to
   "has my money arrived". This lane's eight states are the *lifecycle* that
   produces that answer. They must not be merged: collapsing them would put
   `proof_submitted` on an order record, where some surface would eventually
   read it as settlement. The bridge is one function,
   `isSettledPaymentState`, and the conversion gate is the only caller that
   maps across.
4. **`exception` is deliberately roomy.** It can move to `paid`, `rejected`,
   `refunded` or back to instructions, because a real discrepancy resolves in
   several legitimate directions. Every such exit is still actor-gated, and
   reaching `paid` from it still needs the grant.
5. The two unpriced catalog rows (BAM15 500 mcg, Syringes & Alcohol Swabs)
   cannot reach a quote, a payment or an order — they refuse at three layers.
   That is intended, and is the "never $0" rule.

---

## NEXT UNBLOCKED CODE ACTION

SQL repositories for `assisted_order_payments` (+ proofs, events) with the three
indexes above, as additive migration candidates for the lead's DAG — no
production application. Then the HTTP door snippets for the lead to mount.
