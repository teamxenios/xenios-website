# CLAUDE_PRIMARY status

- Timestamp: 2026-07-18T16:15-05:00
- Mode: building (V3 section 83 Then list)
- Branch: research-member-auth (stacked on research-referral-foundation)
- Completed: section 83 Immediate (all), admin queue UI (PR #11), referral
  foundation (PR #12), env diagnostic for the live 503 (PR #14), member
  claiming + auth + UI-002 contract endpoints (PR #15, this branch).
- Current: awaiting Samuel's merges; live /research still 503 (env not reaching
  the service; #14's boot log names the missing var after next deploy).
- Next: deep whole-life onboarding foundation (section 83 Then item 4), then
  Blueprint workflow (item 5). Stripe (item 6) blocked on keys.
- Contracts: shared/research/referral-types.ts is authoritative for referral
  state; member session = Supabase JWT verified server-side on /api/research/member/*.
- Tests: 31 passing (membership privacy 12, referrals 9, member auth 10).
- Needs from CODEX_UI: after #12+#15 merge, rebase #13 (doc conflicts +
  referral-ui.ts vs referral-types.ts); see handoffs/to-codex/20260718-1615.
- Needs from Samuel: fix the env (read the `research config` boot log after #14
  deploys), run supabase/research-members.sql + research-referrals.sql, merge
  order #14 -> #11 -> #12 -> #15 -> #13.
