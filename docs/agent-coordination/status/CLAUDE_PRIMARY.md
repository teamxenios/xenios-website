# CLAUDE_PRIMARY status

- Timestamp: 2026-07-18T22:15-05:00
- Mode: building (V3 section 83 Then list + Samuel direct requests)
- Branch: research-fraud-integration (TARGETS MAIN; supersedes the stack)
- STRANDED-MERGE RECOVERY (second occurrence of the PR #15 failure): PRs #18,
  #19, #20 show MERGED but merged into their stacked bases AFTER main had
  captured those bases via #16/#17, so their content never reached main
  (proven: security-types.ts, the activate endpoint, the front door, fraud.ts
  all absent from origin/main; both #21 commits not ancestors of main). This
  branch is origin/main + a clean merge of the whole remaining stack. RULE
  GOING FORWARD: no more stacked PRs on this repo; every PR targets main.
- Schema verified (2026-07-18): Samuel ran the combined SQL; a code-to-schema
  cross-check found zero mismatches across all 14 research tables.
  supabase/verify-research-schema.sql is the one-paste DB-side check.
- PR #21: the V3 section 71 fraud controls (review queue with 10 reasons and
  7 actions, canonical self-referral + disposable bright lines, monthly cap
  to pending-review, velocity/household flags, clawback with append-only
  reversal ledger entries, referral_events audit, durable rate limiting,
  activation requires a payment reference). New SQL:
  supabase/research-referral-fraud.sql. This was the stated blocker for
  RESEARCH_REFERRALS_ENABLED; flags still stay false until Samuel flips them.
- Completed: section 83 Immediate (all), admin queue UI (PR #11), referral
  foundation (PR #12), env diagnostic (PR #14), member auth recovery (PR #16),
  email incident fix + durable outbox (PR #17), security/identity governance +
  flags + consent schema (PR #18), referral loop closed end to end (PR #19),
  research front door + Sign in nav (PR #20, this branch).
- Front door decision (Samuel, 2026-07-18): when RESEARCH_PUBLIC=true, GET /
  302s to /research, making research the main page of xeniostechnology.com.
  While the review password gate is on, root stays the professional homepage
  so the public site never hides behind a password. Supersedes the V3 default
  of a professional homepage at root, for the public-launch state only.
- Admin: samuel@xeniostechnology.com is the primary admin (already the default
  in adminRecipients() and ADMIN_EMAIL on Render). His password was shared in
  chat; it was NOT used and rotation was recommended.
- Live: /research gate UP (200). The real applicant's row is in Supabase and
  visible in the admin queue; only the notification email was lost (root cause
  fixed in #17; recover via resend-link after deploy).
- Tests: 53 passing (membership 16, referrals 13, members 8, outbox 6,
  email-config 5, front door 5).
- Contracts: ReferralDashboardState gained optional `eligible`; UI-002
  contract otherwise unchanged. See handoffs/to-codex.
- Needs from CODEX_UI: rebase #13 after the chain merges (doc conflicts +
  section.tsx/layout.tsx route unions; LOCAL_NAV now includes Sign in).
- Migration ledger: supabase/MIGRATIONS.md (all 8 files RUN as of 2026-07-18;
  research-referral-fraud.sql run by Samuel, three new tables confirmed).
  DB-side checks: verify-research-schema.sql + verify-referral-fraud.sql.
- Needs from Samuel: merge ONLY the integration PR (base main), then Codex
  rebases #13 onto main; run verify-referral-fraud.sql once for the
  index/column/function confirmation; rotate the admin password.
  RESEARCH_PUBLIC and RESEARCH_REFERRALS_ENABLED both stay false per Samuel's
  direction (2026-07-18) until he flips them.
