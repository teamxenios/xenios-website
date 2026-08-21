[XENIOS MANUAL ORDER WORKER HANDOFF]

SESSION:   claude-fable-s9-conversion-qa
LANE:      F (E2E / acceptance) — CLOSED
BRANCH:    lane/e2e-conversion-qa-20260819 (pushed)
BASE SHA:  6291242ac4f4 (origin/xenios/launch-integration-20260819)
PUSHED SHA: 12361658c5a2075c57e738103e2ff38d2105b475
PRODUCTION MUTATED: NO

WORK COMPLETED

LANE F is now complete. 45 tests across four files, all green, all inside
`e2e/**`. Nothing outside my lease; service.ts and the pricing source are
untouched in every commit.

The positive path: an eligible RUO peptide through the order form to submit
produces a durable XRR request, exactly one customer notification, exactly one
admin notification, and a reference. Counts are exact, never "at least one".

The negatives, all six the lane asked for:
  - held cannot direct order, and notifies nobody
  - Care/provider cannot become a priced direct order
  - classification-pending keeps the request pathway and carries no price
  - price tampering fails (authority price wins; a mismatch is refused)
  - quantity 101 fails against a maximum of 100
  - affiliate spoof does not become verified attribution

CUSTOMER OUTCOME ENABLED

The intake path is now guarded where it decides money and who gets paid. A
browser cannot set the price, declare itself paid, promote a typed affiliate
code into verified attribution, order a held or pending row, or make you invoice
the same order twice. An unrecognised code is captured rather than refused, so a
typo in an optional box never costs a sale you would have closed by hand.

FILES

  e2e/order-routing-negatives.spec.ts   (new, 6 tests)
  e2e/acceptance-path.spec.ts           (10)
  e2e/launch-invariants.spec.ts         (16)
  e2e/pricing-cache-adversarial.spec.ts (13)
  e2e/harness/assisted-order-door.ts, e2e/vitest.config.ts, e2e/README.md

TESTS

  npx vitest run --config e2e/vitest.config.ts   -> 45/45 pass

Runs standalone, so it cannot redden the default suite. One line folds it in:
add "e2e/**/*.spec.ts" to test.include in vitest.config.ts (snippet in
e2e/README.md).

Mutation-verified rather than trusted. Five mutations, each caught by exactly
the expected test and each reverted immediately:
  authority honours the browser price      -> price-authority test red
  ceiling raised to 1000                   -> quantity test red
  member resolver answers "a" for everyone -> cross-customer test red
  service replay guard disabled            -> both replay tests red
  service reads input.affiliateAttributionRef -> attribution spoof test red

KNOWN BLOCKERS

LANE E (mobile 430/390/375/360/320 on the converged storefront) is unowned and
blocked HERE, not by code: Docker Desktop has stopped on this machine, so the
local Supabase stack will not start, and the converged storefront's All Products
section lazy-loads the full canonical catalog behind the assisted-order bridge,
which needs a live data source. I am deliberately not rendering the legacy 22
Featured page at five widths and calling it a storefront pass. Any session with
a working stack can take it; the target list is in my previous handoff.

INTEGRATION INSTRUCTIONS

Merge or cherry-pick e2e/** from 1236165. No source file outside e2e/ is
touched, so it cannot conflict with an active lane. Your empty-read fix at
15f436b is confirmed working: the pricing suite passes against your real guard
rather than my patch, so that loop is shut and the proposed-fixes patch in
e2e/proposed-fixes/ is now historical.
