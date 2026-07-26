# Website 5 — Care PR 4 production handoff

## Release unit

- Session: WEBSITE 5 — XENIOS CARE FOUNDATION
- Domain: patient-specific prescription and pharmacy foundation
- Stacked base: accepted Care PR 3 source head
  `71da91c458907eaf4f627488e5de35cddf82c04a`
- Branch: `feature/website-5-care-prescription-pharmacy`
- Pull request: `https://github.com/teamxenios/xenios-website/pull/63`
- Final frozen SHA: recorded after final validation and push
- Release order: PR #46 → PR #56 → PR #59 → PR #63

Care PRs 1–3 remain frozen and unchanged. This release contains no instruction
center, supply kit, laboratory sharing, messaging, adverse-event workflow, or
parallel cross-domain pre-launch/required-input model.

The superseded PR 4 head
`604ed05c54ca29063302433aa2c816a68b197424`, stacked on superseded PR 3
`fcc91987586b6f20a88c3467f63fc26202d91f27`, remains prohibited.
Rejected five-HIGH head
`bb5b320471832c69571511d36815306159506b17` also remains prohibited.

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
- Every mutation and replay revalidates exact current telehealth/privacy
  consent, active supported state, actor, ownership, role, and coverage.
- Idempotent replay requires action/input equivalence and never authorizes from
  an idempotency key alone.
- Readiness is calculated from one exact clinician, pharmacy, state, and
  prescription workflow context through a server-authoritative RPC.
- Clarification remains open until the assigned clinician or a clinical
  administrator records a private response reference; a pharmacy operator
  cannot self-clear it.
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
- The shared pre-launch and canonical required-input contracts are not
  duplicated or amended in this focused domain PR.
- No seed namespace or seed role is introduced; Care seed data remains
  prohibited.
- Website 2 retains canonical required-input/readiness/launch-switch mapping and
  shared integration ownership.

## Files

- `shared/care/prescriptions.ts`
- `server/care/prescriptions.ts`
- `server/care/prescriptions.test.ts`
- `server/care/prescription-repository.ts`
- `server/care/prescription-routes.ts`
- `server/care/prescription-routes.test.ts`
- `server/care/prescription-repository.test.ts`
- `server/care/index.ts`
- `client/src/care/CarePrescriptionsPage.tsx`
- `client/src/care/CarePharmacyOrdersPage.tsx`
- `client/src/care/CarePharmacyReadinessPanel.tsx`
- `client/src/care/prescription-ui.test.ts`
- `client/src/care/prescription-landmarks.test.tsx`
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
- `POST /api/care/prescriptions/pharmacy-orders/:id/clarification/resolve` —
  assigned human clinician
- `POST /api/care/pharmacy/admin/orders/:id/clarification/resolve` — clinical
  administrator
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

Register before the broad `/care/*` route:

```tsx
<Route path="/care/prescriptions" component={CarePrescriptions} />
<Route path="/care/pharmacy" component={CarePharmacyOrders} />
```

Mount `CarePharmacyReadinessPanel` only inside the canonical server-authorized
clinical administration experience. Website 2 owns mapping its exact domain
facts into the canonical required-input/readiness contract.

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
receive no table or RPC access. Seven reviewed service-role RPCs cover exact
readiness, prescription/pharmacy mutation, and clinician/admin clarification
resolution. Replay events persist the original expected version for input
equivalence. Configuration changes are audited; clinical source and workflow
histories reject UPDATE and DELETE. Rollback is capability-off plus code
rollback; additive tables must be retained until retention/legal owners approve
any later data disposition.

## Validation

Current branch-ready validation:

- Exact corrected ancestry: merge base is accepted Care PR 3 source head
  `71da91c458907eaf4f627488e5de35cddf82c04a`.
- Accepted PR 3 implementation and correction blobs remain unchanged.
- PR 4 retains the bounded prescription/pharmacy domain and contains no Website
  2 locked shared registration files.
- Superseded PR 4 head
  `604ed05c54ca29063302433aa2c816a68b197424` remains prohibited.
- Rejected head `bb5b320471832c69571511d36815306159506b17`
  remains prohibited.
- Focused PR 4 tests: 5 files / 32 tests passed.
- Full repository result: 162 files / 3,237 tests passed.
- `npm run check`: passed.
- `npm run build`: passed; existing Vite large-chunk advisory only.
- `git diff --check`: passed.
- Scope isolation: the accepted PR 3 base remains exact; the correction changes
  only PR 4 prescription/pharmacy SQL, repository/routes/domain/UI, focused
  tests, and this evidence/handoff.
- Locked-file isolation: no delta in `client/src/App.tsx`, `server/index.ts`, or
  navigation files.
- Disposable PostgreSQL 16:
  - Care 1–4 applied in order.
  - All four migrations applied twice with `ON_ERROR_STOP=1`.
  - PR 1–4 lifecycle proofs completed and rolled back.
  - 38/38 total Care tables and 10/10 PR 4 tables have enabled and forced RLS.
  - PR 4 browser table grants: zero.
  - PR 4 browser routine grants: zero.
  - Seven reviewed PR 4 service-role RPC grants were present.
  - Capability remained `care:disabled`.
  - Zero disposable auth users, roles, access audits, or PR 4 rows remained.
- Lifecycle proof covers no seeds, cross-patient rejection, assigned human
  clinician, verified content, current consent/state before mutation and replay,
  actor/input-equivalent idempotency, exact-entity readiness isolation, assigned
  verified pharmacy/state/operator, clinician/admin clarification resolution,
  immutable source/events, and rollback.
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

## Production verification after Website 2 release

1. Confirm Render is Live and deployed SHA matches merged main.
2. Confirm `/api/health` is 200.
3. Confirm the Care capability remains `disabled`.
4. Confirm every PR 4 route returns `503 care_disabled` before repository
   access or mutation.
5. Confirm `/care/prescriptions` and `/care/pharmacy` render truthful disabled
   states at desktop, 375px, and 320px.
6. Confirm no clinical, prescription, pharmacy, or shipment facts were
   fabricated during migration.
7. Confirm all PR 4 tables force RLS and browser grants remain zero.
8. Confirm readiness labels are visible only to authorized internal roles after
   Website 2 integrates the canonical shared contracts.
9. Inspect Render and Supabase logs without exposing payloads or secrets.

## Next exact action

After Website 6 accepts the frozen PR 4 unit, Website 2 retains serialized
migration, shared wiring, merge, deployment, and production verification.
PR 5–7 remain held until Website 2 advances the queue.

PRODUCTION STATUS: NOT YET MERGED

UI CONSISTENCY STATUS: MATCHES EXISTING XENIOS
