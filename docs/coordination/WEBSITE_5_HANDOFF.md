# Website 5 — Care PR 6 production handoff

## Release unit

- Session: WEBSITE 5 — XENIOS CARE FOUNDATION
- Domain: private messaging, laboratory reference metadata, and adverse-event /
  quality-issue reporting
- Exact stacked base: frozen Care PR 5 head
  `8fbe05a68f06104959ee73c77343142185ed9c12`
- Branch: `feature/website-5-care-comms-safety`
- Frozen head: reported in the PR, Command Center, and final session handoff
- Release order: PR #46 → PR #56 → PR #59 → PR #63 → PR #65 → this PR

Care PRs 1–5 remain frozen and unchanged. This unit does not contain Care PR 7,
clinical seed data, external delivery, provider invocation, notification
dispatch, shared locked-file edits, or unresolved canonical required-input code.

## Completed scope

- Patient and exact assigned-human-clinician message threads bound to a completed
  Care appointment. Participant identity is server authoritative.
- Private message persistence and append-only message/event history. Recording a
  message does not send email, SMS, Telegram, push, or any other notification.
- Provider-neutral laboratory case metadata for provider, order, result, and
  private-object references. No provider is called and no order, result, range,
  interpretation, diagnosis, or treatment is fabricated.
- Exact assigned lab-reviewer workflow with optimistic concurrency,
  idempotency, immutable event history, and patient-safe status projection.
- Patient-owned adverse-event, quality-concern, and device-issue reporting with
  truthful emergency guidance, exact assigned clinician/support ownership,
  acknowledgment, internal escalation, closure gates, optimistic concurrency,
  idempotency, and append-only history.
- Repository failures return stable safe `503` JSON without adapter error text.
- Nine additive tables have enabled and forced RLS; browser roles receive no
  direct table or RPC grants.
- Final Xenios patient, clinician, reviewer, and support surfaces include
  loading, disabled/forbidden, error/retry, empty, populated, form, and success
  states with deliberate 1440/375/320/200%-reflow behavior.

## Truthfulness and safety boundary

- Care remains canonically `disabled`.
- No patient, clinician, medical group, state, laboratory provider, order,
  result, range, report, appointment, pharmacy, message, adverse event, or
  escalation record is seeded.
- No route invokes an external provider or notification channel.
- Emergency copy directs a person to local emergency services and explicitly
  states that the form is not monitored for emergency response and provides no
  diagnosis or treatment advice.
- Mechanical software readiness is not clinical, operational, or public
  clearance.

## Changed files

- `shared/care/communications.ts`
- `server/care/communications.ts`
- `server/care/communications.test.ts`
- `server/care/communication-repository.ts`
- `server/care/communication-routes.ts`
- `server/care/communication-routes.test.ts`
- `server/care/index.ts`
- `client/src/care/CareCommunicationsPage.tsx`
- `client/src/care/CareClinicianMessagesPage.tsx`
- `client/src/care/CareLabReviewPage.tsx`
- `client/src/care/CareSafetyQueuePage.tsx`
- `client/src/care/communication-ui.test.ts`
- `supabase/care-comms-safety.sql`
- `supabase/tests/care-comms-safety-lifecycle.test.sql`
- `supabase/MIGRATIONS.md`
- `docs/evidence/care-pr6/*`
- `docs/coordination/WEBSITE_5_REMAINING_SCOPE.md`

## Route delta

- `GET /api/care/messages` — owning patient conversations
- `POST /api/care/messages/threads` — owning patient plus exact appointment
- `POST /api/care/messages/:threadId` — owning patient
- `GET /api/care/messages/clinician` — assigned clinician conversations
- `POST /api/care/messages/clinician/:threadId` — assigned clinician
- `GET /api/care/labs` — owning patient status projection
- `GET /api/care/labs/reviewer` — exact assigned reviewer
- `POST /api/care/labs/admin` — clinical administrator
- `POST /api/care/labs/admin/:labCaseId/assign` — clinical administrator
- `POST /api/care/labs/reviewer/:labCaseId/action` — assigned reviewer
- `GET /api/care/adverse-events` — owning patient
- `POST /api/care/adverse-events` — owning patient
- `POST /api/care/adverse-events/admin/:adverseEventId/assign` — clinical admin
- `GET /api/care/adverse-events/clinician` — assigned clinician
- `POST /api/care/adverse-events/clinician/:adverseEventId/action` — assigned clinician
- `GET /api/care/adverse-events/support/assigned` — assigned support owner
- `POST /api/care/adverse-events/support/:adverseEventId/action` — assigned support owner
- `/care/communications` — patient communications and safety UI
- `/care/clinician/messages` — assigned-clinician message UI
- `/care/labs/review` — assigned laboratory-review UI
- `/care/support/safety` — assigned support safety UI

Every actor and patient identity comes from `res.locals.carePrincipal`, never
the request body.

## Website 2 locked-file wiring request

Do not register until Care migrations 1–6 are reviewed and applied in order.

In `server/index.ts`, import:

```ts
buildCareCommunicationRepository,
registerCareCommunicationApi,
```

Then, after the accepted shared Care access dependencies:

```ts
const careCommunications = buildCareCommunicationRepository();
registerCareCommunicationApi(app, careAccess, careCommunications);
```

Register before the generic API 404 and SPA fallback. Do not log message bodies,
patient identifiers, laboratory references, private object references, issue
summaries, or event history.

In `client/src/App.tsx`, add lazy imports for:

```ts
@/care/CareCommunicationsPage
@/care/CareClinicianMessagesPage
@/care/CareLabReviewPage
@/care/CareSafetyQueuePage
```

Register their four client routes listed above before the broad `/care/*`
fallback. Do not place them in public navigation while Care is disabled.

The committed narrow screenshots also preserve the current shared-navbar CTA
specificity defect. In Website 2-locked `client/src/components/Navbar.tsx`,
change the desktop CTA class from:

```tsx
btn btn-primary hidden sm:inline-flex
```

to:

```tsx
btn btn-primary !hidden sm:!inline-flex
```

This keeps the desktop CTA out of the 320/375 mobile header. PR6 content itself
has no horizontal overflow.

## Migration delta

Apply `care-comms-safety.sql` after Care migrations 1–5. It adds:

1. `care_message_threads`
2. `care_messages`
3. `care_message_events`
4. `care_lab_cases`
5. `care_lab_assignments`
6. `care_lab_events`
7. `care_adverse_events`
8. `care_adverse_event_assignments`
9. `care_adverse_event_history`

All nine have enabled and forced RLS. `public`, `anon`, and `authenticated`
receive no table or RPC access. Rollback is capability-off plus code rollback;
clinical/audit records must remain until retention and legal owners approve any
later disposition.

## Validation

- Focused: 3 files / 14 tests passed.
- Full repository: 164 files / 3,240 tests passed.
- `npm run check`: passed.
- `npm run build`: passed; existing Vite large-chunk advisory only.
- Disposable PostgreSQL:
  - prerequisite Care 1–5 schema present;
  - Care-6 migration applied twice with `ON_ERROR_STOP=1`;
  - lifecycle proof completed and rolled back;
  - 9/9 Care-6 tables have enabled + forced RLS;
  - cross-patient and cross-role actions rejected;
  - message, laboratory, and adverse-event replays are idempotent;
  - immutable histories reject UPDATE and DELETE;
  - Care remained `care:disabled`;
  - zero Care-6 disposable rows survived rollback.
- Viewable UI evidence: `docs/evidence/care-pr6/`.

## Exact external blockers

- Real assigned licensed clinicians and completed Care appointments.
- Real laboratory provider/order/result/private-object references and assigned
  qualified reviewers.
- Named clinical/support ownership and an approved operational incident process.
- All previously documented Care medical-group, state, pharmacy, privacy,
  consent, support, and activation approvals.
- Website 2 shared registration, ordered migration, merge, Render deployment,
  and live smoke.

PRODUCTION STATUS: NOT YET MERGED

UI CONSISTENCY STATUS: MATCHES EXISTING XENIOS
