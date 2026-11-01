# KAN-29: current-source binding and bounded qualification input

Status: preparation complete; execution HELD. Existing Root owns this addendum under
`KAN29-OPERATOR-QUALIFICATION-INPUT-20261031`. It implements Samuel's October 31
continuation by bringing forward the existing W1-D decision and specifying its next
executable operation. It changes no application, database, account, configuration or
production state. KAN-29, KAN-109 and the full Quick Order journey remain incomplete.

## Reuse the existing decision

The private `STAFF_ACTIVATION_DECISION.md` remains unchanged at SHA-256
`aa5850c20ddfe2b5fcdb21dc83b5c4e9db62b116e7cdc1f386eb81204a4ef340`.
KAN-29/10239 records that packet; 10241 records its independent **source-scope**
acceptance by the distinct `samuel/work-claude` reviewer. Neither is activation
authority. This addendum supplies current bindings and a bounded qualification scope;
it does not replace the private decision, re-review it, or copy private identifiers.

Recorded live application: `6c63aa923c457c1bdaec5a94c3bbe9b8d4664f7f`, tree
`75b7c3eef86340e17e47e0b033dbc8b6fab927ca`, deploy
`dep-dbj5m57avr4c73bnubj0`. Release/static verification is closed. Source bindings
below do not constitute a new production inspection. Corrected PR353
`2981d60a39bc8975d28dc2d5889d11dc2030546c` remains separate pending exact acceptance.

All ten files examined for the original `8efa9a9e` decision are byte-identical at
the recorded live release:

| File | Blob at both sources |
| --- | --- |
| `shared/care/contracts.ts` | `ac99623c3a795e9b00699a1347078861bd96b3bb` |
| `server/care/access.ts` | `a8e4bea90630ecde7998affeab5ab052ff7fad35` |
| `server/care/production-deps.ts` | `13c259d640c2d5f86e6a3aa35b2f5f6802f52491` |
| `server/care/appointment-routes.ts` | `5934898114f8d14a13febbe814698e76bc4a4ee9` |
| `server/care/prescription-routes.ts` | `67cc656447ba460bd912a26a6e9a950e81f51caa` |
| `server/research/assisted-order/request-intent/staff-read-authority.ts` | `a245f2079363c100d9df9512ad5bbcf2e2371c46` |
| `server/research/assisted-order/request-intent/production.ts` | `14fb8ca3de075a03bdaf53079cb67e50e5045912` |
| `client/src/care/CareRequestIntentPage.tsx` | `6048e285bfac1bf09ae33a8f954b4f19680bb1bd` |
| `supabase/care-access-foundation.sql` | `daf25849eac55059c02aa22f8947ee4a2c0feea1` |
| `supabase/candidates/mixed_catalog_request_intent.sql` | `10eefab8a199709c5cb1f0b847c72e71d6371f63` |

The operator route, canonical sign-in, verified principal resolver, role check,
purpose-specific capability and both audit effects already exist. Recent queue,
pending-read and response-ID corrections are deployed. This trace found no missing
unheld runtime prerequisite to implement.

## First missing acceptance input: security closure receipt

KAN-29/10003 remains the controlling security hold. A fresh read of KAN-85 and
KAN-147 found zero comments and their existing descriptions, with no closure receipt
attached. Their To Do labels do not prove remediation never occurred. Reconcile any
existing authoritative receipt before proposing another rotation.

The security owner of record must supply **one linked, nonsecret evidence bundle**
on existing KAN-147, cross-referencing KAN-85 and KAN-29/10003:

| Required evidence | Safe receipt content | Stop condition |
| --- | --- | --- |
| Accountable owner and incident disposition | Owner identity, incident reference, closure decision and timestamp | No accountable security owner or unresolved incident |
| Replacement active in actual consumers | Complete affected-consumer inventory reference; per-consumer activation/verification receipt and version | Unmapped or unverified consumer |
| Exposed credential revoked | Provider revocation receipt reference and timestamp; no key value | Replacement creation alone, or no revocation evidence |
| Named staff scope released | Explicit target, principal-scope and audit-producing read authorization tied to this evidence | Generic deployment approval or an unspecified read scope |

Do not put keys, tokens, DSNs, private UUID inventories, customer fields or raw provider
logs in Jira, this document or Git. Root has not inspected credentials or consumers,
revoked anything, or claimed that this evidence is absent from every private system.
Current [Supabase key guidance](https://supabase.com/docs/guides/getting-started/api-keys)
also distinguishes creating a replacement from revoking the exposed credential.
No new rotation or credential acquisition is proposed by this addendum.

## Remaining bindings before execution

Reuse the operator already nominated in KAN-29/10238. Do not ask Samuel to nominate
the account again. Its supported principal, account control and legitimate role
must be verified privately; email alone supplies none of those facts.

The existing authorized owners must bind the following fields in the **private**
W1-D execution packet. None is inferred from deployed source or this document:

1. Exact existing staging target and approved HTTPS origin, application SHA/tree,
   installed migration/function identities and synthetic-only qualification data.
   Production and staging identities in the existing packet are distinct. No new
   host, service, project or database is acquired or started.
2. Normal, non-recovery synthetic identities: one legitimately authorized
   `clinical_admin` staff principal and one unprivileged principal, plus the guest
   customer context. No account creation, reset, invitation or clinical role grant
   is included. If such a staff identity is unavailable, stop for the existing
   owner; do not manufacture an intake role or grant clinical authority.
3. Full active eligible-role inventory; exact capability-row and saved/effective
   dedicated-flag preimages; approver and grantor authority; effective whole-Care
   gates; a conditional apply procedure and exact rollback. Keep these private.
4. Exact approved fixture offerings, variant/sell-unit identifiers, quantities,
   clinical-review flags, agreement versions and synthetic contact values. Use the
   existing catalog authority; do not infer prices, availability or eligibility.
5. One explicit allowance naming the executor, target, source, three isolated
   browser contexts, request budget below, audit/limiter writes, evidence handling
   and cleanup. Existing browser, SQL and native-runtime allowances are consumed
   or held; this document renews none of them. Actual serialization and the existing
   browser/resource admission requirements remain prerequisites: the browser
   floor stays 2048 MiB, and any separate local test/build job still needs actual
   serialization and the existing fresh 2304 MiB admission. Root performs no new
   process/RAM census or admission retry to prepare this packet.

`request_intent_pending_read` is global to qualifying `clinical_admin` principals,
not a grant limited to the nominated operator. HTTP requires `care:administer`;
SQL independently checks a nonrevoked `clinical_admin`, compatible actor and an
enabled capability with `approved_by` and `approved_at`. An initial atomic enabled
insert must contain those approval fields; the schema does not prohibit an
intermediate disabled row. Apply only the approved conditional operation after a
complete preimage comparison.

The dedicated flag is `RESEARCH_REQUEST_INTENT_STAFF_READ_ENABLED=true`. Pending
reads deliberately do not require whole-Care activation. Preserve `CARE_ENABLED`,
`CARE_ENABLE_APPROVED` and the separate `care` capability. `clinical_admin` also
confers the existing appointment/pharmacy administration permissions behind their
own gates. A promise to use only intake is not a technical restriction. The
private decision's broader-role disclosure and narrow-role alternative remain.

## Exact next qualification operation, after the bindings are approved

Use the existing staging deployment and supported interface. Do not use the
potentially genuine October 17 production request as a test fixture. If staging
contains non-synthetic requests accessible to the qualification staff principal,
stop before opening its queue. No production customer contents are part of this scope.

### Request budget and sequence

Use one guest/customer context, one authorized staff context and one unprivileged
context. Existing normal sign-in may be used for the two already provisioned
synthetic accounts. No recovery-purpose token, copied bearer wall, new profile or
alternate Auth route is permitted. The approval must cover necessary normal Auth
and configuration/catalog reads and at most one automatic `/unlock` per context.
The guest portion allows at most two config GETs and two catalog-page GETs; no
manual refresh, pagination or repeated sign-in is included.
Unexpected extra request-intent calls are a stop, not permission to retry.

| Order | Existing operation | Bound | Required result |
| --- | --- | --- | --- |
| 1 | Guest UI `/research/early-access/order-request`: select the exact approved fixture and complete current agreements/contact | One `POST /api/research/early-access/request-intents` | One `pending_review` request, exact lines and truthful XRI reference; preserve its one attempt key privately |
| 2 | Same guest context: existing `/recover` API, same attempt key and customer identity | One `POST /api/research/early-access/request-intents/recover` with `{ "idempotencyKey": <same private key> }` | Same request ID/reference, no replacement request |
| 3 | Guest context: GET staff page 1 and the saved fixture detail | Two staff GETs, no bearer | 401 for each with the dedicated feature gate enabled |
| 4 | Unprivileged context: normal sign-in and supported `/care/request-intents` UI, queue then explicit fixture lookup | Two staff GETs through canonical transport | 403 for each; no private fixture detail exposed |
| 5 | Authorized context: `/research/sign-in?returnTo=%2Fcare%2Frequest-intents`, queue then explicit fixture lookup | Two staff GETs through canonical transport | Page 1 and that exact fixture detail, matching submitted fields and clinical-review flags |
| 6 | Authorized database owner: bounded evidence read for this fixture and run | One separately approved evidence collection, not blanket SQL | One durable request, matching recovery, access-audit outcomes and private queue/detail events |

The six staff requests are exactly:

```text
GET /api/research/early-access/request-intents/staff?page=1
GET /api/research/early-access/request-intents/staff/<saved-synthetic-request-id>
```

Execute that pair once for each of the three identities. Do not add HEAD requests,
page 2, retries, other record IDs or status/payment/prescribing/fulfillment actions.
For UI operations use the existing canonical transport; do not export bearer tokens.
The anonymous pair can use same-origin browser fetch without an Authorization header.

Recovery returns HTTP 200 with `{ receipt }`. A null receipt is not proof of absence:
stop and retain the original attempt; do not submit a replacement. This proposal
does not inject a lost reply, force a 503 or change server behavior. The uncertain
reply/remount UI journey therefore remains CI-proven until separately authorized
native qualification. A successful normal submit plus direct API recovery must be
reported with that narrower scope.

### Writes and evidence

These GETs are audit-producing operations, not read-only SQL. With the dedicated
gate enabled, guard decisions append `care_access_audit`; an allowed application
decision may still precede SQL refusal. Successful queue reads append `queue_list`
per returned row and successful detail reads append `staff_read`. Empty queues and
missing detail do not produce corresponding private row events. Both endpoints
also call the durable rate limiter. Capture all actual effects under the authorized
scope rather than claiming that only the two audit stores can change.

Require the stage owner to confirm the qualification queue contains only the one
synthetic fixture. The expected successful private row events are then one
`queue_list` and one `staff_read`; refused identities must produce neither. Bind
access-audit outcomes to the six calls privately. A 200, an application allowed
audit, a healthy service or a visible code marker alone is insufficient.

Keep response fields, contact/agreements, attempt keys, identities, session material
and raw audit rows in the authorized private evidence location. Publish only source,
target/deploy identity, receipt hashes, booleans, safe counts, call outcomes, cleanup
result and the exact NOT RUN scope. The operator verifies the synthetic detail
through the UI; Root does not export or inspect production customer contents.

### Cleanup and stop procedure

On mismatch, unexpected data, extra calls, denied audit, wrong target/source or
missing input: stop before another request. Preserve the original attempt and all
evidence. Use the separately approved effective procedure to close the dedicated
flag if this run opened it; verify refusal only within the approved cleanup budget.

If this operation changed the capability, restore only its exact preimage after
concurrent-change checks; otherwise leave it untouched. Revoke
only explicitly approved temporary assignments created for this operation, if any;
this primary scope creates none. Never revoke a pre-existing role. Preserve request,
audit and limiter records, including the synthetic fixture. No customer deletion,
table cleanup, credential change, whole-Care activation or automatic app rollback
is implied. The proposed allowance separately includes at most two cleanup staff
GETs, the same list/detail pair, solely to verify 503 after restoring a flag this
run opened to its prior disabled state. If the run did not open that flag, those
calls and a flag change are omitted. These are separate from the six-call
qualification budget; failure ends the run without another retry or grant.

## Reused checks and explicit limits

Current release push CI `41242404762` passed 18,351 tests, with 83 skipped and all
five required checks successful. Relevant existing tests cover staff authority,
production route composition, canonical Care transport and the durable journey.
No unchanged suite is rerun to prepare this document.

The disposable durable fixture explicitly requires PostgreSQL 16 and uses synthetic
identity/Care-audit adapters. Its server journey and mounted client/operator journey
are CI evidence; they do not prove managed Auth, production Care schema, native
PG17, staging parity or a human follow-up. The accepted native launcher remains a
separate NOT RUN/host-and-resource-held operation, with no new acquisition or job.

The next executable operation is **owner completion of the linked security receipt
and private target/identity/preimage/allowance bindings**, followed by the exact
staging sequence above. The unresolved decision is acceptance of that frozen scope
and its effects under the existing KAN-29/10003 and 10241 authority. Ordinary website
release authority supplies neither. No broad epic rewrite, new notification system,
catalog correction or additional reviewer is created here.

Records: KAN-29/10003, 10200, 10238, 10239, 10241; KAN-85; KAN-147; KAN-109;
KAN-31/10420; Confluence425985 v2. The existing ledger remains authoritative.
