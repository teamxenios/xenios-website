# e33 preparation sufficiency

**CONFIRMED: the actual preparation is sufficient under Doc 185, and all three conditions are met.**

- **First copy.** The first copy (340) stays FAILED.
- **What is sufficient.** The existing copy, verified by Root 341's separate metadata continuation, without recopying.
- **What this is not.** Not compiler or test credit, and not admission.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: committed Git
objects only. Nothing run; no agents. Docs 183–185 are not reopened.
- **Packet.** Root DOC343 (3,233 B, `327c2736…`).
- **Timing.** Reviewed at 2026-10-15T12:16–12:18Z.

Archive: `hl12/186_e33_preparation_sufficiency.json`.

## Evidence (Core `d63ef439`, tree `b21fabfd`)

- **Files.** `PREPARATION_R1_METADATA_CONTINUATION_ACTUAL.json` (1,255,568 B, `b3474ee8…`) and `…_COMMAND.json`
  (17,627 B, `b3bab358…`) match the packet.
- **First attempt: FAILED and preserved.** Copy 340 ran 11:58:34Z–11:59:19Z and exited 1 with `SOURCE_COUNT_REFUSAL`;
  its capture was truncated. Zero source blobs were verified, and ticket `b2c3e8e2` is consumed. The cause: the ZIP
  has 5,254 entries, which is 4,893 files plus 361 directory entries.
- **The continuation.** Root 341 granted a metadata-only continuation, "not an extension/reuse" of the copy ticket. It
  ran 12:04:32Z–12:05:38Z (66 s). All 13 native git commands exited 0 with full capture. There was no recopy, no test,
  no G0 and no browser.

## Checks, recomputed independently where possible

- **Source.** The 4,893 rows (path, blob, length) equal `git ls-tree -r -l e33c12a9` as a set. Their manifest
  recomputes to `5ffdec9b…`, totalling 196,099,837 B, and the LF ZIP files carry the same blobs.
- **New root state.** HEAD `e33c12a9` and tree `ab4415f0`, not shallow, with clean status.
- **Pins.** The 91 actual destination pins equal `fbe8e649…` exactly, in paths and hashes, totalling 102,235,961 B.
  The input pins are identical before and after.
- **Condition 1: reparse census.** The census enumerates every entry and records reparse points rather than skipping
  them. The donor before, the donor after and the destination all show 40,581 entries: 37,927 files, 2,654
  directories, 346,250,952 B and 0 reparse points. All three inventories have the same digest (`6a81994e…`).
- **Locks.** The package lock `d25eb6b8…` (673 packages, no links) and the hidden lock `af5d78e1…` (531) are identical
  in donor and destination.
- **Condition 2: shared Git administration.** The common directory is `C:/Users/sboad/Downloads/xenios-website/.git`.
  - Exactly one admin entry was added (`source7`) and none was removed.
  - Local `core.autocrlf`, `core.eol`, `core.safecrlf`, `core.attributesfile` and `filter.*` are all unset.
  - The effective `autocrlf=true` comes from the system configuration, which the runner excludes.
  - The tracked `.gitattributes` (`* -text`) is unchanged, and the info attributes file is absent.
  - Owned `source7` removal is PENDING.
- **Condition 3: caches.** All 16 carried items are listed: `.vite` (including a Vitest `results.json`), `.vite-temp`,
  and 10 package `tsbuildinfo` and `.eslintcache` files. They affect ordering only.

## Limits

- **Dependency contents.** Beyond the 28 pinned `node_modules` files, dependency files are verified by name, type and
  length, as Doc 185 asked, not by content hash. They are a donor reuse, not a fresh install.
- **Cleanup.** Owned worktree removal is still owed.
- **Results.** Regression 309 stays FAILED, and the 66 tests are NOT_RUN.
- **Window.** It closes at 12:30Z. The compiler's latest G0 is 12:24Z and the regression's is 12:26Z, run one after the
  other. Anything that does not fit lapses, with no extension.
- **Before each group.** A fresh FINAL_READY, a one-use ticket, a G0 and a postcheck.
- **Holds.** The browser, security, Doc 247, the phase A return, the final manifest and live verification are
  unchanged. NOT LIVE.

Not execution, admission, write, push, deployment or production consent; not human approval; not test credit.
