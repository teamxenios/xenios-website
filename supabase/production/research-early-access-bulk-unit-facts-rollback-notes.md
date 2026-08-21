# Rollback: research_early_access_bulk_unit_facts (ledger row 76)

Migration `supabase/migrations/20260821170000_research_early_access_bulk_unit_facts.sql`
creates exactly two SECURITY DEFINER read functions and touches nothing else —
no table, index, trigger, type, policy, or row, and no existing function.

## Rollback procedure

```sql
drop function public.research_early_access_active_unit_holds();
drop function public.research_early_access_live_supplier_confirmations(timestamptz);
```

## Why this is safe at any time

The server detects both functions STRUCTURALLY and falls back to the existing
per-unit RPCs (`research_early_access_active_hold_kinds_for_unit`,
`research_early_access_supplier_confirmation_for_unit`) whenever a bulk call
fails — the declared-facts window ladder in
`server/research/early-access/catalog/declared-facts-source.ts`, same
precedent as `MigrationTolerantUnitHoldRegistry` for migration 54. Dropping
the functions therefore returns the catalog projection to the per-unit read
pattern with identical answers (parity pinned in
`server/research/early-access/catalog/declared-facts-bulk-window.test.ts` and
rehearsed on disposable PostgreSQL 17 — see ledger row 76). No data is read
differently, no data is lost, and no deploy is required in either direction.
