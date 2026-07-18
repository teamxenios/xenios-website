# Claim: referral-foundation (CLAUDE_PRIMARY)

- Opened: 2026-07-18
- Branch: research-referral-foundation
- Scope: V3 sections 68-70, 76, 84. Referral data model (SQL + shared types),
  attribution capture on application submission, idempotent qualification service,
  held-reward + append-only credit ledger foundation, feature flags defaulting to
  false, unit tests. NO public UI (CODEX_UI lane), NO reward issuance while flags
  are off, NO Stripe.
- Files: supabase/research-referrals.sql, shared/research/referral-types.ts,
  server/research/referrals.ts, server/research/referrals.test.ts,
  server/research/membership.ts (attribution hook only), .env.example.
- Out of scope routes: /research/refer, /research/r/:code, member dashboards.
