# XENIOS RESEARCH — EMERGENCY RECOVERY PROMPT

The previous account stopped unexpectedly or exhausted usage before producing a clean handoff.

Recover it safely.

1. Locate the correct `teamxenios/xenios-website` repository.
2. Read `AGENTS.md`, `CLAUDE.md`, `.xenios/MASTER_CORPUS.md`.
3. Run Git fetch, worktree list, status, log, and `xenios-os validate/status/stale/next`.
4. Find sessions with stale heartbeats and their exact worktrees.
5. Check for live OS writers before takeover.
6. Back up every dirty file outside the repo.
7. Record branch, HEAD, diff, untracked files, and last write times.
8. Run typecheck/focused tests only after preserving work.
9. If coherent, commit and push recovered work.
10. If incomplete, preserve it on a recovery branch and write an exact defect list.
11. Mark the old session stale; do not delete it.
12. Transfer only the needed lease.
13. Register this account.
14. Continue the highest-priority unblocked task.
15. Before this account ends, run the normal pre-switch checkpoint.

Never reset, clean, or overwrite a stale worktree before backing it up.
Never rely on the prior chat.
