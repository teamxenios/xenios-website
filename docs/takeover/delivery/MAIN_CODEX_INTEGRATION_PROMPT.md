# Main Codex Integration Prompt

Use the verified Xenios non-clinical takeover delivery as an integration candidate, not as proof that real commerce is enabled.

## Immutable inputs

- Frozen base: `64cceb82f72170004525d5c78dc49ea7b77fdf6b`
- PR #103 source: `97ee1895763ea9c243de7365f224660d83773966`
- Snapshot SHA-256: `930a8a33a815bf1cc91b2bbf780eccc1bcfac12326b50cc2ccb9fc5f7ac194de`
- PR #103 migration: unapplied
- Care/clinical: excluded, disabled, and off the release path

Resolve the delivered source commit from the archive's `DELIVERY_IDENTITY.json`; never substitute a different working tree or prohibited historical head.

## Required integration sequence

1. Extract the delivery into a clean, isolated checkout.
2. Verify the source ZIP checksum, overlay ZIP checksum, `DELIVERY_IDENTITY.json`, frozen-base ancestry, and overlay manifest.
3. Compare current `origin/main` with the frozen base. If main advanced, rebuild one clean integration candidate and re-run every gate; do not force or cherry-pick around conflicts.
4. Preserve all accepted Product Control, inventory/COA, reservation, catalog, privacy, and release-control blobs.
5. Review the two unapplied migrations in the exact order documented in `MIGRATION_DAG_AND_APPLICATION_ORDER.md`.
6. Obtain Website 6 exact-SHA database/security/concurrency and browser/accessibility acceptance.
7. Website 2 alone records pre-apply production counts, applies accepted migrations, merges, deploys, records the exact merge/Render identity, and requests post-deploy QA.
8. Keep `RESEARCH_ADMIN_AUTHORITY_MODE=legacy` during migration. Verify Samuel's existing `auth.users.id` from authorized production evidence, execute at most one audited/idempotent assignment, move to `dual`, verify continuity, then move to `durable`.
9. Do not enable the persistent-cart UI until the legacy writable cart path is removed or bridged.
10. Do not enable checkout until durable pending-order creation, RPC-only order mutation, and provider/idempotency/reconciliation gates pass.
11. Do not publish buyable products until exact real supplier, price, variant, inventory, lot/COA, media, shipping, legal, and fulfillment-owner records are approved.

## Acceptance gates

- exact file identity and ownership;
- full tests, typecheck, build, route uniqueness, diff check, and secret scan;
- migration apply twice and rollback zero;
- forced RLS, zero browser grants, exact service privileges, direct-DML denial;
- lock-before-idempotency and concurrent replay;
- append-only audit;
- one main/H1, 1440/720/375/320 overflow/focus/console matrix;
- authenticated member/admin smoke using an existing authorized account;
- zero fabricated production records;
- Care disabled and absent from normal Research navigation.

Stop only for a true external input, a platform-enforced approval, a conflicting current-main change, or an irreversible production-data action.
