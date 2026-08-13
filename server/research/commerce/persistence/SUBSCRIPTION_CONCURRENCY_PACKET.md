# Subscription concurrency hardening packet

Status: `IMPLEMENTED_CANDIDATE`, `NOT_APPLIED`, and `REBASE_OR_RECREATE_REQUIRED`.

The canonical service and Supabase repository now consume the adjacent
`AtomicSubscriptionTransitionPort`. The migration candidate is
`supabase/migrations/20260813080000_research_subscription_atomic_transitions.sql`.
It has not been executed against any database and must remain inactive until
migration/release ownership and independent database QA accept it.

- the DTO carries the observed subscription `version`;
- member actions carry `expectedVersion` and a cryptographically strong
  `idempotencyKey`;
- one server-only database function owns row locking, compare-and-set, header
  mutation, event append, result persistence, and exact replay;
- the service no longer composes a state transition from separate durable
  `save` and `appendEvent` calls.

## Candidate durable primitive

The candidate function `research_subscription_commit_transition` performs the
following in one transaction:

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

The companion `research_subscription_transition_replay` supports exact
post-success replay without mutating state. Both functions are revoked from
browser roles and granted only to `service_role`. Rollout verification and any
application of the migration still belong to migration/release owners.

## API behavior

Each browser mutation carries both values. The contract keeps them optional at
the shared type boundary for established internal callers, but the service
requires both-or-neither and the member UI always supplies both. Legacy internal
commands receive a deterministic semantic key and the version just read. A key
alone cannot resolve conflicting concurrency; a version alone cannot replay an
uncertain successful response.

No in-process mutex or generic idempotency wrapper is used. The in-memory
repository is an executable semantic harness; durable atomicity comes only from
the database transaction function.

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

The durable adapter and migration have static/mocked coverage. Real-database
multi-client concurrency, rollback, grant, and RLS verification remain a human
gate before migration application or route activation.
