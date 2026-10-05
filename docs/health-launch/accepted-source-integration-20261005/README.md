# Accepted-source integration handoff, 2026-10-05

SOURCE INTEGRATION ACCEPTANCE READY FOR CLAUDE REVIEW

This is a bounded, purchase-disabled source-review handoff, not production readiness, a new Claude verdict, or permission for hosted action. The exact integrated source is pushed. Qualification limitations and expected failed gates remain visible below.

## Identity and authority

- Branch: `codex/accepted-source-integration-20261005`
- Worktree: `C:/Users/sboad/.codex/worktrees/b22f/xenios-website`
- Exact base: `3eaa017fcbd28989c65ffc4bb439a554aa1f3f59`, tree `f38c4d59875cf9d6b0a833a0f0ba0cab9997090e`
- Registration-only predecessor: `66fda5c760ad7d8d95a38f24d7face857e29a920`
- Integration source: `756a906877dbc174b7e228a259d2faa9c3af48ca`
- Integration source tree: `787432948d9464880df1dcfc5dff58eec7d889aa`
- Session: `codex-accepted-source-integration-20261005`
- Task: `ACCEPTED-SOURCE-INTEGRATION-20261005`
- Controlling request: `561596358cbe5ba6b8d5a5a93f85e7df611b2479:docs/coordination/launch-coordination-20261005/INTEGRATION_REQUEST.txt`, including its coordinator addendum.

The full Core/IC-2, partner, D/E foundation, DE-R1 and subscription Claude acceptance reports at that same records commit were read. Their `CLAUDE_*_ACCEPTANCE.txt` files are external provenance, not merged histories. Samuel's direct cross-chat coordination authorization was verified in the coordinator chat. The coordinator and an independent read-only scope agent separately corroborated the 65-path composition. Neither is a substitute for Claude reviewing this new combined source.

The old Core branch at `b0e818f0b3908b13c4181c5b6a59751c1505694b` and partner branch at `3f044f41b93d41c4ca40954eabd919dfb6ef0be4` remain parked and preserved. A registration checkpoint was first pushed at `2da2e25c04b4adcf1f2ebfc92113cbbaa97b0643` on `codex/accepted-source-integration-registration-20261005`; only this new task/session/lease was carried into the exact base. No fleet registry was replaced wholesale.

## Included inputs and excluded work

Each input means its filtered parent-to-commit delta, in this order, not its branch tip or full ancestry:

| Input | Exact commit |
| --- | --- |
| Core runtime | `70cd421a6ab79513744f531d921b3ece61044874` |
| Core tests | `1a409e2f7e1fcdeffc78d24428eeb626d7888e9c` |
| IC-2 runtime | `c93bf5a2c1e2b50c5b40c65f0149033ad84658a0` |
| IC-2 tests | `2a791beeb26b75266b9468aa4a32a4cd07fe871d` |
| Partner return runtime | `94e89be7c959087edfde4ebddf2f50fa5e02cc36` |
| Partner return tests | `806c58a83bb3c0f1f75b9e003de14aa525069950` |
| MC-01 mixed source/test/candidate | `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6` |
| D/E foundation | `5152adb4db6db3e197d4534146bcc2ae75fa8f96` |
| DE-R1 correction | `e6a8171b5b2d4ad78930c214997532e16601a48e` |
| Subscription guarded source | `38d3e467961e12256bd6c5726210b455c3719076` |
| Subscription retry guard | `cad491237e681a643cfe54cc81063ae1662d9bcb` |
| Subscription quantity correction | `7806fb5939a69189e085739fad8cc832cfab201a` |

Excluded: all producer `.xenios`, docs, review, evidence, registration and handoff deltas; no producer branch was merged. The MC-01 rollback Markdown is the single explicitly retained SQL safety companion among its 25 accepted paths, not a lane handoff. Finance candidate `dfd8b9b09815357d6c92f9c00eadf1782325269a` and its tests/runtime, Finance records ancestry `963122ce355568d118c00ed6e774b474e2f50101`, and the coordinator branch ancestry were not integrated. Existing Finance code already in the agreed base is not removed or described as new integration work. No other source/test input was added, apart from the requested bounded HTTP refusal test expansion below.

The complete 65 paths and their classifications are in [PATHS.md](PATHS.md). There are 36 runtime paths, 25 test paths, two unregistered SQL candidates, one local verifier and one rollback companion. [Composition evidence](evidence/composition-invariants.json) binds each to accepted Git blobs and LF SHA-256 values. 63 final blobs match the latest accepted input exactly.

## Conflict and semantic composition ledger

| Intersection | Resolution and verification |
| --- | --- |
| Core versus D/E `AssistedOrderPage.tsx` | Retain D/E media import/card and Core `xenios-order-page--customer` in the wrapper template. The composed file differs from the D/E snapshot only by this customer class. Core admin wrapper remains unchanged. |
| MC-01 then D/E, eight overlapping adapter/projection/service/admin/contract paths | Apply in the accepted dependency order; final bytes equal the accepted D/E successor. Missing/malformed media stays presentation-only. |
| ProductPage subscription consumption | Subscription files are disjoint from other deltas; the composed catalog/detail is tested with the accepted guarded wrapper. Real page still has no authoritative offer and no create control. |
| Requested PS-R5 refusal test | Parameterize the existing canonical refusal test over HTTP 400 and 403. Both use actual `Response` status values with synthetic fetch and prove one request/no legacy retry. This is an adapter test, not a live TCP/server or provider test. |
| Everything else | Exact final accepted source blobs; no blind ours/theirs selection, full-file replacement of independent overlap, or unreviewed Finance import. |

Core public display is Xenios Health; `BRAND.publicName` remains Xenios. No metadata/title policy rewrite. Core customer focus/CTA styles and IC-2 neutral timeline are retained. "Admin unchanged" describes the Core customer-style boundary only: accepted MC-01 intentionally changes the Product Admin media notice/required-input treatment.

## Serialized qualification on the clean source

All completed jobs below started and ended clean at the exact source SHA/tree above. Node `v20.19.0`, npm `10.8.2`; executable `C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe`. Existing dependencies were previously rebuilt under that pinned runtime; package and lockfile are unchanged from the base. The wrapper prepends the pinned directory to process-local PATH, invokes adjacent npm explicitly and sets the real dataset reader. No permanent PATH or system-wide Node change was made.

| Job | Result | Exit | Wrapper duration |
| --- | --- | --- | --- |
| `integration-subscription17-run1` | 17 files, 401 PASS, 0 FAIL, 0 SKIP | 0 | 61.182s |
| `integration-affected-run1` | 36 files, 626 PASS, 0 FAIL, 0 SKIP | 0 | 76.855s |
| `integration-typecheck-run1` | TypeScript no-emit PASS, no diagnostics | 0 | 98.413s |
| `integration-build-run1` | Full npm production build PASS | 0 | 45.952s |
| `integration-protection-run1` | Expected FAIL, exact base to source | 1 | 0.446s |
| `integration-protection-default-run1` | Expected FAIL, origin/main to source | 1 | 0.593s |
| `integration-routes-run1` | PASS: 462 static Express registrations, 453 call sites | 0 | 3.235s |
| `integration-dag-run1` | PASS: 53 registered nodes, canonical checksums | 0 | 12.176s |
| Full repository aggregate | DEFERRED, NOT RUN on this candidate | none | none |

The two focused suites overlap; 401 + 626 is not a unique-test aggregate. All 25 changed test paths and the required full 17-file subscription set ran. [49 focused-file source bindings](evidence/focused-source-bindings.json) and every exact command, start/end revision, timing, exit and raw log are archived under `evidence/`. [evidence-index.json](evidence-index.json) verifies all eight completed raw log hashes. Each job remains separate.

The actual whole-catalog coverage is included in the 36-file run with `XENIOS_MASTER_OFFERINGS_DATASET` set to `server/research/master-offerings/data/member-safe-master-offerings.generated.json`; it was not silently skipped. Benign jsdom `scrollTo` warnings remain in the raw log. A preflight typo named nonexistent `production-catalog-policy.test.ts`; preflight refused before Vitest started. The real existing `pathway-authority.test.ts` was used in the recorded successful run. This preflight was not a failed or passed suite.

PS-R1's receipt gap is closed locally by the fresh complete 401-test run. Prior split 377 + 23 receipts are not relabeled as a clean aggregate. Child-worker provenance is sampled, not continuous attestation: focused runs observed pinned workers; typecheck observed pinned tsc; the build sample observed wrapper/adjacent npm, not every transient Vite/esbuild/tsx descendant. Fast route/protection jobs finished before a four-second sample. Exact npm/build command and PATH pinning are evidence, not a claim of continuous process observation.

Build no-em-dash gates scanned 1,357 runtime files and 228 production-build files: zero forbidden customer-facing forms in each. Existing Vite chunk-size and AdminResearchHome static/dynamic import warnings remain. They are not build errors. Production client build inventory: 349 files, inventory SHA-256 `17a26c8fff606afacff4ba8dabfdd898b2fc5c94c6a9887f867bab17abbc7fa6`.

### Aggregate deferral and historical runs

At 18:46:59Z, available RAM was 805 MiB; at 18:47:27Z, 1,452 MiB. Total RAM was 16,087 MiB, committed memory approximately 39.76 GB of 60.73 GB, disk free 27.31 GiB. No other heavy Node test/build job was observed. Typecheck earlier drove available memory to roughly 304 MiB. The request explicitly allows evidence-based resource deferral. No unrelated app/process was killed and no data/volume was deleted to manufacture capacity. See [aggregate-deferral.json](evidence/aggregate-deferral.json). A quiet-host full aggregate is still release qualification, not PASS.

The inherited ADP-G1 aggregate remains FAILED: 19,443 PASS / 3 FAIL / 85 SKIP, exit 1 (two protection assertions and a pgcrypto timeout), log SHA-256 `4a86e028630c90b7f7cb05d12e4e4ff83f2df4f51b26f9d1017023a308ee1882`; its existing `docs/health-launch/evidence/hl12-adpg1-quarantine-isolation-20261001/` records are untouched. The coordinator also carries a prior ENOSPC aggregate as FAILED. Its exact raw receipt was not located in the scoped b22f scratch/Core records searches in this closeout, so no counts, tested SHA or replacement success are invented. Preserve that historical failure and obtain its precise index from the originating lane if needed.

## Browser evidence and limitations

Actual integrated production client, not Vite dev or another branch. The private loopback harness uses the actual `researchPageGate` and `serveStatic`, with synthetic read APIs and an unsigned local-only member identity. It is not the complete production server. All products are fictional and unavailable, with null prices, selections and subscription offers. Node outbound TCP/UDP/HTTP is blocked; browser CSP restricts transport to the local origin, blocks hosted images/workers/forms, and all server methods except GET/HEAD are refused. No real signup/login, payment, grant, email or provider operation was attempted.

Preview was `http://127.0.0.1:60953/`, synthetic bootstrap `/__preview/start`. It is now stopped. The TTY interruption returned exit 1 without the graceful-stop/result receipt; this is preserved as an interrupted preview stop, not a clean test exit. Both preview PIDs were absent afterwards. A separate read-only rehash at 18:47:45Z verified all 349 retained snapshot files unchanged. The scratch snapshot remains recoverable; no cleanup success is claimed.

| Requested CSS width | Measured innerWidth | innerHeight | document clientWidth = scrollWidth | Page overflow | Routes |
| --- | --- | --- | --- | --- | --- |
| 1440 | 1440 | 800 | 1421 | 0 | all eight |
| 1024 | 1024 | 800 | 1005 | 0 | all eight |
| 768 | 767 | 800 | 748 | 0 | all eight; exact768 unqualified |
| 430 | 430 | 800 | 411 | 0 | all eight |
| 390 | 390 | 800 | 371 | 0 | all eight |
| 320 | 320 | 800 | 301 | 0 | all eight |

Eight routes are `/`, `/care`, `/products`, `/partners`, synthetic member `/research/member/products` and its missing/malformed/blocked detail fixtures. All final measurements wait for visible content. Public headings and both Health shell accessible names rendered; no visible public control crossed document horizontal bounds. Member navigation intentionally scrolls inside its own narrow container: zero page overflow does not mean no nested horizontal scrolling.

Both partner body links retain `/sign-in?returnTo=%2Fresearch%2Fpartners%2Fdashboard`. A real browser click preserves the hint through sign-in and password-recovery links. Direct signed-out partner dashboard shows "Sign in to view your partner dashboard", no account activity, with its canonical return link. This is local signed-out rendering, not successful live partner Auth/RLS E2E or evidence about real active partners.

The three catalog fixtures remain listed; detail pages render exact fallback text "An approved product image is not available." with no role="img". Fallback square reservation was measured 1:1 (219.1927px square at320; 332.34375px square in a later430 observation). The blocked descriptor visibly falls back under CSP; an error-event trace was unavailable, so this is not independent onError-event or storage-delivery proof. The passing component tests cover onError/dimension/expiry behavior. No real approved image, caption delivery or delivered hash was qualified. Every detail shows "A subscription offer is not available for this product yet.", no create form/main button, and no false active or purchased state.

Keyboard Tab reached the public Health home link with visible purple `rgb(124,58,237)` 2.5px outline, and from member Variant to a visible View product link with native focus outline. Forced-colors emulation was confirmed with matchMedia and a visible public screenshot; member focus/geometry also remained observable. This is not native OS high-contrast certification or a complete accessibility audit.

**Explicit browser limits:** native helper initialization failed twice with system path error3. Chrome reported approximately80% page zoom through CDP; no native200% or400% result is claimed. Viewport overrides are responsive proxies only. Integer calibration yielded767 or769 around the requested768; fractional override was rejected. `Log.enable` and early layout-shift instrumentation were unsupported through the browser bridge; numerical CLS is unqualified. Intermediate geometry changed, so zero layout shift is not asserted. An initial pre-render Care sample, uncalibrated wide screenshot and blank scrolled forced-colors capture were rejected rather than counted. Temporary viewport and forced-color overrides were reset. No UI source fix was made merely to accommodate the tool.

Evidence: [browser-observations.json](evidence/browser-observations.json), [build receipt](evidence/build-preview-receipt.json), [public focus screenshot](evidence/public-shell-focus-1440.png), [forced-colors screenshot](evidence/public-shell-forced-colors-1440.png), [synthetic detail screenshot](evidence/synthetic-detail-430-full.png). PNG dimensions include automation canvas gutters and are not CSS viewport measurements. The detail screenshot shows fictional fixture content only.

## Protection and registered release controls

Manifest not recut. Exact accepted LF SHA-256 values are preserved:

| File | SHA-256 |
| --- | --- |
| Navbar.tsx | `6cdfbb0f05cc8d1fb28bfdc6b7a012ddb85e34d0c985bc88e71c09d8456a218a` |
| Footer.tsx | `420b45dc09aefa572a65ae68b5add6a2ce3d435e54e1fea7d9db9f29390df7cb` |
| index.css | `b475a8ee637984965df7497e6bcc9d92113c52c0dd2e21019d5d2806e47fa049` |

Samuel's exact protected-hash approval is still missing. Both gate runs FAILED: these three accepted successor mismatches plus inherited `server/static.ts`; inherited App/server/index/research/index seam warnings also remain. Default origin/main comparison (`6077a6bbb276acf9669c1419c735a9327f8740b1`) additionally reports inherited outside-zone paths across the long history. The bounded integration comparison has no new outside-zone path. The three newly accepted hashes are not described as old baseline approvals. No integration modification beyond the accepted hashes is present.

Protection manifest, migration DAG, migration ledger, App, server/static, server entrypoints, package and lockfile are identical to the exact base. Route uniqueness and registered DAG passing do not waive protection, GATE-01 or source-only SQL qualification. GATE-01 Access Hub remains an unresolved founder decision; integration did not choose a route behavior or weaken its assertions.

## SQL and hosted boundary

| Source-only artifact | Git-byte SHA-256 | Status |
| --- | --- | --- |
| `supabase/candidates/20261003_research_media_commerce_decoupling.sql` | `365728cbc40a60ce3d5ffacbbbd09fd8d716c0413ddb1171565ed50563c9ffa4` | Accepted source, not registered/applied by this work |
| `supabase/candidates/20261005_research_product_media_descriptor.sql` | `552f91324eefce7b6b4c3c1876fe49650af0be295ae15ca363147581a4134f5f` | Accepted source only; execution-unqualified |

The ledger and DAG are unchanged; neither candidate name is registered there, and there is no new managed migration file. No SQL was executed by this integration. This proves source-side non-registration and our lack of application; there was no fresh managed-schema query, so do not interpret it as an independently observed current hosted absence.

MC-01 runtime requires the separately reviewed persistent-cart predecessor chain, including inventory-reservation and strength-write-gate dependencies, then the candidate, canonical non-image product_content reapproval and a separate launch transition. Existing production schema compatibility is not established by TypeScript tests or fallback-only imagery. Adoption requires zero rows in all four `research_persistent_carts/items/commands/events` tables. Nonzero history requires preservation/adoption work, never deletion to pass. Preserve `RESEARCH_MEDIA_COMMERCE_CART_RECONCILIATION_REQUIRED`. MC-01 intentionally refuses a second application; it is not twice-idempotent. D/E is additive but non-idempotent and execution-unqualified. Neither has a destructive postcommit rollback; preserve history and roll forward under a separately approved plan.

Read-only production observation: Render service `srv-d8s9vej7uimc7384dfcg`, live deploy `dep-daqft3vf3r2c73b7e88g`, production commit `79414143d4355d5d3d14cd5fe6e5a536dc68d99d`; release branch `release/early-access-code-session-checkout`, autoDeploy off. At18:28:44Z `https://xenios-website.onrender.com/api/health` returned200 and `commerceEnabled:false`. Supabase/admin configured flags are health booleans, not credential or permission qualification. The broad service-list call lacked a selected workspace; exact known-service reads succeeded without changing workspace/configuration. No environment secrets or raw customer/payment records were read. See [read-only observation](evidence/production-read-only-observation.json).

Production mutated: NO. Staging mutated: NO. Deploy: NO. Migration registration/application: NO. Real email/payment/payout/procurement/clinical action: NO. Partner activation, capability enablement and imagery publication: NO.

## Remaining findings and blockers

| Class | Finding / required follow-up |
| --- | --- |
| SOURCE BLOCKER | None found in this bounded composition. Claude must independently review the new exact source; any new demonstrated composition defect changes this disposition. |
| HOSTED-AUTHORITY BLOCKER | MC-01 predecessor/adoption/manifest/launch chain and D/E descriptor execution qualification remain incomplete. No runtime-only promotion. |
| HOSTED-AUTHORITY BLOCKER | All six subscription buying prerequisites OPEN: durable create idempotency; durable canonical referral lineage; current-price comparison at decisive write; canonical eligible-offer projection; durable production activation/currentness; independent real payment/finality authority. |
| HOSTED-AUTHORITY BLOCKER | PS-R2: preexisting server still accepts nonempty typed payment/shipping references; accepted client omission is not a server fix. PS-R3: service capability projection/production activation seam remains missing; a test-only gate does not close it. Server routes, production-deps and subscriptions authority are unchanged from base. |
| HOSTED-AUTHORITY BLOCKER | Finance F1 and refund/dispute OPEN; ADP-G1 PARTIAL; G2/G3/G4 and LENS adoption OPEN. No Finance source added or payment/provider capability enabled. |
| FOUNDER DECISION | Exact three protected-hash approvals; GATE-01 Access Hub disposition; intended subscription/product plan. Current effective quantity1-50 and frequencies30/60/90 remain;51/100 refused. No new policy100 decision inferred. |
| RELEASE QUALIFICATION | Resource-deferred aggregate; inherited protection/static/seam findings; exact768/native zoom and full forced-colors/accessibility/CLS qualification. Prior failed/timeout/skipped evidence remains separate. |
| RELEASE QUALIFICATION | Real imagery held: metadata ingestion/review writer, five canonical reader connections, immutable delivered bytes, card/detail delivered-hash proof, full responsive/zoom/forced-colors/CLS and descriptor SQL execution. Foundation integration is not imagery release. |
| NONBLOCKING FOLLOW-UP for this disabled source handoff | PS-R4 forward-looking "yet"/placeholder copy, PS-R7 free-string priceVersion versus cart integer shape; preserve review visibility, invent no offer. |
| NONBLOCKING FOLLOW-UP for this disabled source handoff | DE-R1 preserves accepted skew correction only. Arbitrary clock skew, exact server-time expiry under arbitrary skew and stale remount remain unproved. |
| NONBLOCKING FOLLOW-UP for evidence reconciliation | Locate precise original ENOSPC aggregate receipt; do not overwrite or manufacture it. |

## Reproduction

Run only in a clean isolated checkout at the exact source with compatible dependencies and the verified private Node20 runtime. Preserve other active worktrees. All historical result files are immutable; choose fresh job names. The full commands used are the `command` arrays in each `*-result.json` (or preview `*-start.json`). `evidence/run-check.mjs` archives the original wrapper; `preview.mjs` and `fixtures.mjs` archive the private harness. They are evidence, never application imports/deployment inputs. Text archive normalization may change helper byte hashes; the original scratch helper hashes and observed receipt remain authoritative for this run. A new harness location needs a fresh receipt, not a falsified old one.

```powershell
$node20 = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe'
$runner = 'C:/Users/sboad/.codex/tmp/health-n2-20261001/run-check.mjs'
& $node20 --version
& $node20 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node_modules/npm/bin/npm-cli.js' --version
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
git status --short

# Exact focused arguments are replayable from the immutable result records.
$receipt = Get-Content -Raw 'docs/health-launch/accepted-source-integration-20261005/evidence/integration-subscription17-run1-result.json' | ConvertFrom-Json
$nodeArgs = @($receipt.command | Select-Object -Skip 1)
& $node20 $runner integration-subscription17-rerun2 @nodeArgs
# Repeat using integration-affected-run1-result.json with a fresh job name.

& $node20 $runner integration-typecheck-rerun2 node_modules/typescript/bin/tsc --noEmit
& $node20 $runner integration-build-rerun2 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node_modules/npm/bin/npm-cli.js' run build
& $node20 $runner integration-protection-rerun2 scripts/acceptance/verify-core-site-protection.mjs 3eaa017fcbd28989c65ffc4bb439a554aa1f3f59 HEAD
& $node20 $runner integration-routes-rerun2 node_modules/tsx/dist/cli.mjs scripts/acceptance/verify-route-uniqueness.ts
& $node20 $runner integration-dag-rerun2 node_modules/tsx/dist/cli.mjs scripts/acceptance/verify-migration-dag.ts
# Only after a fresh quiet-host resource check, serialized:
# & $node20 $runner integration-full-run1 node_modules/vitest/vitest.mjs run --maxWorkers=1 --no-file-parallelism
```

The records files are not present at the earlier source commit: read/copy the receipts from the separately pushed records tip without importing source histories. Keep source revision and records revision distinct. The actual wrapper uses the b22f worktree path and sets the real dataset explicitly; a reviewer on another checkout must adapt those local paths and record the new provenance, never reuse this run's identity.

Next exact task: independent Claude review of source `756a906877dbc174b7e228a259d2faa9c3af48ca` and tree `787432948d9464880df1dcfc5dff58eec7d889aa`, using this evidence and retaining all holds. Stop integration here. A later production action requires Samuel's separate current exact-SHA authorization, compatible managed qualification, founder decisions, pre/postchecks and rollback; this handoff grants none of those.
