# Website 2 Wave 2 inventory and exact-lot COA integration handoff

## Frozen identities

- Exact production/source base:
  `8efcd9fc9e4f33be84e5b9271aa83b5122788bdf`
- Website 6-accepted PR #80 source:
  `69b71ee4e683c65bc42ac0435b4650a3e8382210`
- Accepted source scope: 17 files, byte-preserved in the integration tree.
- Managed migration canonical Git-blob SHA-256:
  `65a98ccdb43c4adb541d0e21c1cc54b7bfb618755dc37f679414e3dba7a48524`.
- Prohibited PR #80 predecessors remain prohibited and are not ancestors of
  the integration source.
- The exact integration head is the frozen PR head and is also pinned in the
  out-of-band machine-readable release manifest.

## Website 2 integration scope

- Registers the accepted inventory/quality API once, before later fallbacks.
- Applies existing durable prelaunch role guards before repository access.
- Registers `/admin/research/inventory/lots` and
  `/admin/research/inventory/coas` in the Website 2-owned admin route
  assembly, with `/admin/research/inventory` redirecting to the lot surface.
- Adds a service-only, fixed-search-path atomic Product Control
  product/variant/SKU projection. Missing, malformed, inactive, unapproved,
  cross-product, or mismatched state fails closed.
- Copies the accepted SQL unchanged at the start of managed migration
  `20260727120000_research_inventory_lot_coa_admin.sql`, then adds only the
  reviewed projection and the exact private PDF-only 20 MiB bucket posture.
- Adds a read-only production verifier and documented non-destructive
  application rollback.
- Keeps checkout disabled. This release creates no reservation, cart, order,
  payment, provider, Care, product, price, inventory, lot, or COA row.

## Validation

- Focused: 8 files / 43 tests PASS.
- Full: 205 files / 3,669 tests PASS.
- TypeScript: PASS.
- Production build: PASS; existing large-chunk/module advisory only.
- Strict release-control-plane typecheck: PASS.
- Static API route uniqueness: 241 registrations, PASS.
- Migration DAG/checksums: PASS and unchanged; the Wave 2 migration remains
  pending until production application.
- Diff checks: PASS.
- Browser at 1440x900, 720x900, 375x812, and 320x700 for both admin
  destinations: exactly one `main`/H1, Inventory is the sole current global
  destination, no document/nav overflow, no off-screen focusables, no Care
  links, and zero console warnings/errors.
- Fresh PostgreSQL 16: managed migration applies twice; accepted adversarial
  verifier passes; eight tables force RLS; zero browser table/RPC grants;
  eight service SELECT privileges; twelve service-only fixed-search-path RPC
  grants including the integration projection; direct DML remains denied;
  concurrency/replay/lifecycle/history/rollback-zero pass; the read-only
  production verifier reports zero Wave 2 rows in the disposable database.

## Production sequence after exact-SHA integration acceptance

1. Capture immediate pre-apply counts and current migration, RLS, privilege,
   RPC, Storage, Product Control, baseline operational, and disabled-Care
   evidence without creating a record.
2. Apply only the reviewed managed migration.
3. Run the read-only production verifier and preserve its exact output.
4. Merge only the Website 6-accepted integration head.
5. Wait for the matching Render deployment to reach `LIVE`.
6. Verify deployed SHA, health, signed-out role boundaries, private headers,
   both admin destinations at 1440/720/375/320, logs, unchanged baseline
   counts, zero Wave 2 rows, exact grants/RLS/bucket posture, and disabled
   Care.
7. Hand exact merge/deployed SHA, Render deployment ID, migration row, and
   pre/post evidence to Website 6 for read-only post-deploy QA.

## Rollback

Before any real input exists, application rollback restores the exact
pre-release Render deployment while retaining the inert additive schema.
After real input exists, preserve the additive schema and append-only history;
do not drop tables or use `CASCADE`. Destructive schema rollback requires a
separate explicit data decision and reviewed exports.
