# Website 5 — Xenios Care foundation handoff

## Scope and safety posture

Branch: `feature/website-5-care-foundation`

Care is a separate, disabled-by-default rail. Research products, orders,
purchases, inventory, assessments, roles, and administrator authority do not
convert into or unlock Care. No clinical questions, providers, products, doses,
directions, or live integrations are included.

## Integration contract

- Client surface: lazy-mount `client/src/care/section.tsx` at `/care` and
  `/care/*`. It calls only `GET /api/care/status`.
- Server surface: mount `carePageGate` before the SPA catch-all and call
  `registerCareApi(app)` before the generic `/api/*` 404 guard.
- Shared contracts: import role, permission, route, rail, and capability types
  from `shared/care/contracts.ts`.
- Capability: `CARE_CAPABILITY_STATE` defaults to `disabled`. `enabled` also
  requires `CARE_ENABLE_APPROVED=true`. This is preparatory plumbing, not an
  activation recommendation.
- Authentication: operational handlers accept an injected Care identity
  resolver. The production default resolves nobody and therefore fails closed.
- Logging: all `/api/care` bodies are treated as sensitive and must never be
  included in request logs.
- Migration: apply the additive `supabase/care-foundation.sql` only after
  partner/security review; see its rollback notes and verification tests.

## Wave checkpoints

1. Rail, role, capability, route contracts and truthful shell.
2. Eligibility, intake, appointments, clinician review.
3. Prescriptions, pharmacy, instructions, patient-specific supplies.
4. Labs, secure messages, support, adverse events, privacy, audit.
5. Migration verification, privacy review, UI evidence, full validation, draft PR.

## Explicit non-goals

- No AI final clinical decision.
- No nationwide availability claim.
- No Research-to-Care product, order, purchase, inventory, or instruction unlock.
- No affiliate compensation for clinical events or value.
- No email or Telegram clinical record.
- No trainer, Mitch, fulfillment, affiliate, or general Research-admin access.
- No deployment or merge from this branch.
