# Release blockers

Status 2026-07-20. None merged to main. Each blocker names the owner and the
exact repair. Do not mark a PR ready while its blockers are open.

## PR #32 (frontend, research-full-frontend-blitz @ 2e5e399)

- B32.1 HIGH (Website): No React error boundary in client/src. A failed lazy
  chunk white-screens the entire app. REPAIR: add an error boundary at the app
  root (client/src/main.tsx) or wrapping ResearchRoutes + AdminResearchRoutes,
  rendering a recoverable fallback (retry the dynamic import). Add a test that a
  throwing lazy child renders the fallback, not a blank tree.
- B32.2 LOW (Website): client/src/research/pages/member/ReferralsUpgrade
  InvitationCard hardcodes a purple gradient + ~8 hex/rgba literals. REPAIR:
  replace with the .research-app design tokens used elsewhere.
- B32.3 MERGE-HYGIENE (Website + coordinator): base 87150f4 is pre-#27.
  REPAIR: `git fetch && git rebase origin/main` (or merge main) so the diff is
  honest and PR #27's 14 coordination docs are preserved; re-run test/check/
  build after. Do NOT land via squash-replace against stale main.

Otherwise PR #32 is substantively complete and safe (8/8 security/route
criteria pass; 189 tests; check + build green; screenshots confirm gate
protection + recovery isolation, no overflow).

## PR #31 (commerce, research-commerce-distribution-blitz)

- B31.1 BLOCKER (Website 3): runtime not wired. The domain model + 349 tests
  exist but no route registers the commerce/distribution entrypoints; touches
  neither server/routes.ts nor server/research/index.ts. NOT READY until the
  endpoints are registered behind default-false flags with requireActiveMember/
  requireSupabaseAdmin and a route-smoke/integration test. Do not mark ready.
- B31.2 PROCESS (Website 3): the branch is being force-pushed/rewritten during
  review (head moved off 9ff7896). REPAIR: declare a stable milestone head for
  review; the coordinator re-reviews that exact SHA.

## PR #30 / #29 (paperwork / content) — review queued

Not yet independently reviewed this pass. Gate: no legal claim asserted as
final (drafts + counsel placeholders); no unconfirmed supplier fact member-
displayable; content provenance present. Review before integrate.

## Global gates (all lanes)

All production flags false through code merge · no SQL run by any agent ·
no secrets in code/PRs/logs · capability-disabled states honest (no fabricated
success) · PR #32 stale-base rebase applies to any lane branched pre-#27.

## Samuel actions

- None required to keep building (everything proceeds behind disabled
  providers). When ready to land: direct Website to fix B32.1–B32.3 and rebase;
  direct Website 3 to wire B31.1 and declare a stable head; then the
  coordinator integrates in INTEGRATION_PLAN order and opens the release
  candidate. Merges are Samuel's (authors do not merge their own PRs).
