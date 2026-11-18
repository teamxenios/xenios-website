# First request workflow increment

This module adds `queued` and explicit `reviewing` beside the immutable request
receipt. It does not change `pending_review`, quote/clinical authority, the
canonical accountless EA session, or the existing staff notice sender.

Runtime settings are off unless their exact string value is `true`:

- `RESEARCH_REQUEST_WORKFLOW_ENABLED`, with required
  `RESEARCH_REQUEST_WORKFLOW_ENVIRONMENT` and ISO `RESEARCH_REQUEST_WORKFLOW_START_AT`.
- `EA_REQUEST_CUSTOMER_STATUS_ENABLED` for owner API availability. The frontend
  must retain its real receipt/support fallback until a status page exists.
- `RESEARCH_REQUEST_REVIEW_WRITE_ENABLED` for Start review.

The private `workflow_settings` row is independently disabled by default.
Activation requires the same pinned environment/cutoff, approved retention and
recipient policy versions, separately reviewed notification adapter, approved
process capability, current role and explicit per-actor deployment scope. The
migration assigns no actor or scope, approves no capability and sends no mail.
Replay preserves populated settings, approvals, scopes, history and intent IDs:
the migration replaces definitions and only its own triggers, without reseeding
existing rows. The PG fixture asserts this with disabled and populated replays;
only an actual passing fixture run qualifies `applyTwiceVerified` evidence.
Once a deployment/cutoff is pinned, ordinary setting updates cannot move it to
backfill historical requests.

The migration is `20261118024134_request_intent_workflow.sql`, reserved through
Supabase CLI by Root. Its winning-insert trigger creates initial received/queued
history, one existing-key staff intent and calls the notification adapter in the
same transaction. A missing/failing adapter refuses enabled first-slice writes;
it is never silently ignored. The adapter is another author's leased module:

```sql
request_intent_private.enqueue_workflow_notice(
  p_request_id uuid, p_event_id uuid, p_kind text,
  p_revision bigint, p_environment text
) returns void
request_intent_private.workflow_customer_notice(
  p_request_id uuid, p_event_id uuid
) returns text
```

The first callback receives `request_received_queued` for the revision 1 queued
event, or `request_reviewing` for revision 2. Both functions are private, with
PUBLIC/anon/authenticated/service-role execution revoked; the checked definer
transaction invokes them. The second returns only the strict DTO transport enum.
Customer dedupe/render/uncertainty/exception history belongs to that adapter and
the existing shared worker. Do not add another initial acknowledgement enqueuer.
Prior failures remain in the staff delivery ledger even when the public DTO
describes the newest event. The staff sender keeps its existing key and current
two-recipient envelope semantics.

The router adds exactly:

- `GET /:requestId/workflow` under the existing request-intent prefix, owned by
  the same canonical session/member owner as save/recover.
- `GET /staff/:requestId/workflow`, with the existing verified reader guard and
  database reader capability. Response is `{workflow, canStartReview}`.
- `POST /staff/:requestId/start-review`, with origin/JSON/rate controls, a current
  canonical verified staff principal, SDK current AAL2, the process permission,
  and a database recheck of role/capability/deployment scope. It takes only
  `{commandId, expectedRevision}`.

Root owns the protected Research wall extension. No `server/index.ts` change is
needed. The separate shared DTO exports strict schemas/parsers. Receipt parsing
and prior-attempt recovery remain unchanged. Wrong owner and absent request have
the same minimal private 404; unsupported inputs and raw SQL/provider diagnostics
never become request data. Reads do not depend on new intake being enabled.

`canStartReview` is an advisory server result. It requires current write settings,
same-subject MFA, active role, approved capability, explicit unrevoked deployment
scope and queued state. The command repeats these checks and locks current
scope/capability/role/projection rows before committing event and notification.
Concurrent reviewers have one winner; replay requires the same actor/request/
expected revision and command ID. Reading or reassignment does not create review.
An HTTP 409 returns only `{error: "workflow_revision_conflict"}`. The UI must
explicitly reread the staff workflow endpoint for the current revision/state and
action availability; it must not optimistically mark the request reviewing or
automatically retry a new command against a guessed revision.

The installed Supabase SDK's `getAuthenticatorAssuranceLevel(jwt)` checks the
provided token with `getUser(jwt)`. Only `currentLevel === 'aal2'` qualifies;
`nextLevel === 'aal2'` alone does not. This runs after the existing canonical
Care verifier and checks the same verified subject and live token expiry.
SDK/identity/audit outages authorize no write. The source tests use an explicit
fake Auth endpoint and do not qualify any actual staff session.

The explicit scope is the configured EA deployment, not a generic global-admin
bypass. Canonical requests and principals currently have no organization ID.
Organization-specific partitioning is unsupported and must remain unavailable;
never infer it from `contact.organizationName`, a body field or a role label.
The strict commands accept no organization/tenant selector. No cross-organization
acceptance is claimed by the tests.

`contract.pg.test.ts` runs the real canonical save and new SQL locks, constraints,
permissions and rollback in an owned PostgreSQL 16 database. Its notification
callback is explicitly synthetic to test transaction composition/failure. It
does not prove the separate sender, outbox custody or mailbox. Root must run
composed notification SQL and shared-worker tests on the final integrated head.
`routes.test.ts` bootstraps genuine canonical server-issued anonymous A/B cookies
without accounts/passwords, then tests route ownership with a fake RPC result;
it does not claim managed session durability. The native Claude smoke, managed
release and controlled real reply evidence remain separate.

Later lifecycle states, assignment/reassignment, notes, clarification/requeue,
contact correction and quote milestones are not implemented by this increment.
