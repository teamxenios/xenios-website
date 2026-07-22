# Track B migration: rollback and recovery notes

## Scope

This applies ONLY commerce (migrations 20-26 plus the Track B additions). It
runs AFTER migrations 1-8 (already RUN in production) and AFTER Track A
(`research-track-a-private-platform.sql`, migrations 9-19, the member
platform). Nothing in this bundle touches a health-program or tracker table.

Tables created (47): the 44 commerce tables of migrations 20-26 (catalog 7,
inventory lots 5, orders/carts/claims 8, subscriptions 2, fulfillment 5,
partners/attribution/organizations 13, ledgers/payouts 4), plus
`research_idempotency_keys`, `research_order_shipments`, and
`research_admin_queue_items`.

Columns added to existing Track B tables: `research_orders` gains
`approved_by`, `approved_at`, `cancellation_reason`,
`authorization_release_failed`; `research_claims` gains `notes`;
`research_commission_ledger` gains `kind`; `research_product_subscriptions`
gains `price_version` and `shipping_address_ref`;
`research_store_credit_ledger` gains `expires_at`. All nullable, all read
defensively by the stores (null reads back as the pre-migration default).

Triggers installed (4): append-only enforcement on
`research_commission_ledger`, `research_store_credit_ledger`,
`research_order_state_events`, and `research_subscription_events`. UPDATE and
DELETE on those tables raise; corrections are new rows.

## Additive only

The bundle contains NO destructive DDL: no `drop table`, no `truncate`, no
`delete from`, no dropped column. The only `drop` statements are
`drop trigger if exists` immediately followed by `create trigger` (the
standard idempotent trigger pattern, identical to migration 26's own usage).
A failed or partial apply therefore leaves all existing data intact.

## RLS posture (correct as-is)

Every table is RLS-enabled with zero policies. The server reaches these
tables only through the Supabase SERVICE ROLE, which bypasses RLS. No
browser, anon, or authenticated client role has database credentials or a
policy, so a leaked client token can read/write nothing. A public policy
would be a REGRESSION. Tenant isolation lives in the server (every query
scoped by the authenticated member id from the guard, or by the partner
resolved FROM the authenticated member, never from a request body).

## Inert until flagged on

Applying this schema enables nothing. Every commerce table sits inert until:

- the commerce flag (default false) is turned on,
- per-SKU purchase eligibility passes (currently 0 of 15),
- a payment processor is approved and the provider layer is wired,
- and, for partners and payouts, the affiliate flags and payout provider
  (which defaults to `disabled`) are enabled.

The persistence stores resolve to in-memory doubles whenever Supabase is not
configured, and the queue store treats a missing `research_admin_queue_items`
table as an empty queue, so deploy order carries no hazard in either
direction.

## Rollback

- Idempotent re-apply is the primary recovery: every statement is
  `create ... if not exists` / `add column if not exists` (or the
  drop-and-recreate trigger pair), so re-running after a partial apply
  completes it. This was proven live in the dry run
  (`docs/research-launch/TRACK_B_MIGRATION_DRY_RUN_REPORT.md`): the bundle
  applied twice with zero errors.
- Code rollback is independent of schema: reverting the merge and redeploying
  the prior SHA needs no schema change, because the server reads every new
  table and column defensively.
- A true teardown (dropping the 47 tables and the added columns) is a manual,
  reviewed decision, never a routine rollback. It would involve, in reverse
  dependency order: dropping the four append-only triggers, the child tables
  (facts, lines, events, shipments, agreements, training, attempts), then
  the parent tables, then removing the added columns from the Track B tables
  they extended. The append-only triggers exist precisely to make casual
  deletion fail, so a teardown must drop the triggers first, which is a
  deliberate two-step decision. Do not do any of this as part of a deploy;
  an unused new table is inert and safe to leave in place.

## What this does NOT do

- Does NOT apply or modify Track A (9-19) or the base schema (1-8).
- Does NOT enable any capability, flag, or provider.
- Does NOT touch secrets, RLS policies, or existing data. The bundle contains
  zero `update` and zero `insert` statements against existing tables.
