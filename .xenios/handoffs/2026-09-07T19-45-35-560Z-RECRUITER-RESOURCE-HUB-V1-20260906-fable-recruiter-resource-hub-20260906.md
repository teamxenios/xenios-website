[FABLE RELEASE SUPPORT HANDOFF — 2:30 PM BLITZ WINDOW]

**Actual time / timezone:** 2026-09-07, 3:15 PM America/Chicago (window opened 2:32 PM).

**Task and exact ownership:** two deliverables, both inside my own leases. I edited no file
owned by A or B, and none of the three files the Resource Hub access slice touches
(`server/research/index.ts`, `client/src/research/layout.tsx`,
`shared/research/auth-return-to.ts`).

**Source base / integrated candidate:** A's branch `codex/xenios-seth-revenue-launch-20260905`
still at `3351eb34` (unchanged since my last handoff); B's branch moved `18add26` →
`a01289d` (partner payouts, order/commission isolation — no Resource Hub overlap). No frozen
integrated SHA was communicated to me during this window; the request is in my message to A.

**Your full commit SHA / tree:** `6c83ab9322f4f2b8e902baba618c770865e41b21`; the last code
change is `f14735350c5262af574f19571daa6c13291162db` (tree
`606a5528502cb91641561e42bb9c03aa3d978741`). Branch pushed, working tree clean.

**Changed files:**
- `server/research/resource-hub/service.ts`, `service.test.ts` (the fix and its regressions)
- `docs/resource-hub/LOCKED_GATE_ADMISSION_NOTE.md`, `locked-gate-admission.patch`,
  `locked-gate-safety-bar.mjs` (deliverables for A)
- `.xenios/` records and messages

**First failing reproduction:** an adversarial pass over my own `b1b41c80` found, and three
independent agents reproduced, a P1 in my RH-B28-1 scanner fix. `inflatedPdfStreams`
tokenized `stream`/`endstream` over raw bytes with no lexing state, so an inert earlier
object containing the literal `(stream )`, or a `% stream` comment, was taken as a stream
start; the `endstream` search then landed on the NEXT object's `endstream` and the cursor
advanced past it. The real FlateDecode `/Type /ObjStm` that followed was never inflated or
scanned, and the exact payload the RH-B28-1 tests refuse was accepted with `ok:true`.

**What the fix changed:** one position-preserving lexing pass. String literals (nesting and
backslash escapes per the grammar) and comments are data and are never searched for keywords;
`stream` counts only on a token boundary and not as the tail of `endstream`; stream data is
skipped wholesale; a stream's dictionary is read from its own preceding `obj` with literals
blanked. Three conditions now fail closed as an unexamined file, which the validator already
refuses: an unterminated literal, a `stream` keyword not followed by CRLF/LF, and a stream
with no `endstream`.

**Focused test commands / results:**
- `npx vitest run server/research/resource-hub/service.test.ts` → 49 passed (7 new `RH-B28-1b`
  regressions: 4 of them fail on the parent commit, all pass here).
- 19 focused files → **557 passed, 1 pre-existing skip**.
- `npx tsc --noEmit -p tsconfig.json` → clean.
- B's exact ASCIIHexDecode probe → still refused (`unsupportedStreams: 1`).
- 494 real PDFs → **483 accepted / 11 policy refusals, unchanged**; 12/12 synthetic controls.

**Browser scenarios / failures / limitations:** none needed for the scanner (server-side byte
code, no rendered surface). The second deliverable is a locked-gate HTTP safety bar, below.

**Second deliverable — pre-verified locked-gate admission for A.** I applied the proposed
admission to a LOCAL working copy of `server/research/index.ts`, measured, then reverted; the
branch carries no change to it. Shipped: `docs/resource-hub/locked-gate-admission.patch`
(12 added lines) and `docs/resource-hub/locked-gate-safety-bar.mjs` (runnable probe).
Measured under `PREVIEW_LOCK_GATE=1`: before, library and delivery both 401; after, 200 and
200-with-PDF-bytes with **19/19 safety rows, 0 fail** — rep sees only rep-permitted versions,
affiliate cannot see rep-only metadata or fetch its bytes (404 not 403), member without a
partner record 404 `partner_not_found`, suspended empty and 404, withdrawn and draft-policy
denied, unknown uuid 404 with no ledger row, malformed id refused at the wall (401, stricter
than the handler's 404), no bearer and invalid bearer refused, no write method admitted on
either path, no unrelated partner path opened, and no storage key, admin identity or review
reason in any response.

**Database rehearsal scope, if any:** none. No migration applied, no database touched.

**Served build and evidence identities:** no rebuild needed (server-side change; no client
asset moved). Evidence folder
`C:\Users\sboad\projects\xenios-qa-evidence-resource-hub-20260906\` carries
`inventory-f14735350c52.json` (candidate SHA/tree, harness blob, 288 asset hashes, 62 artifact
hashes), `scanner-real-pdfs.json`, `locked-gate-safety-bar-before.json` and
`locked-gate-safety-bar-after.json`.

**Independent reviewer / status:** none, and I do not self-accept. Review requests went to A
and B through the continuity OS at 19:37 and 19:41 and 19:44 UTC; the message files are in
`.xenios/messages/`.

**Integration instructions and dependencies:** take the scanner commit as a normal delta on
the accepted runtime (no route, no dependency, no protected-file change, so seam hash and
route census pins are unaffected by it). For the access slice, apply
`locked-gate-admission.patch` plus the `layout.tsx` exemption and the `auth-return-to.ts`
entry the founder's package names, then re-run the partner portal and resource-hub suites and
the safety-bar probe on the combined tree. `docs/resource-hub/SELECTIVE_INTEGRATION_MANIFEST.md`
still holds: the only overlap with the live baseline is `portal-production.ts`, comment only —
keep the live file.

**Required post-integration gates:** partner portal + resource-hub suites, protected-seam hash
recomputed, route census re-measured, locked-gate safety bar re-run on the combined tree.

**Owned processes and cleanup:** none running. Every preview harness (5231/5232/5233) and every
headless Chromium I started is stopped; the verification agents' `scratch-verify/` is removed;
A's file is reverted (`git status` clean). The kit slice I had begun before this window (Slice 3
groundwork, not part of this release) is parked OUTSIDE the checkout at
`C:\Users\sboad\projects\fable-kits-parked-20260907\` — four files, nothing deleted.

**Remaining blocker and next exact action:** none of mine. Waiting on A for the integrated
SHA, freeze state and any next assignment. The access slice is A's to apply; the patch and its
proof are in the repository so A does not need me.

**Can A/B continue without Fable? Explain the saved state:** yes. Both deliverables are
committed and pushed; the reproduction lives as seven tests rather than in my memory; the
patch and probe are files A can run in one command; every measurement is written to the
evidence folder; three coordination messages are in `.xenios/messages/`; no background process
holds an unrecorded result.

**Production mutated by Fable: NO**
