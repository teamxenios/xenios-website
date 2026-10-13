# Revision 9: static-CLI profile R3 correction (doc 107 remedy) and assessment of three completed receipts

**Part A — correction successor: SOURCE ACCEPTED for the bounded control stage.** The R3 controller differs from the
refused R2 controller in exactly the three lines the remedy called for; the pins and the parent move only the
controller's identity; the new discriminator control exercises the controller's real comparison and would have failed
at R2. Acceptance is of bytes and of the control specification: the 15 mapping controls and the 36 wrapper controls are
not run, and no CLI receipt exists yet.

**Part B — completed receipts: three accepted as bound evidence at `8e85daa`.** Doc 105 §2 item 1 (literal
`check:release-control-plane`) and items 2–3 (one combined Vitest run of the three affected files) are satisfied; the
supplemental 27 DNS guard controls close doc 106's "controls unexecuted" limit. None of these is a full-suite run, a
browser result or a release permission.

Reviewer: this session, `claude-fable-5-1`. Board registration revision 9 on
`DOC96-EXISTING-WIZARD-QL11-QL12-DELTA-REVIEW-20261012` (20:01:38Z;
`DOC107_STATIC_R3_AND_COMPLETED_RECEIPTS_REVIEW_REGISTRATION_20261013.json`, proposal `c287f4bd…`, records
`158cfa06`). Application `8e85daa`/`25507c2f`, build reuse, QS-2, QS-R5 and docs 104–107 unchanged. Reviewed directly,
read-only, no agents, nothing executed. Archive: `hl12/108_static_cli_r3_and_completed_receipts.json`.

## A. The doc 107 remedy (`run-static-cli-r3.cjs` 44,574 B `55b7ff04…`)

- **My diff of `68f738b3…` → `55b7ff04…`:** three lines. `const NODE = RUNTIME + '/node.exe'` and
  `const NPM = RUNTIME + '/node_modules/npm/bin/npm-cli.js'` replace the `path.join` forms, and the self-filename
  guard `EXACT_RUNNER_REQUIRED` now names `run-static-cli-r3.cjs`. Nothing else changed: the strict
  `JSON.stringify(result.command) === JSON.stringify([NODE, ...cliArgs])` gate, argument order, allowlist, handshake,
  ACK, identity, environment, budgets and cleanup are byte-identical to the mechanism accepted in doc 107 §2. With
  these literals the controller's expected array now equals the unchanged wrapper's `commandFor()` for all three
  modes (element 1 of protection mode is `path.join(ROOT, …)` on both sides and already matched).
- **Pins (`pins-static-cli-r3.json` 18,263 B `305cc2e2…`):** 92 entries; the only difference from `3880381c…` is the
  controller entry (`run-static-cli-r2.cjs` `68f738…` → `run-static-cli-r3.cjs` `55b7ff…`); all 91 other entries
  identical.
- **CLI parent (`execute-admitted-static-cli-r3.ps1` 8,791 B `2a72dd9e…`):** differs from `cfbaa675…` only in the
  ticket path (`DOC105_STATIC_R3_…`) and `$qualExpected` (controller filename, pins filename, pins hash).
- **Wrapper `e3898fe7…` and pure36 `44f33dab…` unchanged**, as the remedy required.
- **Discriminator control (`verify-static-command-mapping-r1.cjs` 4,299 B `18cbff0a…`), not run:** pins old and
  new controller and the wrapper by hash; proves the delta is exactly the three edits by reverse replacement; extracts
  each controller's `ROOT/RUNTIME/NODE/NPM/CANDIDATE/CLI_ALIAS` declarations and the `cliArgs` expression into a 100 ms
  `vm` context with `path = path.win32`, asserts the literal comparison line is present, and compares
  `JSON.stringify([NODE, ...cliArgs])` with the wrapper's `commandFor(mode)` for all three modes: old must mismatch,
  new must match, a different executable and a different last argument must refuse; post-pins; 15 named groups under a
  5 s budget, no CLI spawn. This is the proving check doc 107 asked for; it exercises the controller side the pure36
  controls never reached.
- **LIGHT parent (`execute-admitted-static-command-mapping.ps1` 9,010 B `35a7e1b0…`):** exact invocation
  (`node --max-old-space-size=128 <control>`), ticket hash, window ≤10 min with last-start = end − 15 s, fresh output,
  source clean and non-shallow, no competing qualification processes, 512 MiB floor on three measures, output cap,
  child must close.

**Disposition:** technically accepted for the bounded control stage. What it does not supply: the 15 and 36 control
results, the three actual CLI receipts (migration DAG; production state within the QS-R6 window ending
2026-10-20T13:49:12Z; protection `79414143 8e85daa`, 17 paths), each still needing its own finite admission. Retained
limits from doc 107 §3 carry unchanged.

## B. Completed receipts (owner-produced, verified in bytes; not my runs)

1. **`npm run check:release-control-plane` — ACCEPTED (doc 105 §2 item 1).** Archive
   `DOC105_AFFECTED_CONTROL_CHECK_ACTUAL_PASS_20261013/` (records `358d8d7a`, root disposition `6da5b254…`).
   Receipt bound to `8e85daa`/`25507c2f`; runner `run-check-r2.cjs` `e1b22ac2…` in check mode; pins `3af01cf9…`
   (91 files) matched before and after; `run.log` shows the literal
   `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext
   --allowImportingTsExtensions --types node,vitest/globals` over the four acceptance scripts and
   `server/release-control-plane.test.ts`; npm 10.8.2; child 19:19:13–19:19:18Z exit 0; supervisor exit 0; HEAD
   clean before and after; two quiet observations; independent closure PASS. I recomputed `run.log` sha256
   `e8c95d04…` and `receipt.json` `24d3f793…` from the committed bytes; the archive is stored raw (`** -text -diff`),
   the earlier CRLF-normalized copy at `fba76fdf` is historical with an erratum, no rerun. Dependencies were a
   physical copy of the `3dd3d96` `npm ci` tree (same lockfile), recorded by a pinned copy receipt — reuse, named.
2. **Three affected files, one Vitest invocation — ACCEPTED (doc 105 §2 items 2–3).** Archive
   `DOC105_THREE_AFFECTED_REGRESSIONS_ACTUAL_PASS_20261013/` (records `258e2afb`, root disposition `688a11b2…`).
   Exact argv: `vitest run --config vitest.config.ts --maxWorkers 1 --no-file-parallelism --reporter verbose
   --reporter json --outputFile.json …` with `server/release-control-plane.test.ts`,
   `server/research/assisted-order/audit-store-sql.test.ts`, `server/research/inventory-admin/integration.test.ts`;
   cwd the `8e85daa` worktree, HEAD clean before and after, pins matched; child 19:25:13–19:26:36Z exit 0; supervisor
   exit 0; `vitest-results.json`: 3 files, 9 suites, **63 tests: 62 passed, 1 skipped, 0 failed/todo**; per file
   51 + 1 skipped / 5 / 6; the single skip is the authored PG16 opt-in case ("migration DAG validator executes the
   complete production verifier against canonical production-shaped PostgreSQL"), gated on `CI` or
   `XENIOS_RUN_PG16_VERIFIER`, which the allowlisted environment does not set — the same authored skip as in R5 at
   `dd3f532`. `run.log` summary `Tests 62 passed | 1 skipped (63)` and sha256 `1bedd108…` recomputed; independent
   closure PASS; archive raw (`* -text`). This closes the only files whose inputs changed; it is not a new full suite,
   and the R5 reuse for the other 968 files stands as recorded in doc 105 §2.
3. **27 bounded DNS guard controls — ACCEPTED as closure of doc 106's named limit (not browser evidence).**
   Archive `DOC106_LOOKUP_27_CONTROLS_ACTUAL_PASS_20261013/` (records `1b772418`, root disposition `f9426c2f…`).
   Frozen inputs pin the R1 harness `34a094e2…`, the accepted R2 harness `60b025ee…`, the corrected control script
   `verify-loopback-lookup-controls-r2.cjs` 5,941 B `1801377b…`, its launcher and the pwsh binary; invocation
   `node --max-old-space-size=128 <control>`; the control reads pinned text and never imports the harness, proves the
   R1→R2 delta by reverse replacement, and exercises the extracted `dns.lookup` shape in a VM; 27 passed / 0 failed in
   11.6 ms, exit 0, pre/post pins and source unchanged, independent closure PASS. Limits as labelled: lookup and
   refusal shapes only; no resolver, socket, application, database or browser; no all-network containment guarantee.

## C. Browser R2 — recorded as failed-closed, not assessed

`DOC106_LOCAL_BROWSER_R2_ROOT_FAILED_CLOSED_DISPOSITION_20261013.json` (records `be27606b`): started 19:38:51Z under
the accepted `60b025ee…` harness, closed 19:58:26Z, `UNEXPECTED_BROWSER_TARGET`, 0 cases, 0 requests, engine and
listener closed, source and post-pins unchanged, independent closure, no automatic retry. The failure is preserved;
its cause is not inferred or diagnosed here, and no transfer to `8e85daa` arises because nothing was tested. The
browser outcome — lost-response journey with exactly one saved request, admin payment-state refusal, authorized staff
readback — remains owed in full.

## D. Still owed before release (unchanged list, now shorter)

Controls 15 and 36 (LIGHT admission); the three actual CLI receipts (production state inside the QS-R6 window); the
17-path release manifest validation (QS-R2); the browser outcome above; QS-R1 transcription; QS-R4 delivery,
deploy-time build log and served identity; Samuel's current release authority with destination, rollback and
no-overwrite checks. Closed and unchanged: application source, build reuse, QS-2 attestation, QS-R5 direction,
docs 104–107.

Nothing here authorizes execution, a push or deployment. Nothing was executed.
