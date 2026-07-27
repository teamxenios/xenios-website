# Website 5 — Wave 3 persistent cart handoff

- Branch: `feature/website-5-wave3-persistent-cart`
- Exact base: `64cceb82f72170004525d5c78dc49ea7b77fdf6b`
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
  product, variant, SKU, active approved price, required-input versions, and
  domain readiness versions before mutation or replay.
- Remove is deliberately exposure-reducing and does not depend on a current
  saved selection.
- Claim locks anonymous then member scope, is one-way, checks both optimistic
  versions, rejects stale selections and quantity overflow, and records one
  immutable reconciliation event.
- Expiry is an explicit optimistic, idempotent command.
- This unit never reserves or decrements inventory.

## Files

The change is limited to the eight paths leased by Website 2. Website 2 owns
migration composition/application, integration, merge, Render deployment, and
production smoke testing.

## Validation

Required before freeze:

- focused repository tests
- disposable PostgreSQL 16 apply-twice, forced-RLS, grants, direct-DML denial,
  concurrency/claim/idempotency, immutable audit, expiry, and rollback-zero
- full `npm test`
- `npm run check`
- `npm run build`
- `git diff --check`
- exact allowlist and clean worktree

The exact frozen SHA and machine-readable release manifest are supplied
out-of-band after commit so the manifest can be SHA-pinned without a
self-referential repository file.
