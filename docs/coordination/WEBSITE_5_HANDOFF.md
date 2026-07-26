# Website 5 — Care PR 2 production handoff

## Release unit

- Session: WEBSITE 5 — XENIOS CARE FOUNDATION
- Feature domain: patient location, supported-state/clinician coverage,
  service eligibility, non-clinical waitlist, identity state, versioned Care
  consent, and independently versioned clinical-intake foundation
- Stacked base: accepted Care PR 1 head
  `6791656667eee7bdfa9605eb5e0bd869bbde5077`
- Feature branch: `feature/website-5-care-eligibility-intake`
- Pull request: `https://github.com/teamxenios/xenios-website/pull/56`
- Final frozen SHA: recorded in the PR and issue #44 after this committed
  handoff is pushed

Care PR 1 is live from application merge
`c09e6fe756ed924736baf603950c944f1ace619c`; the current docs-only production
successor is `45450eb947b8b96b1717989d915e7ecadd3f9c3d`. This branch is PR 2
only and is rebased from the rejected/superseded PR 1 head
`e1c5117ff0a671312f0f703c80a5690214c5c81c` onto the accepted corrected PR 1
head above. It does not contain appointments, clinician decisions,
prescriptions, pharmacy workflow, instructions, supplies, labs, secure
messaging, or adverse-event workflow.

## Included

- A Care-only patient identity projection linked to one Supabase Auth identity.
- Append-only current-physical-location attestations with idempotency and
  supersession linkage.
- An unseeded supported-state/service registry with database audit history.
- An unseeded clinician-state coverage seam that counts only users with an
  active `clinician` Care role and current, verified coverage.
- Server-authoritative eligibility decisions for disabled, location-required,
  unsupported-state, service-unavailable, clinician-unavailable,
  identity-unverified, consent-required, and intake-foundation-ready states.
- A hard invariant that mechanical readiness always records
  `care_eligibility_cleared = false`.
- Append-only patient-owned waitlist join/withdraw events, bound to the state
  returned by the server decision and containing no availability promise.
- Versioned telehealth/privacy document records, append-only grant/revoke
  events, and database-enforced immutability after document approval except
  for the one-way supersession transition. No document copy or version is
  seeded.
- Independently versioned Care intake definitions, drafts, immutable
  revisions, optimistic autosave, idempotent start/save/submit, and strict
  validation against the exact approved definition bound to the draft.
- Production Supabase repositories and ownership-bound Express route modules.
- Supabase bearer-session propagation in the browser and server rejection of
  password-recovery-purpose credentials.
- Stable safe 503 dependency boundaries with no adapter error text.
- Xenios-consistent loading, disabled, auth-required, error, retry,
  location-required, waitlist, success, and consent-unavailable UI states.

## Explicitly not included

- No supported state, clinician, medical group, consent text, clinical
  question, patient, pharmacy, product, price, availability, appointment,
  prescription, direction, supply, or treatment record is seeded.
- No automatic clinical clearance, treatment decision, prescribing,
  diagnosis, medical advice, or AI decision.
- No import from a Research assessment type, table, response, or question.
- No Care capability activation.
- No direct edit to Website 2-locked `client/src/App.tsx`, `server/index.ts`,
  or `client/src/components/Navbar.tsx`.

## Files

Shared contracts:

- `shared/care/eligibility.ts`
- `shared/care/consent.ts`
- `shared/care/intake.ts`
- `shared/care/contracts.ts`

Server:

- `server/care/eligibility.ts`
- `server/care/eligibility-repository.ts`
- `server/care/eligibility-routes.ts`
- `server/care/waitlist.ts`
- `server/care/consent.ts`
- `server/care/consent-repository.ts`
- `server/care/intake.ts`
- `server/care/intake-repository.ts`
- `server/care/intake-routes.ts`
- `server/care/production-deps.ts`
- `server/care/index.ts`

Client:

- `client/src/care/api.ts`
- `client/src/care/EligibilityPendingPage.tsx`
- `client/src/care/CareConsentPendingPage.tsx`

Migration:

- `supabase/care-eligibility-intake.sql`
- `supabase/tests/care-eligibility-intake-lifecycle.test.sql`
- `supabase/MIGRATIONS.md`

## Route delta

Focused modules provide:

- `GET /api/care/eligibility`
- `POST /api/care/eligibility/location`
- `POST /api/care/eligibility/waitlist`
- `POST /api/care/consents`
- `GET /api/care/intake`
- `POST /api/care/intake`
- `PATCH /api/care/intake/:intakeId/autosave`
- `POST /api/care/intake/:intakeId/submit`
- `/care/eligibility` client page
- `/care/consent` client page

Every API route requires the accepted PR 1 capability and Care-role boundary.
When Care remains disabled, the middleware returns `503 care_disabled` before
authentication, repository access, or patient mutation. When enabled later,
the self-service routes require a valid non-recovery Supabase JWT, an active
`care_patient` role, and the patient profile bound to that authenticated
subject.

## Website 2 locked-file wiring requests

Do not register PR 2 before both Care migrations are applied in order.

### `server/index.ts`

Extend the accepted PR 1 Care import:

```ts
import {
  buildCareEligibilityRepository,
  buildCareIntakeRepository,
  buildCareProductionDependencies,
  carePageGate,
  registerCareApi,
  registerCareEligibilityApi,
  registerCareIntakeApi,
} from "./care";
```

Replace the single PR 1 registration with one shared access dependency:

```ts
app.use(carePageGate);

const careAccess = buildCareProductionDependencies();
const careEligibility = buildCareEligibilityRepository();
const careIntake = buildCareIntakeRepository();

registerCareApi(app, careAccess);
registerCareEligibilityApi(app, careAccess, careEligibility);
registerCareIntakeApi(app, careAccess, careEligibility, careIntake);
```

Keep this block before the generic API 404 and SPA catch-all.

### `client/src/App.tsx`

Add with the existing lazy imports:

```ts
const CareSection = lazy(() => import("@/care/section"));
const CareEligibility = lazy(() => import("@/care/EligibilityPendingPage"));
const CareConsent = lazy(() => import("@/care/CareConsentPendingPage"));
```

Add the exact routes before the broad `/care/*` route:

```tsx
<Route path="/care/eligibility" component={CareEligibility} />
<Route path="/care/consent" component={CareConsent} />
<Route path="/care" component={CareSection} />
<Route path="/care/*" component={CareSection} />
```

Use the same `Suspense` loading treatment as the accepted PR 1 handoff. Do not
add a `/care/intake` client form until an externally approved definition exists.

### `client/src/components/Navbar.tsx`

Retain the accepted PR 1 narrow-mobile correction:

```tsx
className="btn btn-primary !hidden sm:!inline-flex"
```

PR 2 makes no shared Navbar edit.

## Migration delta

Apply after `supabase/care-access-foundation.sql`.

`supabase/care-eligibility-intake.sql` creates 13 forced-RLS tables:

1. `care_patients`
2. `care_patient_locations`
3. `care_supported_states`
4. `care_supported_state_audit`
5. `care_clinician_state_coverage`
6. `care_clinician_coverage_audit`
7. `care_consent_documents`
8. `care_consent_events`
9. `care_eligibility_checks`
10. `care_waitlist_events`
11. `care_intake_definitions`
12. `care_intakes`
13. `care_intake_revisions`

It also creates:

- fixed-search-path immutable-history, approved-version, and
  configuration-audit triggers
- active-clinician role/coverage validation
- `care_active_clinician_count(text, timestamptz)`
- atomic `care_intake_autosave(...)`
- atomic `care_intake_submit(...)`

Anonymous and authenticated browser roles receive zero table grants. Only the
service role may execute the clinician-count and intake transition functions.
The migration is additive, idempotent, creates no Research reference, and does
not change the canonical PR 1 capability row from `disabled`.

## Validation

Current branch-ready validation:

- Exact corrected ancestry: merge base is accepted Care PR 1
  `6791656667eee7bdfa9605eb5e0bd869bbde5077`.
- Scope parity: the 42-file PR 2 name/status delta is identical to rejected old
  head `0f44cdeb4c04b61e585363690655192ec3295e25`; no shared locked file was
  added.
- Focused Care/client/migration tests: 9 files / 49 tests passed.
- `npm run check`: passed.
- Fresh disposable PostgreSQL 16: corrected PR 1 migration applied, PR 2
  migration applied twice with `ON_ERROR_STOP=1`.
- SQL lifecycle passed:
  - no state, consent document, or intake definition existed after migration
  - location UPDATE and DELETE rejected
  - supported-state insert/update audit recorded
  - supported-state audit UPDATE and DELETE rejected
  - clinician coverage required an active clinician role and was audited
  - clinician-coverage audit UPDATE and DELETE rejected
  - active clinician count joined role, state, active, and expiry state
  - consent UPDATE and DELETE rejected
  - approved consent document content mutation/delete rejected
  - cross-patient consent-to-intake binding rejected
  - eligibility history UPDATE and DELETE rejected
  - waitlist history UPDATE and DELETE rejected
  - autosave replay returned one immutable revision
  - cross-patient autosave rejected
  - cross-patient submit rejected
  - stale-version autosave rejected
  - intake-revision UPDATE and DELETE rejected
  - approved intake definition content mutation/delete rejected
  - autosave and submit required the draft's exact approved definition
  - submission replay was idempotent
  - transaction rolled back to zero patient, state, consent, definition, and
    intake fixture rows
- All 13 PR 2 tables reported RLS plus forced RLS.
- PR 2 browser table grants for `anon`/`authenticated`: zero.
- Canonical PR 1 capability remained `care:disabled`.
- Full repository tests: 149 files / 3,171 tests passed.
- `npm run check`: passed.
- `npm run build`: passed (existing Vite large-chunk advisory only).
- Live PR 1 read-only verification passed at current production identity
  `45450eb947b8b96b1717989d915e7ecadd3f9c3d` /
  `dep-d9iqsaeq1p3s73flol2g`: health and Care status returned 200, Care
  remained disabled/Pending, 1440/375/320 layouts had no horizontal overflow,
  keyboard menu focus/Escape/focus-return passed, browser console errors and
  warnings were zero, and recent Supabase `care_capabilities` reads returned
  200. No account, role, record, or production configuration was mutated.

## UI evidence

Viewable evidence:

[`docs/care/evidence/PR2_UI_EVIDENCE.md`](../care/evidence/PR2_UI_EVIDENCE.md)

It covers desktop loading/disabled/error/location/consent states, 375px
waitlist and success, 320px retry, and 200%-reflow-equivalent behavior. Browser
console warnings/errors were zero. Temporary fixture and route wiring was
removed before validation.

UI CONSISTENCY STATUS: MATCHES EXISTING XENIOS

## External blockers and activation gates

The following remain external and intentionally absent:

- medical-group contract and configuration
- real supported-state approvals
- real clinician identities, licenses, role grants, and state coverage
- approved telehealth consent document/version/content hash
- approved Care privacy notice document/version/content hash
- approved clinical intake definition and question schema
- clinical support and privacy operations
- later Care PRs 3–7
- integrated security, mobile, accessibility, and production QA

Do not set the Care capability to `enabled` or both deployment approvals to
`true` until all later clinical release gates pass.

## Production verification after Website 2 release

1. Confirm Render is Live and deployed SHA matches merged main.
2. Confirm `/api/health` is 200.
3. Confirm the Care capability remains `disabled`.
4. Confirm every PR 2 API returns `503 care_disabled` before mutation.
5. Confirm `/care/eligibility` and `/care/consent` render truthful Pending
   states at desktop, 375px, and 320px.
6. Confirm no supported state, clinician, consent, or intake definition was
   fabricated during migration.
7. Confirm 13/13 PR 2 tables force RLS and browser grants remain zero.
8. Inspect Render and Supabase logs without exposing payloads or secrets.
9. Record migration, deployment, persona, authorization, mobile,
   accessibility, persistence, and logs evidence in issue #44.

## Next exact action

After Website 2 accepts this frozen PR 2 unit:

1. Keep PR 2 unchanged.
2. Remain available for PR 1/2 integration corrections and live Pending smoke.
3. Keep PRs 3–7 held and do not amend them as part of this ancestry correction.
4. Website 2 retains serialized migration, shared wiring, merge, deployment,
   and production verification.

PRODUCTION STATUS: NOT YET MERGED
