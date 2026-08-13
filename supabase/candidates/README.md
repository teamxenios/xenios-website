# Migration candidates

A file here is a migration that has been WRITTEN and REVIEWED but has not yet
earned a place in `supabase/migrations/`.

This repository's release control plane requires every file in
`supabase/migrations/` to be recorded exactly once in the directory, the ledger
(`supabase/MIGRATIONS.md`) and the DAG (`docs/coordination/MIGRATION_DAG.json`).
The ledger entry in turn carries executed evidence: a raw Git-blob SHA-256, a
pinned source SHA, and a real apply-twice harness run on PostgreSQL 16 and 17.

A candidate sits here until that evidence exists. Promoting one means:

1. Write and run its harness (model on `scripts/verify-m65-quantity-band.sh`),
   applying twice on the managed-Supabase shape on PostgreSQL 16 and 17.
2. Move the file into `supabase/migrations/`.
3. Add the ledger row with the real evidence, the DAG node, and rollback notes.
4. Only then is it eligible for a founder-gated production apply.

## Current candidates

- `20260813120000_research_early_access_cart_quantity_band_fifty.sql` (M66)
  Widens the two durable cart quantity CHECK constraints from 1..20 to 1..50 for
  the founder decision of 2026-08-13. Modelled exactly on M65: shape-based
  detection so the `subtotal_cents = unit_price_cents * quantity` identity is
  untouched, idempotent, and refusing to run if the data contradicts the band.
  PENDING: the PostgreSQL 16 and 17 harness run.
