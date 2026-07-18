# CLAUDE_PRIMARY status

- Timestamp: 2026-07-18
- Mode: building (V3 execution order, "Then" list)
- Branch: research-referral-foundation
- Claimed work: referral backend foundation (identity, attribution, reward engine,
  credit ledger schema), behind disabled flags. See claims/active/.
- Completed: application security blocker (V3 section 76, merged in PR #9); admin
  review queue UI (PR #11, awaiting review); membership public pages; application
  state machine + emails; coordination scaffold.
- Current: referral schema + server module + qualification service + tests.
- Next: member account claiming/auth (section 83 Then item 3), then deep onboarding
  foundation. Stripe blocked on keys.
- Contracts owned: /api/research/* and /api/admin/research/* shapes;
  shared/research/* types; the application state machine.
- Tests: `npm run test` (vitest). All research API tests must stay green.
- Blockers: live env 503 (Samuel), Stripe keys (Samuel), referral SQL run (Samuel).
- Needs from CODEX_UI: nothing yet. Public referral UI (invitation card, landing
  page, share UI, dashboard presentation) starts only after the referral state
  contract in shared/research/referral-types.ts is merged; treat that file as the
  interface. Do not build against unmerged branches.
- Integration notes: routes /research/* are registered in
  client/src/research/section.tsx; Express gate + APIs in server/research/.
  Do not add /research page routes without updating section.tsx and the
  route-ownership doc.
