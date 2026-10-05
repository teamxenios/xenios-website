# A/B/C public-shell implementation handoff

Status: implementation committed; qualification in progress. Not premium accepted, not independently reviewed, not release approved.

## Exact candidate and authority

- Branch: `codex/xenios-health-launch-implementation-20260930`.
- Worktree: `C:/Users/sboad/.codex/worktrees/b22f/xenios-website`.
- Base records: `3eaa017fcbd28989c65ffc4bb439a554aa1f3f59`.
- Prior runtime: `c0e25c73a0d789829ea213e2ee040c68e06f0a75`.
- A/B/C source: `70cd421a6ab79513744f531d921b3ece61044874`.
- Source tree: `37ea984993cc78ee61d0e9ca944fca0213e73ba8`.
- Tests only: `1a409e2f7e1fcdeffc78d24428eeb626d7888e9c`.
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
| Clean typecheck/build/protection | Pending | Never inferred from predecessor results. |

Raw wrapper directory: `C:/Users/sboad/.codex/tmp/health-n2-20261001`. The final archive will retain commands, logs, exit statuses, tested revisions and sampled child executable paths separately.

No new full-suite aggregate was requested/run for this bounded presentation slice. Earlier ADPG1 aggregate remains FAILED: 19,443 pass / 3 fail / 85 skip, exit 1 (two unchanged protection assertions and one pgcrypto timeout). Isolated reruns do not replace that result.

## Browser evidence and preview limits

No candidate browser evidence captured yet. Native helper initialization failed twice (`failed to write kernel assets`, system path error3). Chrome connection/tab creation timed out; an existing unrelated preview is not this candidate. None of these failures is a layout pass or a layout defect.

The ten required widths (1440,1280,1024,834,768,430,390,375,360,320), actual 200% browser zoom, real keyboard/forced-colors inspection, overflow, long branding, Sign In/Start Care, button wrapping and skeleton layout stability remain unverified. No screenshot from an older build is relabeled. Actual candidate comparison with founder preview `e9ebc7b7df44a8921dd4b64100590da51310ba9a` remains pending.

Private preview harness is prepared, not launched at this checkpoint. It serves the actual clean production client with six explicitly synthetic catalog rows and disabled integrations, all non-GET/HEAD requests refused, no real server authority mounted. It will not qualify auth, pricing, payments, SQL, email or production server composition.

## Remaining holds

- Browser qualification and exact independent Claude successor review are required; neither is claimed.
- Protection gate remains a release hold. Three newly authorized edits require successor review; inherited GATE01/static and three seam mismatches remain separate. No weakening or baseline amendment.
- Financial/source-attribution G1, G2-G4, refund/dispute, F1 activation and LENS01 historical adoption holds remain unchanged in their prior handoffs.
- No production/staging mutation, migration, deployment, live email, price release, grants, money, procurement or clinical action occurred.

Next: finish serial checks and exact local preview, archive evidence, push the source/tests/records, then stop this A/B/C slice for independent review. Other lanes retain their own scope.
