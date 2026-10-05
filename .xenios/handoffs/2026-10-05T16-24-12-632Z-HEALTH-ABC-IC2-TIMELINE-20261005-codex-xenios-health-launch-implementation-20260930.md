# Core IC-2 microscopic correction, 2026-10-05

Status: locally corrected and focused-tested; ready for the existing Claude reviewer's narrow recheck. NOT independently accepted or release-ready. Stop after this handoff.

## Identity and authority

- Branch: `codex/xenios-health-launch-implementation-20260930`.
- Reviewed source: `70cd421a6ab79513744f531d921b3ece61044874`, tree `37ea984993cc78ee61d0e9ca944fca0213e73ba8`; prior handoff `7d665730b6db11d64f4a9910af99fde420ded53b`.
- Binding founder record: `cd66f3c411e6164981295d81c2116e50343edc86`, review document 31 (IC-2 neutral or restrained teal, not purple).
- Independent review: `d9998563c9a709f2ef9ccd928d4e59fc259bb82d`, `docs/review/xenios-health-launch-review-20260930/32_ACCEPTANCE_FINANCE_MC01_CORE_ABC_2026-10-05.md`.
- User's subsequent microscopic instruction was verified from original attachment `c8681bc0-0d4a-443a-83ba-715aa64e51a2/Pasted text.txt`: IC-2 only, focused checks, no full suite/build unless required, preserve protected hashes, push and stop.
- New runtime source: `c93bf5a2c1e2b50c5b40c65f0149033ad84658a0`.
- New runtime source tree: `fd729bca811b8e91ec13a31d9d3985472087579a`.
- Test-only commit: `2a791beeb26b75266b9468aa4a32a4cd07fe871d`.
- Clean focused-test checkout: `ddf679240c86f651ac8d577a3e98163f9ce1a39e`, tree `980ab0f1e287a9ba85b5bc5337482b2e272dda85` (continuity-only successor of the source/test commits).
- No new release-control commit; the manifest is unchanged. Records/evidence and canonical handoff are separate later commits, not new runtime candidates.

## Exact change and classification

The only runtime change is one added rule in `client/src/research/assisted-order/assisted-order.css`:

```css
.xenios-order-page--customer .xenios-order-timeline li { border-left-color: var(--rule); }
```

The existing `--rule` resolves to `rgba(14, 14, 14, 0.10)`, not `#7C3AED` / `rgb(124, 58, 237)`. The customer boundary applies to both confirmation and status timelines. Shared timeline geometry and the admin accent remain unchanged. Purple focus/selection and all CTA rules remain byte-identical.

The only test change is `client/src/research/assisted-order/assisted-order-premium.test.tsx`: render two synthetic receipt timeline steps (and zero when the receipt is missing); assert the exact customer-only override; resolve the actual stylesheet tokens to prove neutral-not-purple; pin shared timeline geometry, base admin accent and customer focus accent. Existing primary/secondary/tertiary and focus assertions remain.

The raw evidence checks that removing this one rule restores the entire previous stylesheet byte-for-byte. It also compares the three protected files, protection manifest and three admin TSX files against reviewed source, successor source and LF-normalized working bytes. All match. No Finance, MC-01, imagery, server, SQL, authority, price or route change.

Protected SHA-256-LF values, unchanged from Claude's review:

| File | SHA-256-LF |
| --- | --- |
| `client/src/components/Navbar.tsx` | `6cdfbb0f05cc8d1fb28bfdc6b7a012ddb85e34d0c985bc88e71c09d8456a218a` |
| `client/src/components/Footer.tsx` | `420b45dc09aefa572a65ae68b5add6a2ce3d435e54e1fea7d9db9f29390df7cb` |
| `client/src/index.css` | `b475a8ee637984965df7497e6bcc9d92113c52c0dd2e21019d5d2806e47fa049` |
| `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json` | `c0fbcc69686562fdd2ec1de6d6a487356118f1d18931f8de3ee9aefd7066eff8` |

## Focused runs, preserved separately

Both commands ran in this worktree with the isolated Node **v20.19.0**, npm **10.8.2**, one worker and no file parallelism. The existing wrapper pins its process-local PATH and the real dataset reader. Each run captured one process snapshot showing the wrapper, test process and one descendant using the pinned executable. These discrete samples are not continuous attestation of every worker.

```powershell
& 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe' 'C:/Users/sboad/.codex/tmp/health-n2-20261001/run-check.mjs' abc-ic2-red-run1 node_modules/vitest/vitest.mjs run client/src/research/assisted-order/assisted-order-premium.test.tsx --maxWorkers=1 --no-file-parallelism
& 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe' 'C:/Users/sboad/.codex/tmp/health-n2-20261001/run-check.mjs' abc-ic2-green-run1 node_modules/vitest/vitest.mjs run client/src/research/assisted-order/assisted-order-premium.test.tsx client/src/research/assisted-order/assisted-order-accessibility.test.ts --maxWorkers=1 --no-file-parallelism
```

For a rerun, use a fresh job name to preserve existing evidence. Red requires the reviewed stylesheet plus the successor test; it is not the expected result on the fixed source.

| Run | Revision and result | Time UTC / duration | Log SHA-256 |
| --- | --- | --- | --- |
| `abc-ic2-red-run1` | `7d665730`, dirty new regression and continuity records, reviewed runtime unchanged. **9 PASS / 1 FAIL**, exit 1: missing neutral customer override. | 16:15:24.004 to 16:15:49.491; 25.487 s wrapper / 22.19 s Vitest | `ed6267d0eac3fcf17f8aad0d7ce06650e5d15eefeb68d9ddc1be38b0045e9efe` |
| `abc-ic2-green-run1` | Clean `ddf679240` at start and end. **15 PASS / 0 FAIL / 0 SKIP**, 2 files, exit 0. | 16:16:30.360 to 16:16:36.198; 5.838 s wrapper / 4.47 s Vitest | `3fe7b2db7798991f6a48760f81bc87815938bc90513081f19319e0233cd1025e` |

`git diff --check` passed. Raw logs, complete result metadata, samples and byte-invariance results: [raw-checks-and-invariants.json](evidence/abc-ic2-timeline-20261005/raw-checks-and-invariants.json), SHA-256 `289e9be96fba8fbcb1511d28feb7db8e7c9a25136ac5181aea405ab30654518a`.

## Evidence limits and remaining findings

- This correction has source-contract/component tests and byte invariance, not a fresh browser computed-style capture. No build, typecheck, full suite or browser rerun was performed for the one-line color override, per the microscopic scope.
- Claude's report 32 independently closed ABC-R2 using the prior `70cd421` production build: 50/50 loads at ten widths, no overflow, and IC-1 admin computed-style invariance across 12 element types. That is evidence for that reviewed source, not a new execution on `c93bf5a2`.
- Native 200% zoom, full keyboard traversal and forced-colors were not captured in that review; Claude classifies them as supplementary/nonblocking. Viewport widths are not native zoom.
- ABC-R1 / IC-2 is locally corrected, awaiting independent recheck. ABC-R3 remains partly open: clean integrated aggregate qualification is still required later. No earlier failure or timeout has been relabeled as a pass. The prior ADPG1 aggregate remains 19,443 PASS / 3 FAIL / 85 SKIP, exit 1.
- ABC-R5 is narrowed by rendered receipt timeline coverage; quote/upload coverage is not claimed. ABC-R4 focused ghost radius, ABC-R6 border contrast and ABC-R7 forced-colors selection remain visible and deferred. Protected files were not changed to address them.
- The old local preview at port 59535 was stopped before the correction. Its process is absent; interruption returned exit 1 without a final integrity/cleanup receipt. Old built files are not successor evidence, and no running successor preview is advertised.
- Protection is NOT green: existing authorized Navbar/Footer/index mismatches and inherited static/seam findings remain. No manifest recut. Accepted exact successor plus Samuel's exact old-to-new approval and GATE-01 / Access Hub disposition are still required. Financial and other-lane release holds remain unchanged.
- No deployment, managed apply, hosted configuration change, real email, money or production/staging mutation. Production identity was not re-observed for this local correction; historical hosted records were not promoted to fresh evidence.

## Reviewer handoff / stop

Existing Claude reviewer: recheck only IC-2 neutral timeline on confirmation/status, focused smoke and protected-hash invariance against the exact source/tree above. Preserve focus/selection, CTA and admin behavior. This handoff does not interrupt or replace the independent reviewer, claim acceptance, authorize a manifest recut, or authorize deployment. Core stops here.
