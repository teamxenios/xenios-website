# Website 2 release-manager handoff

## Current checkpoint — Product Control integration candidate

- Session: Website 2 — Release Manager
- Integration branch: `integration/research-commerce-wave1-product-control`
- Base production main: `ac324cb12f16da9322ff224e78c08210d039c7b2`
- Accepted Product Control source:
  `dd58ccf1fa7919f78838a60aaf66cdee48b73993`
- Rejected source heads: `639148302364bb191103b6f3deb7d1571dcac0be`
  and `7817f4857e6429fec0051168ab9a2fc08847b8e4`
- Source migration:
  `supabase/migrations/20260726143000_research_product_control_center.sql`
- Canonical migration raw Git-blob SHA-256:
  `b1589eb24405d4700206d25541b647479afee34c2cd05422da70df2179876203`
- Production status: NOT YET MERGED; primary migration applied as managed
  migration `20260726214102 research_product_control_center`; application
  deployment remains held for reviewed privilege convergence

This integration preserves the accepted Product Control domain blobs and adds
only Website 2-owned composition and release evidence:

- registers `/api/admin/research/products` and its detail/mutation routes
  before API/SPA fallbacks with the existing server admin guard;
- composes the reviewed Supabase repository, canonical per-product
  required-input readiness gate, and durable database idempotency store;
- keeps routes registered when persistence is unavailable so they fail closed
  with stable redacted 503 JSON instead of a JSON 404;
- preserves existing `/admin/research/products` and
  `/admin/research/products/:id` client routes and grouped admin navigation;
- records migration order 38, a read-only production verifier, and additive
  rollback/recovery notes.

Immediate post-apply verification found the production Supabase environment
retained pre-existing/default service-role `TRUNCATE`, `REFERENCES`, and
`TRIGGER` privileges, yielding 69 privileges instead of the reviewed 33. The
row-preserving migration
`supabase/migrations/20260726214500_research_product_control_center_privilege_hardening.sql`
revokes only those three excess privilege types across the 12 Product Control
tables. It must pass exact-SHA Website 6 review and production verification
before merge or Render deployment.

Release invariants:

- five command-managed tables remain service-role SELECT-only; all mutations
  use the 11 reviewed fixed-search-path SECURITY DEFINER RPCs;
- browser roles retain zero Product Control table/RPC grants;
- no product, variant, price, media, required-input, role, seed, launch-control,
  inventory, lot, COA, order, or Care row is created;
- public commerce remains fail-closed; Care remains disabled and hidden;
- production migration, merge, and Render deployment remain prohibited until
  Website 6 accepts the exact two-parent integration SHA.

Post-deploy handoff must include the exact integration/merge/deployed SHAs,
Render deployment ID/status, managed migration timestamp/name, immediate
pre/post-apply counts, RLS/grant/RPC verification, health/auth/privacy/browser
smoke, Render/Supabase error posture, and the rollback identity in
`supabase/production/research-product-control-center-rollback-notes.md`.

## Current checkpoint — Care PR4 integration candidate

- Session: Website 2 — Release Manager
- Integration branch: `integration/care-pr4-production`
- Base production main:
  `69c8181a49ba1a3b431b24e35068ba70925bb28a`
- Accepted Care PR3 source/base:
  `71da91c458907eaf4f627488e5de35cddf82c04a`
- Accepted Care PR4 source:
  `0ff2352120544f436c005959e1593465353f15bb`
- Superseded PR4 heads: `604ed05c54ca29063302433aa2c816a68b197424`,
  `bb5b320471832c69571511d36815306159506b17`,
  `c0998cab27c08c8cca4aa3245e1dff7dfceb133f`, and
  `4b886f27b5ea79bb2b5fb35a5c09e13810d8f8ec`
- Integration head/PR: pending final validation and freeze
- Care PR4 migration: `care-prescription-pharmacy.sql` — NOT APPLIED
- Production status: NOT YET MERGED

This focused unit integrates only the accepted Care PR4 human-clinician
prescription, verified pharmacy/readiness, clarification, dispense, shipment,
delivery, cancellation, and immutable event foundations after live Care PR3.
Care remains disabled. No patient, clinician, pharmacy, license, supported
state, prescription, order, role, seed, approval, or external action is
created.

Shared integration:

- registers `buildCarePrescriptionRepository()` and
  `registerCarePrescriptionApi(...)` after accepted Care PR1–PR3 dependencies
  and before API/SPA fallbacks;
- registers `/care/prescriptions` and `/care/pharmacy` before the broad
  `/care/*` route using the existing lazy/Suspense pattern;
- preserves the global no-store/no-cache/noindex Care middleware and the
  no-store/noindex/no-referrer page gate;
- preserves the accepted PR4 exact domain semantics for consent/state
  freshness, replay authorization, exact-entity readiness, clinician-owned
  clarification resolution, signed-prescription/supersession enforcement,
  terminal clarification cancellation, and narrow delivery handling;
- resolves only the migration ledger conflict by retaining applied Care
  PR1–PR3 versions and recording Care PR4 as pending.

Production assets:

- migration: `supabase/care-prescription-pharmacy.sql`;
- lifecycle: `supabase/tests/care-prescription-pharmacy-lifecycle.test.sql`;
- verification: `supabase/verify-care-prescription-pharmacy.sql`;
- rollback:
  `supabase/production/care-prescription-pharmacy-rollback-notes.md`.

Current integration validation:

- six focused Care server/client/integration files, 37 tests passed;
- full suite: 186 files, 3,472 tests passed;
- `npm run check`, `npm run build`, and `git diff --check` passed; the build
  retains only the existing large-chunk advisory;
- fresh PostgreSQL 16 applied Care PR1–PR4 twice with `ON_ERROR_STOP=1`;
- all four lifecycle scripts and all four read-only verification scripts
  passed;
- disposable verification confirmed 38/38 total Care tables forced RLS, zero
  PR4 browser grants/policies, seven reviewed PR4 service-role RPC grants, zero
  PR4 prescription/order rows and roles, and the canonical disabled capability;
- local browser checks passed on `/care/prescriptions` and `/care/pharmacy` at
  1440, 375, and 320 pixels with one main/H1, no overflow, no internal-key
  leakage, a truthful retry state, clean console, and mobile menu
  Escape/focus-return;
- native 200% zoom was unavailable in the browser runtime; committed PR4
  evidence and an independent 720-pixel reflow-equivalent check passed.

Release boundary:

- do not apply the migration, merge, or deploy until Website 6 accepts the exact
  integration SHA;
- keep Care disabled and create no Care role, seed, operational row, or external
  action;
- keep PR5–7 held until PR4 is merged, deployed, and independently accepted
  post-deploy.

## Current checkpoint — Care PR3 production release

- Session: Website 2 — Release Manager
- Integration branch: `integration/care-pr3-production`
- Base production main:
  `9209df12275c1de3ac76883d5a5173be707bee28`
- Accepted Care PR2 source/base:
  `54f9bd8d8834de9a8e57fc911665627af36f09ed`
- Accepted Care PR3 source:
  `71da91c458907eaf4f627488e5de35cddf82c04a`
- Accepted integration head:
  `da249ec524b7b7fc5f8751979b822997cfd2e550`
- Merge/deployed main:
  `70711dba04aa33b90e2878c0f68c99bb21763224`
- Integration PR: `#73`
- Render deployment: `dep-d9itarbeo5us73d2unkg` (Live)
- Rejected PR3 heads: `0218e23b0d4ef1bf6d2e7a4bfef78ab23d3b131c`
  and `fcc91987586b6f20a88c3467f63fc26202d91f27`
- Care PR1 migration: `20260726064113 care_access_foundation`
- Care PR2 migration: `20260726080248 care_eligibility_intake`
- Care PR3 migration: `20260726093600 care_appointments_clinician`
- Production status: SOFTWARE LIVE — REAL INPUTS REQUIRED (CARE DISABLED)

This focused unit integrates only accepted Care PR3 appointment, assignment,
provider-neutral scheduling, reminder, private telehealth-reference, and
human-clinician review foundations after live Care PR2. Care remains disabled.
No medical group, clinician, license, supported state, provider, patient,
appointment, consent, seed, role, approval, or external action is created.

Shared integration:

- registers `buildCareAppointmentRepository()` and
  `registerCareAppointmentApi(...)` after accepted Care PR1/PR2 dependencies
  and before API/SPA fallbacks;
- registers `/care/appointments` before the broad `/care/*` route using the
  existing lazy/Suspense route pattern;
- preserves the global `/api/care` no-store/no-cache/noindex middleware and
  `/care/*` no-store/noindex/no-referrer page gate;
- preserves the accepted exact domain semantics for current consent/state
  serialization, same-clinician readiness, due scheduled no-show, human-only
  review, and one-main/H1 rendering;
- resolves only the expected migration-ledger conflict by retaining applied
  Care PR1/PR2 versions and recording the serialized Care PR3 migration.

Production assets:

- migration: `supabase/care-appointments-clinician.sql`;
- lifecycle: `supabase/tests/care-appointments-clinician-lifecycle.test.sql`;
- verification: `supabase/verify-care-appointments-clinician.sql`;
- rollback:
  `supabase/production/care-appointments-clinician-rollback-notes.md`.

Current focused integration validation:

- nine Care server/client/integration files, 33 tests passed;
- full suite: 181 files, 3,439 tests passed;
- `npm run check` and `npm run build` passed;
- `git diff --check` passed;
- fresh PostgreSQL 16 applied Care PR1, PR2, and PR3 twice with
  `ON_ERROR_STOP=1`;
- all three lifecycle scripts and all three read-only verification scripts
  passed;
- disposable verification confirmed 28/28 total Care tables forced RLS, zero
  browser grants, the reviewed service-role RPC posture, zero Care
  roles/audits/patients/appointments/reviews/auth users, and the canonical
  disabled capability;
- Website 6 accepted the exact integration head and independently accepted the
  deployed production release with no blocker/high finding.

Production result:

- migration `20260726093600 care_appointments_clinician` applied through the
  approved production path and PostgREST schema reloaded;
- PR #73 merged only the accepted integration head as
  `70711dba04aa33b90e2878c0f68c99bb21763224`;
- Render deployment `dep-d9itarbeo5us73d2unkg` reached Live at that SHA;
- health returned 200, Care status remained disabled, every PR3 read and
  mutation-shaped route returned stable no-store `503 care_disabled`, and
  `/care/appointments` remained truthful and noindex;
- live 1440/375/320 browser checks passed with one main/H1, no overflow,
  keyboard Escape/focus return, and no console warning/error;
- production verification confirmed 12/12 PR3 and 28/28 total Care tables
  forced RLS, zero PR3 browser table/routine grants, nine reviewed service-role
  RPC grants, zero PR3/role/audit rows, and unchanged member/application/outbox/
  required-input/launch-control counts;
- Supabase API logs contained zero 5xx entries and no production Care error.
  Detailed Render log streaming remains unavailable until a workspace is
  explicitly selected; no workspace was guessed.

Release boundary:

- PR3 production gate is closed; keep Care disabled and create no role, seed,
  operational, or external-action record;
- advance only PR4 on exact accepted PR3 source
  `71da91c458907eaf4f627488e5de35cddf82c04a`;
- old PR4 head `604ed05c54ca29063302433aa2c816a68b197424`
  on superseded PR3 `fcc91987586b6f20a88c3467f63fc26202d91f27`
  remains DO NOT REVIEW/MERGE/APPLY;
- PR5–7 remain held until corrected PR4 completes exact-head QA and serialized
  production gates.

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
