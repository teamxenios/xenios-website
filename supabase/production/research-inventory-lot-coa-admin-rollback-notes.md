# Research inventory, lot, and exact-lot COA rollback

## Release identity

- Accepted domain source: `69b71ee4e683c65bc42ac0435b4650a3e8382210`
- Pre-release production code: `8efcd9fc9e4f33be84e5b9271aa83b5122788bdf`
- Accepted source SQL raw Git-blob SHA-256:
  `f58ebeea6b75a6d28dd22c287cfdd384169a34f50104012f9dd953cc53559ae6`
- Managed migration candidate:
  `20260727120000_research_inventory_lot_coa_admin.sql`
- Managed migration canonical Git-blob SHA-256:
  `65a98ccdb43c4adb541d0e21c1cc54b7bfb618755dc37f679414e3dba7a48524`
- Integration, merge, deployed, Render, and managed-application identities
  are recorded only after Website 6 accepts the exact integration candidate.

## Routine recovery

The migration is additive and idempotent. If application is interrupted,
re-run the exact reviewed managed migration and then run the read-only
`supabase/verify-research-inventory-lot-coa-admin.sql` verifier. Do not edit
the migration, relax grants, or create a parallel inventory model.

If the application release regresses, restore the exact pre-release Render
deployment while retaining the inert additive schema and append-only history.
The browser has no table or RPC grants; the service role has SELECT only on
the eight Wave 2 tables and EXECUTE only on the twelve reviewed functions.
Checkout remains disabled until the separate atomic reservation contract is
accepted and live.

## Production invariants

- The migration creates no product, variant, inventory, lot, COA, allocation,
  movement, event, role, order, payment, or provider row.
- The COA bucket is private, PDF-only, and limited to 20 MiB.
- Product and variant identity comes from the atomic canonical Product Control
  projection; missing or malformed state fails closed.
- Care remains disabled, isolated, and absent from ordinary navigation.
- Never invoke a mutating inventory or quality RPC merely to test production.

## Destructive rollback

Dropping inventory or quality objects is not a routine rollback. It requires
an explicit destructive-data decision, verified exports, exact count evidence,
and separate review. Never use `CASCADE`. Until that authority exists, retain
the schema and roll back only application wiring.
