# Subscription concurrency hardening packet

Status: `HUMAN_GATED` and `REBASE_OR_RECREATE_REQUIRED`.

This packet intentionally contains no SQL and is not wired into the runtime.
The current durable repository cannot honestly implement the adjacent
`AtomicSubscriptionTransitionPort` contract:

- `research_product_subscriptions` has no version column;
- `research_subscription_events` has no resulting version, idempotency key, or
  intent hash;
- `SubscriptionActionRequest` has no `expectedVersion` or `idempotencyKey`;
- the Supabase repository upserts the header and inserts the event in separate
  calls, so failure between them is not atomic;
- the generic idempotency table cannot make those independent writes share its
  transaction.

## Required owner-authorized durable primitive

The migration/integration owner must supply one server-only database function
(proposed name: `research_subscription_commit_transition`) that performs all of
the following in one transaction:

1. Resolve the subscription under the authenticated member scope without
   revealing foreign ownership.
2. Lock the header row and compare `expectedVersion` and `fromState`.
3. Scope a unique idempotency key to member plus subscription, compare the
   stored intent hash, replay the stored result for an identical command, and
   refuse a different intent as `idempotency_conflict`.
4. Update the header with `version = version + 1` using compare-and-set.
5. Append exactly one event containing the resulting version and command
   identity.
6. Persist the replay result in the same transaction.
7. Roll back header, event, and command reservation together on any failure so
   the same command remains retryable.

Required schema ownership includes a header version and durable command/event
identity. Exact DDL, grants, RLS, function security, and rollout verification
belong to the migration/release owners and are deliberately absent here.

## API and integration dependencies

The API owner must version the action contract so each mutation carries a
cryptographically strong `idempotencyKey` and the DTO version the member last
observed as `expectedVersion`. A key alone prevents an identical duplicate but
does not resolve two different commands racing on the same state; a version
alone stops the second write but cannot replay an uncertain successful result.
Both are required.

Only after the database primitive exists may the canonical subscription service
replace `save` plus `appendEvent` with `commitTransition`. Do not add an
in-process mutex, reuse the generic idempotency store around two writes, or label
two sequential Supabase calls atomic.

## Required acceptance evidence

The executable contract test covers:

- concurrent identical replay: two successful responses, one marked replay,
  one version increment, one event;
- conflicting concurrency: one commit and one `stale_version`;
- same-key/different-intent conflict;
- stale expected version;
- injected atomic failure with no header/event/key residue and successful retry;
- ownership isolation;
- quantities 1, 20, 21, 49, and 50 accepted and 51 refused.

The eventual durable adapter must rerun these cases against the real database
function, plus grants/RLS verification and multi-client concurrency tests,
before the service or route may be wired.
