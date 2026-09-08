# Resource Hub and account/partner UI - qualification checkpoint

**IN PROGRESS - NOT READY FOR A NEW RELEASE GO.** The narrow Universal Account and Partner Access release is already live. The combined Resource Hub/UI candidate remains undeployed, its new migration unapplied, and its final gates incomplete. A is the sole integrator and production executor; B independently reviews.

The current frozen application candidate is `c350ab1c1a12d8f9ed7e8e380d4f2ef9eda22662`, tree `314ef445a6e3be8420a77451ed182088419d59ec`. Its complete full suite, typecheck, build, exact-range diff check and secret half of the scan pass. Bounded substantive peer review is complete. The original three Care endpoint differences were reproduced on the live baseline's code; under matching controlled settings, baseline and candidate each return 30 matching results with no waivers. Privacy V3 preparation is blocked by the missing source register/document identities; V2 remains partial and unapproved. No PII qualification has run. Later evidence commits do not replace this application candidate.

## Source bindings

| Evidence or change | Exact binding |
| --- | --- |
| Latest checker procedures; B accepted | `46782cd4f0f73975c021c3a605492aa022c7d4dc` |
| Checker-procedure tree | `6e7965d91ba4a01e416bcc1a7485b0cde80acf27` |
| FORCE RLS correction | `6c77c5663071715f8fe47038f57100c16c430246` |
| FORCE RLS correction tree | `8cf492375e8a66fa474bf425a510c61fc826b985` |
| Reviewed-synthetic-credential scanner change; B accepted | `62336a8e0c05eb4d3804cc7e75593aaa4a5246ee` |
| Recorded fixture acceptance and corrected migration DAG | `01ea702a62388970a14cdfa498a095dcf32007de` |
| Browser/preview source | `8e125ca7cbd300a7e96e4dbca8f5eca654558bfe` |
| Browser/preview tree | `56d76664caa94e0de11a60d6b34c3139ddb1048d` |
| Copied browser acceptance | `0c1ad35c81513a07f5ecbee2fb018c149bd9d52d` |
| Final rebuilt client/server runtime | `c350ab1c1a12d8f9ed7e8e380d4f2ef9eda22662`; all 342 files byte-identical to the accepted earlier build |
| First completed full suite | `33436c5fba078c8511dcc06749e5820995bee023` |
| Live account/partner application | `ff3c496245739233b71e46f9e5d6e26af9d57017` |

The 46782cd full suite completed with **15,996 passed / 59 skipped / 1 failed**, 2,707.77 seconds: the original 5-second static RLS policy-inventory check timed out. Its complete saved log was recovered after the app goal became usageLimited; the terminal exit receipt was unavailable. A reran the unchanged RLS and pgcrypto tests on the quieter host: **23/23 PASS**, 4.44 seconds. This does not convert the failed full run into PASS. The single-worker c350ab1 full suite completed at `2026-09-08T03:28:12.7269412Z`: **15,997 passed / 59 skipped / zero failed**, 917 passed files and 5 skipped, 960.11 seconds, actual exit 0. A collected the existing result without a duplicate run. No assertion, timeout or scanner rule was weakened. See [final full-suite receipt](full-suite-c350ab1.json).

The bf7b5fe cleanup changes four historical documents and removes only the final extra blank line from the local new-account runner. B accepted that immutable equivalence. The 37cd7bf record rebind preserves all 102 credential finding contexts, updating one full-file hash; c350ab1 records B acceptance and **35/35 scanner tests**, zero skips. No application runtime or SQL changed after 46782cd.

A selectively integrated B's account/document/order and partner UI work with Fable's Resource Hub and the reviewed scanner/admin session-isolation corrections. Existing account identity, partner lifecycle, agreement/training, durable-state, and money protections remain part of the integration. A added Resources wall/layout admission, safe sign-in return, and terminal-failure cache clearing. Broader partner routes retain their existing wall restrictions; added reporting UI does not activate recruiting, referrals, payouts, commerce, or unavailable backend actions.

## Current gate disposition

| Gate | Evidence and remaining limit |
| --- | --- |
| First full suite | **NON-GREEN, completed** on 33436c5: 15,995 passed / 59 skipped / 2 failed across 922 files; 1,276.31 seconds. |
| Two observed full-suite failures | The pgcrypto audit hit its 5-second timeout; the second failure required FORCE RLS. A's post-fix focused run passed **23/23**, with original timeouts/assertions. The old full run stays failed. |
| Replacement full suite | **PASS c350ab1: 15,997 passed / 59 skipped / zero failures.** 01ea702 remains interrupted; 46782cd remains failed. [Receipt](full-suite-c350ab1.json). |
| Typecheck/build | **PASS on c350ab1**, Node 20.19.0, both exit 0. All 342 rebuilt files are byte-identical to accepted artifacts; no browser-runtime change is inferred from later evidence commits. [Receipt](build-typecheck-c350ab1.json). |
| Focused Resources checks | Earlier wall/guard, layout, safe-return, principal isolation and corrections passed. Counts overlap; do not aggregate them into a new release total. |
| Route/core-site gates | **PASS**, final c350ab1 route census: 433 registrations/424 calls; core protection: 28 verified hashes. [Final controls](final-control-gates-c350ab1.json). |
| Migration DAG | **PASS**, 36 nodes and canonical checksums; current production-record gate also accepts live ff3/deploy dep-dafcm. These are record/source checks, not new remote SQL or applied history. [Final controls](final-control-gates-c350ab1.json). |
| Strict secret scanner | Actual ff3-to-c350ab1: 42,121 added lines / 187 paths, 102 raw matches / 102 exact reviewed fixtures / zero unresolved. Registry LF digest `b82169d4afa2bc1d2007680c0d984db9b6e0f0bdf4d8ca2b25c30cb937922aba`. [Receipt](release-scan-c350ab1.json). PII remains explicitly skipped pending actual input approval; the combined gate is incomplete. |
| PII verification | **BLOCKED: V3 source register/document identities missing.** Latest preparation direction calls for already-held team, advisor and counterparty documents identified in that register; none is identified. [Specific source gate](privacy-input-v3-source-gate.json). V2 is preserved at 67 bytes/6 entries/3 scanner-eligible, partial and unapproved. No V3 extraction, hash or strict PII PASS exists. |
| Critical endpoints | **Bounded environment mismatch resolved with evidence.** Actual ff3 reproduces the original 27 SAME/3 REGRESSION exactly. Matched-disabled baseline and c350 each pass 30 SAME/zero waivers, independently reviewed. [New disposition](CRITICAL_ENDPOINT_ENVIRONMENT_CONTROL_C350.md). The [original failure](CRITICAL_ENDPOINT_LOCAL_COMPARISON_DISPOSITION.md) remains unchanged; live adapter/production parity remains separate. |
| Substantive independent review | **COMPLETE within recorded scope:** B reviewed A's Resources admission/cache and document-session corrections; A reviewed B's account/order, partner reporting/request and QR control paths. No new blocking logic finding in those bounded areas. [Review and retained limitations](INDEPENDENT_SOURCE_REVIEW_C350.md). |
| Formal manifest and records | **Structural PASS**, schema 2, exact 187-path candidate and B's unchanged attestation. Current graph/DAG records retain the historical source and now identify c350/e55/154 correctly. [Validation](final-manifest-record-validation-c350ab1.json). The manifest explicitly remains a qualification draft, with privacy, adapter/scope and execution requirements open. |
| Real-PDF compatibility | **COMPLETE** for the unchanged PDF validator: package 1/1 accepted; fresh Downloads 1,133 files, 1,034 accepted and 99 refused under existing policy. This is not security certification or historical-corpus parity. |
| Current local database rehearsal | **154/154 PASS on each of PostgreSQL 17.5 and 18.3**, bound to the unchanged FORCE RLS migration and updated checker hashes below. B accepted 46782cd; see [procedure acceptance](RESOURCE_HUB_CHECK_PROCEDURE_ACCEPTANCE.md). |
| Current production precheck | **Actual A read-only PASS at 23:40:28.257398Z**, PostgreSQL 17.6, executor postgres with BYPASSRLS true/SUPERUSER false and row_security off; no migration apply or production postcheck. |

The live endpoint baseline is [critical-endpoints-live-ff3c496.json](critical-endpoints-live-ff3c496.json). The three original differences now have a controlled baseline/candidate disposition, without rewriting the failed receipt or qualifying production adapters. Any later authorized production smoke must include all three Care routes. The secret-scanner change at 62336a8 is separate from the unchanged Resource Hub PDF validator.

## Independent browser and PDF evidence

B's acceptance at `66ab76e675846b8b400494d05d8ec8951e50cf81` is recorded in `docs/reviews/astra-b/20260907/RESOURCE_HUB_RELEASE_CORRECTION_ACCEPTANCE.md` and copied by 0c1ad35. Against 8e125ca, **14 rendered journey steps and 45 width/state captures passed**, exit 0: five states at nine widths from 320 to 1920 pixels, with no measured horizontal overflow. Two representative captures received manual visual inspection; not every image did. The earlier strengthened local API safety probe passed 34/34 at fa26224.

The browser covered synthetic admin upload/review/publication/withdrawal, Resources sign-in return, byte-exact download, audience and role denials, and delayed work followed by logout. Evidence lives under `C:/Users/sboad/projects/xenios-qa-evidence-astra-b-health-20260907/resource-browser-8e125ca-run1/`. These local Auth/in-memory Storage journeys do not prove real production Auth, persisted database/Storage behavior, or every wall path. The delayed save case combines logout and unmount; same-principal failed-refresh browser fault injection is not claimed. Earlier failed preview evidence remains failed rather than erased.

The completed [PDF report](RESOURCE_HUB_PDF_COMPATIBILITY.md), [compact receipt](RESOURCE_HUB_PDF_COMPATIBILITY_RECEIPT.json), and [hash manifest](RESOURCE_HUB_PDF_COMPATIBILITY_HASHES.json) bind PDF validator blob `8a66a45ea0872e8b67bcba3f56cd2d5665ecff8e`, LF SHA-256 `40ad433313f44c64289d42536e1da5acd43593f1f7b9a0a7098e67ad646af789`. Requested 8e125ca and observed census HEAD 0c1ad35 have the same validator blob. The fresh recursive Downloads census excluded 3,830 links/junctions and measured 905 unique content hashes across 1,133 file occurrences, with zero read/validator errors. The 99 refusals carry 101 overlapping filename/size/encryption/content-feature reasons. No PDF filenames or content were retained in the artifacts, and nothing was uploaded. Historical 494 and unverified 521 counts describe unrelated prior scope and do not qualify newer code.

B independently bound the original browser evidence forward to 46782cd without rerunning it: 2,184 source paths were inspected; only the release-control test changed. Client artifacts, preview harness, browser driver and original report hashes match the accepted run. See [runtime equivalence](resource-hub-runtime-equivalence-46782cd.json) and [outside-root inputs](resource-hub-runtime-equivalence-46782cd-outside-inputs.json). The runtime-read Founder Command Center JSON is unchanged and still carries inherited September 4/db5 evidence; it is labeled last verified and is not current serving-state proof.

The [historical 184-path inventory](source-inventory-46782cd.json) discloses account/order, partner CRM, QR/print and Hub changes. Final c350ab1 adds three evidence paths for 187 total; B independently recomputed 164 unowned paths, 23 covered paths, zero wrong-lane owners and zero ownership conflicts. The exact attested artifact is `docs/coordination/evidence/XENIOS_RESOURCE_HUB_2026-09-07.integration-ownership-review-c350.json`, preserved byte-for-byte at B's confirmed path. The earlier canonical alias remains preserved. Ownership acceptance is separate from the now-completed bounded source review; Hub browser proof does not certify every broader workflow.

Known broader gaps remain: QR export is SVG only, the partner dashboard has no requested prominent share/code/link/QR card, and Fable reports Training overflow at 320/360 pixels and Support overflow. The current freeze is preserved. Dashboard card/PNG and mobile corrections are explicitly deferred to a separate builder slice; they are excluded from completed-capability claims, not silently removed from this candidate's source. Any correction needs its own source qualification. The complete affiliate experience is not finished.

## Database candidate

The new Resource Hub migration remains **UNAPPLIED** and requires a new exact authorization.

| Companion file under `supabase/candidates/20260906120000_research_resource_library` | Current LF SHA-256 |
| --- | --- |
| `.sql` | `e55f965fbc942b4de6ec7b74b2bc28b8d7eff8dd6530f50c9876d3137e8dd722` |
| `.precheck.sql` | `742bce5729a0b4c2db848fbf32658efe0b286c5b910730fd6bfc9182c1ea6fab` |
| `.postcheck.sql` | `7c7ef33b7091cc1946077070ca6587491b299c5101ca05b4b70dcf95ff379550` |

The [current PG17 receipt](resource-hub-checker-visibility-pg17.json) at `2026-09-07T23:38:59.858Z` and [current PG18 receipt](resource-hub-checker-visibility-pg18.json) at `2026-09-07T23:39:06.242Z` each passed **154** checks with those hashes. The rehearsal script LF SHA-256 is `feb4cfec17643f3cc11213fca54fee95c17ceee1bb656d7cc6ab29c08cca166e`. All previous 150 case names remain, plus four negative checks for a non-bypass precheck executor and a non-bypass owner whose seeded rows are hidden, across both profiles.

The migration remains the exact e55f965f bytes from 6c77c56. Procedure commit 46782cd changes only the precheck, postcheck and rehearsal: both checks set transaction-local `row_security=off`, require a SUPERUSER or BYPASSRLS checker, and report the role/settings. The setting refuses filtered checks; it does not grant a bypass or alter persistent RLS configuration.

The previous 132-check results for candidate `6859a8d3b156f99b2f3f205de12e6fe84e3f484e186950543895801352f48633` and postcheck `08bbde3025b691390b3d94f9fbd4e761e63b4c1808fc07261d635753edcc3be5` remain historical. The later FORCE RLS [PG17](resource-hub-force-rls-pg17-rehearsal.json) and [PG18](resource-hub-force-rls-pg18-rehearsal.json) receipts preserve their original **150** counts and precheck `12535e95...`/postcheck `d9b2fc43...` hashes. Both generations are superseded for current procedure qualification and must not be overwritten or relabeled. B accepted SQL 6c77c56 and scanner 62336a8; B also accepted the completed checker correction at 46782cd. It does not change migration bytes or imply that production rows were hidden. See [database qualification](RESOURCE_HUB_DATABASE_QUALIFICATION.md).

A executed the updated full precheck through its own authenticated connector against `yvzeduaxbwgcwllhywff` at `2026-09-07T23:40:28.257398Z`: **PASS**, PostgreSQL 17.6, executor `postgres`, SUPERUSER false, BYPASSRLS true, `row_security=off`, zero Storage policies and zero Hub buckets. The [actual A receipt](resource-hub-checker-visibility-production-precheck.json) binds 46782cd and the current precheck hash. Its transaction setup and DO assertions ran unchanged; informational projections were combined for the connector's single-result output, followed by ROLLBACK. This is an actual read-only capability/precheck receipt, not an apply or production postcheck.

The [earlier 23:00 precheck](resource-hub-production-readonly-precheck.json) and A's 23:28:22Z confirmation of both account/partner migration rows and absent Hub objects remain historical observations. Repeat the **current** precheck immediately before any newly authorized apply.

Local WASM rehearsals do not prove exact production 17.6 post-install checks, concurrent-session locking, or enabled PostgREST/Storage private-byte delivery. Upload bytes and database writes are not one cross-service transaction; preserve orphaned private objects and history for separately authorized recovery.

## Production and authorization

The completed narrow **Universal Account and Partner Access** release remains:

- Application `ff3c496245739233b71e46f9e5d6e26af9d57017`; tree `73734e113e8ef5f9e1f27ae4dae36bdf598abb25`.
- Render service `srv-d8s9vej7uimc7384dfcg`; live deploy `dep-dafcm567bikc7382rhng`, retained in A's fresh observation.
- Supabase project `yvzeduaxbwgcwllhywff`; customer-access history `20260907143147` and partner-lifecycle history `20260907143204`, both applied with their original postchecks PASS.

The [original production report](../20260905/PRODUCTION_DEPLOYMENT_REPORT_20260907.md) records that release. Public health evidence alone does not attest a serving SHA; A separately checked Render identity. [Fresh A observations](account-partner-readonly-reverification-20260908.json) at 03:09/03:17 UTC again confirm live ff3c496, both migration-history rows, absent Hub tables, auto-deploy off and the unchanged release branch.

There is **no new GO** for the combined candidate, Resource Hub migration, or Hub activation. `RESEARCH_RESOURCE_HUB_ENABLED` remains absent/false. No new deployment, rollback, Hub migration, or flag change occurred in this qualification work.

Production partner PDF GET/implicit HEAD can write delivery audit records, so they are not read-only smoke checks. Any production fixture or download needs authority covering those effects. Real-account verification still requires separate approval naming the account and notification effects. No real account approval/claim, partner activation, recruiting/referral rollout, price/commerce activation, smoke notification job, email, purchase, payment/refund, shipment, fulfillment, or clinical action is authorized. Preserve customer, approval, partner, agreement, audit, billing and outbox history; additional database recovery needs separate approval.

## Remaining release work

The full suite, build/typecheck and bounded substantive review are complete; every failed/interrupted predecessor is retained. The specific next privacy input is the release-review source register identifying the allowed internal team, advisor and counterparty documents. A and the coordinator found no such register in the current bounded records. Once identified, A can hash exact sources before extraction, prepare V3 privately and return its actual counts/bytes/hash for separate approval. No broader account search or repeat V2 export is needed. V2 remains securely preserved and partial. After hash approval, the unchanged strict scanner must run; no privacy PASS is implied now.

Enabled Supabase Storage/API behavior and the required real-auth/account-switching scope are not proved by local memory/WASM tests. The deferred dashboard card/PNG and mobile findings remain separate. The [formal source manifest](../../coordination/release-manifests/XENIOS_RESOURCE_HUB_2026-09-07.json) records the passed source/test gates and all remaining release prerequisites. Its structural acceptance is not authorization or production readiness.

Once required gates are complete, assemble the exact application SHA/tree plus separate evidence head, migration/check hashes, flags, authorized smoke, compatible rollback and observation packet. There is no new production authority. Overall status remains **NOT READY**; this is neither a full revenue launch nor a completed Xenios Health platform.
