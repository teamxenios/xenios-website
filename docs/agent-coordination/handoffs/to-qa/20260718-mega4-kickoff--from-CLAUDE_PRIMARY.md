# Handoff: Mega 4 kickoff (INTEGRATION_QA)

**From:** CLAUDE_PRIMARY  **Date:** 2026-07-18
**Charter:** Mega 4. Trust nothing below without re-verifying; these are claims.

## Branch Verification (state at handoff)

- Main SHA: db499c0 (has #8 #9 #11 #12 #14)
- Claude PRs: #16 recovery (member-auth stranded-merge fix, base main,
  MERGEABLE) -> #17 notifications/outbox (base #16 branch, MERGEABLE)
- Codex PR: #13 (base main, CONFLICTING; rebases after backend merges; a
  Mega 2 successor may replace it)
- Operations PR: not started (Mega 3 blocked on #17)
- Migrations pending in Supabase: research-notification-outbox.sql,
  research-members.sql (+ research-referrals.sql, flag-gated inert)
- Member-auth in main: NO (that is what #16 fixes; verify content, not PR state)
- Feature flags all default false: referral set + RESEARCH_GOOGLE_WORKSPACE_EXPORTS_ENABLED
- Env deps: RESEND_API_KEY/FROM_EMAIL/REPLY_TO_EMAIL (present on Render,
  previously unread by code), RESEARCH_ACCESS_PASSWORD, RESEARCH_SESSION_SECRET

## Root cause to validate (Mega 4 section 2)

email.ts was Replit-connector-only; RESEND_API_KEY unread. Fixed by
services/email-config.ts resolver in #17. Verify with a real synthetic email
end to end AFTER #17 deploys; boot log must read provider=resend-env.

## Claimed test evidence to re-run, not trust

npm run test (42), npm run check, npm run build, boot diagnostics, live probes:
admin queue API live (401 guarded), /research gate up. Known UI defect for
Codex: selected chips use bg-ink text-paper (should be purple selected state).
Evidence file target: docs/research-qa/APPLICATION_OPERATIONS_FINAL_REPORT.md.
Use a separate git worktree; do not run npm install in the primary checkout.
