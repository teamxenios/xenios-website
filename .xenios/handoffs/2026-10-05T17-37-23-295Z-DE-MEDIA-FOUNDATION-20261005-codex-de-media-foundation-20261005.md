# D/E media foundation — source-only review handoff

## Exact boundary and authority

- Session: `codex-de-media-foundation-20261005`; task: `DE-MEDIA-FOUNDATION-20261005`.
- Branch: `codex/xenios-de-media-foundation-20261005`.
- Worktree: `C:/Users/sboad/.codex/worktrees/2227/xenios-website`.
- Accepted MC01 base: `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6`, tree `f5953b8e148196c4ea71839cdd40a4e06b5f9fd1`.
- Founder authority: `cd66f3c411e6164981295d81c2116e50343edc86`, review doc 31; MC01 acceptance: `d9998563c9a709f2ef9ccd928d4e59fc259bb82d`, doc 32.
- Pushed source SHA: `5152adb4db6db3e197d4534146bcc2ae75fa8f96`; tree: `0258be61bf4761ee9911cda1c0d042b6cd183aa3`.
- Governance setup: `5fcef77`; the previously completed MC01 branch remains preserved at `0b86108dd99a8a59bed868de6fbad17c7d832d61`.
- Status: implementation source ready for independent Claude review. This is not independent acceptance or release qualification.

The source, tests and SQL candidate form one review boundary. Test receipts and this handoff are a subsequent records-only commit. `verification.json` lists every changed source path and its Git blob. No runtime source was edited after the final focused run began. The checkout was reused only after confirming the MC01 session was idle and its work preserved. Root was the sole writer; component, DTO and truth/a11y/performance agents performed read-only reviews.

No deployment, publication, storage upload, Product Control write, hosted mutation, managed migration registration/apply, ledger update, or launch transition occurred. No product renders were generated or wired. Primary checkout, protected shell/manifest, Core clarity/auth paths, Finance and imagery studies were untouched. No new public product-detail route was created. Shared global release/state records remain coordinator-owned; only this task/session/lease records were updated.

## Implemented behavior

`shared/research/product-media.ts` is the single presentation descriptor and parser used by member projection, browser adaptation and `ProductMedia`. It carries media ID, product ID, exact variant ID, alt text, filename, 1024×1024 dimensions, lower-case SHA-256, source version, delivery policy, illustrative flag and expiry. Existing Product Control approval remains authoritative. Missing legacy metadata yields fallback.

The server counts approved-primary records before validating them, so a malformed duplicate cannot make an ambiguous set appear unique. It likewise rejects duplicate delivery presentations, hidden/non-member variants and nontransactional clinical/program imagery. Delivery metadata must agree with the approved record. The current signed-object route, production bucket and 300-second limit remain constrained; no transforms or srcset are introduced. The existing Xenios public-host policy is retained, not newly certified as immutable.

V1 uses one primary bound to the existing first visible variant (the existing detail default). A primary belonging only to a second variant yields fallback on both card and fresh detail. This eligibility choice never changes variant ordering, purchase selection, price or commerce authority. Switching away from the primary's variant yields fallback; switching back restores that same descriptor. Card/detail share the same object path and declared hash when eligible; independently issued signed URLs may contain different tokens.

`ProductMedia` reserves a neutral square and uses `object-fit: contain`, intrinsic 1024×1024 attributes, asynchronous decoding and no-referrer delivery. Cards are lazy; member detail is eager. It has no commerce props or callbacks. Invalid, missing, expired, failed or dimension-mismatched media yields exactly **An approved product image is not available.**, as ordinary text without `role="img"`. **Illustrative image** is a separate figcaption outside the square. A changed descriptor resets failure state; a stale event cannot fail the replacement image. The CSS adds no crop, tint, filter, gradient, blending or pixel overlay.

## Surface wiring

| Existing surface | This source slice |
| --- | --- |
| Member catalog / `MemberCatalogExperience` | Canonical approved descriptor through existing member service/projection/adapter; square image or fallback. |
| Member product detail / `MemberProductDetailExperience` | Same primary descriptor with selected-variant identity check; removes the previous misleading supplier-pending media panel. |
| Assisted-order catalog `ProductCard` | Square neutral fallback; no guessed asset or new DTO authority. |
| Early Access featured `EarlyAccessProductCard` | Square neutral fallback. |
| Early Access direct catalog `EarlyAccessCartCatalogue` | Square neutral fallback. |
| Master offering card and detail | Square neutral fallback; detail has heading first and a responsive two-column media/variant layout. |
| Cart review, payment, summary, confirmation and status | Remain text-only; no media wiring. |

The five fallback-only components do not yet have the canonical member media reader. Completing their data connection needs a reviewed extension of their existing canonical projection; this handoff does not claim live approved-image support there. `CatalogDiscoveryPresentation` is an unmounted, tests-only legacy presentation path and was left untouched. No new parallel media authority was added.

Restrictive, Care, quote/request, documentation/pricing-pending and held states retain their existing facts, controls and routes. Image availability does not create readiness, COA, stock, price, purchase, payment or clinical authority. Tests compare all non-media markup across media states and retain existing routing/quantity checks.

## Source-only schema candidate

`supabase/candidates/20261005_research_product_media_descriptor.sql` is **unregistered, unapplied and execution-unqualified**. It is not in the migrations directory, migration index or DAG. Its source adds nullable metadata, an all-null legacy/all-populated descriptor check, fixed delivery dimensions, hash format, exact `(product_id, variant_id)` foreign key and supporting partial index. Existing approved-primary uniqueness remains. A trigger rejects metadata changes while the resulting row remains approved, requiring the existing review transition. No backfill, approval grant, security-definer function or hosted action is included.

The SQL source tests prove text/registration boundaries only. Disposable PostgreSQL execution, trigger behavior, FK behavior, migration compatibility and rollback qualification are **DEFERRED** under the shared-host constraint. Do not register or apply this candidate from this handoff.

## Verification and receipts

- Final focused Node 20.19.0 / Vitest 4.1.10 run: **15 files, 238 tests passed**, exit 0, 41.10 seconds; one worker and no file parallelism. Receipt: `focused-tests.txt`.
- Final `tsc --noEmit --incremental false`: **PASS**, exit 0; receipt: `typecheck.txt`.
- `git diff --check` and `xenios-os validate`: PASS.
- Earlier diagnostic run: 235/237 passed; two expectations were stale after fail-closed hardening. Both corrected tests passed, then the final 238-test run passed including the added second-variant regression.
- JSDOM emitted its existing `Window.scrollTo()` not-implemented warnings; no test failed. DOM/source assertions are not browser geometry evidence.
- No full suite, build, browser, Docker/database process, dependency install or hosted smoke ran. Heavy operations stayed serialized in the coordinator's slot; the slot is released before commit packaging.

The 15-file command covers shared parsing, media state/expiry, member projection/service/adapter/card/detail, non-media truth invariance, source-only schema boundaries, assisted-order behavior, Early Access cards and cart quantity routing, master detail/full catalog and the existing Product Control production adapter tests. Exact file arguments and source identity are in `verification.json`.

## Deferred browser and performance qualification

No screenshots, computed-style measurements, accessibility-tree snapshots, delivery-byte hashes, CLS, LCP, heap or network measurements are claimed. A successor with a coordinator-approved slot should use approved/synthetic local fixtures (never calibration assets as runtime approvals) and retain exact build/browser/viewport evidence.

1. Exercise mounted member catalog/detail, Early Access catalog, assisted-order catalog and master catalog/detail at 320, 390, 768 and 1440 CSS pixels. Include mobile/desktop and native 200% zoom/forced colors. Verify square dimensions, containment, no horizontal overflow, readable ordinary fallback, alt text, no clipping and no caption occlusion inside the image box.
2. Cover valid exact media, illustrative media, missing legacy metadata, malformed alt/hash/dimensions, wrong identity, duplicate approved primary, expired/failed URL, actual non-square bytes, A→B→A variant change and late image failure after replacement. Compare card/detail media ID, object path and actual downloaded SHA-256.
3. Keep available, held, quote/request, Care and documentation/pricing-pending controls/labels/prices/routes unchanged. Confirm summaries/payment/status remain text-only and image failures issue no commerce writes.
4. Measure lazy requests, detail LCP, CLS and decoded memory with a realistic catalog. A 1024×1024 RGBA bitmap is approximately 4 MiB before overhead; that is an estimate, not a measured browser result. Caption removal on error/expiry can move following content; measure its impact. No responsive derivatives are allowed in v1.

## Remaining Product Control and release work

- Implement/qualify the canonical ingestion/review writer that verifies real bytes, square dimensions, actual SHA-256, variant identity and illustrative truth before populating metadata. Existing upload and approval UI do not yet write these fields.
- Prove immutable object delivery and actual card/detail hash equality. Metadata equality plus unique object paths does not prove the stored bytes or prevent privileged replacement. Browser natural-size checks only check dimensions after decoding.
- Connect other existing catalogs to approved descriptors through their canonical readers; retain fallback until then.
- Qualify the SQL candidate locally and obtain any later registration/apply authority separately. No hosted action follows automatically from source acceptance.
- Independent Claude acceptance is next. Runtime remains blocked by the accepted predecessor persistent-cart chain, MC01 candidate adoption, canonical **non-image** product_content reapproval and a separate launch transition, along with coordinator-owned release gates. D/E does not clear those gates.
- GATE-01 remains open; protected old→new hash approvals/manifest review and exact release-candidate qualification remain outside this task. Production stays NOT READY.

## Continuation

Next task: independent Claude review of the exact pushed source SHA and records, with browser/SQL/delivery qualification explicitly deferred. Do not treat this as a request to deploy. Read `AGENTS.md`, the continuity corpus and this handoff; inspect the exact diff from accepted MC01; run `node scripts/agentic/xenios-os.mjs validate` and `status` before claiming any successor lease. Preserve existing work and coordinate compute before tests. This session stops at `handoff_ready` with task in `qa` and lease in `handoff`; acceptance is the reviewer's action.
