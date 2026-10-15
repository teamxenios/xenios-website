# e33 isolated cloud-regression overlay R2

**ACCEPTABLE for its narrow purpose, with no material defect.**

- **R1's three objections.** All are resolved. For objection 3, the correspondence between each SHA and its tag is the
  author's readback; I did not verify it.
- **What this is.** An optional, isolated way to produce cloud evidence for `e33c12a9`.
- **What this is not.** Not qualification evidence until an actual GitHub Actions run is produced and reviewed. Not
  push, merge, deployment or production authority. It does not lift any hold or unpause the fleet.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session.
- **Method.** Static review of the extracted package plus committed Git objects. I did not run the overlay's 16
  controls, the workflow, any test or any network query, and I used no agents. The accepted application and docs
  163–188 are not reopened.
- **Inputs.** `XENIOS_E33_CLOUD_REGRESSION_OVERLAY_R2_20261015.zip` (19,243 B, `f4116b34…`), delivered in chat with
  `CODEX_INTEGRATION_HANDOFF.md` and `CLAUDE_REVIEW_HANDOFF.md`. Both handoffs are byte-identical to their copies
  inside the ZIP.
- **Timing.** Reviewed at 2026-10-15T15:10–15:16Z.

Archive: `hl12/189_e33_cloud_regression_overlay_r2.json`.

## 1. Package integrity

- **Extraction.** The ZIP has 10 entries, and extraction showed no path traversal.
- **Manifest.** All 9 `SHA256_MANIFEST.json` rows match the extracted bytes:
  - workflow `726cec8a…`;
  - validator `eb6d941f…`;
  - contract `acd3b338…`;
  - control tests `6dc06213…`.
- **Validator pin.** The validator pins the contract bytes to `acd3b338…`.
- **Scope.** The overlay adds only a workflow, a validator, a contract and tests. It changes no application file.

## 2. The three R1 objections

### Objection 1, fake-name acceptance: RESOLVED

- **The contract matches my derivation.** Its 66 names are exactly the set I derived from run 309's actual Vitest
  report plus the three new route-scanner names (Docs 183 and 185), file by file: 55, 5 and 6. Its full digests equal
  the runner's `CURRENT_SELECTION` (`99bcf044…`, `f998eba9…`, `4ddc27eb…`, combined `7a936af7…`).
- **What the validator requires.**
  - Exactly 3 suites, matched by path suffix, with no duplicates.
  - Totals of exactly 66, 65 passed, 1 pending, 0 failed, 0 todo, and `success` true.
  - Suite status `passed` and the exact per-file counts.
  - Each `fullName` non-empty, free of CR, LF and NUL, ending in its own title, and unique globally.
  - Each file's observed name digest equal to the reviewed one, and the same for the global digest.
- **The only allowed skip.** The PG16 title in the release-control file, and exactly one contract name carries that
  title.
- **Result.** Synthetic, renamed, missing, extra or duplicate names cannot pass.

### Objection 2, push trigger bound to the canonical branch: RESOLVED

- **Trigger.** The workflow runs `on: push` to `codex/e33-regression-overlay-20261015` only, with no
  `workflow_dispatch`.
- **Checkout.** It checks out `e33c12a9` by full SHA (`fetch-depth: 0`, `persist-credentials: false`).
- **Checks.** It then asserts HEAD, tree `ab4415f0` and a clean status. Its four blob pins (`84674e19`, `ad3b131a`,
  `e7ef7aad`, `748ee42c`) equal the `e33c12a9` blobs.
- **Commit availability.** `e33c12a9` is already on `origin/codex/mixed-request-intent-20261015` in my fetched refs, so
  the checkout by SHA is reachable.

### Objection 3, movable `@v4` dependencies: RESOLVED in form

- **Pins.** All three `uses:` entries are full 40-hex SHAs, and no tag remains:
  - checkout `11d5960a…`;
  - setup-node `49933ea5…`;
  - upload-artifact `ea165f8d…`.
- **Unverified.** The README says these were the commits behind `refs/tags/v4` when read back. I did not verify that
  by query, so the integrator must confirm it by readback before pushing.

## 3. Checked for new defects: none material

- **PG16 opt-in.** The test's condition is `process.env.CI || XENIOS_RUN_PG16_VERIFIER === "1"`. The Vitest step sets
  both to empty strings and asserts them with `test -z`, so the named skip is preserved. No test in the three files
  reads any other environment variable; `DYNAMIC_PATH` and `PREFIX` appear only in fixture text.
- **A commit missing from GitHub.** `WAVE2_UPSTREAM_REVIEW_SHA` `2542f8da` is not on any ref, so it may be absent in a
  fresh clone. But `isReleaseAncestor` maps any git error to `false`, so the test still sees
  `MIGRATION_SOURCE_NOT_RELEASE_ANCESTOR`. All other migration DAG source SHAs are on remote refs.
- **Permissions and secrets.** `contents: read`, no secrets, and only the JSON report is uploaded.
- **Gating.** Compiler, regression and validator failures all fail the job.

## 4. Limits, not defects

- **Different environment.** A run on Linux `ubuntu-latest` with a fresh `npm ci` is cloud evidence in a different
  environment. It does not reproduce the reviewed Windows runner's protections: the 91 raw pins, owned process closure,
  the G0 resource gate, and isolated npm and git configuration. Whether it can stand in for the Docs 185/188 local
  admission is the release owner's decision, not mine.
- **Command differences.**
  - It uses `--fileParallelism=false`, not the reviewed `--no-file-parallelism`.
  - It uses the JSON reporter only.
  - The config is found implicitly.
  - It runs a network `npm install -g npm@10.8.2`.

  With `--maxWorkers=1`, none of these changes outcomes. Using the reviewed literals would be cleaner.
- **Push.** Pushing the overlay branch needs separate, valid authority.
- **Evidence a run must produce.** The actual job ID, the checkout SHA, the compiler result, the full Vitest JSON and
  the validator exit, all reviewed. An Actions failure is a real failure, and the 16 control passes are not the 66-case
  run.
- **Unchanged.** Regression 309 FAILED and copy 340 FAILED stand.
- **Holds.** The browser capacity, Doc 247 DB, security and staff, phase A return, final manifest and live
  verification are unchanged. NOT LIVE.

Not execution, admission, push, deployment or production consent; not human approval; not test credit.
