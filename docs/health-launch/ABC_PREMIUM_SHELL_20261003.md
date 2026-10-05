# A/B/C public-shell implementation handoff

Status: bounded implementation and local code checks complete; browser premium qualification BLOCKED/INCOMPLETE. Ready for source review with explicit holds. Not premium accepted, not independently reviewed, not release approved. Recorded October5 after a host pause during browser-tool work.

## Exact candidate and authority

- Branch: `codex/xenios-health-launch-implementation-20260930`.
- Worktree: `C:/Users/sboad/.codex/worktrees/b22f/xenios-website`.
- Base records: `3eaa017fcbd28989c65ffc4bb439a554aa1f3f59`.
- Prior runtime: `c0e25c73a0d789829ea213e2ee040c68e06f0a75`.
- A/B/C source: `70cd421a6ab79513744f531d921b3ece61044874`.
- Source tree: `37ea984993cc78ee61d0e9ca944fca0213e73ba8`.
- Tests only: `1a409e2f7e1fcdeffc78d24428eeb626d7888e9c`.
- Clean typecheck/build/protection HEAD: `83d1b9754583b43a03f4d477f47c5f5bad527015`, tree `ce3ee5d2b7455aa14500af9cd9d679c3e40a953f`; records/tests lineage, not a new runtime candidate.
- Release controls unchanged from `22f8d390c730460aa3e695f84213de6bd41ea1b2`; no release-control source or manifest change in A/B/C.
- Controlling scope: Execution Sprint v2 Session01, user-authorized in the pasted attachment `44bf7b83-c36d-4088-82d5-1824cbfb1088`.
- Read complete Claude impact map at `10c40cd8e43f35a99c7ec5e918720d6405805962`, founder A-E record `a4e647eb69959eb91fc05dde8f211342d692b04c`, and baseline authorization `bfec2d8de327f94394cb8ccb1c513ef046c9a845`.
- Task/lease: `HEALTH-ABC-PREMIUM-SHELL-20261003`, same existing Core session. Separate MC01, finance and imagery ownership remains intact.

## Changed paths and behavior

Source commit contains only these ten files:

1. `client/src/clarity/brand.ts`: additive display-only `healthDisplayName: "Xenios Health"`; `publicName`, pageTitle and metadata unchanged.
2. `client/src/components/Navbar.tsx`: three visible/accessible brand references use the new display value; destinations, navigation and logic unchanged.
3. `client/src/components/Footer.tsx`: two visible/accessible brand references use the new display value.
4. `client/src/index.css`: one sparse footer decorative purple-to-teal rule, solid purple public-button focus, forced-colors counterparts. Existing button heights and old unused gradient primitives preserved.
5. `client/src/research/account-portal/account-portal.css`: purple focus and selected navigation; scoped existing buttons retain geometry.
6. `client/src/research/catalog-priority/catalog-priority.css`: purple filter focus and selected filter.
7. `client/src/research/assisted-order/AssistedOrderPage.tsx`: customer root marker only.
8. `client/src/research/assisted-order/AssistedOrderConfirmationPage.tsx`: customer root markers only.
9. `client/src/research/assisted-order/AssistedOrderStatusPage.tsx`: customer root marker only.
10. `client/src/research/assisted-order/assisted-order.css`: customer-only black 4px primary, outlined secondary, text/underlined tertiary, 44px minimum, wrapping, explicit hover/disabled/focus, matching skeleton height, solid purple selection and forced-colors rules. Former shared primary color declarations remain on non-customer roots to preserve admin presentation.

Tests-only paths: `client/src/clarity/premium-shell.test.tsx` and `client/src/research/assisted-order/assisted-order-premium.test.tsx`.

No labels, hrefs, action-policy strings, test IDs, availability, price, payment, auth or server authority changed. No image integration or missing-image accent. Xenios Care and Xenios Research pathway names remain. PWA, Wordmark, SeoHead, page title suffixes, metadata, OG and admin operational chrome remain out of scope.

Exact brand diff:

```diff
 export const BRAND = {
   publicName: "Xenios",
+  healthDisplayName: "Xenios Health",
```

## Protected hashes (SHA-256 of LF-normalized bytes)

| File | Authorized starting hash | New source hash |
| --- | --- | --- |
| Navbar.tsx | e37a5b94cb07674e8f4471ddc37b9a5e8a6f848d300408ba67ff3b706941eb1f | 6cdfbb0f05cc8d1fb28bfdc6b7a012ddb85e34d0c985bc88e71c09d8456a218a |
| Footer.tsx | 25da700fcea32178d19fc21a3d6db4192d11b403418b7fa83100b4c88d9e2a3a | 420b45dc09aefa572a65ae68b5add6a2ce3d435e54e1fea7d9db9f29390df7cb |
| index.css | 70d3302a8b4f5d22aa324c3728ae51963d12222ab880c29fcd3f8ea3e477d0e6 | b475a8ee637984965df7497e6bcc9d92113c52c0dd2e21019d5d2806e47fa049 |

All three starting hashes were checked before edits. Successor hashes are not founder-approved. The protection manifest was NOT re-cut. No other protected source file changed in this slice.

## Qualification ledger (separate runs)

All recorded wrapper runs use full-path private Node `v20.19.0`, adjacent npm `10.8.2`, process-local PATH, and the real `XENIOS_MASTER_OFFERINGS_DATASET` reader. Official Windows x64 archive SHA-256: `be72284c7bc62de07d5a9fd0ae196879842c085f11f7f2b60bf8864c0c9d6a4f`. Process samples are discrete observations, not continuous worker attestation.

| Run | Result | Provenance/limits |
| --- | --- | --- |
| Initial delegated invocation | Interrupted, exit 1, no result output | Not a test failure or pass; stopped before final checks. |
| `abc-affected-run1` | 479 PASS / 30 files, exit 0; 184.403s wrapper | Started dirty at base3eaa017, ended at tests1a409. Exact final runtime bytes were committed while this ran. Includes assisted-order, PageShell, account-entry Navbar, Care, Research touch targets, account portal, catalog-priority, status and public surfaces. `Navbar.audience-navigation.test.tsx` filter did not exist and was not run. jsdom scrollTo warnings are not browser evidence. |
| `abc-shell-run1` | 12 PASS / 1 file, exit 0; 15.551s wrapper | At tests1a409, continuity records dirty only. Public family shells, mobile focus, unchanged metadata/member chrome, CSS constraints. |
| `abc-typecheck-final` | PASS, exit0;262.567s wrapper | Clean83d1b975 start/end, no diagnostics. Host free physical memory observed as low as95,440KB; no other lane/process killed. |
| `abc-build-final` | PASS, exit0;75.480s wrapper | Clean83d1b975 start/end. Source1,353/build226 files scanned, zero forbidden customer-facing em-dash forms. Existing dynamic/static-import and >500KB chunk warnings retained. |
| `abc-protection-final` | FAIL, exit1;3.047s wrapper | Bounded3eaa017..HEAD:34 protected hashes match; new authorized Navbar/Footer/index.css mismatches plus inherited server/static.ts mismatch. Three inherited App/server/index/research/index seam warnings. No manifest amendment. |

Raw wrapper directory: `C:/Users/sboad/.codex/tmp/health-n2-20261001`. Archive: `docs/health-launch/evidence/abc-premium-shell-20261003/raw-checks.json`, SHA-256 `a862f113edf779c162e29e29ab38914f1e7b69147ec4d2f9f83a218a8f3f407c`. All five completed commands/logs/exit statuses/revisions and process samples are preserved separately. Four affected-run samples and one shell-run sample observed pinned child workers; five typecheck samples observed pinned tsc. Two build samples observed wrapper/npm only, NOT every intermediate cmd/tsx/Vite/esbuild descendant. Those descendants are not individually attested; process-local PATH and adjacent npm invocation are recorded. Protection completed before its first sample.

No new full-suite aggregate was requested/run for this bounded presentation slice. Earlier ADPG1 aggregate remains FAILED: 19,443 pass / 3 fail / 85 skip, exit 1 (two unchanged protection assertions and one pgcrypto timeout). Isolated reruns do not replace that result.

## Browser evidence and preview limits

Native helper initialization failed twice (`failed to write kernel assets`, system path error3). Chrome connection/tab creation timed out; an existing unrelated preview is not this candidate. None of these failures is a layout pass or a layout defect. The exact production client subsequently loaded in IAB, but unreliable sizing prevented acceptance; observations are below.

The ten required widths (1440,1280,1024,834,768,430,390,375,360,320), actual 200% browser zoom, real keyboard/forced-colors inspection, overflow, long branding, Sign In/Start Care, button wrapping and skeleton layout stability remain unverified. No screenshot from an older build is relabeled. Actual candidate comparison with founder preview `e9ebc7b7df44a8921dd4b64100590da51310ba9a` remains pending.

Private preview RUNNING: `http://127.0.0.1:59535/research/early-access/order-request`, PID65912, exec session13019. It serves the exact clean production client with six explicitly synthetic catalog rows and disabled integrations; all non-GET/HEAD requests are refused, no real server authority mounted. HTTP page/catalog GET200, six rows, synthetic header and refused POST405 were observed. This does not qualify auth, pricing, payments, SQL, email or production server composition. Catalog delay750ms is deliberate fixture behavior for future skeleton capture.

Receipt/launcher copies are in the evidence directory. Receipt SHA-256 `83a5795e8da4d56dd865cd7b3a36f10cd6c603df85576048d34ef297f70311e7`; launcher SHA-256 `5b762ed357b9d3aa00abc592410ebb6dd54a22ed6985e39cfe124df304eab41b`;347 distribution files, inventory SHA-256 `a74abe70847f5d665cd39e00ee160fd400c6805e8750d0763a51ac4beaa52154`. Loopback-only, disabled integrations, Node outgoing TCP/UDP/HTTP refusal and preview same-origin CSP are harness restrictions, not production qualification. Browser top-level navigation is not OS-sandboxed. Private snapshot: `C:/Users/sboad/.codex/tmp/health-abc-20261003/abc-preview-dist-scFxQp/dist`.

IAB tab5 DOM showed both `Xenios Health home` lockups, unchanged Sign In/Start Care destinations, Care guidance and six synthetic rows. Requested1440x1000 yielded4363x3030 CSS pixels, DPR0.330000013, client/scroll4363, overflow0. Ctrl+0 and documented CDP metrics did not correct it. Tool-rendered screenshot was distorted (13221x9182), rejected and NOT indexed as acceptance evidence. This cannot prove requested-width fit or a source defect. After clearing metrics and resetting viewport, actual3878x2181, DPR0.495000005, client/scroll3832, overflow0. Six primary controls computed rgb(14,14,14), radius4px, height46.0227px; Continue remained disabled. These are uncontrolled-scale observations, not breakpoint/zoom acceptance. Overrides cleared; tab5 marked for continuation. No publishable screenshot is claimed.

## Source comparison and audit limits

Read-only comparison to approved preview `e9ebc7b7df44a8921dd4b64100590da51310ba9a` (tree `e9a7a5c5697bc9cdf85a69dd5b6fdb0f483f8fca`) found intentional deltas, not visual equality. Preview's actual lockups remained Xenios; Health appeared in decision-A sample. Candidate applies Health to actual lockups/names while retaining22px/850 typography, not sample28-48px/900. The existing <520px mark-only behavior and navigation breakpoints remain per Claude's impact map. Global button52/56/60/64px heights remain; assisted controls use44px minimum, wrapping and44px skeleton per S4. The single4px/max240px footer divider is deliberate real-shell placement. No preview-only simulated journeys, authority, imagery or metadata changes were transplanted.

A separate Codex subagent's adversarial source audit found no actionable scope/regression finding. Static inspection only; it is not independent Claude acceptance or actual visual comparison.

## Exact commands and reproduction

The raw archive contains every full command. Historical commands, from this worktree:

```powershell
$abcNode = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe'
$abcCheck = 'C:/Users/sboad/.codex/tmp/health-n2-20261001/run-check.mjs'
$abcNpm = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node_modules/npm/bin/npm-cli.js'
& $abcNode $abcCheck abc-affected-run1 node_modules/vitest/vitest.mjs run client/src/research/assisted-order client/src/components/PageShell.test.tsx client/src/components/Navbar.account-entry.test.tsx client/src/components/Navbar.audience-navigation.test.tsx client/src/care/shell.test.ts client/src/research/layout-touch-targets.test.tsx client/src/research/account-portal client/src/research/catalog-priority client/src/clarity/StatusPage.test.tsx client/src/clarity/public-surfaces.test.tsx --maxWorkers=1 --no-file-parallelism
& $abcNode $abcCheck abc-shell-run1 node_modules/vitest/vitest.mjs run client/src/clarity/premium-shell.test.tsx --maxWorkers=1 --no-file-parallelism
& $abcNode $abcCheck abc-typecheck-final node_modules/typescript/bin/tsc --noEmit
& $abcNode $abcCheck abc-protection-final scripts/acceptance/verify-core-site-protection.mjs 3eaa017fcbd28989c65ffc4bb439a554aa1f3f59 HEAD
& $abcNode $abcCheck abc-build-final $abcNpm run build
```

For reruns use NEW job names: wrapper refuses overwrite. Omit the nonexistent audience-navigation filter in a corrected new command. Wrapper pins process-local PATH and the real dataset. Large jobs run serially. Heavy-job-complete notice successfully delivered to MC01 after13:12:35UTC; earlier coordination timeouts are not confirmed delivery.

Initial interrupted command (session24234, Ctrl-C, exit1, zero output, not a failing test result):

```powershell
& 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe' node_modules/vitest/vitest.mjs run client/src/research/assisted-order/assisted-order-premium.test.tsx client/src/research/assisted-order/assisted-order-accessibility.test.ts --maxWorkers=1 --no-file-parallelism
```

Preview reproduction: use archived harness in private scratch, exact source/tree above, absolute `--repo` and its `--dist`, NEW private `--receipt`, clean successful `--build-result`. First `--create-receipt --catalog-delay-ms 750`; then same repo/dist/receipt/source/tree with `--port 0 --catalog-delay-ms 750` (omit create/build-result). A fresh receipt is required after HEAD changes. Do not reuse old dist, full production server, credentials or hosted origin. Existing running preview stays bound to its snapshot across records-only commits.

## Remaining holds

- Browser qualification and exact independent Claude successor review are required; neither is claimed.
- Protection gate remains a release hold. Three newly authorized edits require successor review; inherited GATE01/static and three seam mismatches remain separate. No weakening or baseline amendment.
- Financial/source-attribution G1, G2-G4, refund/dispute, F1 activation and LENS01 historical adoption holds remain unchanged in their prior handoffs.
- No production/staging mutation, migration, deployment, live email, price release, grants, money, procurement or clinical action occurred.

Next exact task: existing independent Claude source review of70cd421/tree37ea984 with tests1a409, plus complete ten-width/native200% visual matrix on this exact production client using working controls. Do not recut manifest or declare premium acceptance. Core stops this slice for review; other lanes retain their own successors. DECISIONS.md contains non-UTF8 historical bytes and was preserved; the new scope decision is recorded here and in currentABCWork, not by silently re-encoding that history.
