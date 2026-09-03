# CODEX EXECUTION PROMPT

## Xenios Care request visibility, admin operations, reconciliation, and permanent reliability fix

Repository: `teamxenios/xenios-website`

Date of incident: September 3, 2026

Priority: P0 production reliability

Production mutation authority: Founder approval required for the exact release SHA. This prompt authorizes inspection, coding, testing, commits, pushes, pull request preparation, and release packet preparation. It does not authorize a production deploy, production migration, production environment change, real customer email, or any clinical action.

## Founder directive

A Xenios Care request was accepted in production and generated an internal email, but it was not discoverable in the admin surface Samuel was using. Fix the complete system so this cannot recur.

Do not produce only an audit, explanation, TODO list, mockup, or recommendation. Continue until the code, tests, admin UX, evidence, continuity records, and exact release packet are complete.

Do not ask Samuel to repeat project history. Read the repository continuity system and verify current reality yourself.

## Verified incident facts

Treat these as investigation inputs. Reverify them before editing because current Git and production truth outrank this prompt.

Production service:

```text
Render workspace: tea-d8nhh6a8qa3s73f4ocj0
Render service: srv-d8s9vej7uimc7384dfcg
Service name: xenios-website
Auto deploy: disabled
Repository: teamxenios/xenios-website
Configured Render branch: release/early-access-code-session-checkout
Verified production deploy SHA at incident review: 50c2d35cf543724fad17a61d9d5c36cf81fe5f21
Verified branch carrying that live SHA: codex/xenios-care-research-postlaunch-20260831
```

Incident request:

```text
Reference: CARE-2A99C6F7
Name: Seth Grant
Email: se.grant@icloud.com
Phone: 9704153774
State: Colorado, CO
Routing category: new Care request
Preferred contact: phone call
Best time: morning
```

Production evidence:

```text
2026-09-03T04:28:51Z
POST /api/care/access-request
HTTP 201
```

Admin evidence during incident review:

```text
GET /api/admin/me                              200
GET /api/admin/research/applications           200
GET /api/admin/research/assisted-orders        200
GET /api/admin/research/payments               200
```

The current admin did not request a dedicated Care access queue.

## Confirmed root cause at the incident SHA

The public Care request implementation in `server/care/manual-access.ts` saves requests through `insertLoi(...)` into `loi_submissions` using bounded operational markers:

```text
business_name: Xenios Care access request
role: care_access:<careGoal>
url_or_handle: preferred_contact:<contactMethod>
client_count: contact_window:<contactWindow>
source_page: /care/schedule
landing_page: /care/schedule
why_interested.schema: xenios_care_manual_access_v1
```

The writer correctly persists before sending email. Email delivery failure does not remove the durable request.

The defect is on the operational read side. There is no dedicated admin Care request projection, route, queue, navigation item, or status workflow. The only direct operational notice is email, and the row is mixed into the generic LOI store. Email must never be the system of record.

## Attached implementation package

Use the attached package named:

```text
XENIOS_CARE_ADMIN_RELIABILITY_PATCH_2026-09-03.zip
```

The package contains:

```text
apply_patch.py
files/shared/care/manual-access-admin.ts
files/server/care/manual-access-admin.ts
files/server/care/manual-access-admin.test.ts
files/server/care/manual-access-admin-wiring.test.ts
files/client/src/research/adapters/careAdmin.ts
files/client/src/research/pages/adminx/CareAccessRequests.tsx
```

The patch also applies fail closed anchor changes to:

```text
server/care/index.ts
client/src/research/lib/routes.ts
client/src/research/adminx-section.tsx
client/src/research/ui/shells.tsx
```

The package is a prepared implementation, not an unquestionable authority. Inspect it against the exact current repository. If current code has advanced, adapt the implementation rather than overwriting newer work. Preserve every requirement and negative control below.

## Mandatory source of truth order

Before editing, read and obey:

```text
AGENTS.md
CLAUDE.md
.xenios/MASTER_CORPUS.md
.xenios/FULL_VISION.md
.xenios/PROJECT_STATE.json
.xenios/RELEASE_STATE.json
.xenios/ACTIVE_TASKS.json
.xenios/SESSION_REGISTRY.json
.xenios/CODE_OWNERSHIP.json
.xenios/DECISIONS.md
.xenios/BLOCKED_EXTERNAL.md
.xenios/FOUNDER_ACTIONS.md
.xenios/LAUNCH_LANE_OWNERSHIP_2026-08-19.md
.xenios/prompts/UNIVERSAL_MODEL_AGNOSTIC_CONTINUITY_OS.md
docs/research-launch/XENIOS_RESEARCH_FULL_BUILD_STATUS_2026-08-19.md
latest .xenios/handoffs/**
latest .xenios/messages/**
```

Authority order:

1. Current production read only truth
2. Current Git remote and commit graph
3. Current worktrees and dirty state
4. Current `.xenios` continuity state
5. Latest exact SHA handoff
6. Current task and path ownership
7. This prompt and attached patch

Do not start from `main` merely because it is the default branch.

## Required startup procedure

Run and record:

```bash
pwd
git rev-parse --show-toplevel
git remote -v
git fetch --all --prune --tags
git status --short --branch
git branch --show-current
git rev-parse HEAD
git log -20 --decorate --oneline
git worktree list --porcelain
git branch -a --sort=-committerdate
node scripts/agentic/xenios-os.mjs validate
node scripts/agentic/xenios-os.mjs status
node scripts/agentic/xenios-os.mjs stale
node scripts/agentic/xenios-os.mjs next
```

Verify Render production, exact deploy SHA, configured branch, current branch heads, and whether any live process still writes to the old Care manual access worktree.

The prior Care manual access session was last recorded as active with an August 31 heartbeat. Treat it as a potential stale lease, not permission to destroy work. Preserve any dirty files before taking over paths.

## Branch and ownership procedure

Preferred isolated branch:

```text
codex/care-admin-reliability-20260903
```

Base it on the exact current production SHA if that remains the correct safe base, or on a verified clean descendant containing all current production code. Record the base SHA.

Claim only the required paths. Avoid unrelated refactors.

Expected path family:

```text
shared/care/manual-access-admin.ts
server/care/manual-access-admin.ts
server/care/manual-access-admin.test.ts
server/care/manual-access-admin-wiring.test.ts
server/care/index.ts
client/src/research/adapters/careAdmin.ts
client/src/research/pages/adminx/CareAccessRequests.tsx
client/src/research/lib/routes.ts
client/src/research/adminx-section.tsx
client/src/research/ui/shells.tsx
docs/research-launch/CODEX_XENIOS_CARE_ADMIN_RELIABILITY_MEGA_PROMPT_2026-09-03.md
.xenios handoff and session records required by the continuity OS
```

Do not edit `server/care/manual-access.ts` or `shared/care/manual-access.ts` unless a verified defect requires it. The current public writer already persists first and enforces the no clinical free text boundary.

Do not edit production data manually merely to make the UI look correct.

## Apply and inspect the prepared code

Place the extracted patch package outside or inside the repository, then run:

```bash
python path/to/XENIOS_CARE_ADMIN_RELIABILITY_PATCH_2026-09-03/apply_patch.py . --check-only
python path/to/XENIOS_CARE_ADMIN_RELIABILITY_PATCH_2026-09-03/apply_patch.py .
git diff --check
git status --short
```

If an anchor fails, stop the script, inspect the current file, and port the intended change manually. Do not weaken the implementation just to make the script pass.

## Required product outcome

A founder or authorized operations user must be able to open:

```text
/admin/research/care-requests
```

and immediately see every successfully saved public Care access request, including `CARE-2A99C6F7`, without asking the requester to submit again.

The UI must read through an admin only server endpoint:

```text
GET /api/admin/care/access-requests
GET /api/admin/care/access-requests/:requestId
PATCH /api/admin/care/access-requests/:requestId/status
```

Use the canonical `requireSupabaseAdmin` authorization chain. Do not create a second admin key, shared password, public bypass, client side role grant, or duplicated authorization system.

## Permanent reliability invariants

### Invariant 1. A successful public save is operationally visible

For every genuine response:

```text
POST /api/care/access-request -> 201 with saved: true
```

the durable row written by the public service must be discoverable through the authorized Care admin list endpoint.

Create a contract test using the exact output of `careManualAccessOperationsRecord(...)` and prove the admin projector recognizes and renders it.

### Invariant 2. Email is not the source of truth

Internal alert failure or requester confirmation failure must not hide or delete a saved request.

The admin list must display notification state and aggregate:

```text
notification failure count
notification unknown count
```

A saved request with failed email remains visible and marked for attention.

### Invariant 3. Schema drift fails visible, not invisible

A row carrying a strong Care marker but malformed or partially drifted operational JSON must remain in the queue with:

```text
dataQuality: malformed
attentionRequired: true
attention reason: malformed operational payload
```

Do not silently drop the record because one JSON field is invalid.

### Invariant 4. Generic LOIs do not leak into Care

Only rows with strong Care markers may enter the Care projection. Unrelated waitlist, LOI, coach, partner, or contact records must not appear.

### Invariant 5. No PHI expansion

The admin response may contain only bounded operational routing fields:

```text
id
public CARE reference
name
email
phone
state
routing category
preferred contact method
preferred contact window
operational status
email delivery status
created timestamp
data quality
attention reasons
```

Never return or render:

```text
IP address
raw why_interested JSON
referrer or UTM fields
internal generic LOI fields not needed for Care
symptoms
diagnoses
medications
allergies
laboratory results
medical records
clinical notes
clinician reasoning
prescriptions
```

The Care queue is an operations and routing surface, not a clinical chart.

### Invariant 6. Statuses are operational, not clinical

Approved statuses:

```text
New
Contacted
Secure intake sent
Provider handoff
Closed
Not moving forward
```

Do not add statuses such as approved for treatment, prescribed, diagnosed, medically eligible, or any other clinical fact.

### Invariant 7. Every route is discoverable and wired

Add a visible Care group and `Care requests` link to the existing Research operations admin navigation.

Add the route to the canonical `ADMIN_ROUTES` manifest and the mounted admin router.

A source wiring regression test must fail if the API registration, canonical guard, route manifest, admin route, adapter, or navigation link is removed.

### Invariant 8. Honest failure states

The admin list endpoint must return a bounded machine code on failure:

```text
care_access_admin_unavailable
```

The UI must show an honest unavailable state that says the request may still be durably saved and should not tell the customer to resubmit automatically.

### Invariant 9. Existing requests require no migration or resubmission

The fix should project the existing `loi_submissions` records. Do not create a competing Care request table merely to solve visibility. Do not require Seth or any prior requester to submit again.

A future normalized table may be designed separately, with a governed migration and dual read/backfill plan, but it is not required for this P0.

### Invariant 10. No hidden notification or integrity debt

The admin page must show summary metrics for:

```text
total
new
attention required
notification failures
notification unknown
data quality issues
```

The page must make failed or malformed rows visually explicit and searchable.

## Required admin UX

The queue should support:

```text
search by CARE reference, name, email, phone, or state
filter by operational status
filter by state
email action
phone action
status update
loading state
empty state
error state
unauthorized state
unavailable state
mobile and keyboard usable controls
```

Each request must display:

```text
CARE reference
name
submitted time
state
routing category
preferred contact
best contact time
email and phone
operational status
notification status
data quality warning when applicable
attention reasons
```

Display a permanent secure notice that clinical information belongs only in the authorized secure Care system.

## Server implementation review

Review the prepared `server/care/manual-access-admin.ts` for:

```text
closed projection
same durable store as public writer
inclusive strong marker recognition
malformed row visibility
strict output DTO
canonical admin guard
no store headers
safe reference lookup
strict status schema
Care row verification before mutation
bounded machine error codes
no PII in structured error logs
```

Confirm importing `requireSupabaseAdmin` into the Care registrar creates no dependency cycle. If a cycle exists in the current graph, extract the canonical guard into a neutral existing server auth module and update all existing callers in one coherent, fully tested change. Do not duplicate the guard.

## Test requirements

Run focused tests first:

```bash
npx vitest run \
  server/care/manual-access.test.ts \
  server/care/manual-access-admin.test.ts \
  server/care/manual-access-admin-wiring.test.ts \
  server/care/integration-wiring.test.ts
```

Then run:

```bash
npm run check
npm run build
npm test
```

Classify results as:

```text
PASS
FAIL caused by this change
PREEXISTING FAIL
ENVIRONMENT BLOCKED
NOT RUN
```

Do not call the release green while a change caused failure remains.

## Mandatory negative tests

Prove all of the following:

1. Unauthenticated request cannot list Care requests.
2. Non admin authenticated user cannot list Care requests.
3. Unrelated generic LOI never appears in Care.
4. Generic LOI cannot be status updated through the Care API.
5. Raw JSON, IP, UTM, and generic private fields are absent from the response.
6. Clinical field names are absent from the response.
7. Malformed Care payload remains visible and flagged.
8. Failed email remains visible and flagged.
9. Unknown email state remains visible and flagged.
10. Invalid status is rejected.
11. Public writer output maps directly into the admin projection.
12. Existing Seth style row resolves to `CARE-2A99C6F7`.
13. Route removal breaks the wiring test.
14. Admin UI does not grant authority in the browser.
15. Status update cannot create clinical facts.

## Reconciliation proof before release

Using authorized read only access, prove:

```text
number of durable Care access rows
number returned by the Care admin projection
number malformed
number with email failed
number with email unknown
```

The expected invariant is:

```text
all rows recognized as Care by the durable markers are returned by the admin projection
```

Do not print full customer lists, medical information, tokens, cookies, secrets, or raw database payloads into logs or handoffs.

For Seth, record sanitized proof only:

```text
CARE-2A99C6F7 exists in the durable store
CARE-2A99C6F7 is returned by the protected Care admin endpoint
CARE-2A99C6F7 renders in the admin queue
```

Do not ask Seth to resubmit.

## Browser and responsive QA

Test at minimum:

```text
1440 desktop
1024 laptop
768 tablet
430 mobile
390 mobile
360 mobile
320 mobile
```

Prove:

```text
no horizontal overflow
labels do not clip
email and phone wrap safely
status select remains usable
keyboard focus is visible
search and filters work
empty and error states are readable
no protected raw fields appear in DOM
```

## Observability and prevention work

Add or confirm the following without creating noisy or unsafe logs:

1. Structured server error messages for list, detail, and status failures. Never log request PII or raw payloads.
2. Admin summary counts for notification and data quality failures.
3. A focused synthetic test in non production that submits a valid nonclinical Care routing request and verifies the protected admin projection sees it.
4. A release smoke that checks the admin endpoint is registered and authorized.
5. Documentation stating that email is a notification channel, never the operational source of truth.
6. A future monitoring recommendation for a mismatch between successful Care saves and Care admin visibility. Do not add production data mutation merely for monitoring.

## Backward compatibility

Preserve:

```text
public Care request payload
public Care response shape
CARE reference semantics
existing email behavior
existing generic /admin LOI functionality
Research admin authorization
Research, Care, and RUO separation
no clinical free text rule
current production request rows
```

No migration should be necessary for this P0 because the existing durable rows contain sufficient bounded operational markers.

## Release discipline

Auto deploy is disabled, but never rely on that as the only safeguard.

Before any production action:

1. Commit and push the complete branch.
2. Record exact base and head SHAs.
3. Run focused tests, typecheck, build, full suite, and browser QA.
4. Verify no migration is required.
5. Verify no environment variable change is required.
6. Produce a release packet containing exact SHA, changed files, tests, risks, rollback SHA, and post deploy smoke plan.
7. Stop and request Samuel's explicit approval for that exact SHA.

Do not deploy from a branch name. Deploy only the approved exact SHA.

Do not update the stale Render configured branch merely to make names align unless that is separately reviewed and approved.

## Post deploy smoke plan, prepare only

After a later exact SHA approval and deployment, the smoke must verify:

```text
GET /api/health -> 200
GET /api/admin/me with Samuel session -> 200
GET /api/admin/care/access-requests with Samuel session -> 200
CARE-2A99C6F7 appears exactly once
/admin/research/care-requests renders the record
no generic LOI appears
status can move New -> Contacted and is durably reflected
no PHI or raw operational JSON appears
public Care request status remains available
public Care request submission contract remains unchanged
```

Do not change Seth's status during smoke unless Samuel explicitly approves that operational action. A read only proof is sufficient for the release smoke.

## Required continuity updates

Update the project continuity corpus according to current repository rules:

```text
ACTIVE_TASKS
SESSION_REGISTRY
CODE_OWNERSHIP
PROJECT_STATE
RELEASE_STATE
DECISIONS if a new durable decision is made
exact SHA handoff
message to release owner
```

Do not overwrite newer state. Preserve stale work before lease transfer.

## Required final response

Return this exact structure:

```text
[XENIOS CARE ADMIN RELIABILITY BUILD COMPLETE]

ROLE:
REPOSITORY:
BRANCH:
BASE SHA:
FINAL PUSHED SHA:
PRODUCTION SHA VERIFIED:
PRODUCTION MUTATED: NO

ROOT CAUSE:

IMPLEMENTED:

EXISTING REQUEST RECOVERY:
CARE-2A99C6F7 durable: YES/NO/BLOCKED
CARE-2A99C6F7 API visible: YES/NO/BLOCKED
CARE-2A99C6F7 UI visible: YES/NO/BLOCKED

ROUTES:

AUTHORIZATION:

DATA MINIMIZATION:

TESTS:
Focused:
Typecheck:
Build:
Full suite:
Browser QA:
Negative controls:

MIGRATION:
ENV CHANGES:

CHANGED FILES:

RISKS:

ROLLBACK SHA:

EXACT DEPLOY COMMAND OR RENDER ACTION PREPARED:

FOUNDER APPROVAL REQUIRED:
Approve deployment of exact SHA <SHA> to Render service srv-d8s9vej7uimc7384dfcg.

POST DEPLOY SMOKE:

NEXT EXACT ACTION:
```

Stop before production deployment. The completed build and release packet must be ready for Samuel's exact SHA decision.
