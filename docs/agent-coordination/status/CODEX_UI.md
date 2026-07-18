# CODEX_UI Status

**Updated:** 2026-07-18T14:53:00-05:00
**Mode:** local
**Branch:** `codex/research-ui-content`
**Published audit commit:** `e2d493a`
**Base branch:** `feat/research-membership-premium-rebuild`
**Base SHA:** `f9c44807fa3aa70021f27654a31c8dd8aa32a725`
**State:** ready for Stage 1 review

## Claimed work

No active implementation claim. `UI-001` is complete.

## Completed

- Proved direct local access to the real Xenios checkout and Claude's physical worktree.
- Verified repository, remote, source branch, isolated Codex worktree, and exact commits.
- Created and pushed the versioned coordination and research-input packet.
- Opened draft PR #10 against PR #9's branch.
- Read the collaboration prompt, complete V2 membership specification, PR #9 patch, and repository memory files.
- Installed dependencies with the pinned Node 20.19.0 and npm 10.8.2 toolchain.
- Ran typecheck, tests, production build, local server, keyboard interaction, narrow-width, zoom approximation, console, network, and overflow checks.
- Audited all six required main-site routes at 390 x 844, 768 x 1024, and 1440 x 900.
- Versioned 18 full-page PNGs, computed metrics, the completed design-system audit, shared-component inventory, and known issues.
- Audited the priority Research routes at 390 px without changing their UI or backend.

## Material findings

- Responsive Tailwind variants do not apply in the rendered client. Primary navigation remains hidden and responsive grids remain stacked at 1440 px.
- `.rule-all` and `.btn-ghost-on-dark` are used but undefined.
- The main header overflows at 320 px; the current Research shell overflows by approximately 17 px at 390 px.
- Research duplicates the main header and footer instead of extending `PageShell`.
- Public Research peptide content conflicts with the repository's stealth public-copy guidance.
- The canonical V2 specification remains outside the repository.

## Routes touched

None. Route inspection was read-only.

## Shared files touched

Documentation under `docs/` only. No application source or shared component changed.

## Tests completed

- `npm run check`: failed only on pre-existing `server/storage.ts(48,40): TS7006`.
- `npm test`: passed, 12 of 12.
- `npm run build`: passed; Vite reported a 715.09 kB main chunk warning.
- Lint: no script exists.
- Browser: no application console errors; local waitlist count request returned 500 without Supabase and used fallback 556.

## Screenshots completed

Eighteen captures under `docs/research-design/baseline/main-site/`, plus `metrics.json`.

## Needs from Claude

- Update `CLAUDE_PRIMARY.md` with current work, files, routes, contracts, and blockers.
- Review `docs/research-design/MAIN_SITE_UI_AUDIT.md` and acknowledge the shared responsive-CSS findings.
- Confirm whether Claude or Codex should claim the responsive foundation before either agent edits `index.css`, `Navbar.tsx`, `Footer.tsx`, or shared routing.
- Review the proposed public Research versus stealth-copy decision.
- Push any local change Codex must review.

## Needs from Samuel

- Decide how public peptide and GLP-1 routes coexist with the existing stealth public-copy rule.
- Confirm whether the V2 specification should be committed verbatim or summarized into a maintained repository source of truth.
- Provide approved visual references, exact copy, asset ideas, mobile preferences, and animation preferences when ready.

## Integration notes

- PR #9 remains open, unmerged, mergeable, and unchanged at `f9c44807` as of this update.
- PR #10 remains a draft and targets `feat/research-membership-premium-rebuild`.
- Membership backend, authentication, payments, onboarding, private member data, and the Whole-Life Blueprint remain Claude-owned.
- No substantive Research redesign begins until the Stage 1 audit is reviewed and the shared blockers have owners.
