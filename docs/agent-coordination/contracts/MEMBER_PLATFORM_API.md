# Member Platform API contract (Website 2 lane, G2-G5 + G10)

Status: FROZEN at the lane's first milestone per the freeze protocol in
`docs/agent-coordination/blitzscale/API_CONTRACTS.md`. Types live in
`shared/research/member-platform.ts` (import as `@shared/research/member-platform`).
Extend additively; breaking changes go through the coordinator.

Conventions (inherited from merged code, do not re-invent):

- Envelope: success `{ ok: true, ... }`; denial `{ ok: false, code, message? }`.
- Guards: `requireMember` (JWT, denies recovery-purpose sessions with
  `recovery_session`), `requireActiveMember` (adds status + billing checks:
  `activation_required` | `billing_past_due` | `membership_inactive`),
  `requireSupabaseAdmin` (Samuel-only; also denies recovery sessions). No new
  parallel auth.
- Every member/admin JSON response sets `Cache-Control: no-store` and
  `Referrer-Policy: no-referrer`.
- All routes below are registered by `registerMemberPlatformApi(app, deps)`
  exported from `server/research/member-platform.ts`. NOBODY edits
  `server/research/index.ts`; the coordinator wires the one-line call.
- Rate limits reuse `server/research/rate-limit.ts`.
- `POST` bodies are JSON; validation failures return
  `{ ok:false, code:"validation_failed", fieldErrors }`.

Additional machine codes this lane introduces: `not_found`,
`state_conflict` (illegal state transition or stale version),
`rate_limited`, `capability_disabled`, `admin_required`.

---

## 1. Member overview

`GET /api/research/member/overview` — guard: requireActiveMember

Response: `{ ok: true, overview: MemberOverview }`

`MemberOverview` carries member/billing/application state, assessment summary
(with `dueAt` = activation + 3 days), blueprint state, current plan heads,
unacknowledged document count, open question count (open = any status other
than `completed`), `trackerUnlocked`, and one computed `nextAction`.

## 2. Member profile

`GET /api/research/profile` — guard: requireActiveMember
Response: `{ ok: true, profile: MemberProfileView }` (non-sensitive sections only)

`GET /api/research/profile/sensitive` — guard: requireActiveMember
Response: `{ ok: true, sections: ProfileSection[] }` (the
`SENSITIVE_PROFILE_SECTIONS` set; separate endpoint so ordinary account
surfaces never fetch health-adjacent data)

`PUT /api/research/profile` — guard: requireActiveMember
Request: `ProfileUpdateRequest` (one section per call; `schemaVersion` must
match the server's current section schema or `state_conflict` is returned)
Response: `{ ok: true, section: ProfileSection }`

## 3. Assessment definition + state

`GET /api/research/assessment` — guard: requireActiveMember
Response:
`{ ok: true, definition: AssessmentDefinition, response: AssessmentResponseState, status: AssessmentStatusSummary }`

The definition is versioned; adaptive branching is declared per question via
`showWhen`. `status.dueAt` is the 3-day deadline for the initial assessment.

## 4. Assessment autosave

`POST /api/research/assessment/responses` — guard: requireActiveMember
Request: `AssessmentAutosaveRequest` (partial answers; server merges by
`questionId`; stale `definitionVersion` returns `state_conflict` with the
current version in `message`)
Response: `{ ok: true, lastSavedAt: string }`
Rate limit: 30/minute per member.
Consent gate: the Sensitive Health Data Consent (agreement key XR-MEM-012, a
separate acceptance presented at first entry into the assessment) must be
accepted at its current version before any answer is stored; otherwise 409
`state_conflict` naming XR-MEM-012. The same gate applies to submission.

## 5. Assessment submission

`POST /api/research/assessment/submit` — guard: requireActiveMember
Request: `AssessmentSubmitRequest` (`confirmReviewed: true` is mandatory)
Response: `{ ok: true, response: AssessmentResponseState, blueprintState: BlueprintState }`
Effects: locks the response, unlocks the tracker, and moves Blueprint state to
`assessment_submitted`. The submitted response row IS the Blueprint-generation
queue entry (the Blueprint wave consumes `status = submitted` rows with no
blueprint); review-SLA notifications fire from the SLA sweep wave. Submitting
twice returns `state_conflict`.

## 6. Blueprint

`GET /api/research/blueprint` — guard: requireActiveMember
Response: `{ ok: true, blueprint: BlueprintView | null, state: BlueprintState }`
Members see `preliminary` content ONLY once published; before that the view
carries state + placeholders, never draft recommendations.

`POST /api/research/blueprint/acknowledge` — guard: requireActiveMember
Request: `BlueprintAcknowledgeRequest` → `{ ok: true, acknowledgedAt: string }`

Samuel-only:
`GET /api/admin/research/blueprints?state=samuel_review&cursor=` — requireSupabaseAdmin
Response: `{ ok: true, page: AdminQueuePage }`
`POST /api/admin/research/blueprints/:blueprintId/review` — requireSupabaseAdmin
Request: `BlueprintReviewAction`; publish is server-authorized here and NOWHERE
else. Response: `{ ok: true, state: BlueprintState }`

## 7. Xenios 30

`GET /api/research/plans/xenios30` — guard: requireActiveMember
Response: `{ ok: true, current: Xenios30Plan | null, history: { planId: string; monthLabel: string; state: PlanPublicationState }[] }`

`POST /api/research/plans/xenios30/:planId/acknowledge` — requireActiveMember
Response: `{ ok: true, acknowledgedAt: string }`

`POST /api/research/plans/early-change` — guard: requireActiveMember
Request: `EarlyPlanChangeRequest`. One per calendar month is included;
a second returns `state_conflict`. Response: `{ ok: true, review: MonthlyReviewState }`

## 8. Xenios 90

`GET /api/research/plans/xenios90` — guard: requireActiveMember
Response: `{ ok: true, plan: Xenios90Plan | null, review: MonthlyReviewState }`

## 9. Documents

`GET /api/research/documents` — guard: requireActiveMember
Response: `{ ok: true, documents: PlanDocument[] }` (current + archived; member's own only)

`POST /api/research/documents/:documentId/access` — guard: requireActiveMember
Response: `{ ok: true, grant: DocumentAccessGrant }` (short-lived signed URL,
10-minute TTL; `capability_disabled` while document rendering/storage is
disabled)

`GET /api/research/documents/:documentId/download?exp=&sig=` — guard:
requireActiveMember PLUS the signed grant. Additive amendment: the `signedUrl`
returned above points here. Three independent checks must all agree, so a
leaked URL alone is never sufficient:

1. an active member session (the same guard as every member route),
2. a valid, unexpired HMAC that binds the member id into the signature
   (constant-time comparison),
3. a fresh ownership re-read of the document row at use time.

Every denial returns an identical `403 { ok: false, code: "not_found" }`
regardless of which check failed, so probing distinguishes nothing. A row that
exists and is owned but whose bytes are missing returns `404 not_found` with a
different message, because that is an operational gap rather than a denial.
`capability_disabled` (409) while the capability is off; no URL is ever
fabricated in that state.

`POST /api/research/documents/:documentId/acknowledge` — requireActiveMember
Request: `DocumentAcknowledgeRequest` → `{ ok: true, acknowledgedAt: string }`

Documents are never emailed as attachments; email carries a notification plus
a link into the member Document Center.

## 10. Tracker

`GET /api/research/tracker` — guard: requireActiveMember
Response: `{ ok: true, progress: TrackerProgressView }`; `progress.unlocked` is
false (with empty metrics) until the assessment is submitted. `windowDays`
query param: 7 | 30 | 90 (default 30).

`POST /api/research/tracker` — guard: requireActiveMember
Request: `TrackerObservationInput` → `{ ok: true, observation: TrackerObservation }`
Denied with `state_conflict` while the tracker is locked. Six metric domains
only; there is no composite health score anywhere in the contract.

## 11. Private media

`POST /api/research/media/intent` — guard: requireActiveMember
Request: `MediaUploadIntentRequest`. First upload requires `retentionElection`.
Response: `{ ok: true, grant: MediaUploadIntentGrant }`
(`capability_disabled` while private media storage is disabled.)

`GET /api/research/media` — guard: requireActiveMember
Response: `{ ok: true, media: PrivateMediaRecord[] }`

`POST /api/research/media/:mediaId/access` — guard: requireActiveMember
Request: `{ variant: "raw" | "face_blurred" | "transcript" }`
Response: `{ ok: true, grant: MediaAccessGrant }`

`DELETE /api/research/media/:mediaId` — guard: requireActiveMember
Response: `{ ok: true, deletedAt: string }`

`PUT /api/research/media/retention-election` — guard: requireActiveMember
Request: `{ retentionElection: RetentionElection }` → `{ ok: true }`
Raw deletion happens only after verified successful processing AND the
delete election; failed processing never deletes the only copy.

## 12. Questions

`GET /api/research/questions` — guard: requireActiveMember
Response: `{ ok: true, questions: MemberQuestion[] }` (member's own; no queue numbers)

`POST /api/research/questions` — guard: requireActiveMember
Request: `QuestionCreateRequest` → `{ ok: true, question: MemberQuestion }`
Rate limit: 10/hour per member.

`POST /api/research/questions/:questionId/rate` — requireActiveMember
Request: `QuestionRateRequest` → `{ ok: true }` (only `answer_ready`/`completed`)

## 13. Telegram linking

`POST /api/research/telegram/link` — guard: requireActiveMember
Response: `{ ok: true, link: TelegramLinkStart }` (single-use token, short
expiry; `capability_disabled` without a configured bot)

`GET /api/research/telegram` — guard: requireActiveMember
Response: `{ ok: true, state: TelegramLinkState }`

`DELETE /api/research/telegram/link` — guard: requireActiveMember
Response: `{ ok: true }` (revokes the link)

`POST /api/research/telegram/webhook` — guard: webhook secret validation
(constant-time compare), NOT a member session. Replayed link tokens are denied
and audited. Telegram never carries passwords, reset tokens, IDs, payment
data, assessments, private media, or sensitive PDFs.

## 14. Samuel queues

`GET /api/admin/research/queues/:queue` — guard: requireSupabaseAdmin
`:queue` is one of `ADMIN_QUEUE_KEYS` (applications, identity_status,
agreement_status, assessment_due, blueprint_review, monthly_plan_review,
questions, account_blocks, privacy_requests, security_events, sla_risk,
product_concerns). Query: `cursor`, `limit` (max 100), `priority`.
Response: `{ ok: true, page: AdminQueuePage }` (safe summaries + opaque
subject refs in lists; PII only in the detail endpoint below)

`GET /api/admin/research/queues/:queue/items/:itemId` — requireSupabaseAdmin
Response: `{ ok: true, item: AdminQueueItem, detail: object }` (detail is
queue-specific and server-authorized; actions that change member state carry
`requiresStepUp: true` markers)

`POST /api/admin/research/questions/:questionId/answer` — requireSupabaseAdmin
Request: `{ answerText: string, status: "answer_ready" | "more_information_needed" }`
Response: `{ ok: true, question: MemberQuestion }`

## 15. Capability states

`GET /api/research/capabilities` — guard: requireActiveMember
Response: `{ ok: true, capabilities: Record<MemberPlatformCapability, { enabled: boolean }> }`
Member-safe booleans ONLY (G0 contract).

`GET /api/admin/research/capabilities` — guard: requireSupabaseAdmin
Response: `{ ok: true, diagnostics: AdminCapabilityDiagnostic[] }`
Names and states only; never values.

## 16. Agreements (G2)

`GET /api/research/agreements` — guard: requireMember (NOT requireActiveMember:
agreements precede activation, so a pending_activation member reads and signs)
Response: `{ ok: true, agreements: [{ key, version, title, required, trigger, status, separateConsent, acceptedVersion, reacceptanceNeeded }] }`
Definitions are the paperwork register's activation bundle (XR-MEM-001/002/004/
005/006/026, XR-PUB-007) plus XR-MEM-003 and the assessment-stage XR-MEM-012;
all version `0.1.0-draft` with honest `status: "draft"` pending counsel.

`POST /api/research/agreements` — guard: requireMember, plus a server-side
status rule: only `pending_activation` and `active` members may record
decisions (others get 409 `state_conflict`).
Request: `{ decisions: [{ key, version, decision: "accepted" | "declined" }] }`
Rules enforced server-side: `separateConsent` keys (XR-MEM-003, XR-MEM-012)
must arrive as the ONLY decision in their call (bundling → `validation_failed`);
stale versions → `state_conflict` with the current version; acceptances are
append-only rows (sha256-hashed request metadata, never raw IP/UA); latest row
per key wins; `reacceptanceNeeded` flips when a definition version moves past
the accepted one.

---

## Application-state mapping note (frozen machine)

The merged 12-status machine in `shared/research/membership-types.ts`
(`APPLICATION_STATUSES` + `ALLOWED_TRANSITIONS`) is the single source of truth
and is NOT redefined by this lane. The Supreme directive's state names map as:
`pending`→`submitted`, `information_requested`→`more_information_requested`,
`identity_pending`/`agreements_pending`/`activation_pending`→ sub-steps of
`approved_pending_payment`/`payment_pending` tracked by `MemberBillingState`
plus the identity/agreement records this lane adds. Application review APIs
already LIVE in main (`/api/admin/research/applications*`) are extended, not
rebuilt.

## Fixtures

Deterministic fixtures for every payload above ship in
`server/research/member-platform-fixtures.ts`, guarded by
`assertFixturesAllowed()` (throws in production). Tests and the UI storybook
consume fixtures; production never serves them.
