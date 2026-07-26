# Website 2 release-manager handoff

## Current checkpoint

- Session: Website 2 — Release Manager
- Branch: `integration/website-3-production-v2`
- Repository base: `main` at `357785bb7efea3ce65036e2468eb856920aff5d2`
- Current deployed production SHA: `68ee5d612df7d0452091ff0dfd2062d433943066`
- Website 3 source candidate: PR #47 at `877ebfff75452f47b3b185e9879a0dcf156e0ef7`
- Validated integration application checkpoint: `bb2f875`
- Release train: 1; Assessment Release Train 0 is deployed and its external activation gates remain preserved
- Production status: NOT YET MERGED

## Completed at this checkpoint

- Registered the Website 3 member and admin APIs with existing active-member and administrator guards.
- Added Supabase-backed repositories for metabolic pathways and interest, supplement placeholders, Superpower public configuration, biomarker records/uploads, certificate audit, and product content.
- Reused the canonical catalog, inventory-lot, quality-document, commerce, product-request, and private-storage seams.
- Added server-authoritative capability responses for private exact-lot certificate access and biomarker upload.
- Integrated the existing product and subscription routes with the Website 3 catalog/detail presentation.
- Registered member routes for supplements, metabolic pathways, diagnostics, storage, education, and support without crowding primary navigation.
- Registered guarded administrator configuration for approved Pending public copy.
- Preserved truthful Pending states and disabled external-provider actions.
- Corrected every education link to the registered member education route and a matching in-page anchor.
- Added all five supplement channel records to the production admin adapter and populated form, including persistence/reload coverage and public redaction.
- Added the complete Superpower collection, price, review, interest, and affiliate contract to the admin adapter and form. `available` now fails closed unless the offer has complete metadata and an enabled HTTPS affiliate action.
- Connected all ten Website 3 communication templates to the canonical durable Research outbox. The live product-request received/update events exercise that adapter; event-key replay remains deduplicated and payloads are allowlisted at enqueue and dispatch.
- Added the exact four-field trainer-safe biomarker projection to the existing authorized Train 0 Plan Brief. Ordinary member sessions are denied before the provider is called, and viewing context does not create a biomarker record.

## Migration

Prepared migration:

- `supabase/research-products-diagnostics.sql`

Required apply order:

1. Canonical product catalog migration.
2. Canonical commerce/inventory migration.
3. Website 3 products/diagnostics migration.

Disposable PostgreSQL verification:

- Applied the current Website 3 migration twice with `ON_ERROR_STOP=1`.
- Confirmed 8 expected tables.
- Confirmed forced RLS on all 8 tables.
- Confirmed zero `anon` or `authenticated` table grants.
- Confirmed 4 canonical supplement placeholder rows.
- Confirmed Superpower interest is internal and affiliate activation remains disabled.

Production migration is intentionally not applied yet. Release Train 0 is complete; production schema inspection, canonical dependency application, and final candidate review remain required before this migration is applied.

## Routes

Member API:

- `GET /api/research/product-platform`
- `POST /api/research/products/:sku/certificates/access`
- `GET /api/research/metabolic-pathways`
- `POST /api/research/metabolic-interest`
- `GET /api/research/diagnostics/superpower`
- `GET /api/research/diagnostics/biomarker`
- `POST /api/research/diagnostics/biomarker/report-upload`
- `POST /api/research/diagnostics/biomarker/report-upload/confirm`

Admin API:

- `GET /api/admin/research/metabolic-pathways`
- `PUT /api/admin/research/metabolic-pathways/:pathwayId`
- `GET /api/admin/research/supplement-placeholders`
- `PUT /api/admin/research/supplement-placeholders/:category`
- `GET /api/admin/research/superpower-offer`
- `PUT /api/admin/research/superpower-offer`

Member UI:

- `/research/member/products`
- `/research/member/products/:slug`
- `/research/member/supplements`
- `/research/member/metabolic-care`
- `/research/member/diagnostics`
- `/research/member/storage`
- `/research/member/education`
- `/research/member/support`

Admin UI:

- `/research/adminx/product-configuration`

## Validation

- Independent Website 3 review: all five original integration gaps accepted; two final narrow activation/form regressions corrected.
- Final full `npm test`: 152 files, 3,261 tests passed.
- `npm run check`: passed.
- `npm run build`: passed with the existing large-chunk warning.
- `git diff --check`: passed.
- Disposable migration applied twice with `ON_ERROR_STOP=1`: passed.
- Migration verification: 8/8 expected tables, 8/8 forced RLS, zero `anon`/`authenticated` table grants, four canonical supplement placeholder rows, and Superpower still `coming_soon` with affiliate disabled.

## Remaining release work

- Push the corrected candidate, require green GitHub test/typecheck/build checks, and obtain Website 3 re-review of the exact head.
- Inspect the production schema and record baseline counts/invariants for the canonical catalog, inventory-lot, quality-document, and live Product Request tables.
- Run integrated signed-out/wrong-role and available authorized persona browser checks without fabricating an account or record.
- Apply the Website 3 migration only after its canonical dependencies.
- Merge/deploy/smoke Release Train 1 and notify Website 3 for feature-owner live verification.

## Production gates

- Keep `RESEARCH_COA_ACCESS_ENABLED` false/unset until the private COA bucket and canonical exact-lot records are verified.
- Keep `RESEARCH_BIOMARKER_UPLOAD_ENABLED` false/unset until the private report bucket, verification RPC, consent flow, and operational owner are verified.
- Keep Superpower affiliate activation disabled until real approved partner configuration exists.
- Do not fabricate prices, lots, certificates, inventory, provider activation, or clinical availability.
- Website 2 remains the sole merge and production deployment coordinator.

UI CONSISTENCY STATUS: MATCHES EXISTING XENIOS

PRODUCTION STATUS: NOT YET MERGED
