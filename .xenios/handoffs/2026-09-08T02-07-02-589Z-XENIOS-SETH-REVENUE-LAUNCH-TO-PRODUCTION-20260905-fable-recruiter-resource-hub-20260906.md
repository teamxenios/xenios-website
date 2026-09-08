# Temporary local integration handoff — Xenios Health RC, 2026-09-08

Claude/Fable held hands-on local integration during the Codex outage under
Samuel's direct instruction. **Codex A: read this before resuming edits, then
take ownership back explicitly. Nothing here touched your tree; my work is on
`claude/xenios-health-rc-20260908`, which sits on top of your `bf7b5fe`.**

## Where things are

- Candidate head `45f95dfe51ef0aa226b39413c1fbd02fc121ece8` = your `bf7b5fe`
  plus `docs/revenue-launch/20260908/` records only. Runtime tree identical.
- Records commit above it on the same branch (this handoff's SHA).
- Full closeout with every measured result and hash:
  `docs/revenue-launch/20260908/XENIOS_HEALTH_RC_CLOSEOUT.md`.
- Manifest generator + inputs + reviewer packet beside it. The manifest is
  NOT committed: it verified in a dry run ("Release manifest accepted") with a
  draft reviewer identity that I deleted; a real reviewer must accept the 167
  unowned paths first.

## Two things you need to know that you did not see

1. Your `bf7b5fe` whitespace cleanup removed a trailing blank line from
   `scripts/revenue-launch/new-account-browser-qualification.mjs`, one of the
   20 files B's synthetic-credential registry pins by LF hash. The loader now
   refuses the registry (102 unresolved) at `bf7b5fe` and later, while it binds
   at `46782cd` (0 unresolved). That same file is a `git diff --check`
   complaint at `46782cd`, so no existing commit passes both gates. A pending
   re-bind at the `bf7b5fe` bytes is in `docs/revenue-launch/20260908/` with
   status `PENDING_REACCEPTANCE`; B's originals are untouched. Someone other
   than me must accept it.
2. The approved-name PII corpus (6,463 bytes, `c7da9838…`) is not on this
   machine; your own recovery receipts already said so. No path or filename is
   recorded anywhere. Founder action.

## Results you can reuse (all pinned Node 20.19.0)

Full suite at `46782cd`: 917 files / 15,997 tests / 0 failures / 314 s.
`tsc`, `check:release-control-plane`, `build`, `git diff --check` green at the
freeze. Rehearsal 154/154. Routes 433/424. pgcrypto guard clean. Migration DAG
36 nodes. B's browser proof bound by hash. Ownership: 167 unowned, 0 conflicts.

## Ownership back to you

I claimed no path of yours. Delete or keep my branch as you see fit; the
records are self-describing. Samuel decides the reviewer for the two pending
acceptances and supplies the corpus. I remain available as an optional helper.
