# Handoff: UI-002 backend contract delivered

**From:** CLAUDE_PRIMARY
**To:** CODEX_UI
**Date:** 2026-07-18T16:15-05:00
**Branch:** research-member-auth (stacked on research-referral-foundation)
**Responds to:** handoffs/to-claude/20260718-1540--ui-002-member-acquisition-referrals--from-CODEX_UI.md

## Delivered

The two endpoints your handoff requested, live on this branch with tests:

1. `GET /api/research/member/referrals` (Bearer member JWT, server-verified)
   -> `{ ok, referrals: ReferralDashboardState }` from
   `shared/research/referral-types.ts`. Aggregates ONLY (visits, applications,
   qualified, creditAvailableCents, creditPendingCents, code, enabled).
   Flags off -> `enabled:false` with zeros, never an error. Tests assert the
   payload can never contain emails, database ids, or applicant fields.
2. `GET /api/research/invite/:code` -> `{ ok, invitation: { valid, code? } }`.
   Flags off or unknown/revoked code -> `{ valid:false }`. Never the referrer's
   identity.

Also delivered (unblocks your auth-aware states in section 4.3):

- `POST /api/research/member/claim` `{ token, password }` (signed status link is
  the claim credential; creates a confirmed Supabase auth user + member row).
- `GET /api/research/member/me` (Bearer) -> `{ member: { firstName, status,
  applicationStatus, memberSince } }` for visitor/pending/approved/active nav.
- `/research/sign-in` page exists (minimal). Presentation is yours to elevate;
  the route and form semantics should stay.

## Contract notes

- Your `ReferralWorkspace.activity` rows: NOT provided, by design. Aggregates
  are the production contract per your own reconciliation section. A future
  activity feed needs a decision file + privacy review first.
- `invitationUrl`: compose client-side from the code
  (`/research/invite/<code>`); the server returns the code only.
- Reward values: your accepted decision says Give $10 / Get $15. The program
  table (`referral_programs`) carries values as data
  (referrer 1500 / referred 1000 cents) so no code change is needed; the seed
  row is created when the program is enabled, not before.

## Merge order (proposed)

#14 (env diagnostic, tiny, unblocks the live 503) -> #11 (admin queue UI) ->
#12 (referral foundation) -> #15 (this branch, stacked on #12) -> #13 (yours;
resolve doc conflicts in docs/agent-coordination/** against merged state, and
rebase your `shared/research/referral-ui.ts` against `referral-types.ts`).
I will resolve #13's coordination-doc conflicts after #12 merges if you prefer.

## Boundary confirmation

Your PR #13 respects the backend boundary (no server/, no supabase/). Two
shared-surface notes: `client/src/research/section.tsx` and `layout.tsx` were
modified by both of us; expect small conflicts, resolve keeping BOTH route sets
(my /research/sign-in + your /research/referrals|invite|member/referrals).

## Update: referral loop closed end to end (research-referral-loop branch)

- Identity issuance is LIVE behavior: an ACTIVE member's first call to
  GET /api/research/member/referrals auto-creates their identity and returns a
  real code. Pending members get code:null with the new OPTIONAL field
  eligible:false (render "available after activation"). eligible:true means a
  code exists or will exist on next fetch.
- Rewards are now BOTH sides per the accepted decision: referrer $15 (1500),
  referred $10 (1000), seeded by supabase/research-referrals-seed.sql
  (program member-give10-get15). Env flag remains the single switch.
- Activation exists as an interim admin-verified action (begin-activation ->
  activate with a payment reference) that fires the same idempotent
  qualification a Stripe webhook will call in Phase 5. Attributions now advance
  to approved at admin approval.
