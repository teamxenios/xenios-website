# P0 app composition: immutable checkout intent

Status: `ACCEPT_APP_ONLY` / `REBASE_OR_RECREATE_REQUIRED`

This is an isolated application candidate. It is not release, deployment, database,
or production authority.

## Exact lineage

- Explicitly override-accepted catalog base: `e7bc0b691ed813b5ce024f0026e8ab5ba64d74f4`
- Narrow Early Access intent source: `b0e9d537c93d043c9d3acc4851cb3c85ba70b95f`
- Its conflict-free isolated application commit: `79f1e89d165edaa3a3fbcc4972567ce696e76e70`
- Narrow durable-key source: `84fdd2397018e767a81276d3fdc529189d7b89aa`
- Frozen two-source composition: `766b037a81da84728ad535f19ed3e9da3fb1229b`
- Corrective application commit: `4d96331587a0b6b9f08751b069eb0af2d518e0ca`
- Branch: `codex/p0-app-composition-e7-20260813`
- Worktree: `C:\xenios-wt\p0-app-composition-e7`

Each listed application commit is a direct child of the preceding commit. No broad
merge of either stale source ancestry occurred.

## Candidate behavior

- Canonical checkout intent is a SHA-256 digest of the member, normalized address,
  shipping service, credit request, agreement set, attestation, and the server-
  revalidated cart lines, shipment groups, and totals. No client-supplied money or
  payment-method token is part of the digest.
- A settled in-memory key revalidates the cart and refuses a changed intent.
- Concurrent same-key requests with different normalized request intent refuse.
- Durable replay searches the immutable checkout key only. The mutable last-key
  fallback applies only to legacy rows whose immutable checkout key is null.
- Multiple replay candidates refuse as `idempotency_conflict`.
- A non-legacy row with a null/mismatched intent hash refuses closed.
- Both in-memory and Supabase adapters refuse replacement of the original checkout
  key or intent hash.
- The hash uses reserved internal `review_triggers` metadata because this application
  packet is prohibited from adding SQL. Domain reads and the direct admin-queue
  projection strip that marker; malformed or multiple markers refuse closed.
- Stale acceptance prose describing a possible restarted duplicate row is removed.
- On a durable hit, ambiguity, or hash conflict, the production composition returns
  before checkout service/provider execution. On a durable miss it proceeds to the
  provider and only then saves, so this packet expressly does **not** claim atomic
  cross-instance first-settlement authority.

## Exact application allowlist over the accepted base

- `server/research/early-access/cart/cart-settlement-adversarial.test.ts`
- `server/research/early-access/cart/checkout-service.ts`
- `server/research/early-access/cart/intent-uniqueness.test.ts`
- `server/research/early-access/cart/ports.ts`
- `server/research/early-access/cart/store.ts`
- `server/research/early-access/cart/supabase-store.ts`
- `server/research/commerce/acceptance.test.ts`
- `server/research/commerce/checkout.test.ts`
- `server/research/commerce/checkout.ts`
- `server/research/commerce/orders.test.ts`
- `server/research/commerce/orders.ts`
- `server/research/commerce/persistence/admin-queues-store.test.ts`
- `server/research/commerce/persistence/admin-queues-store.ts`
- `server/research/commerce/persistence/orders-store.test.ts`
- `server/research/commerce/persistence/orders-store.ts`
- `server/research/commerce/production-deps.ts`
- `server/research/commerce/production-wiring.test.ts`
- This handoff only.

No auth/account, protected composition root, route registration, catalog data,
migration, grant, RLS, provider implementation, or deployment file is included.

## Focused evidence

Command:

`node node_modules\vitest\vitest.mjs run server/research/early-access/cart/intent-uniqueness.test.ts server/research/commerce/checkout.test.ts server/research/commerce/orders.test.ts server/research/commerce/persistence/orders-store.test.ts server/research/commerce/persistence/admin-queues-store.test.ts server/research/commerce/production-wiring.test.ts --reporter=dot --pool=threads --maxWorkers=2 --no-file-parallelism`

Result: `6 files passed; 202 tests passed`.

Command:

`node node_modules\vitest\vitest.mjs run server/research/early-access/cart/quantity-band.test.ts server/research/commerce/cart.test.ts --reporter=dot --pool=threads --maxWorkers=2 --no-file-parallelism`

Result: `2 files passed; 62 tests passed`. Quantity 1 through 50 remains ordinary;
51 remains refused.

The strict post-commit self-audit reran all eight files in one invocation against
exact code commit `4d96331587a0b6b9f08751b069eb0af2d518e0ca`: `8 files passed;
264 tests passed`. The changed-intent restart test proves the payment provider is
not called on the durable conflict path.

A later independent integration check found that this repository's compiler target
does not allow spread iteration over `Set`. The mechanical `Array.from(new Set(...))`
successor preserves the normalized agreement-set semantics. After that correction,
the checkout and production-wiring suites passed `110/110`, and `npm run check`
passed against the clean successor tree.

`git diff --check` passed. The worktree was clean after the corrective commit.

Accepted-base catalog artifact remains SHA-256
`115ba4065ec3572ed05f71371c1fccb2860c491c2d115f1a3750935a4c08a572`, with its
embedded truthful counts unchanged: 420 items, 418 priced, 2 price-pending.

## Required conditions before any release

1. Keep this candidate `REBASE_OR_RECREATE_REQUIRED` until
   `FINAL_EA_FAST_FOLLOW_BASE` exists.
2. Independently review and provide database/security authority for atomic durable
   intent claiming. The Early Access Supabase RPC packet does not yet prove the
   new `intent_has_active_checkout` rule atomically, and canonical commerce still
   has a cross-instance lookup-then-settlement race even though the database's
   member/key uniqueness constraint prevents two durable rows.
3. Decide in that DB/security review whether to replace the application-only
   `review_triggers` metadata transport with a dedicated immutable intent column.
   No schema claim is made here.
4. Re-run focused tests after the final-base recreation and independently inspect
   overlap with the canonical orders/payments/fulfillment owner.

No SQL was executed or authored. No provider, deployment, tag, Docker, production,
Legal, RLS, grant, Founder Binding, signature, attestation, Proof Door, or release-
authority action occurred. Production mutated by scheduler: `NO`.

## Strict verdict

`ACCEPT_APP_ONLY` for final-base recreation and independent DB/security follow-up.
`REJECT_RELEASE_READY` until the atomic durable intent-claim condition above is
satisfied. No concrete application defect was found in the exact committed scope.
