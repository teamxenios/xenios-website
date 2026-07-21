# Member-platform contract reconciliation (FROZEN)

Root cause: PR #33 (backend) built to `docs/agent-coordination/contracts/
MEMBER_PLATFORM_API.md`; PR #32 (frontend) built to its own divergent
contract. Independent contract-compat review found ~11 endpoint mismatches.
This freezes ONE contract and assigns the convergence edits. **No lane merges
until both sides converge here.** Coordinator wiring (registrars +
assessment-reminder sweep into server/index.ts) happens AFTER convergence.

## Two systematic decisions (apply everywhere)

- **D-PATH (FROZEN): all member content routes live under
  `/api/research/member/*`.** This matches the already-merged surface
  (`/member/me`, `/member/catalog`, `/member/referrals`) and the frontend.
  → **Backend (PR #33) adds the `/member/` segment to every member route.**
  Admin routes stay `/api/admin/research/*`.
- **D-CODE (FROZEN): denials are `{ ok:false, code, message }`; the frontend
  MUST read `code` and route on it.** Backend already emits the correct codes
  (`recovery_session`→finish reset, `activation_required`→/research/activate,
  `membership_inactive`/`billing_*`→billing). → **Frontend (PR #32) reads
  `code` in `lib/api.ts` and the member pages route on it** (today it collapses
  every 403 to a generic "forbidden").

## Per-endpoint (canonical = frozen; fix + owner)

| Endpoint (FROZEN path) | Canonical shape (FROZEN) | Mismatch | Backend (PR #33) fix | Frontend (PR #32) fix |
|---|---|---|---|---|
| GET /api/research/member/overview | `{ok, overview:MemberOverview}` (assessment, blueprint{state,updatedAt}, currentXenios30/90, unacknowledgedDocuments, openQuestions, trackerUnlocked, nextAction{key,label,dueAt}) | frontend `setOverview(res.data)` + reads overview.assessment.state/plan/reviewedUpdate/orderIssue/subscriptionIssue/supportAnswer (wrong nesting + field names) | none (shape is canonical) | read `res.data.overview`; use the canonical field names (assessment, blueprint.state, currentXenios30/90, nextAction) |
| GET /api/research/member/profile ; GET /member/profile/sensitive ; PUT /member/profile | `{ok, profile:MemberProfileView}` | path only (`/profile`→`/member/profile`) | add `/member/` prefix | already reads `result.data.profile`; add sensitive+PUT consumers as needed |
| GET /member/agreements ; POST /member/agreements | `{ok, agreements:[{key,version,status,acceptedVersion,reacceptanceNeeded}]}` | backend serves `/agreements` (nobody calls it); frontend expects agreements embedded in a nonexistent `/member/membership` | move `/agreements`→`/member/agreements` | call GET/POST `/member/agreements`; drop the "embedded in membership" path |
| GET /member/assessment ; POST /member/assessment/responses (autosave) ; POST /member/assessment/submit | GET `{ok, definition, response, status:AssessmentStatusSummary}`; submit body `{confirmReviewed:true}`→`{ok,response,blueprintState}` | frontend does single POST `/member/assessment {mode,answers}`; reads `memberState.status==='submitted'` (status is an object) | add `/member/` prefix | use the two-POST autosave/submit shape; read `status.state==='submitted'` |
| GET /member/blueprint | `{ok, blueprint:BlueprintView|null, state}` (state at ENVELOPE top level; states include `not_started`, `assessment_submitted`, `assessment_due`) | frontend requires `candidate.state` INSIDE the blueprint object; state list omits `assessment_submitted`/`not_started` | add `/member/` prefix | read top-level `state`; add the missing states to BLUEPRINT_STATES |
| GET /member/plans/xenios30 ; POST /member/plans/xenios30/:planId/acknowledge | `{ok, current:PlanView, history:[]}`; acknowledge planId is a PATH param | frontend `/plans/xenios-30`, reads `body.plan??body.data`, POST `/xenios-30/acknowledge {version}` | add `/member/` prefix; keep `current` | path `xenios30` (no hyphen) under `/member/`; read `body.current`; acknowledge by planId path param |
| GET /member/plans/xenios90 | `{ok, plan:PlanView, review:MonthlyReviewState}` | path only (`xenios90` vs `xenios-90`, `/member/`) | add `/member/` prefix | path `xenios90` under `/member/`; (review optional to consume) |
| GET /api/research/member/capabilities | **DECISION D-CAP below** | backend returns object-map `{key:{enabled}}` over 5 provider keys; frontend expects ARRAY of `{capability,state,publicMessage}` over 15 keys | emit the array-of-objects shape (D-CAP) | keep array consumer; source UI-only gates (assessment/tracker/blueprint availability) from member state, not this endpoint |
| GET /member/tracker ; POST /member/tracker | `{ok, observation}` (TrackerObservationInput, 6 metric domains) | frontend posts `/member/tracker/log`, `/tracker/export-request`, `/tracker/delete-request`; **backend has NO tracker.ts at all** | BUILD tracker.ts (later wave) under `/member/tracker`; add export/delete-request routes | align to `/member/tracker` (+ export/delete once built); show pending until live |
| GET /member/documents | `{ok, documents:[...]}` | **backend has NO documents.ts**; frontend calls `/member/documents` | BUILD documents.ts (later wave) under `/member/documents` | show pending until live |
| (membership) GET /member/membership ; POST /member/cancel | to be specified | frontend calls both; neither exists in PR #33 | BUILD `/member/membership` (+ embed nothing agreements need) and `/member/cancel` (immediate access termination, forfeiture disclosure — founder decision) | call once built; agreements come from `/member/agreements` |

## D-CAP (capabilities endpoint) — FROZEN shape

`GET /api/research/member/capabilities` → `{ ok:true, capabilities: [
  { capability:string, state:'active'|'pending_credentials'|'coming_soon'|
    'disabled'|'unavailable'|'error', publicMessage?:string } ] }`.
Member-safe: booleans/enums + copy only, never env names/values. The 5 provider
capabilities (identity_verification, private_media, telegram_support,
infinity_events, document_rendering) are members of this array; UI-only gates
(assessment/tracker/blueprint availability) are NOT provider capabilities and
must be derived from member/overview state, not this endpoint. Backend emits
the array; frontend already consumes an array.

## Sequence (coordinator-enforced)

1. Backend converges (D-PATH prefix + D-CAP shape + build the missing
   tracker/documents/membership routes in later waves, flags default false).
2. Frontend converges (D-CODE code-routing + adapter field fixes +
   capability array source split). Also close B32.1 (error boundary).
3. Both declare stable heads.
4. Coordinator wires `registerMemberPlatformApi` + `registerCommerceApi` +
   the `sweepAssessmentReminders` timer into `server/index.ts` on the
   integration branch (conflict-free per merge-tree), runs an integrated
   route-smoke that proves each frozen endpoint answers with the frozen shape.
