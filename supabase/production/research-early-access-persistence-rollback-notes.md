# Rollback notes: Early Access durable persistence (migrations 50, 51, 52)

Covers the three additive Early Access persistence migrations:

- `supabase/migrations/20260804120000_research_early_access_identity_persistence.sql`
- `supabase/migrations/20260804121000_research_early_access_commerce_persistence.sql`
- `supabase/migrations/20260804122000_research_early_access_supplier_operations.sql`

## Strategy: retain-and-disable, forward repair

All three migrations are strictly additive: new tables, new indexes, new
SECURITY DEFINER functions, new triggers on the new tables only, and one
private storage bucket. They alter no existing table, drop nothing, rewrite
no existing function, and change no existing grant. The correct rollback is
therefore OPERATIONAL, not schema surgery:

1. Set `RESEARCH_EARLY_ACCESS_ENABLED=false` (it is false today). The
   customer routes refuse at the wall, and the composition root
   (`buildEarlyAccessPersistence`) stops mounting the durable repositories
   into anything reachable.
2. Leave the tables in place. They hold at most the facts that were written
   while the feature was live: orders, invoices, money, receipts, and audit
   rows. Money facts are append-only by trigger and MUST NOT be deleted as
   part of any rollback; they are the record of what happened.
3. If a defect in a FUNCTION is the reason for rolling back, repair forward:
   `create or replace function` with the corrected body in a follow-up
   migration. Every function is `security definer` with a pinned
   `search_path`, so replacement is safe and grant-preserving.
4. If the schema itself must be withdrawn before any production application
   has occurred (the current state: `appliedToProduction: false`,
   `managedMigrationId: PENDING`), the compensating action is to drop the
   new objects in reverse dependency order. This is acceptable ONLY while
   the tables have never held production data:

   ```sql
   -- Only while no production data has ever been written.
   drop table if exists public.research_early_access_shipping_regions,
     public.research_early_access_manual_actions,
     public.research_early_access_supplier_confirmations,
     public.research_early_access_admin_exceptions,
     public.research_early_access_releases,
     public.research_early_access_audit_events,
     public.research_early_access_fulfillments,
     public.research_early_access_tracking,
     public.research_early_access_dispatch_events,
     public.research_early_access_commission_events,
     public.research_early_access_outbox,
     public.research_early_access_supplier_orders,
     public.research_early_access_ledger_entries,
     public.research_early_access_receipts,
     public.research_early_access_verifications,
     public.research_early_access_settlements,
     public.research_early_access_proof_objects,
     public.research_early_access_payment_proofs,
     public.research_early_access_reservations,
     public.research_early_access_invoices,
     public.research_early_access_money_snapshots,
     public.research_early_access_order_lines,
     public.research_early_access_placements,
     public.research_early_access_referral_grants,
     public.research_early_access_agreement_acceptances,
     public.research_early_access_session_bindings,
     public.research_early_access_consumed_tokens,
     public.research_early_access_customers cascade;
   ```

   followed by dropping the `research_early_access_*` functions and, if
   desired, the empty `research-ea-payment-proofs-production` bucket. The
   append-only triggers and their trigger functions go with the drops.

## Why this is safe to apply and safe to leave

- Apply-twice is proven on stock PostgreSQL 16 and 17 by
  `scripts/verify-early-access-commerce-migration.sh` (both majors: first
  apply, data written between applies, second apply as a no-op, then the
  full behavioral suite through the real adapters).
- Every table is RLS-enabled AND forced with zero policies, and every table
  privilege is revoked from `public`, `anon`, `authenticated`, and
  `service_role`. An unapplied caller cannot see the tables at all; the only
  access is `grant execute` on the definer functions to `service_role`.
- The application composes these repositories only through
  `buildEarlyAccessPersistence`, which mounts them when Supabase is
  configured and refuses (never falls back to memory) when a production
  process has Early Access enabled without them.

## Evidence

- PostgreSQL 16: `scripts/verify-early-access-commerce-migration.sh 16`,
  2026-08-04, all checks passed (apply twice, data preservation, 15/15
  behavioral tests including exactly-once settlement under concurrency,
  RLS denial for browser roles, append-only money, restart survival).
- PostgreSQL 17: `scripts/verify-early-access-commerce-migration.sh 17`,
  2026-08-04, all checks passed (same suite).
