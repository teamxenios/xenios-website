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

## M66 evidence status (2026-08-13)

The harness EXISTS and is GREEN on both required engines:

- `scripts/verify-m66-quantity-band-fifty.sh 16` -> 31 assertions, 0 failures
- `scripts/verify-m66-quantity-band-fifty.sh 17` -> 31 assertions, 0 failures
- Logs: `docs/evidence/m66-pg16.log`, `docs/evidence/m66-pg17.log`

It proves, by execution rather than assertion: both bands really do read 1..20
before M66 (the blocker is measured); a real seeded cart item at the OLD ceiling
of 20 survives byte-identical; a bare database fails closed with 55000 and leaves
no constraint behind; M66 applies twice at psql exit 0; both bands then read
1..50 under the canonical name with no surviving 1..20 band; a real durable
insert at quantity 50 is ACCEPTED and at 51 is REFUSED by the band BY NAME; every
check constraint outside the two target tables is byte-identical; the public
relation count is unchanged; and no reservation quantity constraint is widened.

Content sha256 of the candidate file: 26439cbc249dc67412f9cdd825f1f0fe37cd3063fc2d0b2ff44c7cd23c21eee0

REMAINING to promote (a short, mechanical morning step):
  1. `git mv supabase/candidates/2026081312...sql supabase/migrations/`
  2. Commit, so the file exists at a real sourceSha.
  3. Add the DAG node with that sourceSha and the checksum above, and the
     MIGRATIONS.md ledger row citing the two logs.
  4. Re-run `server/release-control-plane.test.ts` (it enforces directory,
     ledger and DAG agreement) and the full suite.
The DAG checksum is keyed to a sourceSha at which the file must already exist,
so steps 1-2 must precede step 3. That ordering is the only reason this was not
completed in the same pass.
