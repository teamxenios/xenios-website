# Website 2 release-manager handoff

## Current checkpoint

- Session: Website 2 — Release Manager
- Branch: `integration/website-3-production-v2`
- Production base: `main` at `48cb57250c1ec54fe8714e59fa1071a9eb27f867`
- Website 3 source candidate: PR #47 at `877ebfff75452f47b3b185e9879a0dcf156e0ef7`
- Validated integration code checkpoint: `92f8a6b`
- Release train: 1, held behind Assessment Release Train 0
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

Production migration is intentionally not applied. Release Train 0 must be integrated, migrated, deployed, and smoke-tested first.

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

- Focused Website 3 integration: 12 files, 77 tests passed.
- Full `npm test`: 150 files, 3,193 tests passed.
- `npm run check`: passed.
- `npm run build`: passed with the existing large-chunk warning.
- `git diff --check`: passed.
- Disposable migration apply-twice/RLS/grant verification: passed.

## Remaining release work

- Take the frozen Assessment Release Train 0 handoff first.
- Review and integrate Assessment shared routes, repositories, migrations, and UI.
- Apply and verify the Assessment production migration.
- Merge, deploy through Render, confirm deployed SHA, and complete live Assessment persona/persistence/mobile/accessibility/log smoke tests.
- Rebase this Website 3 integration onto the resulting production `main`.
- Run conflict, focused, full, browser, mobile, accessibility, authorization, and pre-apply production-schema checks.
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
