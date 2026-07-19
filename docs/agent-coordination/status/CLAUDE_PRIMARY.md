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
- Fraud controls (was PR #21, folded into the integration PR): the V3 section
  71 set (review queue with 10 reasons and 7 actions, canonical self-referral
  + disposable bright lines, monthly cap to pending-review, velocity/household
  flags, clawback with append-only reversal ledger entries, referral_events
  audit, durable rate limiting, activation requires verified references).
  New SQL: supabase/research-referral-fraud.sql (run). This was the stated
  blocker for RESEARCH_REFERRALS_ENABLED, which still stays false.
- Completed: section 83 Immediate (all), admin queue UI (PR #11), referral
  foundation (PR #12), env diagnostic (PR #14), member auth recovery (PR #16),
  email incident fix + durable outbox (PR #17), security/identity governance +
  flags + consent schema (PR #18), referral loop closed end to end (PR #19),
  Sign in nav (PR #20; its root-redirect was reversed by canon), fraud
  controls + billing gate (this branch).
- Canonical decisions (Samuel, 2026-07-18, final): research remains PRIVATE;
  RESEARCH_PUBLIC=false and RESEARCH_INDEXABLE=false; the xenios homepage
  stays at the root domain (the root-redirect that briefly existed in #20 is
  REMOVED and a regression test asserts the root never redirects); the shared
  research password opens the private research introduction. Membership is a
  $50 one-time activation PLUS a $25 recurring monthly membership, no annual;
  no active-member state until BOTH payments are verified, enforced by
  RESEARCH_MEMBERSHIP_BILLING_ENABLED (default false).
- Admin: samuel@xeniostechnology.com is the primary admin (already the default
  in adminRecipients() and ADMIN_EMAIL on Render). His password was shared in
  chat; it was NOT used and rotation was recommended.
- Live: /research gate UP (200). The real applicant's row is in Supabase and
  visible in the admin queue; only the notification email was lost (root cause
  fixed in #17; recover via resend-link after deploy).
- Gateway architecture (canonical, 2026-07-18): /research is a minimal
  one-viewport private gateway (Apply for Membership + Member Login only);
  all content lives behind member authentication at /research/member and the
  canonical member routes; the catalog and orders APIs now require the member
  JWT (the shared password never unlocks products); an authenticated member
  bypasses the shared password on exactly the member-authed endpoints. See
  handoffs/to-codex/20260718-gateway-architecture.md.
- Tests: 81 passing across 8 files (membership incl. billing-gated activation,
  referrals incl. fraud controls, members, outbox, email-config, rate
  limiting/fraud utils, the root-domain invariant, and the access
  architecture).
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
  RESEARCH_PUBLIC, RESEARCH_INDEXABLE, RESEARCH_REFERRALS_ENABLED, and
  RESEARCH_MEMBERSHIP_BILLING_ENABLED all remain false; research stays private.
