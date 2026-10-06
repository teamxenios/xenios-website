# Quick Order disabled mount and PWA successor `ac36e60` / `c54f53f`: bounded delta review against `5ee44d5`

**SOURCE: ACCEPT WITH LIMITS** for the S-2 mount and privacy edits and the S-3 PWA edit at
`ac36e60fe5e91b1217722e7f2a2711fd62a64559`. The six S-2 targets are byte-for-byte the exact proposal `c65d7e49…`
applied to the recorded baselines, the S-3 edit is the two-line change the scope describes, every authored regression
is additions-only or a strict widening, nothing else moved, and the mounted page collects nothing. **All regression
tests are NOT RUN by anyone** (qualification group G1 refused at 1,205 MiB), so this is source acceptance of exact
bytes, not qualification. **Seven successor hashes now exist for Samuel's separate acceptance** (section 4); nothing
here accepts them, re-cuts the manifest or resolves GATE-01. Real intake, purchase and release: **NOT READY**.

Two read-only lenses (bytes and tests; records and scope), each adversarially verified, agree: **no P0 or P1**; six
plus seven findings, all upheld by the verifiers (six P2 in total, the rest P3 record precision), folded into section 8.
Lens output archived as `hl12/41_mount_lens_findings.json`. The verdicts are stated separately by file set: **S-2
(six runtime files plus five tests): ACCEPT WITH LIMITS. S-3 (`PwaLifecycle.tsx` plus its focused test): ACCEPT WITH
LIMITS.** Doc 36 condition QO-P2-01 is **PARTIAL (5 of 6 pin classes)**: the real `serveStatic`/Vite direct-navigation
pin is absent by design of S-2 and now belongs to the composition tests authored later on the builder branch, outside
this record.

Reviewer: this session, `claude-fable-5-1`, effort `xhigh` as reported. Method: Git-object reads, independent hashing,
a scratch application of the recorded patch to the predecessor blobs, a protection-gate run in the scratch worktree
(read-only script), and two read-only lenses with adversarial verifiers. No test, build, server, browser or database
process was launched; no worktree other than the scratch one was touched.

## 1. Identity and authority (verified)

| Item | Value |
| --- | --- |
| Source reviewed | `ac36e60fe5e91b1217722e7f2a2711fd62a64559`, tree `c83e78153d8cafcd2580e2ed83e1cd9d6f8b79a0` ("feat(quick-order): mount disabled intake with privacy isolation") |
| Records | `dc119280…` (G1 refusal receipts, records only) → `ac36e60` → `c54f53f5aa0501cbddbb2a1148c49f9578e0ca93` (handoff, `S2_S3_SOURCE_20261006.md`, `evidence/s2-s3-*`) |
| Predecessor | `5ee44d53e55774fd8a29ea009dac16da2ed907ef`, runtime identical to the SOURCE ACCEPT WITH LIMITS Quick Order source `fd023e8` (doc 38); the 24-file module is byte-identical at `ac36e60` |
| Authority as recorded | coordinator `60d593ae2fc0623edc869e373bfe52e830968df9`: Samuel's kickoff received 2026-10-06T17:43:37Z (message `01a11250-62ad-…`, attachment `a276ed40-…`, request sha256 `04daca50…`) adopting `SOURCE_AUTHORIZATION_DRAFT.md` (sha256 `adcb5a98…`) S-1 to S-5; the sprint record assigns S-2, S-3 and G1 to this builder; expiry 21:43:37Z. The record carries message identifiers and hashes, not the message text itself. |
| Scope limits that still apply | S-2 and S-3 are edit-from-exact-baseline permission only; successor hashes, the manifest and GATE-01 are expressly excluded; the inherited Access Hub and HL-12 seam drift is preserved, not accepted |

## 2. Exact-bytes verification (independent)

| Check | Result |
| --- | --- |
| Six S-2 targets | sha256-lf at `ac36e60`: `App.tsx` `1a0ba37c…`, `shared/care/paths.ts` `a15adc22…`, `tracking.ts` `8d62f7a1…`, `attribution.ts` `6b1ab473…`, `raw-http-document-policy.ts` `50b80817…`, `server/index.ts` `cc1d8d4d…`: all six equal the proposal's `proposedAfterSha256lf` |
| Independent reconstruction | applying `MOUNT_PROPOSAL.patch` (sha256-lf `c65d7e49…`) to the `5ee44d5` blobs in a scratch repository with line-ending conversion disabled reproduces all six `ac36e60` files byte for byte |
| Before-hashes at edit time | the builder's `evidence/s2-s3-source-ac36e60.json` and the coordinator's `QUICK_ORDER_S2_S3_COORDINATOR_CHECKPOINT.json` both record the six before-hashes equal to the `5ee44d5` blobs (which I verified in doc 37 and doc 40); the G1 precheck at 17:54:58Z re-measured the same 14 baselines unchanged |
| S-3 PWA edit | `client/src/pwa/PwaLifecycle.tsx` `9594f398…` → `9b1a354d…`; the diff is exactly one import extension and one added predicate line `isHealthIntakePath(pathname) \|\|` inside `isPwaInstallLocationAllowed`; registration, update notices and cache code untouched |
| Nothing else | no change under `client/src/components/`, `client/src/index.css`, `server/static.ts`, `server/vite.ts`, `docs/phase2/`, `supabase/`, `MIGRATIONS.md`, `package*.json`, `vitest.config.ts`, `tsconfig.json`; the Quick Order modules under `server/research/health/quick-order/` and `client/src/research/quick-order/` are untouched |
| Old locations | still absent |

## 3. Behaviour of the applied bytes (static)

Unchanged from the doc 36 and doc 38 analysis of the same bytes: the exact wouter route sits before the preserved
`/health` redirect and renders `QuickOrderPage` with `sessionKey={null}`, which produces only the unavailable notice
inside `PublicShell` with no form, fetch or storage; `isHealthIntakePath` is a separate exact predicate and
`isHealthGatewayPath` is unchanged; tracking blocks the pixel and classifies the document zone as health before first
paint; attribution clears and never stores on the intake path; the raw document policy registers the route as a private
document (200, `noindex,nofollow,noarchive`, no canonical or social tags); the root containment is registered after the
leading-slash normaliser and the legacy containment and before the parsers, using the `fd023e8` classifier; the PWA
install promotion is now suppressed on the intake route by the same predicate. The `/health` → `/` 301 in `static.ts`
remains an exact-key lookup.

## 4. Protection consequences (gate run at `ac36e60`, bounded `3eaa017..HEAD`)

160 changed files: 55 allowed, 58 infrastructure, 3 seams reported as changed (`App.tsx`, `server/index.ts`,
`server/research/index.ts`), **zero out-of-zone paths**, and **seven HARD hash mismatches**: the three Core files
pending Samuel's approval (`index.css`, `Navbar.tsx`, `Footer.tsx`), inherited `server/static.ts` (GATE-01), and three
**new** mismatches created by this successor, exactly as doc 36 predicted. Receipt: `hl12/41_claude-gate-ac36e60.out`.

Successor hashes that now need Samuel's explicit old-to-new acceptance before any protection-owner re-cut, each verified
to be the exact reviewed bytes:

| File | Class | Pinned or seam baseline | Current (`5ee44d5`) | Successor (`ac36e60`) |
| --- | --- | --- | --- | --- |
| `client/src/lib/tracking.ts` | HARD | `258eda22…` | same | `8d62f7a1…` |
| `client/src/lib/attribution.ts` | HARD | `2c406d8a…` | same | `6b1ab473…` |
| `client/src/pwa/PwaLifecycle.tsx` | HARD | `9594f398…` | same | `9b1a354d…` |
| `client/src/App.tsx` | seam | `3b3b808b…` (off since `0d22757`, Access Hub) | `1bc59371…` | `1a0ba37c…` |
| `server/index.ts` | seam | `1d6594d6…` (off since `3562c03`, HL-12 chain) | `ba5800e6…` | `cc1d8d4d…` |
| `shared/care/paths.ts` | allowed zone | n/a | `da51b6c8…` | `a15adc22…` |
| `server/research/seo/raw-http-document-policy.ts` | allowed zone | n/a | `90082298…` | `50b80817…` |

Sequencing consequence, unchanged: a later re-cut of the two seams would carry the inherited HL-17 or HL-12 delta
together with the Quick Order delta, so GATE-01 must be decided first or alongside.

## 5. Regression tests (authored, NOT RUN)

Six test files changed, all within the S-2 list plus the S-3 focused test. Assertion counts rose in every file and no
existing assertion was removed; the only deleted lines convert single cases into parameterised `it.each` tables that
keep the original rows. Mapping to the doc 36 QO-P2-01 pins:

| Pin | Where |
| --- | --- |
| `isHealthIntakePath` positives and negatives, gateway unchanged | `shared/care/paths.test.ts` |
| tracking: no pixel and no event on normalised intake paths, re-check after the config race, full-document transition on `pushState`/`replaceState`, no transition between gateway and intake | `client/src/lib/tracking.test.ts` |
| attribution: clears valid prior storage before any read on intake entry, `?ref=` never stored, public control restored afterwards | `client/src/lib/attribution.test.ts` |
| App route: exactly one lazy import of the Research module, one exact route before the preserved `/health` redirect, `sessionKey={null}`, no `transport` prop, no `/health/*` | `client/src/App.routes.test.ts` (source-contract test; not a rendered App) |
| resolver: `registered_private_document`, 200, `noindex`, for the exact path and its case, trailing-slash, encoded and query/hash variants | `server/research/seo/raw-http-document-policy.test.ts` |
| PWA: neighbours stay eligible, intake and its normalised and encoded forms do not, auto-install prevented across public-to-intake navigation, click-time re-check, iOS hint hidden, update notice independent | `client/src/pwa/PwaLifecycle.test.tsx` |
| **Not present, by design**: `serveStatic` and Vite direct-navigation 200 + `noindex`, real root mount with the body parsers | these need the composition test paths named in the supplemental scope (`static-document.test.ts`, `vite-document.test.ts`, `root-composition.test.ts`, `QuickOrderApp.composition.test.tsx`); S-2 forbade adding them unnamed |

## 6. Evidence classes

Immutable: hashes, diffs, scratch reconstruction, gate run. Producer receipts verified: the 13 before/after pairs in
`s2-s3-source-ac36e60.json` equal my hashes; the G1 precheck receipt (`g1-precheck-20261006.json`: 1,205 MiB free
against 1,536, disk 26.07 GiB, no heavy job, 24 module files and 14 baselines unchanged, zero test processes, group
consumed and released). Independently executed by me: the gate only. Missing: execution of every authored test;
typecheck; build; full-App; browser; the composition tests not yet authored.

## 7. Verdict in the prompt 03 form

- Source and tree: `ac36e60` / `c83e7815…`; scope: S-2 six files plus five tests, S-3 one file plus one test.
- **SOURCE: ACCEPT WITH LIMITS.** Limits: tests NOT RUN; composition proof absent; seven successor hashes await
  Samuel; GATE-01 open; the page is an unavailable shell, not intake.
- P0/P1: none, by me or by either lens and verifier; six P2 and seven P3 findings in section 8.
- Qualification gaps: all S-2/S-3 tests, HTTP red/green, typecheck, build, browser.
- Protected and schema authority: S-2/S-3 edit authority recorded; successor-hash acceptance, manifest re-cut and
  GATE-01 pending; no schema change in this delta.
- Release A answer: **no** (no durable adapter, operator reader, legal pair, classification, standing). Release B: **no**.
- Smallest next action: when host RAM permits, one reservation for the S-2/S-3 focused tests plus the frozen HTTP
  red/green; Samuel's decision on the seven pairs and GATE-01 can proceed on these verified bytes independently of
  execution.

## 8. Findings

Two lenses, four agents, 164 tool uses, every finding re-derived by an adversarial verifier from Git objects; none
refuted. Prefix `M` is the bytes-and-tests lens, `R` the records-and-scope lens.

| ID | Sev | Finding (verified) | Smallest correction |
| --- | --- | --- | --- |
| M-F1 / R-F1 | **P2** | The sixth QO-P2-01 pin class, a real `serveStatic` or Vite direct navigation to `/health/quick-order` returning 200 with `X-Robots-Tag: noindex,nofollow,noarchive`, is absent; the authored server test (`raw-http-document-policy.test.ts:668-683`) exercises `buildRawHttpDocumentResponse` only and says so. QO-P2-01 is PARTIAL, 5 of 6. Verifier precision: at `ac36e60` `static.ts:101-107` sets `no-store`, `Pragma` and `no-referrer` only for `/status`, so a future pin phrased as "private cache headers" would fail against the HARD-pinned `static.ts`; the pin must expect 200, the robots header and no canonical `Link`, with `GET /health → 301 /` as control. | Author and run the pin inside the supplemental composition tests (now authored at builder `5fd2e4c`, NOT RUN, not covered by this record); no intake decision without the executed receipt. |
| M-F2 | **P2** | Zero executed evidence exists for any of the 13 changed files; G1 was refused at 1,205 MiB with zero test processes and the one-shot script refuses a second run. The successor cannot move beyond source acceptance on this record. | Under a distinct reservation after a materially changed host observation: the frozen `fd023e8` HTTP red/green plan plus the builder's proposed six-file focused command at `ac36e60`, raw logs, exit codes and resource samples archived, then handed here. |
| M-F3 / R-F2 | **P2** | The successor carries three new HARD mismatches (not two: S-3 rode along in the same commit) and a second delta on both seams, on top of inherited `static.ts`; the gate fails until Samuel accepts the exact pairs, GATE-01 is dispositioned and the protection owner recuts in a records-only commit. Expected and disclosed, not a defect in the bytes; blocks integration and release, not source acceptance. | Present the five pairs in section 4 by class together with the GATE-01 disposition; builder adds one sentence to the handoff stating the expected gate result at `ac36e60` (four HARD mismatches of its own concern plus the three Core pairs already pending, two seam deltas, manifest unchanged, a later recut cannot isolate the inherited HL-17 and HL-12 bytes). |
| M-F4 | P3 | wouter 3.10.0 matches the route case-insensitively with an optional trailing slash but never percent-decodes (no `decodeURI` in its source), so an encoded alias such as `/%68ealth/quick-%6frder` is a private 200 document server-side yet renders not-found client-side. Not a leak: tracking, attribution and PWA all evaluate the normalised path. | One rendered-App composition case for an encoded alias documenting the outcome; either outcome is privacy-safe. |
| M-F5 | P3 | `QuickOrderPage.tsx:24` reads `window.location.search` into a prop before `QuickOrderForm` returns `IntakeUnavailable`; the value is never stored or transmitted. Pre-existing accepted `fd023e8` behaviour, outside this delta (`git diff --stat fd023e8 ac36e60` over both Quick Order directories is empty). | None for S-2; optional later polish under the module's own lease. |
| M-F6 | P3 | Record precision: say "three HARD pairs plus two seam deltas"; doc 36's literal pin spellings `/HEALTH/Quick-Order/` are represented by equivalent classes (`/HEALTH/QUICK-ORDER/`); the neighbour negatives `/health/quick-orders` and `/health/quick-ordering` are the builder's own coverage and `/healthcare` is the pre-existing gateway pin, none of them a doc 36 literal; the builder's "no other active overlap in registries 389a/3221" is a builder assertion I cannot verify read-only. | Adopted in this record. |
| R-F3 | P3 | The adoption record quotes no separately typed words from Samuel for message `01a11250-…`: the first-person adoption sentence sits inside the fenced "Send this to the existing Codex coordinator" block of a pasted assistant-rendered message, and "User identifies pasted text as the request" is the coordinator's characterisation. The operative authority record is the sprint JSON with the request hash `04daca50…`, which this record cites as the basis. | Coordinator appends either Samuel's own identifying words verbatim with the message id, or a statement that the message body consisted solely of the attachment. No change to the adopted scope is implied. |
| R-F4 | P3 | The G1 "retained producer receipt" hash `f692c897…` is the coordinator's CRLF re-encoding (4,309 bytes); the producer's committed blob at `dc11928` is `95b5ddf4…` (4,209 bytes, LF); identical content after normalisation, no measurement differs. | Add the producer's blob hash next to `receiptSha256` and label the CRLF copy. |
| R-F5 | P3 | The coordinator's own 17:46:01Z baseline check ("mountBeforeHashesMatched 6") has no retained receipt at `60d593a`; the before-hash revalidation evidence is the builder's `dc11928` receipts and my re-hash. | Cite the builder's receipts, not the unreceipted claim. |
| R-F6 | P3 | The planning-relay record at `dc3329b` is undated, so the relay reply "still pending Samuel's actual approval" cannot be time-ordered against the 18:29:11Z approval recorded in the same commit. | Add prompt and reply timestamps and one ordering sentence. |
| R-F7 | P3 | The approved scope document does not itself print the patch hash, and the approval question enumerated "five shared runtime edits, and named tests" without the four composition-test paths or the 23-relation allowlist; the scope is determinable only by commit `1d4f2c3` plus the sidecar. | Cite the approval as "scope at `1d4f2c3` (scope `4e422cf9…`, bindings `62dc4359…`, patch `b7427650…`)". Doc 42 does so. |

Verifier currentness note, recorded as data: at review time the builder branch head was `5fd2e4c` (19:07:08Z) with
`10208fe` (doc 43), `e7e3d44`, `9118a82` (doc 44), `4669493` and `5fd2e4c` (the four composition tests) above
`c54f53f`; `git diff c54f53f 5fd2e4c` over the 13 S-2/S-3 paths, `server/static.ts`, `server/vite.ts` and the manifest
is empty, so this file-set acceptance remains current at that head, while nothing in `10208fe..5fd2e4c` is covered by
it. Adversarial checks that came back clean: the protection route census excludes `/health` section routes, so the new
route does not disturb `core-site-protection.test.ts`; `publicDocumentRedirectLocation` is an exact-key lookup, so the
intake path is served, not redirected; `addExact` is idempotent for a same-kind duplicate; every helper and vocabulary
entry the six test files rely on exists with matching semantics; the containment is mounted before both body parsers
and answers 503 `no-store` for `/api/health/quick-order*`.
