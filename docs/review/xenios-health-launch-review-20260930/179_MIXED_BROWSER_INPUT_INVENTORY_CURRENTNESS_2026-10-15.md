# Mixed browser input inventory: actual completeness and currentness

**SUITABLE. The actual metadata inventory for `84178ce1` is complete and current, and fits the browser group as its
input inventory, subject to final admission.**

- **Source pins.** The source set equals the commit's tracked non-test files exactly. All 3,909 source pins equal
  their `84178ce1` blobs, and all 984 exclusions are tests.
- **Caps.** Every count and byte cap holds.
- **The run.** It completed inside its window and budget, with native exit 0 and empty stderr.

This is not a browser grant, not admission, and not a browser or qualification result.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: committed Git
objects and Git's own tree and blobs. No active source or scratch was read or named, nothing was run, and no agents
were used. Doc 178 and the framework were not reopened. Reviewed at 2026-10-15T07:02–07:06Z. Archive:
`hl12/179_mixed_browser_input_inventory_currentness.json`.

## 1. Binding

- **Archive.** `5ded3708` (tree `93b1bc3b`, parent `640af7ef`) holds 8 files in
  `correction-84178ce-mixed-browser-metadata-actual-r1/`, all matching:

| File | Bytes | SHA-256 |
|---|---|---|
| `INPUT_PINS_PREPARED.json` | 11,365,704 | `e5bf5147…` |
| native stdout | 275,092 | `5fcb8cfd…` |
| native stderr | 0 | (empty) |
| producer | 9,239 | `02988485…` (equals the Doc 178 producer) |
| execution receipt | 11,841 | `564f3aa7…` |
| postcheck and archive | 65,177 | `38fa3416…` |
| native capture | 568 | `b7e6eafe…` |
| handoff | 3,314 | `c80ccb35…` |

- **Admission.** Ticket `dd7dd7a6…`, used once, under the Doc 178 metadata window of 06:21:48.653Z to 07:00Z.

## 2. The run

- **Timing.** The native capture ran from 06:42:38.642Z to 06:51:53.598Z, 554,959 ms, inside the 900,000 ms
  cooperative budget. The producer's own deadline was 06:57:38.710Z, with 345 s remaining at completion.
- **Outcome.** Native exit 0, with 275,092 B of stdout and 0 B of stderr. One attempt, no retry and no stops.
- **What it did not do.** It imported no application code, started no browser, and ran no resource, listener, process
  or SQL activity.
- **Progress.** The final record is `COMPLETE`, with all 7 Git calls completed. It covered 4,893 tracked files, 984
  excluded tests, 3,909 completed sources and 37,927 enumerated dependencies.
  - The output hash `e5bf5147…` equals the archived file.
  - The final stdout line labels the input total, 530,992,067 B, as `bytes` beside the output path. That is only a
    label; the file itself is 11,365,704 B.

## 3. The inventory, independently checked against Git

- **Identity.** Schema `ql_durable_browser_input_pins_prepared_v1`, status `PREPARED_NOT_EXECUTION_ADMISSION`,
  candidate `84178ce1`, tree `24d3fa00`. The pre and post Git state are identical and clean.
  `applicationImported`, `engineStarted` and `executionApproved` are all false.
- **Counts.** 3,909 source pins plus 37,927 dependency pins make 41,836 pins, all unique. There are 984 unique
  exclusions.
- **Scopes.** Every dependency pin is under `node_modules/`, and no source pin is.
- **Bytes.** The pin bytes sum to 530,992,067, equal to the declared total and below the 536,870,912 B cap. The
  largest single file is 24,456,173 B, below the 134,217,728 B cap. The dependency count is below 50,000.
- **The source set is exact.**
  - Using unquoted, NUL-separated `git ls-tree` output, source plus exclusions equals all 4,893 tracked files of
    `84178ce1`, with no overlap.
  - A first comparison with Git's default path quoting falsely differed on non-ASCII names. It was corrected, not
    taken as a finding.
- **Source hashes.** All 3,909 source pins match their `84178ce1` blobs in size and SHA-256, checked through
  `git cat-file --batch`. The lock pin is the accepted LF `d25eb6b8…`.
- **Exclusions.** All 984 are test paths, matching test, spec, `__tests__`, test-directory, e2e or fixture patterns. As
  the packet says, they are not skipped or passed tests.
- **Dependency pins.** The 37,927 are as recorded by the producer. Neither Root nor I independently re-read the whole
  dependency tree. The independent consistency evidence is Core's 06:53:44Z postcheck: output hash and schema, the 28
  build pins, 22 sampled installed files, both lock representations (canonical CRLF `d3083edc…` and actual LF
  `d25eb6b8…`), and clean full-history checkouts. No whole-filesystem proof is claimed.

## 4. Suitability, and what remains for admission

- **Suitability.** The inventory is suitable as the browser group's input inventory for `84178ce1`.
- **At admission, still required:**
  - a fresh check of these pins and the other fixed pins at the moment of admission;
  - Root's final copies of the seven Doc 178 files and their currentness;
  - Core's fresh FINAL READY and the exclusive slot;
  - an actual hash-matched `coordinator-admission.json` (none exists) naming the existing DNS27 receipt bytes;
  - a fresh G0 with all three raw readings at least 2,048 MiB;
  - a new single-use Root ticket;
  - owned cleanup.
- **The consumed metadata window is not a browser grant.**
- **Browser window.** Window 282 stops at 09:00Z. Gate completion is due by 07:24Z and the outer start by 07:24:30Z.
  The budgets are 5,730 s in total, 75 s for fresh actions and 20 s for reopen, with six full raw passes. No
  extension is available.
- **Discipline.** Doc 175's rule applies throughout.

## 5. Scope and holds

- **Mixed scope.** It is unchanged: two synthetic catalog rows, volatile RPC, the harness's own allowlisted app. It is
  not the full real catalog, the research wall, the `server/index.ts` composition, managed SQL, Auth, PostgREST or
  privileged staff reads.
- **Holds.** Security is OPEN, staff reads are HELD, the staging decision (Doc 247) is pending, phase A's return is
  PENDING, and SQL cases 228 are NOT RUN. No payment, fulfillment, push or deployment.
- **Unchanged.** The actual build (Doc 176), focused 220 of 220 and typecheck 0 (Doc 177) stand. The failures stay as
  recorded, and R8 and Docs 160–178 stay closed.

Not execution, admission, push, deployment or production consent; not human approval; not browser or qualification
credit.
