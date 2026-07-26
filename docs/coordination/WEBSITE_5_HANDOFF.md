# Website 5 — Care PR 4 production handoff

## Release unit

- Session: WEBSITE 5 — XENIOS CARE FOUNDATION
- Domain: patient-specific prescription and pharmacy foundation
- Stacked base: frozen Care PR 3 head
  `fcc91987586b6f20a88c3467f63fc26202d91f27`
- Branch: `feature/website-5-care-prescription-pharmacy`
- PR/frozen head: recorded after final push
- Release order: PR #46 → PR #56 → PR #59 → this PR

Care PRs 1–3 remain frozen and unchanged. This release contains no instruction
center, supply kit, laboratory sharing, messaging, adverse-event workflow, or
parallel cross-domain pre-launch/required-input model.

## Completed scope

- Patient-specific prescription source, draft, signing, version, and
  supersession records.
- Signing is limited to the exact assigned human clinician after a completed
  appointment, approved human-clinician review, current state coverage, and
  complete patient-specific content.
- Verified pharmacy identity, license, state coverage, agreement, integration,
  support, and assigned-operator seams.
- Pharmacy receipt, clarification, acceptance, rejection, dispense, shipment,
  delivery, cancellation, and support-reference history.
- Open clarification blocks dispensing; shipment requires a private tracking
  reference.
- Cross-patient, wrong-clinician, wrong-pharmacy, inactive-role, expired
  coverage, stale-version, and replay controls.
- Append-only prescription source/event, pharmacy order event, and
  configuration-audit histories.
- Ten new forced-RLS tables with no browser grants; all writes use service-role
  RPCs behind the accepted Care authorization middleware.
- Stable safe `503` responses disclose no provider/repository error text.
- Final Xenios patient prescription UI plus clinical-administrator readiness
  panel, with loading, disabled, auth/forbidden, error/retry, empty, populated,
  and exact required-input states.

## Truthfulness and shared-contract boundary

- No pharmacy, license, operator, patient, prescription, medication,
  instruction, price, product, order, shipment, supported state, or clinical
  fact is seeded.
- Care remains canonically `disabled`.
- No pharmacy/provider external action is sent by this PR.
- Software readiness is not clinical, operational, or public clearance.
- The live canonical private pre-launch contract at
  `docs/coordination/PRELAUNCH_SHARED_CONTRACT.md` was received after the PR4
  checkpoint. Per Website 2 instruction, PR4 does not retrofit it mid-release.
- No seed namespace or seed role exists; Care seed data remains prohibited.
- Website 2 has not frozen canonical required-input/readiness/launch-switch
  contracts. This PR retains exact Care-domain facts and creates no competing
  shared model.

## Files

- `shared/care/prescriptions.ts`
- `server/care/prescriptions.ts`
- `server/care/prescriptions.test.ts`
- `server/care/prescription-repository.ts`
- `server/care/prescription-routes.ts`
- `server/care/prescription-routes.test.ts`
- `server/care/index.ts`
- `client/src/care/CarePrescriptionsPage.tsx`
- `client/src/care/CarePharmacyOrdersPage.tsx`
- `client/src/care/CarePharmacyReadinessPanel.tsx`
- `client/src/care/prescription-ui.test.ts`
- `supabase/care-prescription-pharmacy.sql`
- `supabase/tests/care-prescription-pharmacy-lifecycle.test.sql`
- `supabase/MIGRATIONS.md`
- `docs/care/evidence/PR4_UI_EVIDENCE.md`
- `docs/coordination/WEBSITE_5_REMAINING_SCOPE.md`

## Route delta

- `GET /api/care/prescriptions` — patient-owned records only
- `POST /api/care/prescriptions` — assigned clinician draft
- `POST /api/care/prescriptions/:id/sign` — assigned human clinician
- `GET /api/care/pharmacy/orders` — assigned pharmacy operator only
- `POST /api/care/pharmacy/orders/:id/action` — assigned pharmacy operator
- `GET /api/care/pharmacy/admin/readiness` — clinical administrator
- `POST /api/care/pharmacy/admin/prescriptions/:id/assign` — clinical
  administrator
- `/care/prescriptions` — patient UI
- `/care/pharmacy` — restricted assigned-operator UI

Every actor identity comes from `res.locals.carePrincipal`, never the request
body. Private tracking and clarification references are persisted but not
returned by patient or queue projections.

## Website 2 locked-file wiring request

Do not register until Care migrations 1–4 are reviewed and applied in order.

In `server/index.ts`, import:

```ts
buildCarePrescriptionRepository,
registerCarePrescriptionApi,
```

Then, after the accepted shared Care access dependencies:

```ts
const carePrescriptions = buildCarePrescriptionRepository();
registerCarePrescriptionApi(app, careAccess, carePrescriptions);
```

Register before the generic API 404 and SPA fallback. Never log request bodies,
clinical content, clarification references, or tracking references.

In `client/src/App.tsx`, add:

```ts
const CarePrescriptions = lazy(() => import("@/care/CarePrescriptionsPage"));
const CarePharmacyOrders = lazy(() => import("@/care/CarePharmacyOrdersPage"));
```

and register before the broad `/care/*` route:

```tsx
<Route path="/care/prescriptions" component={CarePrescriptions} />
<Route path="/care/pharmacy" component={CarePharmacyOrders} />
```

Mount `CarePharmacyReadinessPanel` only inside the canonical server-authorized
clinical administration experience. Website 2 should map its exact domain
facts into the future canonical required-input/readiness contract after that
contract is frozen.

## Migration delta

Apply after:

1. `care-access-foundation.sql`
2. `care-eligibility-intake.sql`
3. `care-appointments-clinician.sql`
4. `care-prescription-pharmacy.sql`

The PR4 migration adds:

1. `care_pharmacies`
2. `care_pharmacy_licenses`
3. `care_pharmacy_state_coverage`
4. `care_pharmacy_operators`
5. `care_pharmacy_configuration_audit`
6. `care_prescription_content_sources`
7. `care_prescriptions`
8. `care_prescription_events`
9. `care_pharmacy_orders`
10. `care_pharmacy_order_events`

All ten have enabled and forced RLS. `public`, `anon`, and `authenticated`
receive no table or RPC access. Configuration changes are audited; clinical
source and workflow histories reject UPDATE and DELETE. Rollback is
capability-off plus code rollback; additive tables must be retained until
retention/legal owners approve any later data disposition.

## Validation

- Focused: 3 files / 16 tests passed.
- `npm run check`: passed.
- `npm run build`: passed; existing Vite large-chunk advisory only.
- Disposable PostgreSQL 16:
  - Care 1–4 applied in order.
  - PR4 migration applied twice with `ON_ERROR_STOP=1`.
  - lifecycle proof completed and rolled back.
  - 10/10 PR4 tables have enabled + forced RLS.
  - capability remained `care:disabled`.
  - zero PR4 fixture rows survived rollback.
- Lifecycle proof covers no seeds, cross-patient rejection, assigned human
  clinician, verified content, idempotent draft/sign, assigned verified
  pharmacy/state/operator, clarification blocking, immutable source/events,
  and rollback.
- Full repository: 158 files / 3,210 tests passed.
- Final UI evidence: `docs/care/evidence/PR4_UI_EVIDENCE.md`.

## Exact external blockers

- Real medical group and executed agreement.
- Real licensed clinician identity, credential review, state coverage, and
  agreement.
- Real pharmacy legal identity, current licenses, state/dispensing/shipping
  coverage, executed agreement, integration, support, and operator approvals.
- Real patient-specific prescription content signed by the assigned clinician.
- Privacy, consent, instruction, support, incident, and Care activation review.
- Website 2 shared registration, ordered migration, merge, Render deployment,
  and live smoke.

PRODUCTION STATUS: NOT YET MERGED

UI CONSISTENCY STATUS: MATCHES EXISTING XENIOS
