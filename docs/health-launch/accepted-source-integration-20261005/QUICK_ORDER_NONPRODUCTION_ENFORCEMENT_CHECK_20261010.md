# Quick Order NONPRODUCTION enforcement steward check, r1

LOCAL ONLY. STATIC SOURCE/DOCUMENTATION CHECK. NO DATABASE ACCESS OR EXECUTION.

## 1. Acknowledgment, scope and disposition

I, `codex-accepted-source-integration-20261005`, existing chat
`01a0e098-3b23-7233-9b07-877ace092650`, explicitly accept the newly designated
NONPRODUCTION Supabase/PostgREST engineering stewardship for
`QUICK-ORDER-NONPRODUCTION-ENFORCEMENT-CHECK-20261010` revision 1. This is not
historical database ownership, a database role, configuration authority or
independent acceptance. Actual model/effort: `NOT_EXPOSED`.

Authority was independently read as Samuel's human message
`01a1261f-9e0b-78d3-919c-23d4778425eb`, turn
`01a1261f-9c2d-77c3-8f8e-60aab7898c13`, in existing builder chat
`01a10d78-0981-7150-9292-c5cde2730d4d`. Explicit acknowledgment was sent to the
existing coordinator `01a103a8-5684-7272-89e5-3c42eefcd593` before this finding.
The builder remains profile author and transaction builder. Original reviewer
`6abf1edf-2b16-476e-8305-23b9a0014e06` remains the technical acceptance owner.

**Bounded disposition:** the proposed numeric profile is internally consistent
as an unmeasured, fail-closed NONPRODUCTION contract. Its enforcement primitives
are plausible, but the current composition does not implement the complete
contract. In particular, pre-BEGIN class routing, independent configuration
binding, original-clock readback and the whole-request deadline are absent or
unproved. This check is complete; enforcement qualification and original-review
technical acceptance are not. There is no transaction dispatch or live approval.

| Evidence dimension | Result |
| --- | --- |
| Design/profile consistency | Static arithmetic and required-condition coverage consistent, with the precise prerequisites below |
| Enforcement feasibility | Conditional; current shared transport is insufficient evidence of the proposed distinct pre-BEGIN routes |
| Deployed configuration | UNKNOWN / NOT OBSERVED; no target, role, pool or GUC readback |
| Measured behavior | NOT RUN; no expiry, disconnect, cleanup, race, latency or refusal-rate results |
| Steward staffing | ACKNOWLEDGED by new designation; installer/DB-object owner/live operator not designated by this assignment |

Frozen profile statements that the engineering owner was unknown describe their
earlier checkpoint. This record supplies the subsequent designation, not a
rewrite of those frozen bytes. No historical-owner search is still needed.

## 2. Exact input and preservation

- Profile records: `9c4a9b5809162eab9b0669cb6a2f1f2516c06c67`.
- Records tree: `d265a25b9b5aea02f71e533e1096ea37b6284a9a`.
- Builder handoff: `0ec1827e2903b774b2b0691807ffed2f0a52b138`.
- Profile version: `quick-order-nonproduction-operating-profile`, `2026-10-10.r1`.
- Profile root: `docs/health-launch/quick-order-20261005/`.

| Frozen file | Git blob | Raw SHA-256 | Bytes |
| --- | --- | --- | ---: |
| `NONPRODUCTION_OPERATING_PROFILE_20261010.md` | `1c8ac2c6c3d027cc073572401ab96201c5cb2ccf` | `a80eb2a6515aa6958440d0909c5d2157be6db3971a9384c5ed0194a7593aed35` | 32563 |
| `evidence/nonproduction-operating-profile-20261010.json` | `58e642e1c05268f3e960022e565fe0170975fa47` | `82544bf503b5dc2ce9ee8bdda19ec4a5e981f76e51bff1f2dbe8f7c98266d4e2` | 132036 |

For each file, `git hash-object --no-filters` of the builder's local file equaled
the committed blob, and `Get-FileHash -Algorithm SHA256` independently reproduced
the raw digest above. The record tree also matched. All 14 `sourceEvidence`
commit/path blob identities were independently resolved and matched the JSON.
This is Git/file evidence, not execution provenance.

Referenced source baseline: `2d291d028ebf3664ead7d2df0b7212fed7a45348`, source
implementation `25858ad94a649a9f7442562e6e0423636d2a3124`. No source change in
`server`, `client`, `shared`, `supabase`, `scripts`, `package.json` or
`package-lock.json` was present from baseline through the profile handoff.

Accepted design records remain `280193059a6b28fee5645833cb56b7d944ad1c46`;
Doc76 byte-check acceptance remains `f04dd9cb01f986066d16e5d755930cc5779c234a`.
The new profile carries 14 Doc76, 16 Doc75 and six Doc73 conditions. I read their
profile matrices and the accepted Doc76 disposition; I did not reopen completed
design/errata reviews. Governing Markdown still resolves older JSON disagreements.

This integration checkout started at
`3df14c276b4812edd44132266fcbdb2e880e8cb2`, tree
`ce66379ef943fe6edc7fa5388b50b39f8d451009`, on
`codex/accepted-source-integration-20261005`. Accepted customer source
`cad2c4d1b1dd4ead798b032e6abf8b55e1c2f055`, tree
`e90de4206f9698f00bc1ee8a9905978db8c960ce`, stays frozen. No QO source was imported.

## 3. Actual source call chain, not a fictitious mounted transaction

All line anchors in this section refer to the source baseline above.

1. `server/research/health/quick-order/handler.mjs:125` authenticates through
   `ports.session` at133, rate-limits, reads/validates the body, and performs
   actor-key replay at142 before mutable config/catalog checks. New requests
   reach `ports.commit` at161. There is no whole-attempt deadline in this handler.
2. `server/research/health/quick-order/production.ts:33` provides the concrete
   port factory. `productionReady` is false at41; config is disabled;
   `getExisting` requires an injected extension at88; `commit` at93-97 throws
   `Quick Order canonical transaction is not qualified`. It deliberately does
   not fall back to legacy submit. Searches found the factory/handler definitions
   and tests, not an application mount. **No current QO write RPC call exists.**
3. Existing canonical assisted-order composition is separate, not a substitute:
   `server/index.ts:932,977` injects `getSupabaseAdmin()` as `supabaseRpc` into
   `buildAssistedOrderProduction`; `production-deps.ts:134-136` constructs
   `SupabaseAssistedOrderRepository`. Its `SupabaseRpcClient` interface at27-29
   carries only name/args and a promise, not connection checkout, timer proof or
   an abort signal. `supabase-repository.ts:332` calls legacy submit; at420 its
   admin readback calls `research_health_quick_order_admin_detail` through that
   same injected RPC client. `quick-order-repository.ts` is a decoder/name
   constant, not another connection or persistence implementation.
4. `server/supabase.ts:54-65` lazily creates a shared Supabase JS admin HTTP
   client from named environment variables. It specifies auth persistence and
   realtime transport, not the proposed connection classes, deadline propagation,
   PostgREST pool acquisition or pre-BEGIN GUCs. It was not invoked; even its
   credential self-check would contact Auth. No credential value was read.
5. The expected transport boundary is server-side Supabase HTTP RPC -> API
   gateway/PostgREST -> PostgREST physical database connection -> request
   transaction -> function. Only the application-side construction and RPC calls
   are source-evidenced here. Endpoint, gateway, PostgREST version/configuration
   and physical pool are not observed. The committed lockfile declares
   `@supabase/supabase-js=2.108.2`, `@supabase/postgrest-js=2.108.2`, `pg=8.22.0`;
   these are dependency declarations, not installed or deployed attestations.
6. `server/db.ts:8` is the legacy `pg.Pool`/Drizzle path. Nothing above uses it as
   the QO commit boundary. Substituting it would require a separate authorized
   architecture/source decision and is not this finding's recommendation.

The frozen intake candidate explicitly refuses if commit/guard write surfaces
already exist (`intake.sql:355-358`). Its current functions are readers. Currentness
publish/revoke at498/531 are owner-only scaffolding; `read_current_authority` at551
always returns unavailable. Their installer `SET LOCAL` values (5s lock, 30s or60s
statement) apply to candidate installation, not this proposed operating profile.
The proposal's gate protocol, commit, activation, new guards and timer checks are
future source conditions, not secretly implemented in these scaffolds.

## 4. Three database identities and one engineering role

| Identity | Source evidence | Still unknown / necessary binding |
| --- | --- | --- |
| Original database login / `session_user` | PostgREST owns a connection pool; the application holds an HTTP client, not a DB login | Actual database name/OID, login role name/OID, endpoint/pool route, startup settings and reconnect/reset behavior. Do not infer the literal name `authenticator` or equate this to `service_role` |
| Request / impersonated role | The admin client is intended to use a service credential. Reader SQL grants EXECUTE to `service_role`, not anon/authenticated | Effective role/JWT-to-role mapping, memberships and role settings on the actual route; no credential inspection or role readback performed |
| Function/object owner O | Intake installation requires current schema owner with RLS bypass matching `research_assisted_order_provider_fence`; reader functions are DEFINER, owner-equal, empty search_path. Currentness publish/revoke are INVOKER and require canonical owner; ACL revokes include service_role | Actual role/OID O, table/function owner equality, effective grants and predecessor seals on the target. Future commit/guard ownership is not an existing fact |
| Engineering steward | This record's direct designation and acknowledgment | Does not supply any of the three SQL identities or authorize impersonating them. Configuration installer and actual DB privileges remain separately bounded |

DEFINER changes the privilege context, not proof of a new login. Function SET
configuration applies at entry and restores at exit; it must not be mistaken
for a connection startup policy. [PostgreSQL17 CREATE FUNCTION](https://www.postgresql.org/docs/17/sql-createfunction.html).
Bare SET ROLE does not load that role's login defaults.
[PostgreSQL17 SET ROLE](https://www.postgresql.org/docs/17/sql-set-role.html).

PostgREST documents START TRANSACTION before transaction-scoped settings and the
main query. It separately applies impersonated-role settings and can hoist selected
function settings. Those mechanisms may affect the main query but do not, without
version/route evidence, satisfy this profile's earlier pre-BEGIN contract.
[PostgREST transactions](https://docs.postgrest.org/en/stable/references/transactions.html).
The consulted stable documentation identifies itself as PostgREST16, **not** the
unknown target version. Hoisting allowlist, pre-request behavior and transaction-end
configuration must be pinned, not assumed from documentation defaults.
[PostgREST configuration](https://docs.postgrest.org/en/stable/references/configuration.html#db-hoisted-tx-settings).

## 5. Complete proposed-limit map

All numbers below come from the frozen proposal. Units are milliseconds unless
explicitly stated. I=intake including authorized replay; W=materialWriter,
publish, activation and authority revoke. No value is changed or approved for
production by this mapping. Every implementation/readback entry is a requirement,
not a claim that it is installed.

| Limit / proposed value | Effective point and measured interval | End, expiry or disconnect behavior / evidence gap |
| --- | --- | --- |
| Connection acquisition: I/W1000 | Before a database transaction; encompass the specific pool-checkout wait within the original request clock | Acquired or refused at deadline. `db-pool-acquisition-timeout` could cover PostgREST checkout if actually configured; it is seconds-valued, so1s is the proposed conversion. It does not cover all DNS/TLS/proxy/app preflight. Actual configuration absent; abort after possible transmission remains uncertain |
| Per-lock: I250 / W7000 | Accepted connection baseline before any pre-function lock; proposed exact `proconfig` at commit entry or guard/admin function entry covers subsequent per-lock waits | Acquisition stops that wait; expiry cancels the statement. Not cumulative. Earlier writer prelocks and work after function return require the outer route's settings, not just proconfig. No installed proof |
| Intake shared gate: one TRY | Exactly one nonblocking two-int32 shared transaction try-lock immediately before head share | False is definite retryable refusal, same key, no body retry. Not `lock_timeout=0`. Acquired ownership lasts to outer completion; no upgrade or reentrant fresh admission |
| Exclusive gate: W7000 | Per-acquisition ceiling for exclusive transaction gate, after original-clock admission checks | Acquire or refuse within the remaining envelope. Timeout is not successful revoke. No fairness/progress guarantee; foreign holders and earlier writers can cause refusal |
| Head row: I250 / W7000 | FOR SHARE after intake TRY or FOR UPDATE after exclusive gate | Separate per-lock ceiling, still inside the original statement/transaction clock; not an additional whole-attempt budget |
| Statement: I4000 / W15000 | Pre-armed at top-level statement receipt, covering work including lock waits | Statement completes or cancellation begins; not proof of completed rollback. Nested SQL cannot earn fresh outer allowances. Original statement and protocol boundary are not bound in current composition |
| Transaction: I5000 / W20000 | Pre-armed before actual implicit/explicit BEGIN, covering the entire outer transaction | COMMIT/ROLLBACK or session termination on expiry; cleanup still must complete. Caller-held extra transactions, prepared transactions and timer rearming are inadmissible. Neither function return nor transport failure proves completion |
| Idle-in-transaction: I/W1000 | Effective connection policy; counts client-idle time inside an open transaction | Next activity ends an idle interval; expiry terminates the session. Not active execution/lock-wait coverage. Pool replacement after termination is unproved |
| Deadlock detector: I/W1000 | Effective setting before lock wait; detector interval, not a success deadline | Detector may find a cycle; no-cycle result is not permission to exceed other clocks. Intake250<1000; W7000 need not be below1000. Installer privilege/effective value unknown |
| Exclusive entry headroom: statement>=8000 AND transaction>=8000 | Immediately before exclusive gate, using the original two clocks, not newly sampled budgets | Otherwise refuse before requesting gate. Reserves gate7000+post-gate1000. No authenticated original-deadline reader exists in current source; current_setting gives a configured value, not elapsed time |
| Post-gate reserve: W1000 | Portion of remaining clocks reserved at gate admission | Not another timeout or promised completion. Head wait or later work still consumes the original remainder; inability to finish refuses/aborts |
| Rollback/lock-release allowance: I/W1000 | After timeout/cancellation/termination initiation until actual rollback and relevant lock release | Engineering characterization target only. No timer guarantees this. Missing/late cleanup prevents operational qualification; a client abort is not a release receipt |
| Total release target: I6000 / W21000 | Whole transaction plus cleanup; any gate/table/row lock held within that interval must be released by observed outer completion | Target=transaction+1000, not an installed hold timer. Requires future backend/lock evidence including failures, disconnect and outer tail; W can stall unrelated DML while publish/activation hold SHARE locks |
| Response allowance: I1000 / W2000 | Remaining outer attempt after database completion, for receipt validation/serialization and response observation | No fresh clock; late/undelivered response cannot fabricate successful confirmation. Preserve same-key recovery on ambiguous delivery |
| End-to-end: I8000 / W24000 | One monotonic attempt clock before auth/session/rate/body/catalog/replay/network/pool work | Confirmed response, definite refusal, or uncertainty ends caller observation. Deadline may stop caller waiting but not prove DB abort. Handler/composition currently lack this boundary; each earlier read must consume the same remainder |
| Maximum timeout field:24000 | Closed profile/effective-setting parser, before operation admission | Positive safe integers only, exact recognized ms/s conversion; per-field ceilings still apply. No missing/zero/fraction/default/coercion. This is validation policy, not a global timer or permission to use24000 everywhere |
| Version:170011 /17.11 | Precheck/reapply/postcheck and runtime route admission with accepted exact build binding | Refuse wrong major/lower minor, and no automatic higher-minor acceptance. Both verifier texts assert17.11; neither was run. Actual version/build/image remains unknown |
| UTC, ISO YMD, READ COMMITTED | Bound/read back at admission; isolation/integrity applies before guard classification | Nonconforming state refuses, including OUT/equal/quantity-only/zero-row guard statements. Canonical timestamps use one post-wait decisionAt, explicit UTC milliseconds; these are correctness conditions, not clocks |
| Characterization window:600000 | Future separately authorized observation window | End window or stop on unsafe/unknown/ineffective control; does not allocate a run, process budget or concurrency slot |
| Offered rates: I<=10/min; materialWriter<=2/min; publish/activation/revoke<=1/min each | Future workload driver, not production rate limiter | Count offered attempts consistently; no catch-up burst or automatic retry inferred. Existing app rate limits are not evidence of this proposed workload |
| Samples/refusals: I/W>=20 with<=1 unplanned retryable refusal; each admin class>=5 with<=1 | Future completed observation counts, failures retained and planned negatives classified separately | At exactly20 this is5%, at exactly5 it is20%; count caps remain<=1 at larger denominators. Missing samples UNKNOWN/insufficient, never pass. Unsafe effects fail regardless of percentages |
| Quiescence:2 observations1000 apart | Future diagnostic observations before administrative admission | Not a locking guarantee; successful all12 SHARE NOWAIT acquisition remains the boundary. No background sampler or retry loop is authorized |

PostgreSQL17 documents per-lock, statement, active-transaction and idle-transaction
timeouts with different scopes. Zero disables them; transaction expiry terminates
the session, and prepared transactions are excluded. These distinctions underpin
the timer rows, not a target measurement.
[PostgreSQL17 client settings](https://www.postgresql.org/docs/17/runtime-config-client.html).
The deadlock interval schedules detection, not guaranteed completion.
[PostgreSQL17 lock settings](https://www.postgresql.org/docs/17/runtime-config-locks.html).
PostgREST pool acquisition has a separate timeout/refusal boundary.
[PostgREST connection pool](https://docs.postgrest.org/en/stable/references/connection_pool.html).

### Arithmetic and cumulative-budget check

Metadata arithmetic reproduced:250<1000;4000<5000;6000=5000+1000;
7000>=6000;15000<20000;21000=20000+1000;8000=7000+1000 at gate entry.
8000=1000+6000+1000 and24000=1000+21000+2000. All four W classes agree.

These sums allocate **no extra preflight allowance**. Authentication, body reads,
catalog reads, replay and network queues must deduct from the original envelope;
otherwise a full downstream budget cannot still be promised. This is consistent
with the profile's cumulative-clock/refusal language, but is an implementation
prerequisite, not an independently enforced bound. A writer reaching the gate
after more than7000 of its15000 statement budget must fail the8000 headroom check.

The7000>=6000 relation is only arithmetic until actual full-intake cleanup is
demonstrated. It neither bounds foreign gate holders nor guarantees revocation
under all traffic. A shorter effective value is not automatically acceptable;
retain positive-value checks, field ceilings, the intake detector inequality,
exclusive minimum relationship and original-clock headroom together.

## 6. Bounded findings and exact prerequisites

These findings are enforcement prerequisites, not reopened stock/hold decisions,
new production approvals or claims of a measured application defect.

| ID | Finding and concrete missing evidence | Required resolution and exact boundary |
| --- | --- | --- |
| QOE-01 | No demonstrated class-to-physical-connection route with intake4s/5s versus writer15s/20s armed before BEGIN. One shared HTTP admin client and two JSON sections cannot establish it. Role/hoisted function settings occur later in the documented request lifecycle | Specify an accepted, authenticated class-to-route mapping within the canonical RPC architecture: target/version, original login/database, physical pool, startup policy, precedence/reset/reconnect, checkout refusal and installer. Then qualify it when separately authorized. Potential excluded seams: `server/supabase.ts`, `server/index.ts`, `server/research/assisted-order/production-deps.ts`, `server/research/assisted-order/supabase-repository.ts`. No legacy pool substitution, blanket shared-role timeout change or unapproved alternate transport |
| QOE-02 | External expected configuration digest has no actual artifact/consumer. `pg_db_role_setting` carrier is a policy location, not self-authentication or proof that clocks were armed | Bind profile digest/version to exact NONPRODUCTION route identities and permitted settings, from independently accepted server configuration into the private constructor/proof contract. Required sanitized artifact fields: profile/raw digest, source, database/login OIDs, request roles, O, route/pool, PG/PostgREST/build versions, effective GUCs/precedence, before-BEGIN mechanism, installer/authority and evidence references. Artifact path and delivery implementation must be separately named/owned before wiring. Request JSON or caller-set GUC cannot supply authority |
| QOE-03 | No original-clock readback or whole-request deadline/cancellation contract. The `commit` adapter is entered after session/rate/body/replay/catalog work; its injected RPC type has no deadline capability | Identify an existing authorized outer boundary or obtain exact scope for `server/research/health/quick-order/handler.mjs` and its protected caller/transport. Propagate one trusted monotonic attempt/deadline through all awaited work. SQL/private proof must bind original statement/transaction start and remaining-budget checks without resets. Missing trusted proof refuses; a late Promise race must not be called rollback or success |
| QOE-04 | Future per-wait function configuration alone omits pre-function locks and post-function outer work. Existing readers require exactly empty-search_path proconfig; installer timers are not operating timers | Later bounded source must update exact candidate definitions, integrity/fingerprint/proconfig inventories and matching pre/postchecks/verifier controls together. Preserve predecessor function settings and ACLs. Outer connection enforcement must cover earlier/later work. No changes performed; conditional17+4 scope still needs original acceptance and exclusive lease |
| QOE-05 | Shared writer paths include inventory/quality, Product Control/content, required-input and launch-control RPCs/direct DML. Their physical routes, prelocks, later statements, exceptions and reset behavior are unbound | Complete the already-required writer/lock-participant census against the chosen route, including prepublication, owner/direct service_role DML, DO batches, cascades and non-writer cart/fulfillment locks. Source anchors: inventory-admin `production.ts:73,159,203,231,265`; product-admin `product-admin-production.ts:284,652`; `required-inputs.ts:263,299,330,353,399`. Route amendments in these files or their SQL bodies are excluded from17 and require exact separate authority. Do not install guards and discover that unrelated platform writes lack the required profile |
| QOE-06 | Private Early Access session revoke is a separate row UPDATE, not authority revoke. Its class/timer route and outer boundary are not established by the five profile labels | Bind this caller explicitly to an accepted writer-bound contract or obtain a separate bounded disposition. Source: `private-access-session-repository.ts:372-387` injected executor and `supabase/research-private-early-access-sessions.sql:570-595`. Demonstrate session-row share/revoke ordering and uncertain outcomes later. Do not silently apply authority-gate semantics, change Website2-owned session SQL or assign credentials |
| QOE-07 | No actual before-BEGIN, cancellation, active/idle expiry, disconnect, pool-replacement or rollback/lock-release measurements.6000/21000 targets and ordinary-load refusal caps therefore cannot establish operational admission | Future separately authorized exact-target qualification must retain actual armed-setting/role provenance, original clocks, acquire/release timing, SQLSTATE/transport outcomes, database completion versus response delivery, same-key recovery and all negative/failed runs. Capture prelocks and post-return tail, foreign gate holders, shared pools and all12 table-lock stalls. Do not raise the1000 cleanup allowance or other budgets automatically |
| QOE-08 | Source version pins do not identify a server, function owner or managed configuration. Currentness administration is owner-only INVOKER, so service_role HTTP credentials do not establish access to it | Obtain sanitized target/configuration attestation with exact PG17.11 build, PostgREST/gateway/pool versions, role/OID/owner/ACL/seal equality, grant/configuration precedence, transaction-end policy, hoisted settings, pool acquisition units and automatic transport retry behavior. No grant or role change follows. Route must exclude prepared transactions, catch-and-continue/reentrant admission and unapproved client retry |

### What is already complete versus what remains authorable

- Complete: engineering steward designation/acknowledgment, this static check,
  profile arithmetic and inventory of concrete prerequisites. No more owner-name
  search, profile rewrite or repeated stock/hold question is needed.
- The frozen contract preserves one shared TRY, bounded exclusive waits, no
  upgrade/reentry,12 ordered SHARE NOWAIT publication/activation locks,35 guarded
  I/U/D paths,12 TRUNCATE refusals and47-trigger/48-row fingerprint. Session-binding
  INSERT stays excluded. These are future source acceptance criteria, not installed
  controls. Closure changes still need a new revision/decision/publication/receipts;
  revoked revisions cannot auto-reactivate.
- Missing operational target/measurements do not require fabricated Health or
  commercial inputs and do not, by themselves, forbid generic **disabled** authoring.
  The original reviewer should explicitly decide whether this profile plus the
  identified unavailable enforcement-proof boundary is sufficient for that bounded
  implementation, and which excluded seam changes remain prerequisites. This
  steward does not grant that acceptance or enlarge17+4.
- Any future in-slice implementation must remain disabled/unmounted, with missing
  trusted route/configuration/deadline proof refusing. Do not encode a fake receipt,
  treat a helper interface as actual enforcement, silently mount the route, or claim
  the whole contract while QOE-01 through QOE-08 remain unresolved.

## 7. Refusal, expiry and interruption semantics retained

The proposed false-TRY and confirmed-abort55P03/40P01/40001 paths use existing503
`temporarily_unavailable`, retaining the original key and payload, no automatic
body retry. A generic23505 is not evidence of the intended known conflict.
Correctly classified pre-write catalog/terms409 or invalid-input422 may reset only
within the reviewed semantics.25P04, a caller deadline, lost connection or unconfirmed
COMMIT/ROLLBACK remains uncertain; missing/malformed receipts never mean saved.

On a future disconnect, the backend may still finish, abort, or already have
committed while the response was lost. Recovery must authenticate and reuse the
same actor/key, preceding mutable intake gates, without reactivating intake.
Trusted proof of a server-side refusal differs from an HTTP/gateway timeout.
Function return does not release transaction locks; confirmed outer completion
must be distinguished from a cancellation request and subsequent cleanup.

Publish/activation must retain all12 SHARE locks while later waiting on gate/head,
so even successful NOWAIT acquisition can lead to unrelated DML stalls. Authority
revoke takes no source-table locks. Disable acknowledgment does not cancel admitted
transactions or prove database revocation. Failed/uncertain revoke stays disabled;
no automatic retry/reactivation or new-key escape is introduced.

## 8. Check method, limitations and handoff

Only source/Git/file/JSON metadata, digest/arithmetic checks, official public
documentation and narrowly scoped records edits/commits were used. Application
code and verifier scripts were read, never imported or executed. No Node/npm or
PostgreSQL process version is claimed for a run, because no run occurred.

The Supabase skill guided the separation of API/client configuration from database
authority. Its public changelog was read; the relevant17.11 advisory concerns
extension/operator upgrade compatibility, not a timer attestation. Nothing was
upgraded or probed. [Supabase17.11 advisory](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).

Public documentation describes available mechanisms, not this environment.
`web.open` could not fetch the Markdown changelog due to its content type; a
read-only public HTTP fetch succeeded. An initial lockfile JSON parse rejected its
empty package key and was corrected with `-AsHashtable`; one arithmetic shell
expression had a parser error and was corrected. These were document-processing
attempts, not failed or passing application tests. Truncated search outputs were
followed by bounded relevant reads; no full source audit is claimed.

Source boundary citations not already in the profile's14 bindings:

| Baseline path | Exact Git blob |
| --- | --- |
| `server/index.ts` | `d27a3da9221fe9ce0c7b992021500859ce7e6e34` |
| `server/research/assisted-order/production-deps.ts` | `0aee29e96481c7aa7a036e15b129b8b8c3487077` |
| `server/research/assisted-order/supabase-repository.ts` | `8da0f773db6ef4f6dbca145b67232731b8fcf693` |
| `package-lock.json` | `912f4f85e9a078ed97ed2b67ce8d1de09490eb29` |

The narrow steward lease is `ad40b9f0-b430-48c7-9f10-f1d5432fd1fe`. Prior source
custody and foreign rows are preserved. Only this finding, necessary own continuity
and its new handoff may change in this checkout. No push is authorized; exact local
commit/tree and this file's raw digest are returned outside this file to avoid
self-reference.

Next: coordinator collects this frozen finding with profile9c4a9b5/digest82544bf5
and routes them together to the SAME original reviewer through the existing queue.
Do not duplicate an active review. After actual technical acceptance, confirm
current path owners and exact exclusive17+4 lease before the same builder's dispatch.
Both schedules remain unchanged. No source implementation, tests, DB access, SQL,
hosted observation/configuration, new credential, role/pool change, installation,
push, deployment, real intake/email/payment or clinical action is authorized or done.
