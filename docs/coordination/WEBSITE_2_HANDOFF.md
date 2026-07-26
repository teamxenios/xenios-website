# Website 2 release-manager handoff

## Current checkpoint — Care PR2 eligibility/intake production release

- Session: Website 2 — Release Manager
- Branch: `integration/care-pr2-production`
- Application merge/deployed main: `e6c8fff2db6fc0fb6201180e3d3463e05eb84ff1`
- Care PR1 application merge: `c09e6fe756ed924736baf603950c944f1ace619c`
- Accepted Care PR1 source: `6791656667eee7bdfa9605eb5e0bd869bbde5077`
- Accepted Care PR2 source: `54f9bd8d8834de9a8e57fc911665627af36f09ed`
- Rejected PR2 heads: `8e3df03173e9d7ed6a351883da3ecac1a595d46f`
  and `0f44cdeb4c04b61e585363690655192ec3295e25`
- Care PR1 migration: `20260726064113 care_access_foundation`
- Care PR2 migration: `20260726080248 care_eligibility_intake`
- Care PR2 integration PR: `#71`
- Accepted integration head: `cd8e05798e086fd45fa864464f89e4a2ad683797`
- Render deployment: `dep-d9iruuf41pts73aomu0g` (Live)
- Production status: SOFTWARE LIVE — REAL INPUTS REQUIRED (CARE DISABLED)

This focused unit integrates only accepted Care PR2 eligibility, consent, and
versioned-intake foundations after the live Care PR1 boundary. Care remains
disabled and no state, clinician, consent document, intake definition, patient,
role, seed, or clinical record is created.

Migration:

- `supabase/care-eligibility-intake.sql`
- applies only after the live `care-access-foundation.sql`;
- creates 13 additive forced-RLS Care tables;
- grants no browser table mutation authority;
- seeds no state, clinician, consent copy, intake definition, patient, or
  operational record;
- keeps the canonical Care capability disabled;
- enforces current exact consent again at HTTP autosave/submit and inside both
  locked SQL RPCs;
- rejects stale, revoked, or superseded bindings before replay or mutation.

Routes:

- `GET /api/care/eligibility`
- `POST /api/care/eligibility/location`
- `POST /api/care/eligibility/waitlist`
- `POST /api/care/consents`
- `GET /api/care/intake`
- `POST /api/care/intake`
- `PATCH /api/care/intake/:intakeId/autosave`
- `POST /api/care/intake/:intakeId/submit`
- `/care/eligibility`
- `/care/consent`

Current integration validation:

- focused Care integration/server/client tests: 11 files, 62 tests passed;
- full suite: 173 files, 3,408 tests passed;
- typecheck, diff check, and production build passed;
- accepted PR1 and PR2 migrations each applied twice in disposable PostgreSQL
  16;
- committed consent/intake lifecycle passed, including later revocation and
  required-notice supersession with no mutation;
- read-only verification confirmed 13 PR2 tables, 16 total Care tables,
  16 forced-RLS tables, zero browser grants, zero Care role/patient/consent/
  intake rows, and the canonical disabled capability;
- shared registration applies no-store/no-cache/noindex headers to every
  `/api/care` response before focused handlers.

Production result:

- Website 6 accepted exact integration head
  `cd8e05798e086fd45fa864464f89e4a2ad683797`;
- PR #71 merged as `e6c8fff2db6fc0fb6201180e3d3463e05eb84ff1`;
- migration `20260726080248 care_eligibility_intake` was applied after Care PR1;
- Render deployment `dep-d9iruuf41pts73aomu0g` reached Live at the merge SHA;
- health, disabled Care APIs, truthful `/care/eligibility` and `/care/consent`,
  no-store/noindex headers, desktop/375/320 layout, landmark count, keyboard
  focus return, console, Render logs, and Supabase logs passed;
- production verification confirmed 13/13 PR2 tables forced RLS, zero browser
  table/routine grants, exactly three service-role RPC grants, zero PR2 rows,
  zero Care roles/audits, and the canonical disabled capability;
- no account, patient, consent, intake, seed, role, approval, or external action
  was fabricated or created.

Remaining:

- Website 6 accepted the read-only post-deploy gate with no blocker/high at
  https://github.com/teamxenios/xenios-website/issues/44#issuecomment-5082689237;
- request a corrected-base PR3 candidate. Existing PR3–6 heads and PR7 remain
  held until Website 2 authorizes each exact next boundary.

Queued but not mixed into this candidate:

- PR #61 Website 1 pre-launch application at
  `1ee36a3d6d492cb3da8d8d0fe23c9653085951b2` (QA queued, not reviewed);
- PR #62 Website 3 pre-launch application at
  `7cbc7a4e3bf309db9b44359a20bea8922ab27e00`;
- Care PR3–6 remain held because their frozen heads were stacked on superseded
  ancestors; PR7 has not started and requires a Website 2-owned post-contract
  base after the accepted stack is integrated;
- Website 4 Train 3A at
  `d162f1eafe249be57e9d23c87c65d99f1efdbc89`.

## Archived Release Train 1 checkpoint

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
