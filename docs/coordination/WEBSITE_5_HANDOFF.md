# Website 5 — Care PR 5 production handoff

## Release unit

- Session: WEBSITE 5 — XENIOS CARE FOUNDATION
- Domain: patient instruction and product-specific supply foundation
- Stacked base: accepted Care PR 4 source head
  `0ff2352120544f436c005959e1593465353f15bb`
- Original PR 5 source checkpoint:
  `493ca898ebe688eb9b039b570e619baa85dee8af`
- Branch: `feature/website-5-care-instructions-supplies`
- PR/frozen head: recorded in the final PR and Command Center handoff
- Release order: PR #46 → PR #56 → PR #59 → PR #63 → this PR

Care PRs 1–4 remain frozen and unchanged. This unit does not contain laboratory
sharing, messaging, support, adverse-event work, PR6 code, clinical seed data,
external clinical actions, or a parallel canonical required-input/readiness
model.

The old PR 5 head `8fbe05a68f06104959ee73c77343142185ed9c12`
on superseded PR 4 `604ed05c54ca29063302433aa2c816a68b197424`
remains DO NOT REVIEW / MERGE / APPLY / INTEGRATE / DEPLOY.

## Completed scope

- Patient-specific instruction sources for exact pharmacy label, pharmacy
  information, clinician direction, and manufacturer material.
- General education remains a separate source kind and cannot satisfy a
  patient-specific instruction release.
- Draft, assigned-human-clinician release, acknowledgment, version,
  supersession, optimistic concurrency, and idempotency lifecycle.
- Every protected read, mutation, and replay revalidates the exact current
  consent and supported-state context before returning a record.
- Replays are actor-, record-, version-, action-, and semantic-input-bound;
  changed payloads, cross-patient identifiers, revoked coverage, and
  cross-pharmacy actors fail without mutation or protected-record return.
- Released instructions require a signed prescription, exact patient and
  prescription binding, current verified sources, and the assigned human
  clinician. AI and automation cannot release instructions.
- Verified supply-source seam, released patient instruction prerequisite,
  product-specific device, replacement cadence, kit version/release, patient
  replacement request, and assigned-pharmacy replacement queue/action.
- Replacement reads and actions revalidate the exact current prescription,
  instruction, supply source, eligible assigned order, pharmacy, operator,
  consent, and state chain at use time.
- Supply-source verification is optimistic-versioned and actor-idempotent,
  follows guarded state transitions, and records immutable input/result
  history. Expired, rejected, superseded, and missing relationships never
  project as verified.
- No RPC or route invokes shipping, pharmacy, supplier, clinician, laboratory,
  messaging, or other external actions.
- Twelve additive tables have forced RLS and no browser table/RPC grants.
- Instruction sources, source links, instruction events, acknowledgments,
  supply-kit events, and replacement events are database-enforced append-only.
  Supply-source configuration changes are fully audited.
- Repository failures return stable safe `503` JSON with no adapter error text.
- Final Xenios patient instruction center, clinical-admin readiness panel, and
  restricted pharmacy replacement UI include loading, disabled/forbidden,
  error/retry, empty, populated, acknowledgment, and replacement states.

## Truthfulness and shared-contract boundary

- No patient, clinician, pharmacy, prescription, instruction, supply source,
  product-specific device, cadence, replacement, supported state, price,
  availability, or clinical fact is seeded.
- Care remains canonically `disabled`.
- Software readiness is not clinical, operational, or public clearance.
- Website 2’s live pre-launch contract is not retrofitted into this stacked
  unit. No Care seed namespace or role exists and no Care seed data is
  authorized.
- Canonical required-input/readiness/launch-switch contracts were not frozen
  for this stack. PR5 retains only exact Care-domain facts for later Website 2
  mapping and creates no competing shared object.

## Changed files

- `shared/care/instructions.ts`
- `server/care/instructions.ts`
- `server/care/instructions.test.ts`
- `server/care/instruction-repository.ts`
- `server/care/instruction-repository.test.ts`
- `server/care/instruction-routes.ts`
- `server/care/instruction-routes.test.ts`
- `server/care/index.ts`
- `client/src/care/CareInstructionCenterPage.tsx`
- `client/src/care/CareInstructionReadinessPanel.tsx`
- `client/src/care/CareSupplyReplacementPage.tsx`
- `client/src/care/instruction-ui.test.ts`
- `supabase/care-instructions-supplies.sql`
- `supabase/tests/care-instructions-supplies-lifecycle.test.sql`
- `supabase/MIGRATIONS.md`
- `docs/evidence/care-pr5/*`
- `docs/coordination/WEBSITE_5_REMAINING_SCOPE.md`

## Route delta

- `GET /api/care/instructions` — patient-owned released/history records
- `POST /api/care/instructions` — assigned clinician draft
- `POST /api/care/instructions/:instructionId/release` — assigned human clinician
- `POST /api/care/instructions/:instructionId/acknowledge` — owning patient
- `POST /api/care/instructions/sources/clinician` — clinician direction only
- `POST /api/care/instructions/sources/pharmacy` — pharmacy label/information only
- `POST /api/care/instructions/sources/admin` — manufacturer/general education
- `GET /api/care/instructions/admin/readiness` — clinical administrator
- `GET /api/care/supplies` — patient-owned kit/replacement records
- `POST /api/care/supplies/:supplyKitId/replacements` — owning patient
- `GET /api/care/supplies/pharmacy/replacements` — assigned pharmacy operator
- `POST /api/care/supplies/pharmacy/replacements/:replacementId/action` —
  assigned pharmacy operator
- `POST /api/care/supplies/admin/sources` — audited clinical-admin supply-source
  entry, review, and verification with expected version and idempotency key
- `POST /api/care/supplies/admin/kits` — clinical administrator
- `POST /api/care/supplies/admin/kits/:supplyKitId/release` —
  clinical administrator
- `/care/instructions` — patient instruction/supply UI
- `/care/pharmacy/replacements` — restricted pharmacy queue UI

Every actor and patient identity comes from `res.locals.carePrincipal`, never
the request body.

## Website 2 locked-file wiring request

Do not register until Care migrations 1–5 are reviewed and applied in order.

In `server/index.ts`, import:

```ts
buildCareInstructionRepository,
registerCareInstructionApi,
```

Then, after the accepted shared Care access dependencies:

```ts
const careInstructions = buildCareInstructionRepository();
registerCareInstructionApi(app, careAccess, careInstructions);
```

Register before the generic API 404 and SPA fallback. Never log request bodies,
instruction content, source references/content, patient identifiers, supply
details, or replacement records.

In `client/src/App.tsx`, add:

```ts
const CareInstructionCenter = lazy(
  () => import("@/care/CareInstructionCenterPage"),
);
const CareSupplyReplacements = lazy(
  () => import("@/care/CareSupplyReplacementPage"),
);
```

Register before the broad `/care/*` route:

```tsx
<Route path="/care/instructions" component={CareInstructionCenter} />
<Route
  path="/care/pharmacy/replacements"
  component={CareSupplyReplacements}
/>
```

Mount `CareInstructionReadinessPanel` only inside the canonical
server-authorized clinical administration experience. Website 2 should map its
exact Care-domain facts into the canonical required-input/readiness contract
only after that shared contract is frozen.

## Migration delta

Apply after:

1. `care-access-foundation.sql`
2. `care-eligibility-intake.sql`
3. `care-appointments-clinician.sql`
4. `care-prescription-pharmacy.sql`
5. `care-instructions-supplies.sql`

Care-5 adds:

1. `care_instruction_sources`
2. `care_patient_instructions`
3. `care_instruction_source_links`
4. `care_instruction_events`
5. `care_instruction_acknowledgments`
6. `care_supply_sources`
7. `care_supply_source_events`
8. `care_supply_configuration_audit`
9. `care_supply_kits`
10. `care_supply_kit_events`
11. `care_supply_replacements`
12. `care_supply_replacement_events`

All twelve have enabled and forced RLS. `public`, `anon`, and `authenticated`
receive no table or RPC access. Rollback is capability-off plus code rollback;
additive clinical tables and audit history must remain until retention/legal
owners approve any later disposition.

## Validation

- Exact corrected ancestry: merge base is accepted Care PR 4 source head
  `0ff2352120544f436c005959e1593465353f15bb`.
- Scope isolation: the ancestry-corrected 22-file PR5 unit remains intact; the
  bounded Website 6 corrections modify only PR5 instruction/supply
  schema, repository, routes, types, UI, and tests, plus one adjacent
  repository regression file. No PR6/PR7 or shared canonical model is added.
- Locked-file isolation: no delta in `client/src/App.tsx`, `server/index.ts`, or
  navigation files.
- Focused: 4 files / 26 tests passed.
- Full repository: 166 files / 3,264 tests passed.
- `npm run check`: passed.
- `npm run build`: passed; existing Vite large-chunk advisory only.
- `git diff --check`: passed.
- Fresh disposable PostgreSQL 16:
  - Care 1–5 migrations applied in order and all five applied a second time
    with `ON_ERROR_STOP=1`;
  - all five lifecycle proofs completed and rolled back;
  - 50/50 total Care tables and 12/12 Care-5 tables have enabled + forced RLS;
  - Care-5 browser table grants: zero;
  - Care-5 browser routine grants: zero;
  - thirteen reviewed Care-5 service-role RPC grants were present;
  - state-disabled and consent-revoked/superseded actions and replays rejected;
  - changed-input, cross-patient, cross-pharmacy, and revoked-role replays
    rejected without row/version/history changes;
  - expired source relationships blocked replacement progress;
  - stale supply-source writes lost, exact replays wrote once, and guarded
    source transitions preserved immutable audit history;
  - a verified successor invalidated the old linked instruction, readiness,
    replacement request/action/replay, and patient current label without
    rewriting history; an unrelated successor did not contaminate the chain,
    and an explicitly successor-linked instruction and kit passed;
  - instruction and replacement histories reject UPDATE and DELETE;
  - capability remained `care:disabled`;
  - zero disposable auth users, roles, access audits, instructions, supply
    kits, or replacements remained.
- Viewable UI evidence: `docs/evidence/care-pr5/`.

## Exact external blockers

- Real signed patient prescription and assigned licensed clinician.
- Exact verified pharmacy label and information, clinician direction, and
  manufacturer material for the patient/prescription.
- Real verified supply relationship, product-specific device record, and
  replacement cadence.
- Real medical group, clinician/state coverage, pharmacy, privacy, consent,
  support, incident process, and Care activation approvals.
- Website 2 shared registration, ordered migration, merge, Render deployment,
  and live smoke.

PRODUCTION STATUS: NOT YET MERGED

UI CONSISTENCY STATUS: MATCHES EXISTING XENIOS
