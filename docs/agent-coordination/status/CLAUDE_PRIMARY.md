# CLAUDE_PRIMARY status

## Standing order + live state (2026-07-19, latest)

- Samuel's standing order: keep building and fixing autonomously to the end;
  coordinate through this tree; anything needing external keys/APIs gets
  built behind flags/seams and finished without them.
- PRODUCTION INCIDENT (open until Samuel's env fix): Render's
  SUPABASE_SERVICE_ROLE_KEY holds an anon-grade key after the project's
  migration to Supabase's new API-key format. Every server write 500s with a
  hidden 42501 RLS violation (applications, waitlist, outbox emails) and
  RLS reads return EMPTY (the admin queue looks empty; no data is lost).
  Fix: put the sb_secret_ key in that Render var. PR #26 (open, base main)
  adds a boot-time SERVICE KEY CHECK log so this can never be silent again.
- PR #25 merge gate: at head f48bda0 the re-review-round fixes (path
  normalizer for wouter case/percent-encoding parity, tracking TOCTOU) are
  verified sound (161/161, clean, green, gate's own runs). STILL OUTSTANDING:
  disposition 3's three items (MFA-laundering compensation + its
  documentation + stale-test rename) — see handoffs/to-claude/
  20260719-account-email-queue.md and the PR comment. Gate expects READY
  once they land. Do not merge before.
- PR #27 (this branch): the approval-expiry sweep (standalone
  server/research/expiry.ts + hourly tick), closing the last open backend
  item in my lane. Deliberately email-silent; the notification template is
  queued for the account-email lane.
- Handoffs written: to-claude/20260719-account-email-queue.md,
  to-architecture-security/20260719-priorities.md (trust proxy now their
  top item; MFA design must account for the amr-laundering finding).

## Agent registry and merge order (2026-07-19)

- Sessions: CLAUDE_PRIMARY (this file; backend/referrals/fraud/admin),
  CLAUDE_ACCOUNT_EMAIL_SYSTEMS (joined 2026-07-19, isolated worktree, claim
  ACCOUNT-EMAIL-SYSTEMS-001, draft PR #25: tokens/claim/reset/outbox
  recovery/alerts/billing-state model), CODEX_UI (PR #13, rebases last),
  CLAUDE_ARCHITECTURE_SECURITY (announced, not yet joined).
- Verified conflict map: #25 vs #23 conflicts in exactly TWO files
  (client/src/research/section.tsx, server/research/members.ts); everything
  else auto-merges. #24 is conflict-free with both.
- MERGE ORDER: #23 -> #24 -> #25 (after its small rebase) -> #13 (rebased).
- Cross-lane findings from the #25 audit landed in my lane: promoteHeldRewards
  had NO caller (held rewards could never become credit) — FIXED on the #23
  branch (5-minute promotion tick in server/index.ts, flag-gated no-op while
  referrals are off). Approval-expiry sweep remains OPEN in my lane, queued
  after #23 merges. SQL pending (do not run until #25 review):
  supabase/research-member-billing.sql (#25's, drafted).

## FOR CLAUDE_ARCHITECTURE_SECURITY (read before branching)

The master guide (docs/research-canonical/COMPETITIVE_CODE_UI_MASTER_GUIDE_V1.md)
was assessed against main BEFORE PR #23. Already implemented on PR #23
(branch research-fraud-integration, base main, mergeable): the minimal
one-viewport gateway; catalog/orders behind member auth (the shared password
no longer unlocks products and no longer triggers a catalog fetch);
requireActiveMember (pending members 403 on catalog/orders); member bypass of
the shared password on exactly the member-authed endpoints; sign-in redirects
by member status; /research/activate; member-area routes behind RequireMember;
access-architecture tests. BRANCH ONLY AFTER PR #23 MERGES or you will
rebuild and collide with all of it. Still yours per the guide's P0: member
resolution by auth_user_id (currently email), atomic/compensating account
claim, purpose-scoped single-use tokens, admin roles + MFA, CSP report-only,
trust proxy + canonical IP helper, review-cookie path scoping, CSRF on
cookie-authed writes. Guards live in server/research/member-auth.ts. The
Tailwind utilities fix is PR #24 (merge in either order; proven conflict-free
with #23). CLAUDE_PRIMARY otherwise owns backend/admin; CODEX_UI owns the
visual member experience (see handoffs/to-codex/20260718-gateway-architecture.md).

- Timestamp: 2026-07-18T23:55-05:00
- Mode: building (V3 section 83 Then list + Samuel direct requests)
- Branch: research-fraud-integration (targets main)
- MERGED: PR #22 (2026-07-19T03:40Z) landed the stranded stack recovery, the
  fraud controls, and the canon correction pass in main. OPEN: PR #23 (same
  branch, base main, NOT stacked) carries the gateway architecture, which was
  pushed minutes after the #22 merge. Merge #23, then Codex rebases #13.
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
