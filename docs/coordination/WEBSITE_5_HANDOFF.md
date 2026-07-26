# Website 5 — Care PR 3 production handoff

## Release unit

- Session: WEBSITE 5 — XENIOS CARE FOUNDATION
- Feature domain: appointments, provider-neutral scheduling, reminders,
  telehealth-session references, clinician assignment, and human-clinician
  review
- Stacked base: accepted Care PR 2 source head
  `54f9bd8d8834de9a8e57fc911665627af36f09ed`
- Feature branch: `feature/website-5-care-appointments-clinician`
- Pull request: `https://github.com/teamxenios/xenios-website/pull/59`
- Final frozen SHA: recorded in the pull request and issue #44 after push

Care PR 1 and PR 2 remain frozen and unchanged. This branch is PR 3 only. It
preserves the accepted PR 2 consent-freshness correction and supersedes the
old PR 3 candidate `fcc91987586b6f20a88c3467f63fc26202d91f27`, which was
stacked on rejected PR 2 head
`0f44cdeb4c04b61e585363690655192ec3295e25`. The old PR 3 candidate must not
be reviewed, merged, migrated, or deployed. This focused unit
does not contain prescriptions, pharmacy fulfillment, patient-specific
instructions, supplies, report sharing, messaging, adverse-event workflow, or
the canonical cross-domain launch-gate implementation.

## Included

- Verified medical-group, clinician-profile, clinician-license, scheduling,
  telehealth, reminder, state, and clinician-coverage readiness seams.
- Exact Care required-input labels for missing medical group, clinician record,
  license, credential verification, coverage, supported state, telehealth
  provider, scheduling provider, reminders, and activation approval.
- A provider-neutral appointment lifecycle: request, assign, schedule,
  reschedule, patient cancel, check-in, clinician completion, and administrator
  no-show.
- Opaque private telehealth-session references that are never returned by the
  repository or route response.
- Privacy-safe reminder records containing no clinical detail.
- Assigned-clinician review states for review, information request, laboratory
  request, follow-up, approve, decline, and no-treatment.
- A database constraint and server contract that permit only
  `human_clinician` as the final-decision source.
- Patient/clinician ownership, active role, current state coverage, optimistic
  version, idempotency, and append-only audit/history controls.
- Production Supabase repository and focused Express route modules.
- Stable fail-closed `503` JSON that discloses no adapter/provider error text.
- A final Xenios patient appointment page with loading, disabled,
  authentication-required, error/retry, empty, and populated states.
- A clinical-administrator readiness panel that distinguishes SOFTWARE
  COMPLETE from REAL INPUTS REQUIRED and PUBLIC RELEASE BLOCKED.

## Truthfulness and pre-launch boundary

- No medical group, clinician, license, supported state, provider, appointment,
  telehealth session, reminder, clinical decision, patient, pharmacy, product,
  price, availability, or treatment record is seeded.
- No private seed record is authorized by this PR. Website 2 owns the canonical
  seed-origin model, server pre-launch gate, reset safety, cross-domain
  exclusions, and approval.
- No browser value can activate scheduling, validate credentials, approve
  coverage, or make a clinical decision.
- No AI or automation actor can submit a final clinician decision.
- The canonical Care capability remains `disabled`.
- Mechanical software readiness is not clinical or public-launch clearance.

## Files

Shared:

- `shared/care/appointments.ts`
- `shared/care/clinician-review.ts`

Server:

- `server/care/appointments.ts`
- `server/care/clinician-review.ts`
- `server/care/appointment-readiness.ts`
- `server/care/appointment-repository.ts`
- `server/care/appointment-routes.ts`
- `server/care/index.ts`

Client:

- `client/src/care/CareAppointmentsPage.tsx`
- `client/src/care/CareAppointmentReadinessPanel.tsx`

Migration:

- `supabase/care-appointments-clinician.sql`
- `supabase/tests/care-appointments-clinician-lifecycle.test.sql`
- `supabase/MIGRATIONS.md`

## Route delta

The focused module provides:

- `GET /api/care/appointments`
- `POST /api/care/appointments`
- `POST /api/care/appointments/:appointmentId/action`
- `GET /api/care/appointments/admin/readiness`
- `POST /api/care/appointments/:appointmentId/assign`
- `POST /api/care/appointments/:appointmentId/schedule`
- `POST /api/care/appointments/:appointmentId/no-show`
- `POST /api/care/appointments/:appointmentId/complete`
- `GET /api/care/reviews`
- `POST /api/care/reviews/:reviewId/action`
- `/care/appointments` client page

Every API route first passes the accepted PR 1 capability and active Care-role
boundary. Self-service routes bind patient identity from the authenticated
principal. Administrator routes require `care:administer`. Review and
completion routes require `care:review_assigned` and bind the clinician from
the authenticated principal.

## Website 2 locked-file wiring requests

Do not register PR 3 before Care-1, Care-2, and Care-3 migrations are reviewed
and applied in order.

### `server/index.ts`

Extend the Care import with:

```ts
buildCareAppointmentRepository,
registerCareAppointmentApi,
```

After the accepted PR 1/2 shared dependencies:

```ts
const careAppointments = buildCareAppointmentRepository();
registerCareAppointmentApi(app, careAccess, careAppointments);
```

Keep registration before the generic API 404 and SPA catch-all. Do not log
request bodies or provider session references.

### `client/src/App.tsx`

Add:

```ts
const CareAppointments = lazy(() => import("@/care/CareAppointmentsPage"));
```

Register before the broad `/care/*` route:

```tsx
<Route path="/care/appointments" component={CareAppointments} />
```

The clinical-administrator readiness panel is an embeddable Care-domain
component. Website 2 should mount it only inside the canonical server-
authorized internal administration experience; it must not be placed on a
public route.

### Canonical pre-launch integration

Website 2 must map `CareAppointmentReadinessFacts` and the exact labels returned
by this module into the canonical required-input objects, role gate, readiness
dashboard, and launch switch. This PR deliberately does not create a competing
canonical required-input table, seed-origin model, or browser launch flag.

## Migration delta

Apply after:

1. `supabase/care-access-foundation.sql`
2. `supabase/care-eligibility-intake.sql`

`supabase/care-appointments-clinician.sql` creates 12 forced-RLS tables:

1. `care_medical_groups`
2. `care_clinician_profiles`
3. `care_clinician_licenses`
4. `care_scheduling_providers`
5. `care_clinical_configuration_audit`
6. `care_appointments`
7. `care_telehealth_sessions`
8. `care_appointment_events`
9. `care_clinician_assignment_events`
10. `care_clinician_reviews`
11. `care_clinician_review_events`
12. `care_appointment_reminders`

It adds fixed-search-path validation/transition functions, immutable
configuration and workflow histories, active-role/current-license/current-
coverage checks, private session-reference storage, optimistic versions,
idempotency keys, and reminder supersession. Anonymous and authenticated
browser roles receive zero table grants or function execution.

## Validation

Current branch-ready validation:

- Exact corrected ancestry: merge base is accepted Care PR 2 source head
  `54f9bd8d8834de9a8e57fc911665627af36f09ed`.
- The accepted PR 2 consent-freshness correction is present unchanged.
- PR 3 name/status scope matches the superseded `fcc919875...` candidate and
  contains no Website 2 locked shared registration file.
- Focused PR 3 tests: 6 files / 23 tests passed.
- `npm run check`: passed.
- Disposable PostgreSQL 16:
  - Care-1, Care-2, and Care-3 applied in order.
  - All three migrations then applied a second time with `ON_ERROR_STOP=1`.
  - PR 1, PR 2, and PR 3 lifecycle SQL each completed and rolled back.
  - 28/28 total Care tables reported RLS plus forced RLS.
  - 12/12 PR 3 tables reported RLS plus forced RLS.
  - PR 3 browser grants were zero and seven reviewed service-role workflow RPC
    grants were present.
  - Capability remained `care:disabled`.
  - Zero residual PR 1 roles/audits, PR 2 records, PR 3 records, or disposable
    auth users remained after rollback.
- Lifecycle proof includes:
  - no migration seed records
  - cross-patient appointment request rejection
  - cross-patient appointment mutation rejection
  - request replay idempotency
  - current-state and verified-clinician coverage enforcement
  - verified provider and reminder requirements
  - private telehealth reference persistence
  - append-only appointment, assignment, configuration, and review histories
  - completed appointment requirement before a final decision
  - final decision source fixed to `human_clinician`
  - decided-review assignment immutability
- Full repository tests: 155 files / 3,199 tests passed.
- `npm run check`: passed.
- `npm run build`: passed (existing Vite large-chunk advisory only).
- Viewable desktop, 375px, 320px, populated, empty, disabled, error/retry,
  no-overflow, and 200%-reflow-equivalent evidence:
  `docs/care/evidence/PR3_UI_EVIDENCE.md`.

## External and canonical blockers

- Actual medical-group relationship and executed agreement.
- Actual clinician identity, license, credential review, agreement, role, and
  state coverage.
- Actual supported-state approval.
- Actual telehealth and scheduling-provider configuration.
- Approved reminder timing and communication integration.
- Website 2 canonical required-input records, private pre-launch gate,
  seed-origin filtering, launch switches, migration apply, and shared route
  registration.
- Website 6 integrated isolation, mobile, accessibility, and launch-gate
  verification.

## Production verification after Website 2 release

1. Confirm Render is Live and deployed SHA matches merged main.
2. Confirm `/api/health` is 200.
3. Confirm the Care capability remains `disabled`.
4. Confirm every PR 3 route returns `503 care_disabled` before repository
   access or mutation.
5. Confirm `/care/appointments` renders the truthful disabled state at desktop,
   375px, and 320px.
6. Confirm no clinical or scheduling facts were fabricated during migration.
7. Confirm 12/12 PR 3 tables force RLS and browser grants remain zero.
8. Confirm internal readiness labels are visible only to an authorized clinical
   administrator after the canonical internal gate is integrated.
9. Inspect Render and Supabase logs without exposing payloads or secrets.

## Next exact action

After Website 2 accepts this frozen PR 3 unit:

1. Keep PR 3 unchanged after exact-SHA acceptance.
2. Remain available for PR 1–3 integration corrections and live Pending smoke.
3. Keep PRs 4–7 held until PR 3 completes serialized production gates.
4. Website 2 retains serialized migration, shared wiring, merge, deployment,
   and production verification.

UI CONSISTENCY STATUS: MATCHES EXISTING XENIOS

PRODUCTION STATUS: NOT YET MERGED
