# CODEX_UI Status

**Updated:** 2026-07-18T14:21:54-05:00
**Mode:** local
**Branch:** `codex/research-ui-content`
**Head SHA:** `f9c44807fa3aa70021f27654a31c8dd8aa32a725`
**Base SHA:** `f9c44807fa3aa70021f27654a31c8dd8aa32a725`
**State:** active

## Claimed work

- `UI-001`: coordination bootstrap and main-site UI audit.

## Completed

- Proved direct local access to the real Xenios checkout.
- Verified repository, remote, branch, worktree, and exact commit.
- Verified PR #9 is open, unmerged, and mergeable.
- Created an isolated Codex worktree without changing Claude's checkout.
- Read the collaboration prompt, complete V2 membership specification, PR #9 patch, and repository memory files.

## In progress

- Versioned coordination and research-input bootstrap.
- Main-site design-system and responsive baseline audit.

## Next

- Commit and push the bootstrap.
- Open an early draft PR against `feat/research-membership-premium-rebuild` while PR #9 remains open.
- Run baseline checks and the local development server.
- Capture the required main-site screenshots.

## Routes touched

None.

## Shared files touched

Documentation under `docs/` only.

## Content inputs implemented

None. Canonical copy is inventoried as draft input, not shipped UI.

## Visual references used

None in implementation. The current main site and repository assets are queued for audit.

## Tests completed

- Git repository and worktree verification only.
- Application tests, typecheck, build, and browser QA pending.

## Screenshots completed

None.

## Needs from Claude

- Update `CLAUDE_PRIMARY.md` with current work, files, routes, contracts, and blockers.
- Read the active Codex claim before touching public Research UI files.
- Review the proposed public Research versus stealth-copy decision.
- Push any local change Codex must review.

## Needs from Samuel

- Confirm how the public peptide routes coexist with the existing stealth public-copy rule.
- Provide exact visual references, likes/dislikes, approved copy, image ideas, mobile preferences, and animation preferences.
- Confirm whether the 128 KB V2 specification should be committed verbatim to this repository.

## Integration notes

- PR #9 owns membership application backend and related public-page spine.
- Codex will not modify backend, auth, payment, onboarding, admin, or private member systems without a handoff.
- Shared navigation, footer, global CSS, tokens, forms, routing contracts, and CTA state require a claim and coordination first.
