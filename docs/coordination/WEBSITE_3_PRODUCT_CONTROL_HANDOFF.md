# WEBSITE 3 — Product Control Wave 1B handoff

Branch: `feature/website-3-research-commerce-wave-a`

Approved base: `6e4944674cfdfb33a8fd5685c031c7ac7c86fdb4`

Frozen head: use the commit containing this file and verify it against the PR head before integration.

## Scope completed

- Product create, edit, duplicate-as-draft, publish, unpublish, archive, and restore.
- Variant/SKU create, edit, submit, approve, activate, and archive.
- Retail, member, professional, wholesale, and compare-at price version history with effective dates and immutable version numbers.
- Private product media prepare/upload/verify, metadata, ordering, review, approval, rejection, and archive.
- Append-only product administration audit history.
- Canonical required-input release gate reuse; empty, rejected, and expired canonical inputs fail closed.
- Server-only non-PII Product/Operations readiness projection.

No product, variant, SKU, price, media, lot, COA, inventory, order, role, or production row was created by this release unit.

## Migration

`20260726143000_research_product_control_center.sql`

- Four new tables: `research_product_variants`, `research_product_prices`, `research_product_media`, `research_product_admin_audit`.
- Additive columns on canonical `research_products` and `research_product_content`.
- Twelve affected canonical/new product tables have enabled and forced RLS.
- Anon/authenticated table grants: 0.
- Anon/authenticated Product Control RPC grants: 0.
- Service-role domain table privileges: 48 (SELECT/INSERT/UPDATE/DELETE across 12 tables).
- Service-role Product Control RPC grants: 11.
- Private Storage bucket: `research-product-media-production`.
- Migration creates zero domain rows.

Disposable PostgreSQL 16 proof: migration applied twice; product/duplicate/variant/price/media lifecycle passed; cross-role and cross-product mutation failed; service-role audit update failed; superuser-only disposable rollback left zero domain rows. Verifier: `scripts/product-control-dryrun.mjs`.

Rollback for an unpopulated failed release: remove the isolated private bucket, 11 Product Control RPCs, append-only trigger/function, four new tables, and only the columns introduced by this migration. For any populated environment, preserve audit/history and use an additive corrective migration; do not drop or rewrite production records.

## Server registration seam (Website 2 owned)

Import `registerProductAdminApi` from `server/research/products-diagnostics/product-admin-routes.ts` and register it with an existing server-authoritative Research product administrator guard and a `ProductAdminService` composed from:

- `SupabaseProductAdminRepository` — `server/research/products-diagnostics/product-admin-production.ts`
- `productAdminIdempotency` — same file; consumes the canonical commerce idempotency store
- `productReleaseGateFromRequiredInputs` — same file; consumes canonical required-input rows and fails closed on an empty item set

Do not register a browser/service-role bypass or a parallel readiness model.

## API contract

Reads:

- `GET /api/admin/research/products`
- `GET /api/admin/research/products/:productId`

Idempotent writes (all require `Idempotency-Key`):

- `POST /api/admin/research/products`
- `PUT /api/admin/research/products/:productId`
- `POST /api/admin/research/products/:productId/duplicate`
- `POST /api/admin/research/products/:productId/archive`
- `POST /api/admin/research/products/:productId/restore`
- `POST /api/admin/research/products/:productId/publish`
- `POST /api/admin/research/products/:productId/unpublish`
- `POST /api/admin/research/products/:productId/variants`
- `PUT /api/admin/research/products/:productId/variants/:variantId`
- `POST /api/admin/research/products/:productId/prices`
- `POST /api/admin/research/products/:productId/prices/:priceId/approve`
- `POST /api/admin/research/products/:productId/media/upload`
- `POST /api/admin/research/products/:productId/media/:mediaId/confirm`
- `PUT /api/admin/research/products/:productId/media/:mediaId`

## Client seam (Website 2 owned registration only)

- Adapter: `client/src/research/adapters/productAdmin.ts`
- List page: `client/src/research/pages/adminx/ProductsAdmin.tsx`
- Detail page: `client/src/research/pages/adminx/ProductAdminDetail.tsx`

Website 2 registers these existing pages in the shared administrator routes/navigation. Website 3 did not edit shared route or navigation files.

## Website 4 server-only seam

Exact exported type/reader path:

`server/research/products-diagnostics/product-commerce-readiness.ts`

Exports `ProductCommerceReadinessProjection` and `ProductCommerceReadinessReader`. It contains only opaque product/variant/SKU identity, product/variant approval and active state, active price snapshot, shipping class, exact-lot COA requirement, and documentation requirement. Inventory, lot selection, quantities, payment, shipment, provider, and PII remain Website 4 owned.

## Verification

- Focused: 4 files / 16 tests passed.
- Full: 189 files / 3,485 tests passed before the final fail-closed adapter regression; rerun at frozen checkpoint recorded in PR checks.
- Typecheck: passed.
- Production build: passed; existing chunk-size warning only.
- Disposable migration/security verifier: 27/27 passed.
- `git diff --check`: required immediately before freeze.

## Locked shared files preserved

- `client/src/App.tsx`
- `client/src/research/adminx-section.tsx`
- `client/src/research/lib/routes.ts`
- shared administrator/member navigation and shell arrays
- `client/src/components/Navbar.tsx`
- `server/index.ts`
- shared capability and required-input contracts
- migration ledger/manifests

## Production authority

Website 2 alone orders/applies this reviewed migration, registers shared routes/navigation, merges, deploys through Render, and performs production smoke verification. Website 3 must correct returned findings and verify the deployed Product Control flow using an authorized existing administrator session without fabricating records.
