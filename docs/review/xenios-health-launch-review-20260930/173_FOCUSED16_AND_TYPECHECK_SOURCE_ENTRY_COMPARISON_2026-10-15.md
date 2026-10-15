# Focused16 and generic typecheck slots: narrow source and entry comparison

**SUFFICIENT, with no material issue.** Both runners, both entries, the selection, the pins, the fixture limits, the
materialization, the windows and the capture match their declarations and their accepted bases.

One clarification is required so that the serial typecheck is not falsely refused: see section 6. This is not
admission or invocation. Tests and typecheck remain NOT RUN.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git objects,
text, and one physical base file. Nothing parsed or run, no agents. Docs 163–172 were not re-reviewed. Reviewed at
2026-10-15T03:46–03:53Z. Archive: `hl12/173_focused16_and_typecheck_source_entry_comparison.json`.

## 1. Binding

- **Core.** `4a662adb` (tree `4da55f64`, parent `18fe8d29`). All 13 `focused-typecheck-slot-r1/` files match.
- **Root.** Doc 250 at `677c34a`. Its frozen proposal (`32fe041b…`), materialization (`e45c36f9…`), reuse comparison
  (`c2961f21…`) and both entries equal Core's files.
- **The two groups:**

| Group | Pins | Runner | Entry |
|---|---|---|---|
| focused | 2,472 entries, 596,066 B, `6457a76a…` | 55,368 B, `edab84df…` | 3,254 B, `54b53e4a…` |
| typecheck | 44 entries, 9,675 B, `3a0ce4d4…` | 33,758 B, `404d1e95…` | 3,279 B, `df2ddfb7…` |

- **Helpers.** These are unchanged, with the same hashes the accepted build runner pins: `owned-processes.ps1`
  (`f3a92fa2…`) and `process-identity.cjs` (`c9d5d4f3…`).

## 2. Runners are exact rebindings of the accepted bases

- **Focused.** The base is the existing full R5 runner `ql-doc102-qs1-full-r5-20261013/run-full.cjs` (54,178 B,
  `74824f58…`; the physical file matches).
  - Its 17 declared replacements each apply exactly once and reproduce `edab84df…` byte for byte. Reversing them
    reproduces the base.
  - They cover these items:
    - root and scratch paths, candidate and tree;
    - the fixture raw hash;
    - `FILE_COUNT 971` replaced by the explicit `SELECTED` list;
    - the timeout cut from 1,800,000 to 600,000 ms, plus matching wording;
    - process-only `autocrlf` changed from true to false;
    - the reporters changed to verbose, JSON and the unchanged selection reporter, plus the selected paths;
    - the action label and the selection-text wording;
    - an `expected` filter restricted to `SELECTED`.
- **Typecheck.** The base is the companion that previously passed, `companion-r2-passed/run-check.cjs` (33,738 B,
  `d71208c2…`).
  - Its five scalar rebindings apply exactly once and reproduce `404d1e95…`, reversibly: root, scratch, candidate, tree
    and action.

## 3. Selection, limits and the local fixture

- **Selection.** `SELECTED` holds exactly the 16 test files among the 40 applied paths, with no duplicates. The 97
  authored declarations are not a result count. Results must come from the reporter output.
- **Vitest settings.**
  - One fork, `--maxWorkers 1`, `--no-file-parallelism`, `--allowOnly=false` and `--retry 0`.
  - A 600,000 ms aggregate budget, with 60,000 ms of cleanup inside it, and a deadline reserve of stop minus 1,000 ms.
  - A 1,024 MiB heap.
  - The runner requires its own start plus 600 s to be no later than the stop time.
- **Fixture.** `production-env-shape.fixture.json` is now pinned at `be34e4d2…`, which equals the `47f49adf` blob.
  - The old pin (`bd1cfc4a…`) was the raw hash from the earlier CRLF checkout. That is consistent with this fresh LF
    checkout and process-only `autocrlf=false`.
  - The fixture helper `scripts/evidence/lib/preview-supabase-fixture.mjs` is unchanged since the R5 candidate.
  - It permits exactly four local RPCs: issue nonce, exchange nonce, session active and revoke session. It refuses
    every other method or RPC (`preview_write_refused`), and refuses service-role use.
  - It listens only on its owned `127.0.0.1:54321`.
  - So these tests prove nothing about real Auth, PostgREST, the database or persistence.
- **No canary removed.** The base had no mandatory named-canary assertion. Its selected-union, fixture and process
  guards remain.
- **Typecheck settings.** `npm run check -- --incremental false`, refused unless `scripts.check` is exactly `tsc` with
  no pre- or post-hooks and no shadowing `tsc` binary. 300,000 ms of work plus 60,000 ms of cleanup, a 1,536 MiB heap,
  and the runner's own check that launch plus 360 s is no later than the stop time.

## 4. Pins and materialization

- **Focused pins.** 2,435 tracked-source pins, each equal to its `47f49adf` blob. They cover 38 of the 40 applied
  paths, all matching.
  - The two unpinned paths are the protection manifest and the SQL candidate, which `sql-contract.test.ts` reads. Both
    runners bind every tracked file by requiring HEAD `47f49adf`, tree `a2a8e79d` and empty
    `git status --porcelain=v2 --untracked-files=all`.
  - The pins also include 23 installed dependency files and the toolchain and helper files.
- **Typecheck pins.** 15 tracked files, all equal to their blobs. The protection manifest pin is the applied
  `dd99bc37…`, not the index's pending template, which is correct. The pins also include 19 installed files, among them
  `typescript` and `tsc`.
- **Materialization.** It copies exactly 8 files into fresh group folders, each matching its pinned hash:
  - focused: the runner, the pins, the two helpers, the helper test and the selection reporter;
  - typecheck: the runner and the pins.

  It requires the group folder to be absent. It creates no new checkout, install or build. Both groups use the Doc 172
  dependencies.

## 5. Entries, window, authority and capture

- **Entries.** Both reproduce exactly from the accepted R2 entry `8edcfb98…` through 12 declared changes:
  - group run root and the three output names;
  - stop `2026-10-15T04:45:00.000Z`;
  - labels, and "build" wording changed to "qualification";
  - the window, 600,000 ms for focused and 360,000 ms for typecheck;
  - the final call to the group runner, with its pins and pins hash.

  The R2 adapter `8b1e85ed…` is unchanged. Its kind `FIRST_LITERAL_BUILD_G0` is only a resource tag, not build credit.
  `-DateKind String` and every G0 refusal check are retained.
- **Windows.** 03:30:00–04:45:00Z. The focused group's last full start is 04:35:00Z and typecheck's is 04:39:00Z; the
  entry checks enforce both. The runs are serial, one G0 per group, a separate Root ticket each, and no retry or
  extension.
- **Authority.** Item 3 of Doc 223 and Doc 239 cover tests and typecheck. Each group still needs Core's fresh FINAL
  READY, the exclusive heavy slot, and prior owned closure.
- **Capture.** The same managed session, held for the run. Only `write_stdin` wait requests of 30 s or less, with no
  interleaved calls, and the actual transport delay recorded. That answers the Doc 172 polling recommendation without
  promising an impossible cadence.

## 6. Required clarification: reading the Doc 172 reuse condition

Doc 172's condition "nothing changed since 03:18:33Z" means the bound inputs:

- the lock;
- the 22 selected installed files;
- the 28 build pins;
- each group's own pins;
- HEAD, tree and an empty status.

It does not cover every byte under ignored `node_modules`. The focused run may legitimately write test-runner caches
there. If the fresh checks above pass after the focused group finishes, the typecheck group is not blocked. Any change
to a bound input still refuses.

## 7. Limits and holds

- **Starting at the last instant.** It passes the entry check, then fails closed on the runner's own launch check or
  the 1,000 ms reserve. Start well before 04:35Z and 04:39Z.
- **Not in scope.** Release-control source is not admitted, and the final manifest stays pending a real return.
- **No permission.** Nothing here permits the full suite, browser, SQL, security, hosted, push or deploy.
- **Security.** The exposure condition is OPEN and privileged staff reads are HELD.
- **Production.** The live revision (`7bba…`) is not `47f49adf`.
- **Custody.** It is unchanged: phase A active, return PENDING.
- **Unchanged.** R8 and Docs 160–172 stay closed, failed run `790af2ce` and tickets `404727c5`, `264a4c65` and
  `07024dd5` stay consumed, and the payment and security holds stay open.

Not execution, admission, push, deployment or production consent; not human approval; not test, typecheck or
qualification credit.
