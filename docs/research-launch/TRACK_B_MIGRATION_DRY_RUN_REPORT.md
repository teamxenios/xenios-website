# Track B migration dry-run report (live scratch Postgres)

A LIVE apply of the Track B commerce bundle
(`supabase/production/research-track-b-commerce.sql`) against a throwaway
PostgreSQL 16 Docker container, replicating and extending the method of
`MIGRATION_DRY_RUN_REPORT.md`. No real or remote database was touched; the
only connection was the localhost container the run creates and deletes.

Run date: 2026-07-22. Runner: `node scripts/track-b-dryrun.mjs`
(reproducible; exits non-zero if any proof point fails). Result: 32/32 proof
points passed.

## Prerequisite chain (replicated from the prior dry run)

Applied in order, each with `ON_ERROR_STOP=1`, all PASS:

1. Base migrations 1-8 (already RUN in production): `supabase/schema.sql`,
   `research-membership.sql`, `research-notification-outbox.sql`,
   `research-members.sql`, `research-referrals.sql`,
   `research-referrals-seed.sql`, `research-consent-covenant.sql`,
   `research-referral-fraud.sql`.
2. Track A: `supabase/production/research-track-a-private-platform.sql`
   (migrations 9-19, the member platform).
3. Track B: `supabase/production/research-track-b-commerce.sql` (this bundle).

No prerequisite surprises: the chain needed exactly base 1-8 then Track A.
Track B references nothing outside itself except `research_orders` (its own
migration 22) for the fidelity child table, so Track A supplies only the
shared base (`research_members` exists before commerce, matching production).

## Bundle contents (what was applied)

| Section | Source | Tables |
| --- | --- | --- |
| Migrations 20-26, verbatim | `supabase/production/research-full-production.sql` (post-19 sections) | 44 |
| research_idempotency_keys | `supabase/research-idempotency-keys.sql` | 1 |
| Schema fidelity (order approval/cancellation columns, shipments child table, claim notes, settlement partial unique, commission kind) | `supabase/research-track-b-fidelity.sql` | 1 |
| Completion 1: `research_admin_queue_items` | gap named in `admin-queues-store.ts` | 1 |
| Completion 2: subscription `price_version` + `shipping_address_ref` | gap named in `subscriptions-store.ts` | 0 (columns) |
| Completion 3: store-credit `expires_at` | gap 1 named in `store-credit-store.ts` | 0 (column) |
| Completion 4: append-only triggers on the two state-event trails | see note below | 0 (2 triggers) |

47 tables total. Zero health-program or tracker tables (those are Track A,
already merged; this bundle is commerce only).

NOTE ON COMPLETION 4: migration 26 trigger-enforces append-only on the two
MONEY ledgers only; the order state-event and subscription-event trails were
append-only by store convention alone. Because this dry run must prove the
state-event ledgers physically reject mutation, the bundle extends migration
26's `research_ledger_is_append_only()` to both trails. The stores wire no
update or delete path to either table (verified in `orders-store.ts` and
`subscriptions-store.ts`), so no application behavior changes. This is the
one addition beyond the four listed assembly inputs; drop that section if it
is not wanted.

## Proof points

| # | Proof | Result |
| --- | --- | --- |
| 1 | First application of the Track B bundle succeeds (`ON_ERROR_STOP=1`) | PASS |
| 2 | Second application succeeds unchanged (idempotent re-run, the primary recovery path) | PASS |
| 3 | All 47 expected tables exist | PASS |
| 4 | RLS enabled on all 47 (and on all 72 `research_*` tables in the database) | PASS |
| 5 | Zero policies on any `research_*` table (service-role-only posture) | PASS |
| 6 | Append-only ledgers reject UPDATE and DELETE (commission, store credit, order state events, subscription events; 8 rejections captured live) | PASS |
| 7 | Idempotency unique (scope, key) rejects a duplicate | PASS |
| 8 | Over-capture row (captured > authorized) rejected by check constraint | PASS |
| 9 | Over-refund row (refunded > captured) rejected by check constraint | PASS |
| 10 | Duplicate (member, checkout idempotency key) order rejected | PASS |
| 11 | Replayed provider webhook (provider, event id) rejected | PASS |
| 12 | Second live commission accrual for one order rejected (partial unique) | PASS |
| 13 | Second settlement of one store-credit entry rejected (partial unique) | PASS |
| 14 | No destructive DDL in the bundle (static scan) | PASS |
| 15 | `research-track-b-verification.sql` runs clean (zero FAIL rows) | PASS |

## Captured psql output (excerpts, verbatim)

Posture after the double apply (72 = the 69 tables of the prior full dry run
plus the 3 new Track B tables):

```
 research_tables | rls_enabled | rls_disabled
-----------------+-------------+--------------
              72 |          72 |            0

 research_policies
-------------------
                 0

                tgname                 |           relname
----------------------------------------+------------------------------
 research_commission_ledger_no_update   | research_commission_ledger
 research_order_state_events_no_update  | research_order_state_events
 research_store_credit_ledger_no_update | research_store_credit_ledger
 research_subscription_events_no_update | research_subscription_events
(4 rows)
```

Append-only enforcement, run for real (one of the 8 captured rejections;
UPDATE and DELETE were both attempted on all four tables):

```
ERROR:  ledger research_commission_ledger is append only. Record a new row that references the original instead of UPDATE on row 00000000-0000-0000-0000-00000000c001.
CONTEXT:  PL/pgSQL function research_ledger_is_append_only() line 3 at RAISE
```

```
ERROR:  ledger research_order_state_events is append only. Record a new row that references the original instead of DELETE on row 00000000-0000-0000-0000-00000000e001.
CONTEXT:  PL/pgSQL function research_ledger_is_append_only() line 3 at RAISE
```

Idempotency duplicate:

```
ERROR:  duplicate key value violates unique constraint "research_idempotency_keys_scope_key_unique"
DETAIL:  Key (scope, key)=(checkout:member-aaa3, client-key-1) already exists.
```

Over-capture and over-refund:

```
ERROR:  new row for relation "research_orders" violates check constraint "research_orders_capture_within_authorization"
```

```
ERROR:  new row for relation "research_orders" violates check constraint "research_orders_refund_within_capture"
```

Checkout replay, webhook replay, and double accrual:

```
ERROR:  duplicate key value violates unique constraint "research_orders_idempotency_unique"
DETAIL:  Key (member_id, checkout_idempotency_key)=(00000000-0000-0000-0000-00000000aaa6, ck-1) already exists.
```

```
ERROR:  duplicate key value violates unique constraint "research_provider_webhook_events_unique"
DETAIL:  Key (provider_name, event_id)=(testprov, evt_1) already exists.
```

```
ERROR:  duplicate key value violates unique constraint "research_commission_one_live_accrual_per_order"
DETAIL:  Key (order_id)=(00000000-0000-0000-0000-00000000bbb1) already exists.
```

Store-credit settlement: the first settlement row inserted, the second was
rejected by the database, which is the concurrency guarantee the application
check alone could not give:

```
ERROR:  duplicate key value violates unique constraint "research_store_credit_settlement_unique"
DETAIL:  Key (reverses_id)=(00000000-0000-0000-0000-00000000a001) already exists.
```

Verification roll-ups (every FAIL check returned zero rows):

```
 track_b_tables_present | rls_enabled | rls_disabled
------------------------+-------------+--------------
                     47 |          47 |            0

 track_b_tables | append_only_triggers | track_b_policies
----------------+----------------------+------------------
             47 |                    4 |                0
```

## Destructive-DDL proof

The static scan (proof 14, in the runner) matches
`drop table | truncate | delete from | alter table ... drop column |
drop schema | drop index` against the bundle and found ZERO matches. The only
`drop` statements in the bundle are `drop trigger if exists` each immediately
followed by `create trigger`, the same idempotent pattern migration 26 already
uses. The bundle also contains zero `update` and zero `insert` statements, so
it cannot modify existing rows (unlike Track A, whose migration 9 backfills
`billing_state`; that backfill belongs to Track A and ran there).

## What this does not cover

- A schema dry run, not an application-flow test (those are covered by the
  domain-service test suites) and not a substitute for applying the reviewed
  SQL to the production Supabase project, which remains Samuel's action.
- RLS is proven ON and unpoliced; the service-role bypass semantics are only
  meaningful under the Supabase role model, as before.

## Exact apply order for production (Samuel's action, after review)

1. Migrations 1-8: already RUN in production; do not re-run (re-running is
   harmless but unnecessary).
2. Track A: `supabase/production/research-track-a-private-platform.sql`
   (if not already applied), then `research-track-a-verification.sql`.
3. Track B: `supabase/production/research-track-b-commerce.sql`, then
   `research-track-b-verification.sql` (expect: checks 1, 2, 4, 5, 6, 7 zero
   rows; check 3 shows 47 present / 0 rls_disabled; check 8 shows 47 / 4 / 0).

Applying Track B enables nothing: every table is inert until the commerce
flag, per-SKU eligibility, and the provider layer are switched on.

## How to reproduce

```
node scripts/track-b-dryrun.mjs
```

The runner creates container `xenios_trackb_dryrun` (postgres:16, port 5544),
applies the chain, runs every proof, prints each captured error, and removes
the container even on failure.
