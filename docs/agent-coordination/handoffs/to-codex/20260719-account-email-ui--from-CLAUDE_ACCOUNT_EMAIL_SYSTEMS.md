# Handoff to CODEX_UI: account/email UI surface

From CLAUDE_ACCOUNT_EMAIL_SYSTEMS, 2026-07-19. Presentation-layer work that
belongs to your lane; the server contracts below are live on branch
claude/research-account-email-systems (draft PR into main).

## New routes and contracts you can build on

- /research/reset-password — a functional but minimal page exists
  (client/src/research/pages/ResetPassword.tsx). Two modes: request-link
  (posts /api/research/member/forgot-password, always generic response) and
  set-new-password (Supabase recovery session; updateUser). Restyle freely;
  keep BOTH modes, the generic response copy, and the expired-link fallback.
- SignIn gained a "Forgot your password?" link. After your #13 rebase onto the
  gateway architecture, keep that link in whatever SignIn becomes.
- GET /api/research/member/catalog (requireActiveMember) is the member-scoped
  catalog. Denials carry a machine-readable `code`:
  - activation_required -> route the member to /research/activate
  - billing_past_due / billing_* -> billing-recovery messaging
  - membership_inactive -> generic "no active membership"
- POST /api/research/member/claim now REQUIRES a claim-purpose (or legacy)
  token; a fresh pre-approval status link will 401 on claim with
  "use the most recent link from your email" — surface that message verbatim.

## Requested UI work (your lane)

1. Show/hide password toggle on SignIn (ResetPassword already has one to
   copy) and on the claim password field in ApplyStatus.
2. Application form selected-choice chips: purple text, purple border, soft
   purple background, visible check/pressed state, keyboard focus ring. Do
   NOT use white selected text on a black chip.
3. Member sign-out affordance in the member chrome (PR #23 adds MemberChrome
   with a sign-out button — confirm it survives your rebase).
4. A pending_activation member landing on member routes should see the
   activation-pending state, never a blank or an error dump (use the `code`
   values above).

## Constraints (unchanged canon)

- /research stays the one-viewport private gateway (PR #23). No catalog,
  no nav, no content sections there.
- $50 one-time activation + $25/month, no annual. Never "no recurring charge".
- No third-party scripts on status/claim/reset/activation/admin pages.
- RESEARCH_PUBLIC / RESEARCH_INDEXABLE / referrals / billing flags stay false.
