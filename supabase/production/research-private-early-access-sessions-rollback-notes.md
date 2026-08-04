# Private Early Access session durability rollback notes

Status: **PENDING / UNAPPLIED**

These notes describe a separately reviewed compensating rollback. They do not
authorize execution, contain credentials, or make an inline destructive rollback
part of the forward migration.

## What the migration adds

- `public.research_private_early_access_sessions`, containing opaque-session
  hashes, exact owner/role binding, database-authored expiry, and revocation.
- `public.research_private_early_access_nonces`, containing hash-only one-time
  grant nonces and the session hash created by their atomic exchange.
- Four fixed-search-path `SECURITY DEFINER` functions: nonce registration,
  atomic nonce-to-session exchange, active-session verification, and revocation.
- Forced RLS with zero policies, zero direct application-role table grants, and
  service-role execute only on those four narrow functions.

There is no standalone session-create function. The migration creates no user,
product, price, order, payment, provider, notification, Care, inventory, or
fulfillment row and mounts no application route.

## Preferred recovery

Forward repair is preferred after any production use. Session and nonce rows are
security evidence; dropping them could erase revocation or replay history. First
disable/unmount every consumer, revoke affected sessions, and deploy a reviewed
corrective migration.

## Preconditions for destructive removal

Website 2 must record explicit protected approval and independently verify:

1. Every early-access route and background consumer is disabled.
2. No request can issue, exchange, verify, or revoke an early-access session.
3. Both tables contain zero rows, confirmed by aggregate counts only.
4. No routine, trigger, view, policy, or foreign key depends on either table or
   any of the four functions.
5. The applied managed-migration ID and exact deployed Git SHA are recorded.
6. A current backup/recovery point exists under the approved Supabase process.

If either table contains a row, stop. Retain the schema through absolute expiry
and revocation and use forward repair.

## Separately reviewed compensating migration order

One explicit transaction must:

1. Revoke execute on all four functions from `PUBLIC`, `anon`,
   `authenticated`, and `service_role` where those roles exist.
2. Lock both tables against concurrent writes and abort unless both row counts
   are zero.
3. Drop exact functions in this order:
   - `research_private_early_access_revoke_session(text,uuid,text)`
   - `research_private_early_access_session_active(text,uuid,text)`
   - `research_private_early_access_exchange_nonce(text,text,uuid,text)`
   - `research_private_early_access_issue_nonce(text,uuid,text)`
4. Drop `public.research_private_early_access_nonces` before
   `public.research_private_early_access_sessions` because of the foreign key.
5. Verify all exact functions, tables, and feature indexes are absent before
   commit. No unrelated object may change.

Never rewrite the production migration ledger. Register the compensating
migration append-only and preserve the original applied history.

## Disposable verification

In disposable PostgreSQL 16 and 17 only, test absent, full, and deliberately
partial installations; test the zero-row drop order; then cleanly apply the
original migration twice. This disposable exercise is evidence, not production
rollback authorization.
