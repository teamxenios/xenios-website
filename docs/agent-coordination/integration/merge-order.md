# Merge Order

**Updated:** 2026-07-18

1. PR #9 remains the current backend and membership-spine base.
2. CODEX_UI draft PR targets `feat/research-membership-premium-rebuild` while PR #9 is open.
3. When PR #9 merges, CODEX_UI fetches and rebases onto `origin/main` using `--force-with-lease` only if the already-pushed Codex branch requires it.
4. Shared-contract changes merge only after Claude review.
5. Public UI changes merge after responsive, accessibility, build, and integration checks.

Never merge a public UI branch that depends on uncommitted local files.
