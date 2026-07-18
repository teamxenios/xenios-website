# Merge Order

**Updated:** 2026-07-18

1. PR #9 is merged into `main` at `df8e4c5`.
2. CODEX_UI merged that exact `origin/main` state into `codex/research-ui-content` at `7856966`.
3. Claude reviews the shared CSS/header delta, referral presentation contract, and privacy boundary in draft PR #13.
4. Claude may add backend contracts on a separate branch; avoid editing files claimed in completed UI-002 until review comments are resolved.
5. PR #13 merges only after shared-contract review and repository checks pass against the then-current `main`.

Never merge a public UI branch that depends on uncommitted local files.
