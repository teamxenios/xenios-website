# CLAUDE_ACCOUNT_EMAIL_SYSTEMS status

- Timestamp: 2026-07-19
- Role: account, authentication, email, membership-state, access-control,
  notification, and operational reliability for xenios research.
- Branch: claude/research-account-email-systems (worktree
  xenios-research-account-email-systems), based on origin/main 8b94410
  (the PR #22 merge). PR targets main directly; NOT stacked.
- Claim: ACCOUNT-EMAIL-SYSTEMS-001 (claims/active/).

## Ground truth at join (2026-07-19, audited against origin/main 8b94410)

- Tests on main: 75 passing across 7 files; build green; one pre-existing
  typecheck error (server/storage.ts:48 implicit-any tx) which blocked
  `npm run check` — fixed in this branch.
- PR #23 (research-fraud-integration @ f0c4559, CLAUDE_PRIMARY) is OPEN and
  carries the gateway architecture: minimal /research gateway, requireMember
  on catalog/orders, member-JWT bypass of the shared password. This branch
  deliberately does NOT duplicate any of it and avoids its conflict surface
  (no file named member-auth.ts; no edits to the wall middleware or the
  catalog/orders handlers in server/research/index.ts).

## Defects found by the join audit and FIXED in this branch

1. Admin alerts never reached the configured admins:
   sendInternalApplicationAlert hardcoded team@xeniostechnology.com and
   ignored the outbox job's recipient; N configured admins produced N
   duplicate emails to team@. Now delivers to job.recipient (default
   samuel@xeniostechnology.com).
2. Resend SDK failures were recorded as sent: the SDK reports API rejections
   via the error field WITHOUT throwing; send() now inspects it, and
   provider_message_id is captured on success.
3. Account claim could permanently brick an email address: createUser then
   member-insert with no rollback. Now: compensating deleteUser on insert
   failure, self-healing retry when the auth user exists without a member row
   (password reset via the proven claim token + member-row completion), and
   concurrent-duplicate tolerance.
4. Tokens were single-purpose-less: one 90-day token served status, resubmit,
   AND account claim. Now v2 purpose-scoped tokens (status 90d /
   account_claim 14d) with domain-separated MACs (also separated from the
   gate-cookie MAC, closing the shared-key protocol-confusion hazard).
   Legacy tokens are honored until they expire (no minting after this).
5. No member password reset existed. Now: POST
   /api/research/member/forgot-password (generic response, rate-limited,
   silent per-email cooldown) + /research/reset-password page.
6. Resubmissions were silent: no applicant confirmation, no admin alert.
   Both now enqueue (applicant_resubmitted + admin_resubmitted).
7. Outbox black holes: rows stranded in `processing` after a crash were
   unrecoverable, and failed_permanent rows could never be resent. Now:
   stale-processing reclaim (15 min), admin list endpoint
   (GET /api/admin/research/outbox, metadata only, no payloads), per-message
   requeue (POST /api/admin/research/outbox/:id/retry, audited via an
   attempts row), permanent failures alert the admins through the outbox
   (loop-guarded), and a test-email endpoint restricted to configured admin
   addresses (POST /api/admin/research/test-email).
8. Member resolution was email-keyed. requireMember now resolves
   auth_user_id first (email fallback), and claim-time approval expiry is
   enforced.
9. No active-member guard existed anywhere. New server/research/guards.ts:
   requireActiveMember (pending_activation -> activation_required; past_due ->
   billing recovery; paused/cancelled/closed -> denied; billing_state
   consulted when RESEARCH_MEMBERSHIP_BILLING_ENABLED=true) + the first
   member-scoped catalog endpoint GET /api/research/member/catalog.
10. Membership/billing model: shared MEMBER_STATUSES and
    MEMBER_BILLING_STATES types + drafted migration
    supabase/research-member-billing.sql (PENDING, NOT run; code tolerates
    absence). Canonical sender: RESEARCH_EMAIL_FROM /
    RESEARCH_EMAIL_REPLY_TO env (default research@xeniostechnology.com only
    when no FROM_EMAIL is configured); REPLY_TO_EMAIL now actually honored.

## Tests

101 passing across 7 files (was 75). New coverage: purpose-scoped claim
(status token cannot claim; legacy window; expired approval), orphan cleanup +
stranded-claim healing + concurrent duplicate, forgot-password (enumeration
safety, cooldown), requireActiveMember matrix (401/403/200, billing_state),
auth_user_id resolution, outbox stale reclaim, permanent-failure admin alert
(with loop guard), provider-id capture, per-recipient admin alerts, token
purpose minting, admin outbox list/requeue/test-email.

## Flags: unchanged

RESEARCH_PUBLIC, RESEARCH_INDEXABLE, RESEARCH_REFERRALS_ENABLED,
RESEARCH_MEMBERSHIP_BILLING_ENABLED all remain false. No production flag was
touched. No SQL was run.

## Adversarial review round (2026-07-19, pre-PR)

A 4-lens multi-agent review (correctness / security / PR #23 compatibility /
test fidelity) produced 25 findings; 16 survived adversarial verification and
were fixed or documented before the PR: billing_state is now written on
activation and active-claim (schema-tolerant, so pre-migration deploys stay
safe), legacy queued approval rows mint claim-capable tokens (template-keyed
fallback), resubmission and failure-alert event keys are time-bucketed,
the requeue endpoint refuses fresh processing rows (duplicate-send race),
claim-token TTL tracks RESEARCH_APPROVAL_EXPIRY_DAYS (NaN-guarded),
forgot-password sends fire-and-forget (timing enumeration), activation retry
is idempotent after a partial failure. Deploy notes surfaced by the review:

- The gate-cookie MAC domain label INVALIDATES all live xr_access sessions at
  deploy: reviewers re-enter the shared password once. Intended.
- Pre-#23, the emailed password-recovery link lands behind the shared-password
  page for a visitor without a live xr_access cookie (identical to the
  existing sign-in flow's constraint). PR #23's bearer-bypass architecture is
  the resolution; noted for the rebase.

## Known gaps left open (deliberately out of this PR)

- No approval-expiry sweep (expiry IS now enforced at claim time).
- Billing/Stripe (Phase 5), referral promoteHeldRewards scheduler, member
  sign-out UI beyond the #23 member chrome, DB-backed admin roles + MFA
  (requireSupabaseAdmin single-email model untouched — do not weaken it
  before the role system exists), Supabase auth email templates/SMTP and
  redirect allowlist (Samuel's checklist).
- After PR #23 merges: rebase, port the requireMember auth_user_id change to
  member-auth.ts (delete/modify conflict expected in members.ts, small),
  reconcile section.tsx/SignIn.tsx route additions, and point the catalog
  route at requireActiveMember.

## Needs from Samuel (production actions; see the PR description checklist)

1. Merge order: PR #23 first, then this PR (rebased).
2. Run supabase/research-member-billing.sql (before any billing enablement).
3. Resend: verify xeniostechnology.com domain (SPF/DKIM), set
   RESEARCH_EMAIL_FROM + RESEARCH_EMAIL_REPLY_TO on Render.
4. Supabase Auth: allowlist https://xeniostechnology.com/research/reset-password
   as a redirect URL; review auth email templates.
5. After deploy: POST /api/admin/research/test-email to prove delivery, then
   the controlled end-to-end applicant test.
