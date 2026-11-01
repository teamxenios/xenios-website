# KAN-29: current-source binding and bounded qualification input

Status: corrected procedure prepared; independent successor review pending;
**execution HELD**. Existing Root owns this one-document correction under
`KAN29-OPERATOR-PACKET-CORRECTION-20261101`. It applies SAME Claude's finalized
KAN-31/10424 R1-R8 and P1-P3. It supplies no activation or execution permission.
KAN-29, KAN-109 and the full Quick Order journey remain incomplete.

## Revision and existing evidence

This is the corrected successor of the SAME document at
`833f426bf07799f953cf9ee966fae11f72b6743a`, blob
`1b39a1083ccdd61206db9dcbe168467b295523dc`, 15,313 LF bytes, SHA-256
`781304920958dc0878dde0709fdaa54e47b25527c4bfbc45d33cbfed9319c4fb`.
That original commit, branch history and qualification remain preserved. Its
procedure is superseded here; no competing master plan or unposted reviewer draft
is adopted. KAN-29/10239 remains the existing owner route.

The private `STAFF_ACTIVATION_DECISION.md` remains unchanged at SHA-256
`aa5850c20ddfe2b5fcdb21dc83b5c4e9db62b116e7cdc1f386eb81204a4ef340`.
KAN-29/10241 is the distinct `samuel/work-claude` reviewer's acceptance of that
older decision's **source scope**, not activation authority or acceptance of this
successor. Private identifiers and the private decision are not copied here.

Recorded live application: `97b26c1f7460ec31ffa99e0e93e928ea01248dcf`, tree
`89ac4efb4bef1a0f5450247feb8fde607dad3bd6`, deploy
`dep-dbja8cfb9u1s73bhgd90`, release run `41264977981`. PR353 is accepted in
KAN-31/10421 and released in 10422. Its release/static scope is closed; this
document is not a new production inspection. Claude's separate GET-only postcheck
10423 confirms served code only. Native focus/scroll and the full journey remain
untested. The documentation branch itself is not a deployment candidate.

The original W1-D authority/mount/SQL source bindings retain these blobs at the
recorded application release, as at the original `8efa9a9e` decision and `6c63aa92`:

| File | Preserved blob |
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
purpose-specific capability and audit paths already exist. Source presence is
neither installed database proof nor proof of successful staff access.

## First missing input: security closure receipt

KAN-29/10003 remains the controlling security hold. Previously read KAN-85 and
KAN-147 descriptions/comments supplied no closure receipt; that is not a claim
about every private system or proof remediation never happened. Recover existing
authoritative receipts before proposing replacement work or asking Samuel to resend.

The security owner must supply **one linked, nonsecret bundle** on existing
KAN-147, cross-referencing KAN-85 and KAN-29/10003:

| Required evidence | Safe receipt content | Stop condition |
| --- | --- | --- |
| Accountable owner and incident disposition | Owner, incident reference, closure decision and time | No accountable owner or unresolved incident |
| Modern replacement Supabase secret running in actual consumers | Complete affected-consumer inventory reference; per-consumer replacement activation/verification and version | Unmapped/unverified consumer or replacement creation alone |
| Exposed credential revoked | Provider revocation receipt reference and time, without key values | No revocation evidence |
| Named staff scope released | Exact target/principal-scope and audit-producing read authorization tied to the evidence | Generic deployment approval or unspecified read scope |

No keys, tokens, DSNs, credential identifiers, private UUID inventories, customer
fields or raw provider logs belong in Jira or Git. Root has not inspected consumer
credentials or revoked anything. Existing [Supabase key guidance](https://supabase.com/docs/guides/getting-started/api-keys)
distinguishes replacement from revocation. This document proposes no rotation,
credential acquisition or expansion of the security owner's authority.

## Private bindings and allowance required before execution

Reuse the operator already nominated in KAN-29/10238. Verify its legitimate
principal, account control and role privately; do not request another nomination.
The existing authorized owners must bind these fields in the existing private
execution packet. All remain pending; this publication does not fill them.

1. **Existing staging target and apply state.** Bind exact service/project, HTTPS
   origin, application SHA/tree/deploy, installed migration identities **and apply
   state**, and installed `staff_get`/`staff_list` function-body digests plus their
   public wrappers against the approved candidate. Object presence alone is not
   parity. Reuse the existing V2 identity-read input referenced by KAN-31/10386
   (`2bd344c4`); its own approval and native PG17 rehearsal dependency in 10400
   remain held. Those receipt references are not a newly executed verification.
   Keep actual installed/private digest comparisons private. Candidate SQL is not
   installed proof. The owner must also bound the logging/limiter domains and
   approve the expired-other-key sweep: an empty request table alone proves
   nothing about those domains. Exclude actual customer traffic/data; separately
   name the permitted operator identity/IP/session metadata. If sweep effects
   cannot be safely bounded, stop rather than purging or repairing the target.
   No new host/project/database, provisioning, acquisition or
   held WSL/Docker start is included.
2. **Origin and readiness settings.** Before the first browser load/submit, the
   owner verifies privately that the approved HTTPS origin is exactly staging's
   configured `SITE_URL` origin, not an apex/www/platform near-match. The submit
   and recover guard requires that exact `Origin`, JSON, and any supplied
   `Sec-Fetch-Site` to be `same-origin`; the source permits an absent Fetch-Metadata
   header, while this browser procedure sends `same-origin`. Bind existing
   `RESEARCH_REQUEST_INTENT_ENABLED="true"`,
   `RESEARCH_EARLY_ACCESS_OPEN_ACCESS`,
   `RESEARCH_EARLY_ACCESS_SESSION_IDENTITY_ENABLED`,
   `RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS` matching the published policy, and
   configured Supabase including `SUPABASE_ANON_KEY`. Names are not values or a
   request to change them. Without that key the Care production adapter resolves
   no principal and its access-audit writer is a no-op; status codes then cannot
   prove the intended audit path.
3. **Legitimate identities and preimages.** Bind one already provisioned normal
   `clinical_admin` principal, one unprivileged principal, and the guest context;
   complete active eligible-role inventory; exact purpose-capability row and
   saved/effective dedicated-flag preimages; whole-Care gates; approver/apply and
   effective rollback authority. No account creation/reset/invite, recovery-purpose
   token or clinical role grant. If legitimate identities are unavailable, stop.
4. **One selectable synthetic fixture and follow-up owner.** Bind exact approved
   offerings/variant/sell-unit identifiers, quantities, clinical flags, current
   agreement pair/version and synthetic contact values. It must be selectable
   from default catalog page 1, or after one predetermined family selection, from
   the bare URL with no linked-product hint and nothing typed in search. No
   page-size-100 hint scan, search keystrokes, Next or requirements refresh is in
   this profile. The existing owner must name who contacts requesters, by which
   channel and when, per 10200; do not invent an assignee or service promise.
5. **Explicit executor, capture, budget and effects allowance.** Name the executor,
   bound target/source, three fresh isolated contexts, approved existing automation
   and the service-worker-blocking setting below, normal sign-in traffic, the
   complete finite endpoint/count manifest, all writes/limiter sweeps, bounded
   owner evidence reads, private evidence location/access/retention, cleanup and
   any staging restart/redeploy needed for a flag. Explicitly allow a request-body
   observer armed **before** the submit click: DevTools Network with Preserve log
   or the approved automation's request listener. Filter to this synthetic submit;
   extract its `idempotencyKey` and response `requestId` privately. Do not export
   HARs, cookies, bearer headers, storage or page-memory dumps. No interception,
   request modification, lost-reply injection or fault injection is proposed.
   No new allowance for browser/SQL/native runtime is granted here. Actual
   serialization and existing admission rules still apply: browser floor2048MiB;
   any separate local test/build needs fresh2304MiB admission. No Root process/RAM
   census, admission retry, local Node, install or acquisition to prepare the doc.

`request_intent_pending_read` is global to qualifying `clinical_admin` principals,
not a grant limited to the nominated operator. HTTP requires `care:administer`;
SQL independently checks a nonrevoked `clinical_admin`, compatible actor and
enabled capability with `approved_by`/`approved_at`. An initial atomic enabled
insert must include those fields; a disabled intermediate row is not forbidden by
the schema. Apply only the exact separately approved conditional operation after
full preimage comparison. This profile grants no role.

The dedicated flag is `RESEARCH_REQUEST_INTENT_STAFF_READ_ENABLED`. Pending reads
do not require whole-Care activation. Preserve `CARE_ENABLED`,
`CARE_ENABLE_APPROVED` and the separate `care` capability. `clinical_admin` also
confers appointment/pharmacy rights behind their own gates; an intake-only promise
does not technically narrow the role. The private decision's broader-role
disclosure and narrow-role alternative remain intact.

## One proposed staging qualification, after approval

### Admission and synthetic-only preflight

No production request, including the potentially genuine October17 request, is a
fixture. Before step1, the authorized database owner uses the separately approved
bounded evidence collection to count **all stored requests**, without reading
contact/line contents or opening the queue/API. Require **zero**. Any row stops
the run before submission. Reserve the staging fixture space against other writers
through the run; if that isolation cannot be attested, stop. Step6 confirms the
post-count is exactly one and identifies it as this fixture. The candidate list
function has no status filter and audits every returned row; checking through the
queue would itself expose/audit the rows this preflight protects.

Create three fresh isolated contexts using an **explicitly approved existing**
automation with [`serviceWorkers: "block"`](https://playwright.dev/docs/api/class-browser#browser-new-context-option-service-workers)
before any navigation. This changes the
test harness, not site code/configuration. If that profile is unavailable or not
approved, stop for a separately frozen allowance; do not silently count a native
first-visit reload inside this budget or acquire another harness.

Use one page per context. Keep each staff page foreground, unswitched, uncovered
and unminimized from fresh normal sign-in through its one explicit detail read;
no other tab in that context. Finish well before its privately verified token
expiry, then preserve its evidence and normally close that disposable staff
context before proceeding. Do not invoke extra sign-out/revoke APIs. No reuse of
profiles, stored expiring tokens, repeated sign-in or return to a staff tab.
Supabase's [documented default JWT lifetime](https://supabase.com/docs/guides/auth/sessions)
is one hour, not proof of staging's
configuration. The proposed six-call profile is conditional, not a guarantee that
Auth emits only one callback. Count **every dispatched call**, including a remount
whose response becomes obsolete; obsolete-response cleanup does not cancel it.
An unexpected automatic staff GET is a failed bounded run: stop before further
actions and record all already-dispatched calls/audit effects; never hide them or
change Auth/app behavior to fit the budget.

### Counted traffic and sequence

The owner freezes the complete manifest before execution, including normal Auth
and shell traffic. The following is not a total-network budget. No manual refresh,
pagination, search, PWA update, requirements refresh, retry, replacement request,
HEAD, alternate Auth route or copied bearer is included.

| Guest startup operation, with SW blocked | Proposed count per one stable load |
| --- | --- |
| `GET .../request-intents/config` (mode probe and form) | Exactly2, with no spare for reload/refresh |
| `GET .../request-intents/catalog`, page1/pageSize24 | One initial; at most one additional for the bound family selection |
| `GET .../assisted-orders/config` | One legacy bridge probe |
| `POST /api/research/early-access/unlock` | At most one automatic unlock in guest context; creates a durable EA session |
| `GET /api/research/early-access/session` | Expected automatic session checks; the old QA observed two per load, not a universally proven maximum |
| `GET /api/research/policies` and `GET /api/research/early-access/agreements` | One of each for the mounted agreement section in this profile |
| `/api/config`, `/api/research/me`, normal Auth/configuration reads in the other two contexts | Expected paths; the owners must bind finite counts and any per-context unlock/session traffic before admission |

Unbound counts are a missing execution input, not an unlimited allowance. Capture
actual dispatch order privately. The SW source registers on load, claims clients
on activation and reloads on first `controllerchange`; a first-visit reload and
interrupted-unlock repeat are **inferred possibilities**, not observed outcomes.
Claude's 10-30 fresh-profile QA observed one navigation with SW bypassed by its
harness, so it neither proves nor refutes native takeover reload. Each extra
load repeats automatic traffic. This proposed blocked-SW profile qualifies neither
that lifecycle nor real-browser visibility/refresh behavior.

| Step | Operation | Bound and required result |
| --- | --- | --- |
| 1 | Guest UI `/research/early-access/order-request`: select the approved fixture, read current policies/standing and accept the bound current agreement, then submit once with the observer already armed | The two legal GETs above; ONE `POST /api/research/early-access/agreements/accept` with the supported pair, then ONE `POST /api/research/early-access/request-intents`. Observe durable acceptance before submit and one `pending_review` receipt with exact lines/XRI reference. Save the original request-body `idempotencyKey` plus response `requestId` privately. Extra required agreement pairs need a separately bound allowance. |
| 2 | Unchanged guest tab: one in-page same-origin `fetch()` to `/api/research/early-access/request-intents/recover` | ONE POST, JSON body exactly `{ "idempotencyKey": <same captured key> }`, no Authorization header or trailing slash. Retain the normal EA cookie in that tab, within its bound lifetime (source default240minutes; actual staging expiry must be bound). HTTP200 `{ receipt }` must identify the SAME request/reference, with no replacement. No curl/cookie export or storage/memory inspection. |
| 3 | Same guest context: page1 staff list and saved synthetic detail via same-origin browser fetch | ONE list GET + ONE detail GET, no Authorization header:401 each while dedicated gate is enabled. |
| 4 | Fresh unprivileged context: supported normal sign-in and `/care/request-intents`, automatic queue, then explicit fixture lookup | ONE automatic page1 queue GET + ONE explicit detail GET through canonical transport:403 each; no fixture contents exposed. Count Auth-triggered dispatches, not just clicks. |
| 5 | Fresh authorized context: `/research/sign-in?returnTo=%2Fcare%2Frequest-intents`, automatic queue, then explicit saved-fixture lookup | ONE automatic page1 queue GET + ONE explicit detail GET through canonical transport:200 for list and exact synthetic detail with submitted contact/acknowledgments/variants/quantities/clinical flags. No status/assignment/payment/prescribing/fulfillment controls are invented. |
| 6 | Authorized database/evidence owners finish the bound collection | Pre-count0/post-count1; one durable fixture and matching same-owner replay, intended audit/events/limiter effects, run-window logging/notification evidence, and cleanup postimages. These are separately approved bounded reads, not blanket SQL or permission supplied by this table. |

The qualification staff API pair is exactly:

```text
GET /api/research/early-access/request-intents/staff?page=1
GET /api/research/early-access/request-intents/staff/<saved-synthetic-request-id>
```

Execute the pair once per identity: **six dispatched staff GETs**. The conditions
above reduce remount triggers; they do not turn an inferred startup duplicate into
an observed browser result. Do not allow an uncounted seventh GET or assume it
left no rows if it occurs. Stop and preserve the bounded-run failure. A different
finite contingency budget would require a separately frozen owner allowance.

The client generates a UUID and writes a marker before submit, then deletes that
marker on a valid receipt (`request-intent-attempt.ts:76-94`). The receipt contains
no attempt key and the server stores only its hash. A volatile form-memory copy
may survive until navigation; it is not a supported capture method. After normal
success there is no recovery UI action. Missing pre-armed capture means **stop**,
not key reconstruction, another submit or a new key. A null recover receipt means
unconfirmed, not absence. This is normal success plus direct API replay only;
lost-reply, in-flight reload and remount UI recovery remain CI evidence, NOT RUN here.

### Durable effects, correlation and 10200 disposition

Name all effects in the allowance, not just two POSTs or two audit stores:

- `/unlock` creates a durable EA session; agreement acceptance records durable
  standing including server-derived `requestIp` (`req.ip`) and request-id metadata
  (`register.ts:975-991`). The executor's IP and all synthetic contact/acceptance
  values remain private. A preexisting acceptance must not be invented as a fresh
  acceptance proof; the owner binds standing pre/postimages for these fresh contexts.
- The submit writes the synthetic request; replay is the same owner/attempt, not
  a second request. Do not infer absence or permission for a replacement.
- With a working configured audit adapter and dedicated gate enabled, staff guard
  decisions append `care_access_audit`. An application `allowed` decision may still
  precede SQL refusal; it is not successful SQL read proof. Successful list reads
  append `queue_list` for **each** returned row; successful detail appends
  `staff_read`. With only the fixture and exactly one successful list/detail, expect
  one of each; refused identities must produce neither private row event.
- `care_access_audit` stores actor, permission, outcome and application-clock
  `occurred_at`, without a request/run ID. Bind guest rows by NULL actor,
  `unauthenticated`, `care:administer` and a privately recorded bounded window;
  report any other anonymous row in that window rather than attributing it to this
  run. Bind staff rows by actual actor/outcome/window. Private `access_events`
  use database `now()`; correlate by the bounded window and independently recorded
  dispatch/order evidence, **not equal timestamps**. Ambiguity remains unresolved
  evidence, never an invented one-to-one join.
- Every reached limiter call can upsert/update the caller's hashed-IP key in place
  and opportunistically **delete other keys' rows older than one day**
  (`supabase/research-referral-fraud.sql:96-108`). The allowance must name both
  effects, including config/catalog/staff/submit/recover calls that reach this
  middleware. Multiple calls can update the same row; do not count every hit as
  an inserted row. Preserve evidence of pre/postimages and sweep effects; the
  old promise to preserve every limiter record cannot hold for swept rows. Do
  not restore counters or recreate swept rows as cleanup.

KAN-29/10200's notification-link criterion is **NOT APPLICABLE to this source/run
and NOT PASSED overall**. No notification writer is composed in the request-intent
production path, and the readback has no per-record URL selector. That criterion
remains with existing KAN-75/new-request-email ownership and the Core notification
hold; no new notification implementation or message is authorized here. Record
the existing owner's requester follow-up channel/time/ownership input from binding4.
Do not imply an operational staff email/dashboard or fabricate assignment/status
mutation controls over the immutable pending-review record.

The authorized evidence owner must attest that the designated staging logs in the
run window contain none of the approved synthetic contact values, and that **no
email was sent**. Bind the exact logging/notification evidence route before the
run; source absence of this writer alone is not a global runtime assertion.
Collect safe counts/booleans/references privately without unrelated customer logs
or provider/credential access. Keep raw bodies, attempt keys, identities, IPs,
sessions, contact/agreements and audit rows in the approved private location.
Publish only source/target/deploy identities, evidence hashes, safe counts,
outcomes, cleanup result and explicit NOT RUN scope. Root exports no customer data.

### Stop, effective rollback and cleanup

Missing input, wrong target/source/Origin/settings, nonempty preflight, expired
session, unexpected data/calls, capture failure, denied/ambiguous audit, failed
replay or any mismatch stops the run **before another action**. Preserve the
original attempt and already-produced evidence/effects; do not retry, re-sign-in,
refresh, submit a replacement, widen a role or repair the environment in this scope.

Close the dedicated flag only if this run opened it, by the separately approved
effective mechanism. If it is an env value, each change requires the approved
restart/redeploy; name that effect, actor and source/old/new deploy identities in
advance. A saved configuration edit alone is not an effective rollback.

**Rollback proof is the running deployment identity plus the effective dedicated
flag postimage matching its saved preimage**, attested privately by the authorized
owner. A503 `private_review_unavailable` alone is insufficient: identity, role or
audit failures can produce the same body. After that postimage proof, the allowance
may separately include at most TWO list/detail cleanup GETs **from the unchanged
guest context without Authorization**, solely when restoring a flag this run
opened to its prior disabled state. Expected503 supports the postimage evidence;
it does not replace it. If still enabled, the guest should get401 plus an audit
row, not private data. Count any limiter/audit effects of those calls. If the run
did not open the flag, omit the flag change and those cleanup GETs. Any failure
ends the run without another retry; existing guest-session expiry is not bypassed.

Restore a capability only if this run changed it, using its exact preimage and
concurrent-change comparison; otherwise leave it alone. Never revoke a preexisting
role; this primary profile creates no assignment. Retain the synthetic request,
acceptance/session and audit evidence according to the approved policy; no table
cleanup/customer deletion, limiter rollback, credential change, whole-Care
activation, server-session revocation or automatic application rollback is implied.
After preserving approved evidence, normal closure of the disposable contexts is
part of the bound cleanup, not a sign-out or revocation API call.

## Source basis, reused checks and limits

All code citations here refer to `97b26c1f` unless explicitly historical. Root
rechecked the attempt/guard/standing/acceptance/audit/limiter/list source and the
app/PWA call sites. The lockfile pins auth-js2.108.2; Claude10424 inspected its
installed source for visibility/refresh/broadcast events. That installed package
was not present at Root's scoped paths, so Root does not claim a second independent
verification of exact library timing. The app increments its epoch for Auth events
and keys the readback by it; remount effects can dispatch another page1 call.

| Final delta | Corrected sections / source anchors |
| --- | --- |
| R1 | Binding5, steps1-2, capture/replay limits; `request-intent-attempt.ts:76-94`, `RequestIntentForm.tsx:185`, private-access session TTL default240minutes |
| R2 | Traffic table, step1, durable effects; `earlyAccessAgreement.ts:107-110,209-214,273-290`; EA `register.ts:975-991`; request-intent `service.ts:87` |
| R3 | Foreground isolated staff contexts, six dispatched calls, explicit stop on remount; `CareRequestIntentPage.tsx:24-30,46`, `RequestIntentStaffReadback.tsx:24-32` |
| R4 | Approved SW-blocked profile and endpoint-specific startup budget; `pwa/register.ts:18-20,43-48`, `public/sw.js:31-41`, `order-request-mode.ts:21`, form config/catalog/filter call sites |
| R5 | Private origin/settings binding2; request-intent `production.ts:29-37,66-74`, private-access config, session-scoped identity, Care `production-deps.ts:93-99` |
| R6 | Owner count0 before step1 and isolated fixture/post-count1, never through queue; candidate SQL `:282-288` |
| R7 | 10200 notification NOT APPLICABLE/NOT PASSED, follow-up owner input and private logs/no-email evidence; request-intent `production.ts:135`, readback `:14` |
| R8 | Updated97b release evidence; modern replacement secret row; installed identity/apply-state/body-digest method remains held under10386/10400/10241 |
| P1-P3 | NULL-actor/window/different-clock correlation; limiter upsert plus deletion; effective running flag postimage and guest-only cleanup, with no503-only rollback claim |

Source and release runs `41258051541` and `41264977981` each executed the accepted
89ac tree:18,357 passed,0 failed,83 skipped;983 passed/6 skipped files, all five
trusted checks successful. Focused145 overlaps, not additive. Reuse this application
evidence; no unchanged suite/PR/deployment is manufactured for this doc-only change.
The disposable journey fixture uses PostgreSQL16 and synthetic identity/Care-audit
adapters. It does not establish managed Auth, installed schema, nativePG17, staging
parity or human follow-up. Native PG17 stays NOT RUN/host-and-resource-held.

Any eventual permitted result is **STAGING-QUALIFIED at its bound target and SHA**,
not PRODUCTION-OBSERVED. A normal confirmed submit does not reach "Check saved
request" after its marker clears. Lost-reply/remount UI recovery stays CI-PROVEN;
no native focus/scroll, startup reload or actual browser Auth-event result is claimed.
Follow-up of the potentially genuine October17 request stays BLOCKED and excluded.
The independent source delta's context/refuter limitations remain in10424;
implementation assistance is not independent acceptance of this successor.

Next: SAME Claude reviews this corrected successor at its exact pushed SHA. Actual
execution still needs the linked10003 closure, exact private bindings and explicit
executor/effects/evidence/cleanup allowance under10241. Recover existing receipts
and reuse the nominated operator. No broad epic rewrite, notification/catalog
correction, new reviewer or new runtime unit is created by this procedure.

Records: KAN-29/10003,10200,10238,10239,10241; KAN-85; KAN-147; KAN-75; KAN-109;
KAN-31/10386,10400,10420-10424. Existing ledger history remains authoritative.
