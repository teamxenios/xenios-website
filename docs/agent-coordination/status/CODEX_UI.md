# CODEX_UI Status

**Updated:** 2026-07-18T14:53:00-05:00
**Mode:** local
**Branch:** `codex/research-ui-content`
**Published audit commit:** `e2d493a`
**Base branch:** `feat/research-membership-premium-rebuild`
**Base SHA:** `f9c44807fa3aa70021f27654a31c8dd8aa32a725`
**State:** active, UI-002

## Claimed work

`UI-002`: private acquisition, referral, monetization, and trust surfaces, including the scoped responsive-foundation repair.

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

## New user direction received

- Treat Research as a private member acquisition, activation, monetization, retention, referral, and trust system.
- Build the requested public-facing presentation inside the existing private gate.
- Use Give $10, Get $15 after qualified activation, not application submission.
- Build an original Xenios Member Passport and invitation experience inspired by the supplied pattern without copying Superpower.
- Keep referral codes, identity, attribution, credits, fraud, billing, admin, analytics, and privacy enforcement in Claude's infrastructure scope.

## Routes touched

UI-002 routes are listed in `docs/agent-coordination/claims/active/UI-002--CODEX_UI.md`; implementation has not yet been committed.

## Shared files touched

The UI-002 claim includes the Research route registry, layout, components and styles, application success presentation, and the scoped Tailwind entry/missing primitive repair in `client/src/index.css`.

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

- Review proposed pricing labels and UI previews after implementation.
- Confirm whether the V2 specification should be committed verbatim or summarized into a maintained repository source of truth.
- Approve final referral terms, credit expiration, milestones, and launch timing before public release.

## Integration notes

- PR #9 remains open, unmerged, mergeable, and unchanged at `f9c44807` as of this update.
- PR #10 remains a draft and targets `feat/research-membership-premium-rebuild`.
- Membership backend, authentication, payments, onboarding, private member data, and the Whole-Life Blueprint remain Claude-owned.
- Samuel's new direction authorizes UI-002. Research remains private and noindexed; backend and regulated publication boundaries are unchanged.
