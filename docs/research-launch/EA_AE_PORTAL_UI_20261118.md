# Connected AE portal frontend

Task: `EA-AE-PORTAL-UI-20261118`. Author: `codex-ea-ae-portal-ui-20261118`.
Base: `c48b59bc6be4f618700fc02a5920be9ca63ad5a2` from existing PR500.
This is an unmounted source slice. It grants no role, installs no schema,
changes no production behavior and supplies no substitute data.

## Root composition contract

`client/src/research/account-executive/AeWorkspacePage.tsx` exports the named
and default `AeWorkspacePage`, plus `AePortalSession` and
`AeWorkspacePageProps`. Root owns the private route, layout, navigation,
ordinary sign-in adapter and approved operational scope.

Pass these props:

- `session`: `checking`, `signed_out`, `recovery`, `unavailable`, or `ready`
  with `{actorAuthUserId, accessToken, sessionInstance}`. Obtain these from the
  existing canonical Auth shell. A ready state must represent an ordinary
  verified session, with one stable opaque `sessionInstance` for that lifetime.
  The page neither creates an Auth client/store nor calls member-only or
  unrelated admin endpoints. Do not derive AE permission from browser JWTs.
- `scopeId`: one server-approved operational scope UUID, and optional
  `scopeLabel`. This is not an assertion of legacy research-organization
  membership and there is no scope selector or scope value in a request body.
- `journal`: create once using `createAeCommandJournal(sessionInstance,
  actorAuthUserId, scopeId)` from `workspace-api.ts`. Retain it above page/child
  remounts for that exact actor, ordinary session and operational scope. Replace
  it on sign-out, recovery, identity/session replacement or scope change; retain
  it through same-session credential refresh. It holds only frozen commands,
  original open-task IDs and outcome status, never tokens/contact/receipts.
  A missing/mismatched journal permits readback only. Do not recreate it to
  clear an uncertain operation.

The server remains authoritative for session purpose, active role, scope,
current assignment, capabilities, revision and receipt access. Browser fences
only discard work after context changes; they grant no authority. The route
must remain private/noindex through Root's existing shell.

## Connected behavior

The API uses only authenticated `GET /api/research/account-executive/workspace`
and `POST /api/research/account-executive/commands`. Responses are checked with
the existing strict schemas/model and bound to the current actor/scope. The
adapter checks command/revision/customer/audit/follow-up/transfer relationships;
no raw server diagnostic is rendered. GET/POST use same-origin credentials,
no-store, a bearer header, and no redirects. Each request has a 30-second
local wait bound and no automatic retry. A timeout/invalid POST response is
uncertain, even if abort was attempted, because the operation may have committed.

Loading, validated empty assignments, denied access, recovery, expired session
and service unavailability have distinct screens. A failed read never becomes
an empty customer list. Ready data is hidden during the render observing a
credential/actor/scope/session change; late GET/POST results cannot revive it.

Each assigned customer shows permitted contact, actual receipt/workflow status,
fixed-purpose follow-ups, redacted original-referral presence, canonical
referrer state and available scoped assignment history. Missing history is not
reported as zero events. No clinical fields, supplier costs, commission data,
raw referral input or fabricated name/account directory is supplied.

Follow-up/reassignment requires an explicit confirmation. Reassignment accepts
the existing contract's approved target account UUID because the contract has
no assignee-directory endpoint; Root may later compose a separately authorized
picker. A typed UUID does not grant that assignee any server capability.

The first confirmation freezes command UUID, assignment/customer identity,
revision, purpose/due date or target assignee and original open-task IDs. The
memory journal prevents another command while an outcome is pending/uncertain,
including across page remounts. Retry sends the same command bytes; it never
changes revision or mints another ID. No new mutation is triggered by refresh.

Customer details disappear before POST. Successful receipts yield generic
confirmation only, followed by an explicit fresh read. A lost reassignment
response can be followed by the former assignee's `not_found` denial; the UI
retains no old contact/receipt display or special receipt-reading capability.
A denied attempt remains terminal within its journal; conflicts require a fresh
read and new explicit confirmation. Unknown outcomes are not inferred from a
later changed assignment revision.

An independent review found that a GET begun after remount/credential refresh
could return the old assignment while its original reassignment POST was still
held. The successor conceals that entire customer's article by canonical
customer ID whenever the retained reassignment is pending, uncertain or denied,
even if another GET returns the customer. Unrelated customers may still be
read. The concealed rows are not reported as an empty assignment list. Neither
refresh nor remount clears the original command or releases this private-render
fence. A former-assignee 404 keeps the affected customer concealed, including
through another old-data GET in that same journal lifetime.

## Verification and remaining work

The two new test files author 46 API/React cases: strict envelopes/status/body,
actor/scope/receipt contamination, complete transfer evidence, stale dispatch
and parsed replies, bounded lost responses, canonical Auth-state screens,
render-time actor/scope/session/token fencing, confirmation/double submit,
same-command retry/remount, former-assignee denial, conflict and sign-out.
Two added regression cases hold the actual page POST through remount or token
refresh, complete a GET carrying the old customer, then lose the POST reply and
retry the unchanged command into a former-assignee 404. They require no customer
article/contact before or after uncertainty/denial, and after another refresh.
They use synthetic DTOs and mocked transport only inside tests; the actual page
has no mock fallback. Cases are authored, not a runtime pass until executed.
Pinned Node20.19/TypeScript5.6 static AST parsing of all four new TypeScript
files reported zero syntax diagnostics; this executes no application imports,
typechecker or tests.

This author has not run local tests, a typecheck/build, install, browser, app,
provider, database, service/controller or deployment. Root retains allocation,
exact-source hosted qualification, independent review, backend adapter and
route/sign-in/layout composition. Browser viewport/accessibility verification,
managed schema/role grants and actual connected operational proof remain open.
No new route, Auth authority or production release is claimed by this slice.
