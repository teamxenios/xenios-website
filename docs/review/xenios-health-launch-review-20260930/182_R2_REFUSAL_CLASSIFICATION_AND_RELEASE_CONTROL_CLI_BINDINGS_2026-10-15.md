# Second browser refusal, and the release-control CLI bindings and window

**R2 refusal: REFUSED, as designed.** It is a host-capacity refusal at the external 2,048 MiB browser floor. It is not
an application defect and earns no test credit.

**CLI bindings: SUFFICIENT, with no discrepancy.**

- **Runner and entries.** The runner and both entries are exact, reversible literal rebindings of accepted baselines.
- **Pins.** The 91 pins match the runner's required set and the candidate's Git blobs.
- **Window.** The window is enforced both by the entry and by the runner.

This is not admission, consent or a pass.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: committed Git
objects only, with no command naming an active source or scratch path, and no active native group. Nothing run, no
agents. Docs 174–181 stay closed.
- **Packet.** Root `961ef38` DOC304 (4,033 B, `6d230323…`).
- **Timing.** Reviewed at 2026-10-15T08:29–08:47Z.

Archive: `hl12/182_r2_refusal_classification_and_release_control_cli_bindings.json`.

## 1. The second browser refusal (Core `09286601`, tree `4d983f54`, 6 files)

### Identity

All six files match. The G0 result is 995 B (`4fbc6ffe…`) and stderr is 0 B. The grant is 7,018 B (`14529191…`) and
is byte-identical to Root's DOC300 grant. The execution record and handoff equal Root's DOC301 frozen copies.

### Admission conformed to Doc 181

- **The grant.** It is `approved`, `oneAttempt`, run ID `mixed-r2`, ticket `18611b86…`.
  - Its `inputMetadataPin` is exactly the R1 path, 11,365,704 B, `e5bf5147…`.
  - It carries the DNS27 receipt pin (5,834 B).
  - Its launcher, outer and driver pins equal the hashes accepted in Doc 181.
  - Its window is `notBefore` 07:58:23.475Z, latest start 08:24:30Z, reserved until 10:00Z.
- **Sequence.** READY at 07:53:32Z was within 5 minutes of the ticket at 07:58:23Z. Currentness was rechecked
  immediately at 08:00:17Z, and the grant copy matched exactly at 08:01:24Z.

### The earliest failing condition

Entry line 41 at G0 08:01:35.637Z.

- **What passed first.** The earlier checks all passed: G0 exited 0 in under 30 s with stdout ≤ 8 KiB and empty
  stderr, and on line 40 the kind, candidate, tree, status and all three internal 1,536 MiB comparisons were true.
- **Line 41.** It requires all three raw readings ≥ 2,048 MiB. OS free was 1,700.832 MiB and available was
  1,700.105 MiB, both under, a shortfall of 347.89 MiB. Commit headroom of 6,381.078 MiB passed. The entry threw
  `BROWSER_EXTERNAL_2048_RESOURCE_FLOOR`; native chunk `79f4f6` exited 1 after 1.888 s.

### Classification

- **Refusal.** This is the same designed refusal as Doc 180.
- **Nothing downstream ran.** There were zero bridge, outer, harness or browser attempts, zero assertions, zero raw
  passes and no stops.
- **Missing outer summary.** It is the same non-material throw-path gap as Docs 169 and 180. No substitute receipt,
  census or cleanup claim is made, and none is needed.
- **Capacity change.** Against R1, available rose by 76.8 MiB, which is not attributed to any cause and is still
  short.
- **Postcheck.** At 08:02:26Z, source and inputs were unchanged, and Root 301 verified all six files and 479 bounded
  pins.
- **Tickets.** Tickets 290 and 300 are both consumed.
- **Next attempt.** No automatic third attempt. Any third attempt needs a concrete resource change, which is
  Samuel's, with Chrome preserved, plus a fresh READY, a new ticket and a fresh 2,048 MiB G0.

## 2. Release-control CLI bindings (Core `bba1ac0c`, tree `7c2ade95`, 8 files)

Hashes match: `BINDING_SCOPE` `bde2feb2…`, `SOURCE_VERIFICATION` `8933f728…`, runner `b096bbb9…`, check entry
`df44f7f0…`, regression entry `2f863a58…`, pins `747e230f…`. Root's DOC303 frozen copies are identical.

### The runner

- **Baseline.** `affected-check-actual/run-check-r2.cjs`, 40,676 B, `e1b22ac2…` (Doc105, `fba76fd`).
- **The six changes.** Root, scratch, candidate, tree, action label and the dependency-provenance text. Each occurs
  once.
- **Transformation.** Applying them gives the R2 runner (40,816 B) exactly, and reversing them gives the baseline
  exactly.
- **Both modes are in the unchanged body.**

| Mode | Command | Work + cleanup | Child heap | Pass criterion |
|---|---|---|---|---|
| check | `npm run check:release-control-plane` | 300 s + 60 s | 1,536 MiB | — |
| regression | `vitest run`, one worker, on exactly the three tests | 180 s + 60 s | 1,024 MiB | exactly the historical Doc105 identity selection |

- **The check script.** Its expected text equals the script in `84178ce1`'s `package.json` exactly.

### The entries

- **Baseline.** The accepted generic-typecheck entry, 3,274 B, `fa50c3d3…`. Only its pattern is reused; no test
  credit carries over.
- **Check entry: 7 replacements.** Scratch (3 places), G0 prefix (4), label, stop 09:30Z (3), runner name, pins name
  and pins hash.
- **Regression entry: the same 7, plus two.** The mode argument becomes `'regression'`, and the reserve becomes
  240,000 ms, which equals 180 s plus 60 s.
- **Transformation.** Both are exact forward and in reverse. The G0 helper (`947bba10`), the internal 1,536 MiB
  thresholds, the 30 s freshness and capture limits, the 8 KiB stdout and empty-stderr checks, and cleanup are all
  unchanged.

### The pins

- **Count.** 91 pins: 81 under the candidate root (53 tracked files and 28 under `node_modules`) plus 10 external.
- **Required set.** The 81 root-relative paths equal the runner's required list exactly.
- **Helpers.** The helper hashes equal the runner's constants. The future runner pin is `b096bbb9…`.
- **Tracked files.** All 53 tracked pins equal the SHA-256 of their `84178ce1` blobs.
- **Against the old pins.** Against the old Doc105 pins, 88 are equal. Only three differ:
  - the runner, by path and hash;
  - `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json`;
  - `server/index.ts`.
- **Candidate changes.** Those two source files are exactly the pinned files that changed from `8e85daa` to
  `84178ce1`.
- **Unchanged inputs.** The three tests, `package.json`, the lock, `.npmrc`, `tsconfig.json` and the Vitest config
  are unchanged.
- **Copy grant.** Root 303's copy grant maps exactly two files: the runner (40,816 B) and `pins-r2.json` (21,000 B,
  `747e230f…`).

### Window and action

- **Root 302.** Root 302 (`baec631`) sets 08:08:25.095Z to 09:30Z, with no extension or retry.
- **Stop.** Both entries carry 09:30Z three times.
- **Latest G0 completion.** The entry reserve allows it by 09:24Z for check and 09:26Z for regression.
- **Runner start limit.** The runner also refuses if the launch time plus the aggregate budget exceeds 09:30Z.
- **Action labels.** `MIXED_84178CE_RELEASE_CONTROLS_{CHECK,REGRESSION}_20261015`.

## 3. Limits

- **Not re-read.** The bytes of the 28 `node_modules` pins, the 10 external pins and the 102,225,494 B total are
  recorded by Root, not re-read by me.
- **Regression identities.** The three tests use static names, so identity drift is not expected. If it happens
  anyway, it fails as `FAILED_OR_INCOMPLETE` and is not reinterpreted.
- **The skip.** The named PG16 opt-in skip is retained, not passed, and no PostgreSQL or CI result is claimed.
- **Current results.** The inventory-admin integration test reads `server/index.ts`, which changed in `84178ce1`,
  directly. The release-control-plane test imports the route-uniqueness verifier, which may read changed route
  sources indirectly. Either way, results must come from the new run. The 63 = 62 + 1 historical figures are
  expectations, not results.
- **No start literal.** As in the accepted pattern, the CLI entries carry no `notBefore` literal; the ticket and
  grant must bind the start.
- **CLI G0 scope.** A CLI G0 checks only 1,536 MiB and can never admit a browser.
- **Before each group, separately.**
  - Owner's fresh READY.
  - Current 91 pins.
  - Absent outputs.
  - One exclusive slot.
  - A new actual Root ticket and grant.
  - A fresh G0.
  - Owned postchecks.
  - No fallback from the first group to the second.
- **Discipline.** Doc 175's rule applies.
- **Still open.** The full suite, static checks, diff, final manifest, the hosted DB and staging decision (Doc 247),
  the security exposure, privileged staff reads, phase A's return and live verification all remain OPEN. NOT LIVE.
  No deployment, secret, provider or payment change.

Not execution, admission, push, deployment or production consent; not human approval; not test, browser or capacity
credit.
