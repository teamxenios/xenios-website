# HL-17 Access Hub restoration, 2026-10-01

Status: implementation and local qualification in progress. Not approved for release.

Source: `0d22757ab458862c4a9ded6eae7812cc17a06116`.
Runtime tree: `afeaa20d6501e49a92bf456ae72fcb383e9e1a47`.
Tests: `bd236fa55e2ce6b042e5cc809056e6bf16e6a65f`.
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
| `hl17-focused-final` | 285 pass / 18 files; exit 0 | Final source and tests; includes status recovery, account boundaries, static microsite and SEO/path policy regressions; 24.52s Vitest / 26.048s wrapper. |
| `hl17-typecheck` | pass; exit 0 | `tsc --noEmit`, 91.444s wrapper, precommit stable source. |
| `hl17-build-final` | pass; exit 0 | Clean `8f240828df93ad45f31609d85460bd9d111047ec`, 35.483s; 1,352 source / 225 production files scanned, zero forbidden em-dash forms. |
| `hl17-routes-final` | pass; exit 0 | Same clean revision; 462 registrations / 453 call sites; 2.580s. |
| `hl17-protection-final` | fail; exit 1 | Same clean revision; 37 hard hashes pass, static hard hash fails; three seam warnings. |
| `hl17-protection-tests-final` | 35 pass, 2 fail; exit 1 | Same clean revision; unchanged hard-hash and seam-baseline assertions fail. |

All ten runs are retained separately under `docs/health-launch/evidence/hl17-access-hub-20261001/`: raw logs, exact commands/start/end revisions, exit status and SHA-256 hashes, and process samples when available. There are no filtered or conditional skips in these ten runs. Build warnings about an existing mixed static/dynamic admin import, chunk size and npm configuration are preserved. Process snapshots are bounded samples, not proof of every grandchild's lifetime; fast checks can finish before the first sample. The build sample observes the pinned wrapper/npm pair, not all build grandchildren.

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
| `client/src/research/pages/AccessHub.tsx` | `8744896e14c85eff4dc05ce5ccce5ce27f77f068a3ecd365fd4c453a05cb5f19` | `2029d05ddaedf04c88390aaf6ab15897129c26ca088016e3d11b4531eb1488ea` |

Codex subagent read-only diff review found no additional blocking defect. This is not independent Claude acceptance or owner approval. Original HL-17 finding is retained in reviewer commit `e7b74feb04567cac16d5b8bd089a7ae1218721d2`, `docs/review/xenios-health-launch-review-20260930/01_FINDINGS_c213707.md:329`. A fresh-origin local browser check cannot prove eviction of a previously cached permanent 301 in an existing production visitor's browser.

## Evidence boundaries and continuing holds

No new full-suite claim exists for HL-17 yet. The ADP03 aggregate (19,357 pass / 1 fail / 85 skip, exit 1) belongs only to that frozen predecessor and remains a failed aggregate. Browser review, exact protected hashes and final source/test identities will be appended after qualification.

No managed migration, deployment, hosted configuration, price release, account grant, live provider, real email, money movement, procurement or clinical action. Claude acceptance is pending. Image/media lanes and their unapproved assets remain separate.
