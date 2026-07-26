# Website 1 Remaining Scope

Reconciled against deployed production main
`efd2213b7687c2f6400ca35b2f846fa9e632d572` and the canonical required-input
contract in `shared/research/required-inputs.ts`.

| Requirement | Original assignment | Current implementation | Live production state | Classification | Remaining work | Owner | Release train |
|---|---|---|---|---|---|---|---|
| Server-authoritative initial-v2, six sections, 6–8 minutes | Assessment directive | Implemented and client-rendered from the server definition | Software deployed; collection fails closed | COMPLETE_AND_LIVE | Authorized production persona smoke after XR-MEM-012 approval | Website 2/6 | 0 |
| Historical initial-v1 completion | Assessment directive | Submitted v1 remains completion-equivalent and readable | Compatibility code deployed | COMPLETE_AND_LIVE | Production regression when an authorized historical persona exists | Website 6 | 0 |
| Active-member authorization | Assessment directive | `requireActiveMember` protects read, save, and submit | Signed-out API boundary returns 401 | COMPLETE_AND_LIVE | Authorized member persona smoke | Website 2/6 | 0 |
| Immutable health-data consent | Assessment/privacy directive | Collection requires explicit server configuration plus published, effective, hash-valid XR-MEM-012 | Counsel-approved content absent; collection correctly disabled | BLOCKED_BY_REAL_INPUT | Enter and independently verify the four canonical Assessment configuration inputs after Website 2 authorizes row creation | Legal owner + Website 2 | 0 follow-on |
| Withdrawal at any time | Privacy directive | Historical version/hash withdrawal; paused/closed subject sessions retain the privacy route only | Software deployed | COMPLETE_AND_LIVE | Browser test with an authorized historical acceptance | Website 2/6 | 0 |
| Server autosave and cross-device resume | Assessment directive | Server draft authoritative; optimistic revision and cycle protection | Software deployed; workflow activation gated | COMPLETE_AND_LIVE | Live two-session smoke after approved consent | Website 2/6 | 0 |
| Local failure fallback | Assessment directive | In-memory current-page fallback; browser persistence intentionally absent to prevent cross-account health leakage | Software deployed | COMPLETE_AND_LIVE | Verify copy and absence of Storage writes with an authorized persona | Website 6 | 0 |
| Hidden conditional answer deletion | Assessment directive | Client sends explicit null tombstones; server deletes the stored key | Software deployed; automated regression green | COMPLETE_AND_LIVE | Authenticated browser regression after activation | Website 6 | 0 |
| Idempotent submission and locked initial response | Assessment directive | State/revision guards and immutable initial submission | Software deployed; migration invariants verified | COMPLETE_AND_LIVE | Production retry smoke after activation | Website 2/6 | 0 |
| Monthly check-in | Assessment directive | Separate definition and UTC cycle with stale-month rejection | Software deployed; no eligible live workflow row | COMPLETE_AND_LIVE | Live current-cycle smoke after activation | Website 2/6 | 0 |
| Deterministic v2 recommendation compatibility | Assessment directive | v2 schedule/structure fields consumed; v1 fallback preserved | Software deployed | COMPLETE_AND_LIVE | Website 6 integrated regression | Website 6 | 0 |
| Durable Plan Brief generation | Assessment directive | Submitted responses are retry jobs; one Blueprint per response is structurally enforced | Software and invariant index deployed | COMPLETE_AND_LIVE | Production queue retry smoke after activation | Website 2/6 | 0 |
| Trainer review queue and minimum-necessary brief | Assessment directive | Server routes, audit, adapters, page, shared route, and restrained navigation implemented | Deployed; signed-out API boundary returns 401 | COMPLETE_AND_LIVE | Authorized admin persona smoke | Website 2/6 | 0 |
| Atomic human publication | Assessment directive | Advisory-locked RPC; one published Blueprint and one active monthly-plan draft | Migration and service-role-only RPC deployed and verified | COMPLETE_AND_LIVE | Authorized end-to-end publication smoke | Website 2/6 | 0 |
| Member acknowledgment | Assessment directive | Version-bound Blueprint flow; overview uses the sole published row | Software deployed | COMPLETE_AND_LIVE | Browser smoke with an authorized published record | Website 2/6 | 0 |
| One dominant member-home action | Acceleration directive | Assessment, review, monthly check-in priorities implemented | Assessment signals deployed | COMPLETE_AND_LIVE | Add domain-owned order/request signals through their canonical contracts | Website 2/3 | 0/1 |
| Canonical required-input/readiness governance | Private pre-launch/required-input directive | Shared object, persisted role guards, independent review, manifests, validators, launch transitions, admin UI, forced RLS, and audit are deployed | Migration `canonical_required_input_readiness` and Render deployment `dep-d9ip5pn41pts73an90m0` are Live | COMPLETE_AND_LIVE | Website 6 continues integrated verification | Website 2/6 | Shared |
| Assessment configuration required inputs | Private pre-launch/required-input directive | Four exact `RequiredInputDefinition` records cover approved XR-MEM-012 content, effective date, hash verification, and collection approval | Definitions exist only in the focused application candidate; no canonical row or manifest is created | COMPLETE_NOT_INTEGRATED | Website 2/6 review the exact head; Website 2 separately authorizes creation and canonical manifest approval when real evidence exists | Website 1 then Website 2 | 0 follow-on |
| Trainer assignment required inputs | Assessment/private pre-launch directive | Four exact definitions cover qualified identity, active state, minimum-necessary member scope, and accountable assignment ownership | Definitions exist only in the focused application candidate; no trainer or required-input row is fabricated | COMPLETE_NOT_INTEGRATED | Website 2/6 review; use canonical admin routes only after real trainer records and row creation are authorized | Website 1 then Website 2 | 0 follow-on |
| Plan-review ownership required inputs | Assessment/private pre-launch directive | Four exact definitions cover qualified reviewer, review ownership, independent verification, and correction/supersession policy | Definitions exist only in the focused application candidate; existing review routes remain unchanged | COMPLETE_NOT_INTEGRATED | Website 2/6 review; use canonical state transitions and readiness validation only after row creation is authorized | Website 1 then Website 2 | 0 follow-on |
| Full trainer assignment operator workflow | Assessment directive | Reviewer assignment storage and scoping exist; the required real facts are now named canonically | No canonical assignment mutation UI exists | PARTIALLY_IMPLEMENTED | Website 2 owns canonical operator integration; Website 1 verifies the Assessment handoff and minimum-necessary boundary | Website 2, reviewed by Website 1 | 0 follow-on |
| Fitness/nutrition document publication | Assessment directive | Human-review plan drafts are created; existing plan/document publication remains canonical | Draft creation deployed; complete authoring/revision integration remains shared | PARTIALLY_IMPLEMENTED | Website 2 integrates canonical plan authoring/publication; Website 1 verifies Assessment handoff and member acknowledgment | Website 2, reviewed by Website 1 | 0 follow-on |
| Internal member and trainer seed states | Private pre-launch directive | No Website 1 seed records, roles, or namespaces exist | Prohibited; real-member and reviewer paths remain isolated | BLOCKED_BY_REAL_INPUT | Wait for explicit Website 2 approval after repository, RLS, analytics, notification, external-action, and reset isolation proof | Website 1 after Website 2 approval | Pre-launch follow-on |
| Trust reviewer and content reviewer required inputs | Private pre-launch/trust directive | Trust layer remains queued; no Trust definition is included in this unit | Not started | INTENTIONALLY_DEFERRED_WITH_APPROVAL | Begin only in focused Train 4 work after sequencing authorization | Website 1 | 4 |
| Trust/evidence/quality layer | Report directive | Governing scope is queued; no Trust code is mixed into this unit | Not started | INTENTIONALLY_DEFERRED_WITH_APPROVAL | Start fresh five-wave branches only after the approved sequencing gate | Website 1 | 4 |

## Focused application boundary

- Domain: `research_assessment`
- Proposed canonical definition count: 12
- Persisted required-input rows created: 0
- Readiness manifests approved: 0
- Launch transitions requested: 0
- Seed namespaces, roles, or records created: 0
- External provider actions: 0
- Canonical mutation paths remain:
  - `POST /api/admin/research/required-inputs`
  - `POST /api/admin/research/required-inputs/:id/transition`
  - `PUT /api/admin/research/readiness/:domain/manifest`
  - `POST /api/admin/research/readiness/:domain/transition`
