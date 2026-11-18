# AE canonical adapter and API contract

Task: EA-AE-CANONICAL-ADAPTER-20261118. Author: existing PR #500 owner.
Current behavior reference: e7fb20a28788879f1d85232b954f23a03ba5d0d2.
This is isolated source preparation. Root retains actual application mounting,
Care role registration, migration registration and release actions. Candidate
SQL is not an installed schema, a granted production role or an enabled portal.

## Stable frontend boundary

The owned registration module will register these exact relative routes beneath
`/api/research/account-executive`. Root mounts it only after durable authority,
verified session resolution and the relevant policy qualify.

| Method/path | Body | Result |
| --- | --- | --- |
| GET `/workspace` | none | Existing strict `{ok:true,value:AeWorkspace}` from the shared contract |
| POST `/commands` | Existing strict `record_followup` or `reassign` command | `{ok:true,value:AeCommandReceipt}` |
| POST `/assignments` | `{commandId,customerAuthUserId,assigneeAuthUserId}` UUIDs only | Audited initial assignment receipt; requires explicit assigning capability |
| POST `/identity-claims` | `{commandId,requestId}` UUIDs only | Minimal `{requestId,claimId,replay}`; canonical verified member and original guest proof come from the server, never the body |

There is no body actor, scope, grant, owner hash, contact, referral or session
field. Scope is selected by Root's trusted server composition. A frontend must
bind parsed results to the verified current actor and selected organization
context and discard stale results after either changes.

All responses are private/no-store. Errors are closed `{ok:false,code}` envelopes:
`invalid_input` HTTP400, unauthenticated `access_denied` HTTP401, authenticated
`access_denied` HTTP403, `not_found` HTTP404, `revision_conflict` and
`idempotency_conflict` HTTP409, `unavailable` HTTP503. No raw source error or
customer payload is reflected. No automatic mutation retry occurs.

Example followup command:

```json
{"kind":"record_followup","commandId":"00000000-0000-4000-8000-000000000009","assignmentId":"00000000-0000-4000-8000-000000000006","customerAuthUserId":"00000000-0000-4000-8000-000000000003","expectedRevision":3,"purpose":"contact_customer","dueAt":"2026-11-19T14:00:00.000Z"}
```

The three fixed purposes remain contact_customer, request_status_followup and
documentation_followup. Reassign uses the same command/assignment/customer/
revision identity with `kind:"reassign"` and `nextAssigneeAuthUserId`.
Keep the exact frozen command after an uncertain result; changing any field
under its command ID conflicts while authorization still exists.

## C3 contract corrections before the concrete adapter

1. Service reads and commands require a server-verified
   `{authUserId,purpose,sessionId}`. Recovery, missing session identity and bare
   user IDs are denied before any port call. Purpose belongs to the request
   session and is absent from user-keyed grant authority. The concrete adapter
   receives the exact verified session ID on every operation.
2. Reassignment transfers every open followup to the new current assignee in the
   same transaction. Its receipt has `followupTransfers`, each bound to the
   main reassignment audit ID and time, with the task ID and old/new owners.
   Completed tasks keep their original owner and remain visible only with
   scoped assignment history proving that owner. They are not silently dropped
   or rewritten. An empty transfer list is valid only when there were no open
   tasks. A former assignee cannot replay through the old receipt after transfer.
3. Request sources carry actual `ownerHash`; a member request must match the
   existing canonical member owner-hash namespace. An equal-email guest hash
   fails. A future verified guest claim must preserve its actual guest hash and
   prove the existing binding custodian plus exact original guest session; it
   must never be relabeled as a member hash.

UUID output is lowercase. A post-commit authority expiry is an uncertain
`unavailable` result, rather than a false assertion that nothing committed.

## Qualification state

The predecessor's 56 cases and six hosted checks passed in run44387206588.
Those were mock-port/source evidence. The new finite contract cases and the
concrete SQL/adapter/route/PG work must qualify separately. No local heavy job,
managed schema/data/config change, merge, deployment or production grant is
authorized by this document.
