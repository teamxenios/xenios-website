# Synthetic credential fixture review: re-bind request — 2026-09-08

**SUPERSEDED, 2026-09-08T03:2xZ.** ASTRA-B accepted the re-bind on A's branch
at `c350ab1c1a12d8f9ed7e8e380d4f2ef9eda22662`, in place under
`docs/revenue-launch/20260907/` (registry `reviewedSourceSha` `bf7b5fe`,
status `ACCEPTED`, registry digest
`b82169d4afa2bc1d2007680c0d984db9b6e0f0bdf4d8ca2b25c30cb937922aba`;
`SYNTHETIC_CREDENTIAL_REBIND_ACCEPTANCE.md` and
`scanner-rebind-test-receipt.json`, 35 controls passed). Claude verified:
`scan-release-diff.mjs ff3c496..c350ab1c` with that registry → 102 reviewed,
0 unresolved. **The pending pair in this `20260908/` directory is not the
accepted record and must not be pointed at by the scanner.** It stays here
only as the proposal history.

**Original status when written: PENDING. Nothing in this directory is an
accepted review.** B's accepted review at `docs/revenue-launch/20260907/` is
preserved unchanged.

## What broke, exactly

B's review pinned 20 fixture files by LF SHA-256 at reviewed source
`8e125ca7cbd300a7e96e4dbca8f5eca654558bfe`. The loader refuses the whole
registry if any pinned file's bytes differ at the candidate.

Commit `bf7b5fee78102289bcc6c68e9e336bb0ea0c9d5e` ("clear exact-range whitespace
defects") removed one trailing blank line from
`scripts/revenue-launch/new-account-browser-qualification.mjs`, which is one of
the 20 pinned files. Measured consequence at `bf7b5fe`:

| Range | `git diff --check` | Secret scan with registry |
| --- | --- | --- |
| `ff3c496..46782cd` | **FAIL** (8 complaints, including `new blank line at EOF` on that same file) | **PASS** — 102 raw, 102 reviewed, 0 unresolved |
| `ff3c496..bf7b5fe` | **PASS** | **REFUSED** — "reviewed file content has drifted"; 102 unresolved |

No existing commit satisfies both gates, because the file's reviewed bytes
are themselves the diff-check complaint.

## What the re-bind changes, and what it does not

Added-line comparison of that file between `8e125ca7` and `bf7b5fe`: 30 lines
versus 29; the only line present at `8e125ca7` and absent at `bf7b5fe` is the
empty string. Every `addedLineSha256` the registry lists for that file is still
present at `bf7b5fe`. The other 19 files are byte-identical.

`REVIEWED_SYNTHETIC_CREDENTIALS.json` here is B's registry with:

- `reviewedSourceSha` moved to `bf7b5fee78102289bcc6c68e9e336bb0ea0c9d5e`;
- the one file's `lfSha256` recomputed (`fa3f47de…` → `4a11081b…`);
- `contextReview.path` pointing at the copy in this directory;
- `independentReviewStatus` set to `PENDING_REACCEPTANCE`, which the loader
  refuses by design.

`synthetic-credential-context-review.json` here is B's context review with
`candidateSha` moved to `bf7b5fe`, the same 102 findings and dispositions, a
placeholder `reviewedAt`, and one added limitation stating the above.

## What is being asked

A reviewer who is not the author of this re-bind confirms that a removed
trailing blank line does not change any disposition, then:

1. sets `independentReviewStatus` to `ACCEPTED`;
2. sets `reviewedAt` in the context review to the acceptance time;
3. records their identity and time in this file under "Acceptance".

Only then may `XENIOS_RELEASE_REVIEWED_FIXTURES_FILE` point here for the
strict scan. Claude prepared this and must not accept it.

## Acceptance

_(none yet)_
