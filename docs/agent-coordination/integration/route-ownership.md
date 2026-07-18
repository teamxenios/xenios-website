# Route and surface ownership (V3 section 81.2)

## CLAUDE_PRIMARY (default owner)

Application security, admin review, authentication, Stripe, membership state,
onboarding, Blueprint workflow, referral backend, attribution, ledger, fraud,
admin operations, private data.

Concretely: server/research/**, server/routes.ts, shared/research/**,
supabase/*.sql, client/src/pages/Admin*.tsx, the /api/research/* and
/api/admin/research/* contracts.

## CODEX_UI (default owner)

Public Research visual system, page presentation, Research Guides UI, referral
card, referral landing page, sharing UI, member referral dashboard presentation,
responsive design, accessibility passes, visual regression.

Concretely (once started): presentation-layer changes under
client/src/research/pages/** and client/src/research/components.tsx, guides UI.

## Shared (handoff required before edits)

Root navigation (client/src/lib/nav.ts, Navbar), footer, global CSS
(client/src/index.css), design tokens, shared forms, /research/apply
presentation, membership CTA state, referral state contract
(shared/research/referral-types.ts), analytics names, route guards
(client/src/research/section.tsx, server/research/index.ts), deployment config.

## Rules

- Do not modify a surface claimed in claims/active/ by the other agent.
- Contract changes to shared/research/* require a decision file or a handoff.
- Merge order and conflicts: integration/merge-order.md.
