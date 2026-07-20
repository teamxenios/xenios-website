# CLAUDE_INTEGRATION_COORDINATOR status

- Timestamp: 2026-07-19
- Role: coordinate the parallel build sessions, prevent file overlap, and
  hold the release train. Docs-only; touches no product code.
- Branch: claude/integration-coordinator (worktree wt-integration-coordinator),
  base origin/main 468466f. Targets main directly; not stacked.

## Phase 0 result

PR #25 independently reviewed **READY** at head f48bda0 (two reviewer fleets;
router-normalization + server-authz + client-isolation + email axes all pass;
161 tests / 12 files; typecheck + build + boot smoke green). Handoff to Samuel:
review the exact head → mark ready → merge. The author does not merge.

PR #13 confirmed closed/superseded (old Research architecture).

## Deliverables in this PR (docs only)

- integration/RELEASE_BOARD.md — the release train: 19 lanes with owner,
  dependency, credential need, and "buildable-now-without-keys" status; the
  release gates; the external-dependency shopping list; and the
  "what PR #25 already provides" list so no lane rebuilds it.
- file-claims.md — one owner per file/area for the whole fleet, so no two
  sessions edit the same path. server/research/* and shared/research/* are
  locked to PR #25 until it merges.
- project-state.md — refreshed to the current gate.

## What is NOT done and why

- No downstream code was written: every code lane must branch from the
  post-#25 origin/main (shared rule 3); starting now would stack/diverge.
- PR #25 not merged (Samuel's gate + rule 17).
- No flags, no SQL, no secrets touched.

## Next action (Samuel)

Merge PR #25 → confirm Render deploy → configure Resend + Supabase recovery
redirect → run research-member-billing.sql → controlled account/email test →
then spin up the release train from RELEASE_BOARD.md, starting with lane 1
(Account/Identity/MFA/Security). Provide the credential shopping-list items as
each lane reaches its live-integration step; code proceeds behind default-false
flags until then.
