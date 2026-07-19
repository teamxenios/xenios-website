# Claim: ACCOUNT-EMAIL-SYSTEMS-001 (CLAUDE_ACCOUNT_EMAIL_SYSTEMS)

- Opened: 2026-07-19
- Branch: claude/research-account-email-systems (base origin/main 8b94410,
  targets main directly, not stacked)
- Scope: account claim reliability, purpose-scoped tokens, member password
  reset, auth_user_id member resolution, active-member guard, admin-alert
  delivery fix, resubmission notifications, outbox reliability
  (stale reclaim, requeue, failure alerts, provider ids, test email),
  member status/billing state model.

## Files owned by this claim

- server/research/guards.ts (new)
- server/research/membership-emails.ts
- server/research/outbox.ts
- supabase/research-member-billing.sql (new, PENDING migration)
- client/src/research/pages/ResetPassword.tsx (new)
- docs/agent-coordination/status/CLAUDE_ACCOUNT_EMAIL_SYSTEMS.md

## Files touched (shared; expect rebase after PR #23)

- server/research/members.ts (claim handler + requireMember auth_user_id
  lookup + forgot-password route; #23 extracts requireMember to
  member-auth.ts — the auth_user_id change gets ported there on rebase)
- server/research/membership.ts (token v2 layer + notification enqueues)
- server/research/index.ts (gate-cookie MAC domain label ONLY; the wall
  middleware and catalog/orders handlers are untouched — #23's surface)
- server/index.ts (registerMemberAccessApi)
- server/services/email.ts (getResendClient exposes replyToEmail)
- shared/research/membership-types.ts (MEMBER_STATUSES, MEMBER_BILLING_STATES)
- client/src/research/section.tsx (+1 route), pages/SignIn.tsx (+forgot link)
- server/storage.ts (one-line tx type; unblocks `npm run check` on main)
- supabase/MIGRATIONS.md (+row 9, PENDING)

## Contracts changed

- shared/research/membership-types.ts: ADDITIVE only (new exported consts +
  types; nothing existing changed).
- New endpoints: POST /api/research/member/forgot-password,
  GET /api/research/member/catalog, GET /api/admin/research/outbox,
  POST /api/admin/research/outbox/:id/retry,
  POST /api/admin/research/test-email.
- Token format: v2 purpose-scoped (`v2.<purpose>.<id>.<exp>.<sig>`); legacy
  3-part tokens verify until natural expiry; claim requires purpose
  account_claim (or legacy). Status endpoint accepts both purposes.

## Do-not-touch respected

- No file named server/research/member-auth.ts (add/add conflict with #23).
- No edits to the /api/research wall middleware or catalog/orders handlers.
- No flag changes; no SQL run; no production secrets.

## Next action

Draft PR into main; rebase after #23 merges; port requireMember change to
member-auth.ts; then Codex applies the UI handoff.
