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

## Wave 2 notes

`server/care/clinical.ts` contains pure, server-owned policy functions for
eligibility, intake creation, appointment transitions, and assigned-clinician
review. Eligibility accepts only verified signals and coverage policy supplied
by the server. Intake ships with a `partner_defined` placeholder rather than
invented questions. Appointments carry no fabricated provider. Final review
decisions reject automation/AI actors and require the assigned human clinician.

## Wave 3 notes

`server/care/pharmacy.ts` authorizes instruction access only when the requesting
patient, signed prescription, accepted pharmacy assignment, formulation,
concentration, instruction binding, and current version match exactly.
Instruction kinds stay separate. Patient supply drafts are created only after
that gate and contain the required field names with every value `null`; no
generic retailer, product, dose, or direction is seeded.

## Wave 4 notes

Lab shares require a current patient consent and exact clinician/lab-reviewer
recipient; revocation closes the share. Clinical messages can exist only in the
Care portal—email and Telegram are notification-only. Adverse events carry
urgency, explicit clinician and pharmacy routing, escalation/closure rules, and
an audit requirement. Audit helpers accept metadata only. Clinical value events
are categorically ineligible for affiliate compensation.

## Wave 5 notes

`supabase/care-foundation.sql` provides additive Care-only tables, constraints,
indexes, default-disabled capability state, forced RLS, authenticated ownership
policies, revoked public access, audit records, and rollback notes. The full
privacy review is in `docs/care/PRIVACY_REVIEW.md`. No migration has been
applied and no deployment has occurred.
