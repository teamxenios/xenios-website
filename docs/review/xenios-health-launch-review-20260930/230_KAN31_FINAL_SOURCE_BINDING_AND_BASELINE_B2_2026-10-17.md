# KAN-31 final source binding: comparator successor, manifest template, and accepted baseline B2

**ACCEPTED.**

- **What is accepted.** The comparator source-binding patch (`dd111730…`) and the manifest template (`00db2ef8…`),
  from KAN-31 comment 10108.
- **To remove a review round trip,** I built and accept the populated baseline **B2**:
  `hl12/230_KAN31_ACCEPTED_BASELINE_MANIFEST_B2.json`, **4,601 B, SHA-256
  `dea66dabb3ffa991a77622fdf762e3c46c9259177f6a210902d5f41dce366a00`**.
- **What this is not.** Not reopening or run authority.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5. Read-only.

## Checks

- **Comparator patch.** It replaces the hard-coded `032ec068` with the hash-pinned accepted baseline's own
  `workflowSourceCommit`, which must be a 40-character hex value. `main` and the candidate must both equal it, and the
  source stays outside the allowed changes. The four added tests cover: wrong baseline hash, changed candidate source,
  an exact successor baseline, and a malformed source. They are authored, not run in CI; Root keeps the transcript.
  It is correct.
- **Template against accepted manifest `d85a5774`.** The only differences are:
  - `workflowSourceCommit` `032ec068` becomes `da2f3386cbd031c37f4b804c7553306c9edfe49f`. That is `main` now, PR #313
    merged, and it contains `route-boundary.mjs`. Workflow `7cbe7ccb` is unchanged.
  - Added `executableAcceptance.routeBoundaryCorrection` = `b39d3145…` (Doc 229).
  - `databaseSuccessorReview` is shortened to `e262a6a0…`.
  - The live fields are null.
- **Why B2 is needed.** The comparator requires the same JSON *types* (a null cannot become a string). The template
  cannot therefore serve as the baseline.
- **How B2 was built.** B2 is the template with only the Doc 227 live fields filled from `d85a5774`: `deployId`,
  `publicModeWindow.startsAt`/`endsAt`, `expiresAt`, `providerProofSha256` and `executionAuthorization`. Those values
  are placeholders that the comparator lets the real fresh values replace.
- **The accepted proof baseline stays `271fda86…`.** It carries no source field.

## Doc 227 transfers to B2

- **The rule.** Doc 227's pre-acceptance rule applies unchanged, with manifest baseline **B2 (`dea66dab…`)** in place
  of `d85a5774`, proof baseline `271fda86`, `ref=main` and `source_commit` both equal to `da2f3386…` at dispatch,
  artifact `12033375179` and ZIP `73e53b02…`.
- **The process.** Root runs the patched comparator immediately before dispatch, records its output, and dispatches
  only on PASS.

## Post-merge CI failure (run `38997756111`)

Of the tests, 5,738 passed and 1 failed. The failure is in the existing `release-control-plane` test: the Docker
PostgreSQL socket was unavailable before the first SQL statement. Build and typecheck passed. This is runner
infrastructure.

- **Unrelated to the merge.** PR #313 changed only harness files under `docs/` and `scripts/`, and its pre-merge CI
  was green.
- **Does not block the run.** The hosted qualification does not exercise that test.
- **Fix.** Root reruns the failed job once, with no code change, and records the result.

NOT LIVE.
