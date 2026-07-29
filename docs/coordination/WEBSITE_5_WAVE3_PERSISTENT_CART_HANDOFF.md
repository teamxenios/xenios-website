# Website 5 — Wave 3 persistent cart handoff

- Branch: `feature/website-5-wave3-persistent-cart`
- Exact reconstruction base: `2891dcb9ded41e6007f636bf053cd090dcd16111`
- Scope: persistent-cart contract, RPC-only repository, prepared migration, disposable verifier
- Production mutation: none
- Routes/UI/shared registration: none
- Inventory reservation/decrement, checkout, orders, and payment: none

## Security and ownership

- Member identity is supplied only by authenticated server composition.
- Anonymous secrets and idempotency keys are domain-separated SHA-256 hashes
  before the database adapter boundary; raw values are never persisted.
- Four tables force RLS and define no policies.
- Browser roles receive no table or RPC privileges.
- `service_role` receives SELECT-only table access and EXECUTE only on the five
  reviewed command/read RPCs. Direct table mutation is denied.
- Commands and events are append-only and contain only hashed actor scope plus
  redacted results/metadata.

## Command invariants

- Put requires a complete PR84 `CartProductSelection`; SQL revalidates exact
  product commerce/availability, variant/SKU/member eligibility, active
  approved price, approved primary-media identity, the exact four canonical
  display-input versions, and domain readiness before mutation or replay.
- SQL reconstructs the exact current-main catalog inventory fingerprint from
  the exact product, variant, SKU, lot versions, dispositions, update times,
  and `research_lot_is_allocatable(...)` results. It locks the canonical lot,
  COA-document, and quality-test tables in the same ordered selection lock set,
  compares the exact source version and evaluated instant, and requires at
  least one exact lot allocatable both at that evaluated instant and at the
  command instant before put, claim, or protected replay.
- Anonymous carts are retail-only. Non-retail selections carry a
  server-authenticated principal binding; member puts and replays require the
  exact active, billing-current member. Claim revalidates the anonymous source
  as retail-only and cannot promote a member-priced selection.
- Cart selection validation takes fixed-order mutation-conflicting table locks.
  Authoritative product, price, required-input, domain, lot, COA-document, and
  quality-test invalidations always remain available; after invalidation,
  forward mutation, replay, and claim fail closed against the stale saved
  selection.
- Remove is deliberately exposure-reducing and does not depend on a current
  saved selection.
- Claim locks anonymous then member scope, is one-way, checks both optimistic
  versions, rejects stale selections and quantity overflow, and records one
  immutable reconciliation event.
- Expiry is an explicit optimistic, idempotent command.
- This unit never reserves or decrements inventory.
- Cart persistence stores the exact approved Product Control price ID, version,
  authorized audience, amount, currency, and effective window. It has no
  legacy-price or supplier-cost fallback. Immutable order-line capture belongs
  to the downstream checkout/order command seam:
  `server/research/commerce/orders.ts`,
  `server/research/commerce/persistence/orders-store.ts`, and their adjacent
  tests. Those files are outside this lease and remain unchanged.

## Files

The change is limited to the eight paths leased by Website 2. Website 2 owns
migration composition/application, integration, merge, Render deployment, and
production smoke testing.

## Validation

Completed before freeze:

- focused repository tests: 1 file, 11 tests passed
- disposable PostgreSQL 16: migration apply-twice, forced-RLS, grants,
  direct-DML denial, exact audience/principal isolation, exact Product Control
  price-lineage rejection, claim/idempotency, immutable audit, expiry,
  rollback-zero, exact Node/SQL inventory-fingerprint parity, forged-source
  denial, canonical all-unavailable historical-state denial before and after
  later activation, no inventory reservation/decrement, and two repeated cart-first /
  writer-first invalidation races for product, price, required input, domain
  readiness, lot state, COA document, and COA test state; all passed using
  explicit advisory/table-lock barriers with no timing sleeps
- full `npm test -- --maxWorkers=1`: 215 files passed; 3,744 tests passed,
  1 skipped; one unrelated release-control snapshot test timed out while
  probing an older deployed Git tree under low memory, then passed 1/1 in an
  immediate isolated rerun
- `npm run check`: passed
- `npm run build`: passed
- `git diff --check`: passed
- exact allowlist and prohibited-head ancestry: pending final commit proof

The exact frozen SHA and machine-readable release manifest are supplied
out-of-band after commit so the manifest can be SHA-pinned without a
self-referential repository file.
