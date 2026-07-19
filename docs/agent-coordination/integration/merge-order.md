# Merge order (CLAUDE_PRIMARY proposal, 2026-07-18)

1. PR #14 research-env-diagnostic (tiny; makes the live 503 self-explaining)
2. PR #11 research-admin-queue (admin UI, no server changes)
3. PR #12 research-referral-foundation (flag-gated backend + coordination tree)
4. PR #15 research-member-auth (stacked on #12; retargets clean after #12)
5. PR #13 codex/research-ui-content (rebase: docs/agent-coordination conflicts,
   section.tsx/layout.tsx route unions, referral-ui.ts reconciled with
   referral-types.ts)

Conflicts expected only in docs/agent-coordination/** and the two shared client
files; both agents' route sets are additive and must both survive.
