# HL-17 Access Hub restoration, 2026-10-01

Status: bounded implementation and local qualification complete; ready for independent exact-SHA review, not approved for release. Full integration gates and owner disposition remain open.

Source: `8a31b0fa664f3570ae0bf66a7a65f62c051b2e08`.
Runtime tree: `6d209a70a3231c5c6c1362338293bfc5e9e6f871`.
Tests: `091bcde3e1f6f39ba84c02c78412fca72c567b4d` (cumulative with `bd236fa55e2ce6b042e5cc809056e6bf16e6a65f`).
Release controls inherited unchanged from ADP03 `edf8526bdefc34b8e87fa6e46585573535dba6cd`.

Branch: `codex/xenios-health-launch-implementation-20260930`.
Session: `codex-xenios-health-launch-implementation-20260930`.
Task: `HEALTH-HL17-ACCESS-HUB-RESTORE-20261001`.
Base records: `b907cf680362b36b4dfb8a29cb51a4064e0ec54b`.
Prior ADP03 runtime remains separately frozen at `2f0a975c1e051e7f23ccd3a9d5492431b8df1cdd`, tree `55c15891b07be438a933d025a7381dd7f90a04e2`.

## Bounded source change

- Remove only the exact `/research/access-hub` to `/` redirect in `client/src/App.tsx` and `server/static.ts`. The existing Research section owns the page. No route, provider, guard, role or grant is added.
- Replace the hub's unconditional open/passwordless Early Access promise with configuration-neutral entry guidance. Existing destinations and Care, Research, supplier and account limitations remain.
- Restore the canonical `#account-access` chooser focus when the actual lazy hub arrives after the outer router's one-shot animation frame. The retry belongs to this page's mount, checks the exact current pathname/hash, and cancels on unmount. Later hash navigation remains owned by the unchanged global router. No claim is made for encoded/case/trailing-slash variants of that cold-focus path.
- Preserve search policy. The shared raw HTTP policy currently classifies this known document as private/noindex even with `RESEARCH_INDEXABLE=true`. It serves neutral private metadata without canonical, Open Graph or structured data. Client rendering provides the existing hub copy. Public readability is not indexing or account authorization.

## Failure history (never relabeled as passing)

Captured with private verified Node v20.19.0/npm 10.8.2 and one Vitest worker, real dataset reader enabled. Scratch root: `C:/Users/sboad/.codex/tmp/health-n2-20261001`.

| Job | Result | Meaning |
| --- | --- | --- |
| `hl17-repro-routes` | 65 pass, 13 fail; exit 1 | Original client redirect plus server 301 reproduced. Unchanged source; new test files. |
| `hl17-repro-copy` | 20 pass, 2 fail; exit 1 | Original unconditional open/passwordless copy reproduced. |
| `hl17-repro-cold-focus` | 72 pass, 5 fail; exit 1 | After both redirect removals: one real cold-focus failure plus four incorrect new-test metadata expectations. |
| `hl17-focused-client` | 55 pass; exit 0 | Page-local focus and copy fix; before additional unmount test. |
| `hl17-focused-final` | 285 pass / 18 files; exit 0 | Initial `0d22757` source before browser-discovered clearance correction; includes status recovery, account boundaries, static microsite and SEO/path policy regressions; 24.52s Vitest / 26.048s wrapper. |
| `hl17-typecheck` | pass; exit 0 | `tsc --noEmit`, 91.444s wrapper, precommit stable source. |
| `hl17-build-final` | pass; exit 0 | Clean `8f240828df93ad45f31609d85460bd9d111047ec`, 35.483s; 1,352 source / 225 production files scanned, zero forbidden em-dash forms. |
| `hl17-routes-final` | pass; exit 0 | Same clean revision; 462 registrations / 453 call sites; 2.580s. |
| `hl17-protection-final` | fail; exit 1 | Same clean revision; 37 hard hashes pass, static hard hash fails; three seam warnings. |
| `hl17-protection-tests-final` | 35 pass, 2 fail; exit 1 | Same clean revision; unchanged hard-hash and seam-baseline assertions fail. |

All ten runs are retained separately under `docs/health-launch/evidence/hl17-access-hub-20261001/`: exact commands/start/end revisions, exit status and SHA-256 hashes, and process samples when available. Ignored `.log` files are not Git artifacts: `raw-logs.json` preserves all ten exact raw byte streams as base64 with decode instructions and hashes. There are no filtered or conditional skips in these ten runs. Build warnings about an existing mixed static/dynamic admin import, chunk size and npm configuration are preserved. Process snapshots are bounded samples, not proof of every grandchild's lifetime; fast checks can finish before the first sample. The build sample observes the pinned wrapper/npm pair, not all build grandchildren.

The additional new hard-hash failure is `server/static.ts`; the seam assertion now reports App plus inherited `server/index.ts` and `server/research/index.ts`. No test expectation or baseline was changed to hide these failures.

## Local reproduction

From the branch worktree, use the already verified private Node binary. Official Windows x64 archive SHA-256: `be72284c7bc62de07d5a9fd0ae196879842c085f11f7f2b60bf8864c0c9d6a4f`. No system installation or permanent PATH change.

```powershell
$xeniosNode = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe'
$env:PATH = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64;' + $env:PATH
$env:XENIOS_MASTER_OFFERINGS_DATASET = (Resolve-Path 'server/research/master-offerings/data/member-safe-master-offerings.generated.json').Path
& $xeniosNode --version
& $xeniosNode 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node_modules/npm/bin/npm-cli.js' --version
& $xeniosNode node_modules/vitest/vitest.mjs run client/src/App.access-hub.test.tsx client/src/App.routes.test.ts client/src/research/pages/public-brand-pages.test.tsx server/static.test.ts server/research/seo/raw-http-document-policy.test.ts client/src/research/seo/route-policy.test.ts shared/research/paths.test.ts shared/care/paths.test.ts client/src/clarity/StatusPage.test.tsx client/src/clarity/AccountAuthorityPages.test.tsx client/src/clarity/public-surfaces.test.tsx server/research/status-recovery server/research/hino-static-site.test.ts --maxWorkers=1 --no-file-parallelism
& $xeniosNode node_modules/typescript/bin/tsc --noEmit
& $xeniosNode 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node_modules/npm/bin/npm-cli.js' run build
& $xeniosNode node_modules/tsx/dist/cli.mjs scripts/acceptance/verify-route-uniqueness.ts
& $xeniosNode scripts/acceptance/verify-core-site-protection.mjs
& $xeniosNode node_modules/vitest/vitest.mjs run server/core-site-protection.test.ts --maxWorkers=1 --no-file-parallelism
```

The final two commands currently fail by design of the unchanged gate. Do not interpret them as expected passes. Exact captured invocations, dirty states and result hashes are authoritative in the individual JSON receipts.

The four metadata failures were corrected in tests against the existing policy implementation. Runtime search policy was not changed. The first route run includes React lazy-resource `act` warnings; the successful client run does not report those warnings. This is mounted JSDOM evidence, not browser or hosted authentication evidence.

## Protected-change review required

`App.tsx` and `server/static.ts` are permitted integration seams but require a fresh exact-byte review. Previous owner approvals do not cover this successor. App changes exactly one route line; static changes exactly one redirect-map entry. Other aliases, raw document privacy, status caching, static microsite handling and global focus code are unchanged. The protection manifest and assertions remain unchanged. Any mismatch is a release hold, not an authorized baseline amendment.

Canonical UTF-8 CRLF-to-LF SHA-256 pairs (base records to frozen source):

| Path | Old | New |
| --- | --- | --- |
| `client/src/App.tsx` | `3b3b808b23cccdf8d2e2179fd30349b3ae299137a8a4a5f33525e0a304828d80` | `1bc59371e5028234ed5b31e1b3db77f0c2ff6a011999210d2b29d46be18a57a7` |
| `server/static.ts` | `9cd3e1c363dd921fab780761baa888e9319f40ef177ca303072e3179b2c20004` | `b7a7641752b74a557664c9119130431fa3e68c0b2a31acce5ddab0c8283d9f94` |
| `client/src/research/pages/AccessHub.tsx` | `8744896e14c85eff4dc05ce5ccce5ce27f77f068a3ecd365fd4c453a05cb5f19` | `d869f37a53c3892d1347eea149264df887448e86150fa4dbd6a6d3a501224cbd` |

Codex subagent read-only diff review found no additional blocking defect. This is not independent Claude acceptance or owner approval. Original HL-17 finding is retained in reviewer commit `e7b74feb04567cac16d5b8bd089a7ae1218721d2`, `docs/review/xenios-health-launch-review-20260930/01_FINDINGS_c213707.md:329`. A fresh-origin local browser check cannot prove eviction of a previously cached permanent 301 in an existing production visitor's browser.

## Evidence boundaries and continuing holds

### Browser-discovered correction

The first local production-browser pass at source `0d22757ab458862c4a9ded6eae7812cc17a06116` (tree `afeaa20d6501e49a92bf456ae72fcb383e9e1a47`) found actual heading clipping despite passing mounted tests. Cold fragment, reload and same-tab fragment placed the chooser top at approximately 0px, its heading at 34.32px, behind a sticky header ending at 69px. Horizontal overflow was zero. The recorded viewport was 319x332 CSS pixels, DPR3, with no viewport override. Native zoom percentage was not observed and is not inferred.

`chrome-initial-observation.json`, `chrome-cold-fragment.png`, `preview-initial-receipt.json` and `preview-initial.mjs` preserve that failed browser observation and exact source/build/snapshot provenance. The original preview process30316 was interrupted and ended exit1; its private snapshot was retained, not claimed gracefully cleaned.

Root cause: shared CSS provides 84px scroll margin only after `:focus-visible`, but both existing helpers scroll before focusing. Successor `8a31b0f` adds only `[&>#account-access]:scroll-mt-[84px]` to this page's chooser wrapper, making the margin persistent before native or scripted scrolling. No shared chooser/global CSS/global router behavior changed. The initial AccessHub canonical hash was `2029d05ddaedf04c88390aaf6ab15897129c26ca088016e3d11b4531eb1488ea`; the final hash is in the table above.

### Corrected-source checks (separate from initial runs)

All use Node v20.19.0/npm10.8.2 and the unchanged real dataset reader. Exact receipts and raw bytes are in the distinct `raw-clearance-logs.json` archive; the first ten-run archive is unchanged.

| Job | Revision and result |
| --- | --- |
| `hl17-focus-clearance` | Precommit corrected source; 57 pass / 3 files, exit0, 69.85s Vitest / 76.620s wrapper. |
| `hl17-build-clearance` | Clean `a0e36631b8f05fe7ca3a5574efbb1c452171a4ff`; exit0, 133.942s wrapper; 1,352 source and 225 build files, zero forbidden em-dash forms. |
| `hl17-typecheck-clearance` | Same revision, clean start; only browser evidence added by end; exit0, 53.603s. |
| `hl17-focused-clearance-final` | Same revision, only browser evidence dirty; 286 pass / 18 files, zero skips, exit0, 88.85s Vitest / 94.730s wrapper; 14:04:34.926Z to14:06:09.656Z. |
| `hl17-protection-clearance-final` | Same revision, records-only dirt; exit1, 4.598s; 37 hard hashes pass, static hard hash fails, three seam warnings. |

One explicit process sample additionally traced the final build npm36544 to cmd35024 to private Node22364. This does not convert bounded process sampling into continuous or exhaustive child-runtime attestation. No timeout or skipped run is reclassified as passing.

### Final local Chrome and HTTP evidence

Final URL: `http://127.0.0.1:53791/research/access-hub#account-access`. Preview build and launch revision: `a0e36631b8f05fe7ca3a5574efbb1c452171a4ff`, runtime `8a31b0f`, Chrome browser3/tab1096126699. The loopback preview remains running at handoff time. `hl17-preview-v2.mjs` and `hl17-preview-v2-receipt.json` pin source bytes and the 346-file private build snapshot (inventory SHA256 `9bc8df3a2af9c248762c981e336e1523f08e5155c19e83bb6a9d38f3e896b235`).

This harness imports the real page gate and static middleware and serves the exact production-built client. It uses synthetic signed-out GET-only API responses, blocks other methods and external connections, and is not the full production server/Auth/SQL/provider composition. No service, account or integration was contacted.

`chrome-final-observations.json` and `chrome-fixed-cold-fragment.png` record:

- Cold fragment, refresh and settled same-tab fragment: chooser top84.0104px, heading top118.3229px, sticky header bottom69px; temporary chooser tabindex-1 and focus correct. Margin84px is present before focus. One earlier same-tab sample precedes the router animation frame and is retained separately.
- All seven chooser links reached with Tab in their existing order. Each focused link was within the viewport (top180.03125px, bottom224.03125px), below the header; temporary tabindex removed. No link was activated for these checks.
- Actual footer policy navigation and Research menu link were activated: Research reaches the hub, not home. Back/forward navigation passed. No browser warning/error entries were observed.
- Measured innerWidth319, innerHeight332, document clientWidth311 and scrollWidth311, horizontal overflow0, DPR3, visual scale1. **Native zoom percentage is unknown. No 200% or 400% qualification is claimed; no viewport override was used.**
- Local GET/HEAD for plain and query-bearing hub URLs returned200 without Location. GET preserves neutral private title, no canonical; all responses noindex/nofollow/noarchive. Query responses have no-store/no-referrer; those headers were absent on the plain path. HEAD bodies were empty. `http-final-observations.json` records this distinction.

Fresh-origin local proof cannot establish old cached301 eviction, live authentication, hosted configuration, email delivery, payment/provider authority, native zoom or independent accessibility review.

### Exact classification and open review

Runtime commits: `0d22757ab458862c4a9ded6eae7812cc17a06116` and `8a31b0fa664f3570ae0bf66a7a65f62c051b2e08`; only App.tsx, server/static.ts and AccessHub.tsx. Test-only commits: `bd236fa55e2ce6b042e5cc809056e6bf16e6a65f` and `091bcde3e1f6f39ba84c02c78412fca72c567b4d`; App.routes, App.access-hub, static and public-brand-pages tests. All other HL17 commits are continuity/handoff/evidence records. No release-control or protected-baseline edit.

No new full-suite claim exists for HL-17. The ADP03 aggregate (19,357 pass / 1 fail / 85 skip, exit1) belongs only to the frozen predecessor and remains a failed aggregate. A resource-controlled aggregate is still required at the next integration boundary before integration; focused checks do not replace it. The inherited server/index.ts and server/research/index.ts seam mismatches also remain unresolved. Claude has not accepted this successor; the known reviewer tip `e7b74feb04567cac16d5b8bd089a7ae1218721d2` reviews older source. Request exact-byte review of the new App/static seams without amending their manifests, plus the narrow fragment/copy correction. Payment successor review takes priority over public-journey review.

No managed migration, deployment, hosted configuration, price release, account grant, live provider, real email, money movement, procurement or clinical action. Claude acceptance is pending. Image/media lanes and their unapproved assets remain separate.
