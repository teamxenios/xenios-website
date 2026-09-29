# Claude final independent website verification

Date: 2026-09-29
Reviewer: Claude (independent review lane; no runtime source edited, nothing deployed)
Worktree: `C:/xenios-wt/closeout-review` at `796f0ba` (local branch `claude/final-verify-796f0ba`, not pushed)

## Verdict

**READY FOR MANAGED STAGING QUALIFICATION: YES**

I did not reproduce any P0, P1 or P2 defect. I made no runtime commit, and `c213707` is preserved as the candidate runtime.

## 1. Candidate identity

| Item | SHA | Verified |
| --- | --- | --- |
| Runtime | `c213707a9d80ecc9f772b5790acb52f1fa503da7` | tree `09cbd1d25b7ab7dd2e60ae40ee2003226a9855e0` matches |
| Test-only | `4cc31567e2e93b0708584c8cfb45fee17209bea4` | tree `69f46e09…` |
| Release-control | `7396f53dcedb154991f8f9b23accaee137286fdd` | tree `ebe9b201…` |
| Docs/handoff tip | `796f0ba55c9d665086ee11904a691b7f313e3223` | equals `origin/codex/xenios-status-ux-closeout-20260928` (`git ls-remote`) |
| Parent | `899395c4980cc554f9a2c6bdb3eb3d14e63ee65a` | ancestor of `c213707` |
| Migration | `supabase/migrations/20260927203000_research_status_recovery.sql` | committed-blob SHA-256 `98cce457…0292`, unchanged |
| Production | `79414143d4355d5d3d14cd5fe6e5a536dc68d99d` | as recorded in the generated site record; not re-observed live by Claude |

Ancestry runs `899395c` → `04b44d1` → `c213707` → `796f0ba`, and `796f0ba` is the remote tip.

### Commit classification (`899395c..796f0ba`)

The only commits that touch client/server/shared runtime are these two:

- `04b44d1` normalizes reconciliation labels at presentation. It changes `ReconciliationReviewPanel.tsx` and adds `shared/research/reconciliation-presentation.ts`.
- `c213707` keeps public controls visible on keyboard focus. It adds a `PublicShell.tsx` class marker and a `:focus-visible` `scroll-margin-block: 84px 12px` rule in `index.css`.

The other commits fall into three groups:

- **Release-control** (package.json and gate script): `c4396f3`, `94dbfb9`, `858f971`, `8ff2d0e`, `d60a80f`, `7396f53`, `9b1d514`.
- **Test-only**: `71eee2a`, `696b7c2`, `a0a429c`, `cfba43d`, `f3f7fc1`, `4cc3156`.
- **Docs/continuity**: the rest.

`git diff --name-only c213707 796f0ba` contains no runtime paths, so there are **0 runtime changes after the candidate**.

I read every test edit since `899395c`. The `a0a429c` edits swap the expected em-dash text for the new copy one-for-one, with the same assertion strength. `f3f7fc1`, `4cc3156` and the gate node-tests only add tests. No gate was weakened.

## 2. Pinned runtime

- **Binary:** `scratchpad/node20/node-v20.19.0-win-x64/node.exe`, private and outside PATH.
- **Archive:** official `node-v20.19.0-win-x64.zip`, 29,871,567 bytes. Its SHA-256 `be72284c7bc62de07d5a9fd0ae196879842c085f11f7f2b60bf8864c0c9d6a4f` matches the official SHASUMS256.
- **node.exe:** SHA-256 `6e3a39787e667d50487f7335c85636c2823a53e636d73c2c841d45da4e57906c`. `node -v` reports `v20.19.0`.
- **npm:** the bundled npm is `10.8.2`. On this host it exits 1 with no diagnostic for `run` and `config list`; the debug log ends at `verbose exit 1` with no stack. `-v` works.
  - The install (lockfile-exact) and all script runs used the global npm `11.11.0`, executing on Node `v20.19.0`. Every heavy command (vitest, tsc, tsx) was invoked directly through Node 20.19.0.
  - Codex reports bundled npm 10.8.2 working in its own environment, so this is a host tooling issue, not a candidate defect.

## 3. F-01: runtime-fed admin reconciliation copy

**PASS**

- **Source JSON unchanged.** Blob `1c502e08fc10eb5328eccb02898cd1c537b5c388` is identical at `899395c` and `c213707`. It keeps its evidence em dashes: 23 in `phaseB/*/sourceConfiguration` and 1 in `phaseB/*/sourceProduct`. No other field in the file has any em-dash form.
- **Projection-level normalization.** `formatReconciliationPresentationLabel` is applied only where the label is displayed (the `<h3>` product label and the configuration `FactValue`). The wire contract and the server projection (`revenue-launch-reconciliation.ts:252-253`) are unchanged.
  - Those two fields are the only render sites. `CrmSupplierOperations` `productLabel` comes from a different, DB-fed source.
- **Admin rendered em dashes: 0.** I ran all 13 unique source values through the candidate normalizer. Every output is clean.
- **Copy is natural.** For example, "Capsule — 100 mg" becomes "Capsule, 100 mg", and "Wolverine — BPC-157 / TB-500 / MGF" becomes "Wolverine, BPC-157 / TB-500 / MGF". Hyphens, en dashes and slashes are left untouched.
- **The gate covers runtime-fed strings.** `scanRuntimeConfigText` runs the exact normalizer over phaseA and phaseB `sourceProduct`/`sourceConfiguration`. Probes:
  - A literal em dash normalizes to 0 findings.
  - `&mdash;`, `&#8212;`, `&#x2014;` and a literal `\u2014` survive normalization and are flagged.
  - phaseA is covered as well as phaseB.
- **No false failures on evidence-only data.**
  - An evidence-only field inside the listed file produces 0 findings, and a non-listed config file produces 0.
  - The other `config/research` em dashes all sit in fields that never reach a screen:
    - `catalog-priority-projection` `evidence`: parsed and never serialized.
    - `product-activation-overlay` `confirmedBy`: server-side only, a privacy boundary the file itself documents.
    - `master-catalog-reconciliation` `commerceHolds/*/why`: never read.

## 4. Zero em dashes

| Surface | Result |
| --- | --- |
| Gate: runtime source | 1,332 files, **0** forbidden forms |
| Gate: production build | 224 files, **0** forbidden forms |
| Customer rendered (Claude browser check of `/status` across states) | **0** |
| Admin/operator rendered (reconciliation labels via the normalizer) | **0** |
| Build, independent raw scan of all 5 forms | 4 raw occurrences, **0 rendered copy** |

My independent raw build scan found four occurrences, none of them rendered copy:

1. The allowlisted `@supabase/auth-js` debug string (third-party).
2. The normalizer's own regex literal in the `ProductsAdmin` chunk (code).
3. A `sw.js` comment.
4. The server name-normalization regex `[–—]` in `dist/index.cjs` (code).

My independent source scan covers client, server, shared, config, content and scripts. All remaining non-comment hits are one of the following:

- mislabelled CSS or JSX comments;
- dev tooling console output;
- normalization regexes;
- evidence-only config;
- an internal `.md` packet.

None of them is customer- or operator-rendered copy.

## 5. Gate behaviour

- **Test suite:** `test:no-em-dash` passed 9/9.
- **Forms detected in source:** literal U+2014, `&mdash;`, `&#8212;`, `&#x2014;`, escaped `\u2014`, template literals (with and without substitution), JSX text, JSX attributes and JSON values.
- **Build scan:** detects a customer string in a bundle. It passes the allowlisted third-party string.
- **Accepted without failure:**
  - approved punctuation (colon, comma, semicolon, parentheses, hyphen);
  - comments and test files;
  - `TEST_OR_ARCHIVE_PATH` exclusions (signed agreements, private archives, historical/audit evidence);
  - `node_modules`;
  - non-rendered evidence config.

## 6. R-01, R-02, R-03 regression

**PASS**

Checked in the Claude harness: the candidate `dist/public` served by the candidate `serveStatic`, over the real status-recovery service and an in-memory store, on Node 20.19.0.

**R-01 (Care references).** Tested `CARE-VALID1234`, `care-lowercase99`, `CARE-` and `CARE-UNKNOWN0000`.

- All four produce identical neutral Care guidance.
- There is no email promise and no confirmation or disclosure of Care status.
- **Zero network requests** are made.

A Research reference sends exactly one POST `/request`, gets a neutral "Check your email" message, and produces one captured outbox message to the canonical recipient.

**R-02 (authorized shortcuts).** Signed out, there is no "View account orders" link and no private shortcut. The only links are Contact Support and Sign In. The authorized-state cases pass in the focused tests.

**R-03 (same-tab recovery links).**

- **Hash navigation.** Same-tab `#recovery=<43-char synthetic token>` navigation leaves the URL scrubbed synchronously. The token is absent from the DOM, `history.state` and web storage, and **no exchange request** is sent.
- **View status.** "View status" is shown. Activating it sends exactly one POST `/exchange` (204), then the status renders.
- **Replay.** Replaying the consumed token shows "invalid or has expired" in `role=alert`, with focus moved inside the alert.
- **Back/forward.** Back and forward restore neither the token nor View status, and send no replay POST.

## 7. P-17 security

**Unchanged.** There is zero diff from `899395c` to `c213707` across all of these paths:

- `server/research/status-recovery/**`
- `supabase/migrations/**`
- `client/src/clarity/pages.tsx`
- `server/routes.ts`
- `server/static.ts`

The migration bytes are identical (SHA-256 `98cce457…`). My earlier PG17 qualification of these exact bytes still stands: applied twice, 80/80 adversarial checks passed, race-safe.

The focused P-17 suite (`server/research/status-recovery/**`, frontdoor, static) passes. Owner isolation and the Care boundary are unchanged.

## 8. True zoom

- **Codex's evidence: accepted as true Chrome page zoom, with one limitation.**
  - The numbers are internally consistent with real page zoom:
    - DPR is 3.0 at 200% and 6.0 at 400%, which implies a 1.5 host scale.
    - `innerWidth` is 1280/2 = 640 and 1280/4 = 320.
    - `innerHeight` is 304 and 152 against a 752 outer height.
  - scrollWidth equals clientWidth, so there is 0 horizontal overflow and there are 0 clipped controls.
  - The reverse-focused submit sits at `top=83.98` / `bottom=135.98` in a 152 px viewport. Before the repair it sat at `top=-0.02`, under the 69 px header.
  - No emulation, transform or CSS zoom is presented as zoom evidence.
  - **Limitation:** the 200% and 400% screenshots were captured inline in the Codex task and are not committed, so I reviewed the numeric evidence and the packet, not the images.
- **Claude's own true-zoom run: NOT RUN.** My tools cannot set Chrome page zoom.
- **Supplementary viewport proxy (not zoom).** I emulated a 320x152 viewport and reverse-tabbed with real Shift+Tab.
  - The focused submit, email and reference controls sit at top 83.8–85.8 and bottom 135.8–137.8, under a header whose bottom is at 68.7. All are fully visible.
  - `scroll-margin-top` is 84 px on `:focus-visible`, and there is 0 horizontal overflow.
  - This agrees with Codex. It is not zoom evidence.

## 9. Business and copy boundaries

The only runtime copy change since `899395c` is the admin label separator, a comma. No pricing, commission, claims, Care/Research boundary or buyer-specific copy changed. My earlier route sweep of `899395c` still applies.

## 10. Release checks (Node 20.19.0)

| Check | Result |
| --- | --- |
| Focused tests (PageShell, StatusPage, clarity pages, ReconciliationReviewPanel, frontdoor, status-recovery/*, static, release-control-plane) | PASS, 12 files, 157 passed / 1 skipped |
| Typecheck (`tsc`) | PASS, exit 0 |
| Build (`npm run build`, with the source and build gates) | PASS |
| Build scan | PASS, 224 files, 0 |
| Full suite, quiet host | 993 files: 986 passed, 6 skipped, 1 timed out. 18,267 tests: 18,181 passed, 85 skipped, 1 timed out. See the note below. |
| Migration DAG/checksums | PASS, 38 nodes |
| ACL/postchecks | The migration is byte-identical to the one I qualified on PG17 (80/80). I did not re-run it, because nothing changed. |
| Route uniqueness | PASS, 453 registrations across 444 call sites |
| Protected change (`fef7b313..c213707`) | PASS, 38 protected hashes verified, 108 files |
| Site records | PASS against the committed blobs: 235 routes, 15 capabilities, production `79414143`. See the note below. |
| Release manifest (base `fef7b313`, head `c213707`) | PASS |
| `git diff --check` (`fef7b313..c213707` and `c213707..796f0ba`) | PASS |
| Remote | `origin` tip is `796f0ba` (verified with `ls-remote`) |
| Clean worktree | PASS, 0 changes |

**Full-suite note.** The one failure is `release-control-plane.test.ts` › "hashes canonical raw Git blobs…". It timed out against its own hard-coded 30 s limit while running Git operations under parallel full-suite load.

- The first run was made while my harness was up. It had 5 timeouts, all in `release-control-plane.test.ts` and `production-boot.test.ts`.
- Rerunning both files in isolation passed: 57 passed, 1 skipped. The focused run above also passed.
- The candidate does not touch this test or its subject.
- It is an environmental timing issue, not a product defect.

**Site-record note.** `npm run site:record:check` reports "stale" in this checkout for two reasons:

- It compares the worktree bytes, which are CRLF because of `core.autocrlf=true`.
- It needs the branch to be named exactly `codex/xenios-status-ux-closeout-20260928`.

I regenerated the snapshot under that branch name and compared it to the committed Git blobs: all three artifacts match exactly.

## 11. Findings

- **P0: 0. P1: 0. P2: 0.**
- **New P3s (deferred, not blocking):**
  1. The Codex zoom screenshots are not committed. Committing them would make the zoom evidence independently reviewable.
  2. After "End secure status access", focus falls back to `BODY`. Moving it to the form heading would help screen-reader users.
  3. The runtime-config gate list is maintained by hand (one file, two fields). New runtime-fed config must be added to it, and DB-fed operator strings are outside any static gate.
  4. `site:record:check` is CRLF-sensitive and branch-name-bound on Windows checkouts.
  5. Tests with a hard-coded 30 s timeout (`release-control-plane` Git tests, `production-boot`) flake under host load.
  6. The bundled npm 10.8.2 fails silently on this host (tooling).
- My earlier P3 backlog of 12 items remains deferred. None of it was implemented or reproduced as P0–P2.

## 12. Mutations

- External delivery: NOT RUN. No real email was sent; the outbox was captured locally.
- Managed staging: NOT RUN and not mutated.
- Staging and production: not mutated, not deployed.
- The migration was not applied anywhere.
- Harness processes and temporary launch configuration were removed after the review.
- The private founder archive was not used or copied.
