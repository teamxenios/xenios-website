# Launch B money-path red team

Frozen Buyer candidate: `54b94bb406f287900c503b8c3b7135b775721a34`

Scope: Launch B only. No route was mounted, no SQL was executed, and no production state was read or changed.

## Executable evidence

`server/research/buyer-commerce/launch-b-money-path.redteam.test.ts` is an
uncommitted, deliberately failing test packet. Running it against the frozen
tree produces seven failures:

1. two quote ids with one customer `intent_hash` create two checkouts;
2. `orderToHeaderRow` omits `checkout_idempotency_key`;
3. two checkout service instances mint different order ids for one member/key;
4. capture occurs before the caller attempts durable order save;
5. a reservation-audit exception leaves an in-memory idempotent success;
6. a held reservation remains held and stock remains decremented after 31 minutes;
7. Early Access checkout accepts an unexpired quote after exact Product Control authority is removed.

Command:

```text
npm exec vitest -- run server/research/buyer-commerce/launch-b-money-path.redteam.test.ts
```

Observed: `1 failed file; 7 failed tests`. These failures are the evidence, not
a candidate suite regression to commit.

The adjacent established suites remain green: `9 files; 236 tests`.

## Findings and minimum safe repairs

### LB-MONEY-001 — duplicate semantic intent across fresh quotes — confirmed

The existing partial unique index is on `quote_id`. The RPC and in-memory store
also look up only `quote_id`. `intent_hash` excludes `quote_id`, so two fresh
quotes for the same customer, basket, contact, and destination have the same
intent hash and both commit.

Minimum application repair:

- add an active-intent lookup to both the in-memory reference and durable RPC;
- replay only when customer and intent match exactly;
- return a conflict without disclosing the prior order on any ownership/hash
  disagreement;
- preserve the existing same-key and same-quote checks.

Minimum database repair for the present manual-payment Early Access lifecycle:

```sql
create unique index research_ea_cart_checkout_active_intent_uidx
on public.research_early_access_cart_checkouts(customer_ref, intent_hash)
where disposition is null
  and payment_state in ('awaiting_payment', 'under_review');
```

The commit RPC must catch this exact constraint, re-read by
`customer_ref + intent_hash` under the same transaction, and replay the winner.
The partial predicate is important: a permanent uniqueness rule over this
deterministic hash would forbid a legitimate later repeat purchase forever.

### LB-MONEY-002 — immutable checkout idempotency key is not persisted — confirmed

The schema defines `checkout_idempotency_key` and a per-member unique constraint,
and reads consult it, but `OrderHeaderInsert`, `orderToHeaderRow`, and
`headerRowToOrder` do not carry it. Initial checkout currently places the key in
mutable `last_idempotency_key`; an admin/provider transition may replace that
value, after which the original checkout key cannot be found on a fresh process.

Minimum application repair:

- add immutable `checkoutIdempotencyKey` to `OrderRecord`;
- populate it only on checkout creation;
- map it to/from `checkout_idempotency_key` on every round trip;
- never overwrite it during admin/provider/webhook transitions;
- query the dedicated column directly, scoped by member.

Minimum database requirement:

- verify the column exists in the managed migration history;
- enforce `unique (member_id, checkout_idempotency_key)` for non-null keys;
- add an immutable-column trigger or write through a narrowly privileged RPC;
- do not guess a backfill for historical rows whose `last_idempotency_key` may
  already describe an admin/provider action.

### LB-MONEY-003 — cross-instance checkout claim — confirmed

The service's `orders`, `byIdempotencyKey`, and `inFlight` maps are process-local.
The production wrapper checks the durable order projection, but performs no
durable claim when it misses. Two instances can therefore both pass the miss,
mint different order ids, reserve inventory, and enter the provider path.

Minimum production-safe design, reusing `research_orders`:

- add a single transaction RPC that inserts the `checkout_pending` order header,
  lines, shipments, immutable checkout key, and checkout intent hash before any
  provider call;
- serialize on `member_id + checkout_idempotency_key` via the existing unique
  constraint (optionally plus a transaction advisory lock for a clean replay);
- same key + same hash returns the existing order; same key + different hash is
  `idempotency_conflict`; an in-progress owner returns an explicit in-progress
  outcome, never starts a second provider call;
- replace the current multi-statement order `save` for checkout creation with
  this atomic RPC. No second order table is required.

Exact additional database fields required on `research_orders`:

- `checkout_idempotency_key text` (existing schema intent, written at creation);
- `checkout_intent_hash text` with a lowercase 64-hex check;
- an optimistic `version` or equivalent conditional transition token;
- the existing unique `(member_id, checkout_idempotency_key)` must be active.

### LB-MONEY-004 — capture before durable order persistence / post-capture failure — confirmed

`createCheckoutService.submit` authorizes and captures. Only after it returns
does `production-deps.ts` call `orderRepository.save`. A save failure therefore
leaves captured money and finalized inventory with no durable order. A retry on
another instance can mint another order id; provider idempotency may prevent a
second charge, but it cannot recreate the missing order truthfully.

Minimum production-safe ordering:

1. atomically claim and persist the complete `checkout_pending` order;
2. reserve stock atomically and record the reservation ids;
3. authorize with the immutable checkout key;
4. durably transition the order to `payment_authorized` with provider reference;
5. capture;
6. durably transition to `payment_captured` and finalize reservations;
7. return success only from durable state.

Exact recovery requirement:

- a captured provider response followed by DB failure leaves a durable
  `payment_authorized` order with its provider reference;
- a signed webhook or reconciliation worker retrieves provider status and
  idempotently applies `payment_captured`;
- capture and state transitions use stable provider/idempotency identities;
- the retry reads the claimed order instead of creating a new one.

### LB-MONEY-005 — audit/outbox failure — latent canonical-checkout defect; Buyer and Early Access projections disproved

The frozen Buyer request path commits first and uses `Promise.allSettled` for
audit and notification. Early Access cart also commits first, catches audit
failure, and uses a quiet durable-notification projection. Those two alleged
paths do not create a fake success.

However, canonical member checkout puts its new order into process-local maps
before awaiting `reservationAudit.record`. If that optional recorder throws,
the request fails but a retry receives an in-memory `ok: true, idempotent: true`
order that was never persisted or paid. The red-team test reproduces this.
Production currently does not inject `reservationAudit`, so this is latent, but
must be closed before adding a real recorder.

Minimum repair:

- make the durable order state event part of the atomic checkout claim/transition;
- make notification a uniquely keyed durable outbox insert in the same
  transaction when delivery is required;
- external delivery remains asynchronous;
- never make a process-local map the authoritative result after any throwing
  projection; a local test adapter must roll back its map/hold on failure.

### LB-MONEY-006 — 30-minute inventory hold sweeper — confirmed

Reservations store `expires_at`, but the repository exposes no expired-hold
claim and production composes no sweeper. Time passing alone leaves the hold in
`held` and keeps lot quantity decremented.

Minimum application repair:

- add `releaseExpired(asOf, limit)` as one durable operation, not a loop of the
  current multi-statement TypeScript `release`;
- run it from a bounded worker and an authenticated admin drain;
- expose metrics for claimed, released, already-settled, malformed, and failed;
- never release finalized reservations or reservations attached to a captured
  order.

Exact database requirement:

- one service-role RPC selects `status='held' and expires_at <= p_now` with
  `for update skip locked`;
- in the same transaction, lock allocation/lot rows, restore each allocation
  exactly once, set reservation status/released time, and append audit evidence;
- conditional status update/row lock is the idempotency guard;
- revoke public/anon/authenticated execution and grant only service role;
- reserve, release, and finalize should also become atomic RPCs because the
  current separate lot adjustment and reservation save can tear on failure.

### LB-MONEY-007 — stale price/Product Control authority — split result

Canonical member checkout is protected: `cart.revalidate(memberId, asOf)` runs
inside every checkout evaluation and rebuilds totals server-side. No client
price is trusted.

The Early Access quote checkout is not protected inside its TTL. It verifies
the stored quote/hash/expiry but has no catalog, Product Control, release, or
price authority port. The red-team test removes exact authority after quote and
checkout still returns 201.

Minimum repair if the Early Access quote checkout remains reachable in Launch B:

- inject the canonical catalog/Product Control/release authority into checkout;
- re-resolve every exact variant and current price immediately before commit;
- on any price, availability, legal, release, or quantity-authority change,
  refuse with `QUOTE_CHANGED` and require a fresh quote;
- do not silently honor stale authority merely because the quote TTL remains.

No new database object is required for the authority read itself; the durable
checkout RPC must accept only the server-revalidated snapshot/hash.

### Retry and double-click summary

- same process, same member/key: protected by `inFlight`;
- Early Access, same quote with fresh keys: protected by active-quote uniqueness;
- same key after a successfully persisted order: intended durable replay works;
- two instances before durable claim: not protected;
- fresh quotes with the same Early Access intent hash: not protected;
- retry after capture but before order save: unsafe and not recoverable from the
  current order row because it does not exist.

### LB-MONEY-008 — durable subscription atomicity — database-gated and incomplete

Runtime transition code calls `research_subscription_commit_transition` and
`research_subscription_transition_replay`. The prepared SQL contains row lock,
expected-version comparison, event idempotency hash, intent hash, replay
snapshot, a partial unique index, Q1-Q50 check, and service-role-only execution.
That SQL is untracked in this worktree, was rejected from Buyer ownership, and
has not been applied or independently database-QA'd. Launch B cannot claim
durable subscription OCC until the DB/security owner adopts an approved managed
migration.

Exact transition DB requirements:

- `research_product_subscriptions.version >= 1` and quantity `between 1 and 50`;
- event columns `resulting_version`, `idempotency_key_hash`, `intent_hash`, and
  `result_snapshot`;
- unique `(subscription_id, idempotency_key_hash)` where the hash is non-null;
- `for update` on the owned subscription row;
- one transaction updates the header and inserts the append-only event;
- replay returns the stored snapshot; payload mismatch returns
  `idempotency_conflict`; version/state mismatch returns `stale_version`;
- fixed safe search path, public/anon/authenticated revoked, service-role execute
  only, managed migration DAG/checksum, PG16/17 apply-twice and race evidence.

Subscription creation remains a separate gap: the create request carries no
idempotency key and calls a plain header `save`. Before enablement, creation must
receive a required idempotency key and intent hash and use an atomic create RPC
with unique `(member_id, creation_idempotency_key_hash)`, replay/conflict
semantics, and an initial append-only event. The prepared transition SQL alone
does not close duplicate subscription creation.

## P0 activation gate

Do not enable cart or subscriptions until LB-MONEY-001 through 004, 006, the
reachable half of 007, and 008 have accepted application and database evidence.
LB-MONEY-005 must be fixed before wiring a throwing reservation audit adapter.

