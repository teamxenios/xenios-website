# e33 current-66 runner, pins, window, preparation and reuse

**Runner, profile, entries, G0, pins and window: SUFFICIENT, with no discrepancy.**

**Preparation proposal: SUFFICIENT WITH THREE CONDITIONS.** See section 4.

**Exact-tree reuse: ACCEPTED, bounded.** It covers the Doc 176 build, the Doc 177 focused 220 of 220 and the Doc 177
generic `tsc`, and only as evidence that their inputs did not change.

Nothing here is admission, a ticket, a copy or a result.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: committed Git
objects only. Nothing compiled, parsed, tested or copied; no agents. Docs 183 and 184 stay controlling and are not
reopened.
- **Packet.** Root `5eb0084` DOC335 (5,002 B, `c24af141…`).
- **Timing.** Reviewed at 2026-10-15T11:30–11:35Z.

Archive: `hl12/185_e33_current66_runner_pins_window_preparation_and_reuse.json`.

## 1. Identity (Core `6e614a53`, tree `7e164416`)

- **Files.** 10 documents plus four `.xenios` ACK metadata files.
- **Hashes.** All 10 match the packet: runner `5de63524…`, pins `fbe8e649…`, G0 `4f2898d8…`, check entry `2f3fb42e…`,
  regression entry `f1d4adf6…`, `PROPOSAL` `2dfc811a…`, `EXACT_LITERAL_DELTAS` `4c937a8d…`, `ENTRY_LITERAL_DELTAS`
  `b7341843…`, `EXACT_TREE_REUSE_ARGUMENT` `94604a46…`, `SOURCE_VERIFICATION` `c5b265a5…`.
- **Root copies.** Root 334's frozen copies are byte-identical.

## 2. The complete runner and current profile

- **Changes.** 15 literal changes from the Doc 182 runner (`b096bbb9…`), each occurring once. Applying them gives
  `5de63524…` (42,235 B) exactly, and reversing them gives the base exactly.
- **What they bind.**
  - Root, scratch (`…/runner`), candidate `e33c12a9`, tree `ab4415f0` and the action label.
  - A new frozen `CURRENT_SELECTION`.
  - Every guard reference switched from the historical selection to the current one.
  - Receipt and text fields.
- **Historical selection.** `HISTORICAL_SELECTION` is byte-identical and is used only as provenance in the receipt.
- **Unchanged.** No guard, environment, cleanup, budget, cap or helper changed.
- **Profile digests.** I recomputed the digests from run 309's actual Vitest names plus the three new names:
  - 52 + 3 = 55 names give `99bcf044…`;
  - the 5-name and 6-name files give `f998eba9…` and `4ddc27eb…`;
  - all 66, unique, give `7a936af7…`.
- **The old names.** The same method gives `1a67f0d4…` and combined `74d3fe24…` for the old names, which is exactly
  run 309's receipt.
- **Guards (read in full).** The runner refuses on:
  - any file count other than exactly 3, an unexpected file, a duplicate file or an empty file;
  - an assertion name that is empty, contains CR, LF or NUL, or is duplicated globally;
  - a status outside passed, failed, skipped, todo or pending.

  It also requires:
  - each file's count, name digest, passed count and skipped count to match, with 0 failed, pending or todo;
  - 66 assertions in total;
  - exactly one skip, the named PG16 test, in the release-control file;
  - reporter totals that agree;
  - 65 passed, `success` true, and every file `passed`.

  A missing, extra, renamed or duplicate assertion therefore fails.
- **Expected values.** The 65 + 1 figure is an expected value, not a result.

## 3. Entries, G0, pins and window

- **G0 script.** `947bba10` → `4f2898d8`: only the candidate and tree result literals (1 each).
- **Entries.** `df44f7f0` → `2f3fb42e` (check) and `2f863a58` → `f1d4adf6` (regression). Seven declared changes each:
  scratch (3), G0 path, stop 12:30Z (3), action, candidate, tree and the pins hash. All are exact forward and in
  reverse.
- **Unchanged in the entries.** Both reserves (360,000 and 240,000 ms), the 1,536 MiB floor on all three metrics, the
  30 s freshness and capture limits, the 8 KiB stdout cap, empty stderr, and the pinned PS7 and Node.
- **Pins.**
  - 91 pins: 81 root-relative, exactly the runner's required list, plus 10 external.
  - 88 are equal to the Doc 182 pins. The only changes are the runner (path and `5de63524…`), the scanner
    (`157ac000…`) and the test (`f9518705…`).
  - Those two source files are exactly the files that differ between `84178ce1` and `e33c12a9`.
  - All 53 tracked pins equal their `e33c12a9` LF blobs.
  - The 102,235,961 B total equals 102,225,494 + 4,853 + 4,195 + 1,419.
- **Window.** Root 328 (`d920d1c`) sets 11:11:56.032Z to 12:30Z, with no extension or retry.
  - The entries carry 12:30Z.
  - The latest G0 completion is 12:24Z for check and 12:26Z for regression.
  - The runner also refuses if the launch time plus the aggregate budget passes 12:30Z.
  - Window 302 has closed, and tickets 307 and 309 are consumed.
- **Window capacity.** With one heavy job at a time, preparation (≤360 s), its separate sufficiency review, and check
  then regression must all fit before 12:24Z and 12:26Z. Whatever does not fit lapses; there is no extension.

## 4. Preparation proposal: sufficient with three conditions

- **Source checkout.** Detached `git worktree add` of `e33c12a9` from the existing full-history repository, with
  process-local `core.autocrlf=false`, `core.eol=lf`, `core.hooksPath=NUL` and `core.longpaths=true`. The tracked
  files are then matched to the verified 4,893-entry LF archive. The ZIP is not a substitute.
- **Dependencies.** A read-only `robocopy` of the donor `node_modules` into an absent destination, using `/E /COPY:DAT
  /DCOPY:DAT /R:0 /W:0 /XJ`. Only native exit 1 is accepted. Nothing is installed or overwritten, and the donor is not
  modified.
- **Checks after the copy.** All 4,893 source blobs, all 91 actual destination pins, and lock and dependency
  provenance before READY. The lock has 673 packages and no `link` entries.

### Conditions for Root's preparation grant

1. **Reparse check.** `/XJ` silently skips junctions and symlinks, so the robocopy command itself cannot "refuse"
   them. Before copying, run a donor census that enumerates reparse points explicitly; any non-zero count refuses the
   copy. After copying, compare names and lengths against a donor enumeration that does not skip reparse entries.
2. **Worktree side effects.** `git worktree add` writes administrative metadata under the source repository's
   `.git/worktrees/`, and the new root depends on that repository's object store. The grant should name this, record
   the shared repository's local end-of-line and filter settings and that `.gitattributes` is unchanged, and include
   owned `git worktree remove` cleanup. This touches no tracked phase A path.
3. **Copied caches.** The donor `node_modules` may carry caches from earlier runs, such as Vitest result caches. They
   affect ordering only, not pass/fail, but the inventory must record them so they are not silent.

## 5. Exact-tree reuse argument: accepted, bounded

- **The diff.** The whole-tree diff from `84178ce1` to `e33c12a9` is exactly the two tooling and test paths, so all 24
  named blobs are necessarily identical.
- **References.** I checked every reference to either path in `e33c12a9` (excluding docs and `.md` files). Outside the
  two files, they are:
  - comments, in `hardening-contract.ts` and the mount files;
  - `package.json` script strings;
  - `.xenios` registry rows;
  - test files outside all three scopes (`core-site-protection.test.ts`, `mount.test.ts`).

  The only executable import of the scanner is in the changed test.
- **Build (Doc 176).** The entry is `server/index.ts` plus the Vite client root, with no glob and no `scripts/` read.
  **Accepted** as unchanged-runtime-input evidence. It is not a new `e33` build or proof of the served version.
- **Generic typecheck (Doc 177).** `tsconfig` includes `client/src`, `e2e`, `shared`, `server` and one preview script,
  and excludes `**/*.test.ts`. No included file imports either path. **Accepted** for the unchanged generic scope.
- **Focused 220 (Doc 177).** None of the 16 files is or imports either path. Their file reads target
  `server/index.ts`, client sections, the sitemap, `index.html` and the SQL candidate, none of which changed. The
  Vitest config has no setup files and is unchanged. **Accepted** for that named scope only.
- **Mandatory new runs.** The release-control compiler and the current-66 regression must still run fresh. The
  `aa521d7` credit does not transfer.

## 6. Limits

- **Not yet measured.** The pins are expected values. The actual destination bytes, the donor inventory, and the
  copy's file count and size are not measured.
- **Results.** Regression 309 stays FAILED. The 66 tests are NOT_RUN, and 445/454 is unmeasured.
- **Phase A.** The 40-path return is still pending.
- **Holds.** The browser resource requirement, the Doc 247 DB, the security exposure, staff reads, the final manifest,
  the full suite, static checks, the diff and live verification all remain OPEN. NOT LIVE.

**Actionable disposition:** Root may issue a concrete preparation grant once it adds conditions 1–3. After the actual
copy and the required post-copy measurements, a separate preparation-sufficiency review follows. Then, for each of
check and regression separately: a fresh READY, a slot, a ticket, a fresh G0 and an external postcheck, all within
12:30Z.

Not execution, admission, preparation, write, push, deployment or production consent; not human approval; not test
credit.
