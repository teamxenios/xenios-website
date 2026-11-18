# Auth session protocol prototype — 2026-11-18

Status: isolated physical-copy build passed at exact source
`0feceb775b108d35842848112518a98d8345e0d6`. Twelve CJS race scenarios passed;
scenario 13 failed on the synthetic JWT's malformed base64url signature.
Qualification stopped there: 47 scenarios and all ESM runtime scenarios remain
NOT_RUN. Fixture-only signature and per-run epoch corrections are authored but
NOT_RUN, along with a new independent helper case.
MFA485 remains unmerged. The application, canonical
browser helper, package files, lockfile and shared dependencies are unchanged.

Subsequent independent static review required further prototype corrections:
canonical proactive-refresh fallback, retryable-error retention, provider
single-flight/cooldown, original-revision recovery cleanup, and downstream
Realtime channel/HTTP/Phoenix transport effects. Those source corrections and
new fixtures are authored **NOT_RUN**. They change SDK build inputs; the six
historical artifacts are invalid for this source. The next allocation requires
a fresh isolated build, not artifact reuse.

Independent static review of `15d0abeedf7249cc863848ffbee22a66ab94098e`
found those five corrections source-coherent but still unqualified, with one
remaining terminal-result gap: an in-flight ACK-required broadcast could hang
when stale local timeout delivery was suppressed or teardown canceled it.
The narrow successor tracks pending strict-mode Push objects, removes them on
normal ACK, and settles each once with a generic redacted cancellation during
retirement/destruction. Local timeout settlement bypasses the data-admission
gate while carrying no remote payload. Canceled work cannot reset/resend, and
retired channels cannot schedule rejoin. This correction and its bounded
successful-ACK, replacement/sign-out cancellation, and stale-local-timeout
fixtures are authored NOT_RUN. `15d0` and all historical receipts are preserved;
no source-coherence finding is treated as runtime acceptance.

Exact `50e67c775d5607e9531f09d9e5f31dcdc2d88df9` then received source acceptance
for isolated qualification. Its fresh build actually failed before compilation
at `patch-sdk.mjs:248`: the anchor expected 8 spaces before
`settings.tracePropagation` and 6 before `)`, while pinned SupabaseClient
lines 364–365 use 6 and 4. PID 18132 exited 1; conhost 15308 and the main PID
were absent at 17:21:30.223Z. No fixture ran and no retry occurred. New partial
copy `sdk-5QK0Zx` and complete logs are retained. The exact receipt is
`.receipts/qualification-50e67c77-fresh/summary.json`, SHA256
`8ed53fb5f42449fd2b444960a0cbfa3bb7b05a710505bd032beebd84ed2fb52a`.
The 552-file comparison has zero mismatches but is explicitly a post-failure
reconstruction, not a persisted full before-inventory. Its eight dist files
are copied upstream stock artifacts, not corrected compilation outputs.

The next narrow source-only successor fixes that exact 6/4-space anchor while
retaining strict source hash and exact-occurrence checks. It also persists
`shared-inputs-before.json` in each new sandbox **before** source transformation,
with all physical shared/copy digests, tool/package versions and build-source
inputs. `build-status.json` records creation, tool resolution, before-inventory,
patch attempt/completion, compilation progress and terminal success/failure;
separate `shared-inputs-after.json` records direct post-build/failure reads.
Partial or missing before evidence is never relabeled complete. An optional
third builder argument records Root's exact source SHA. This successor has
only static checks at its authoring checkpoint. Failed `50e67c77`
artifacts remain immutable and runtime behavior/fixtures are otherwise unchanged.

Exact `bf7a2665fad54d30e9368981870620bed6f8b1f3` subsequently had a fresh allocated
build. It persisted genuine before/after records for 552 physical inputs, with
zero copy/hash mismatches and zero shared mutation. It failed before compilation
at `patch-transport.mjs:66`: the generic opts/return-type suffix matched both
`track` (423–424) and `send` (880–881) in pinned channel source `229ce199...`.
PID 1356 exited 1; main/conhost 24168 were absent at 17:33:24.030Z. No fixture
or retry ran. Partial copy `sdk-LpnfgY` and all receipts are preserved; its
eight distributions remain upstream stock. Summary
`.receipts/qualification-bf7a2665-fresh/summary.json` SHA256 is
`4d5fdad4dabe2b3afb9f8d7fc890859a768b244a86e95d0d9da13ec4aa19e477`.
The full before record SHA256 is
`9f66594644ec2d6a38880456a3b006960ce9a6ac6cf7f705963baeb975c5ab45`.

The new finite source-only correction matches the complete exact `async send`
declaration, with a unique boundary; `track` is not targeted. The builder and
new `preflight.mjs` share the same pure `transformSdkSource` and ten-source
census. Existing transformation order, normalization and generated source
bytes are intended to remain unchanged except that send-boundary fix. Types
and verifier replacements now also enforce their known 1/14 anchor counts.
No code has executed the new transforms yet.

The authored in-memory preflight loads each actual pinned source as bytes,
executes the real shared transform, records before/after hashes and syntax
diagnostics, and verifies unique send/track methods plus unchanged track bytes.
It checks three preserved partial-transform hashes from the failed bf7 copy.
The other source transforms are shared unchanged, not replaced by mocks.
It attempts all ten inputs, reports each failure without source adoption,
checks the new coordinator's syntax and rechecks shared hashes. Its only
writes are source/progress/hash receipts under the owned ignored directory;
it imports no SDK runtime, calls no provider, and substitutes no clock.
This preflight is **AUTHORED_NOT_RUN**. Root must separately allocate it and
inspect an actual passing result before another fresh bundle build. A source
preflight pass will not be runtime, artifact, accessibility or MFA acceptance.

Task: `EA-AUTH-SESSION-PROTOCOL-PROTOTYPE-20261118`. Owner registration:
`codex-ea-auth-protocol-20261118`, `2026-11-18T15:38:17.188Z`.
Base: `e6e11c3f923491d55bc2cd221c29da77001a0822`.
Branch: `codex/ea-auth-session-protocol-20261118`.
Owned implementation is only `scripts/acceptance/auth-session-protocol/**`
and this document. Root alone controls subsequent integration and activation.

## Source provenance and upstream finding

The earlier architecture evidence is preserved at
`C:/Users/sboad/projects/xenios-auth-mediation-review-20261118/MFA485-ARCHITECTURE.md`,
SHA256 `eb6339d8c9aaaa02519a12e8d3c5fd5647ea492762f10c3ba21a9323e70ee6f3`.
It contains the application call-site inventory, actual installed-SDK race
characterization, full save/remove/notification inventory and upstream review.
Its earlier proposed Auth-only package plan is superseded here by explicit
SupabaseClient and Realtime final-effect patches. Its evidence is unchanged.

The inspected [official v2.119.0 Auth source](https://github.com/supabase/supabase-js/blob/v2.119.0/packages/core/auth-js/src/GoTrueClient.ts)
retained the unversioned commit/notification gaps; merely upgrading was not a
proved correction. The previous review also checked the
[changelog](https://supabase.com/changelog.md),
[Auth notification contract](https://supabase.com/docs/reference/javascript/auth-onauthstatechange),
[getSession](https://supabase.com/docs/reference/javascript/auth-getsession),
and [MFA verify](https://supabase.com/docs/reference/javascript/auth-mfa-verify).
This prototype is pinned to installed 2.108.2 and Node 20.19.0, rather than
combine a protocol experiment with the newer upstream Node requirement.

The patch refuses changed upstream source. SHA256 pins:

| Source | SHA256 |
| --- | --- |
| Auth `src/GoTrueClient.ts` | `5fa1b69040657aefe2fd94697f3a290cbfa1bb21d3406f87bfb056f972f517b6` |
| Supabase `src/SupabaseClient.ts` | `83702688e4b6b8d9cd90a32fb1cb126fd80491ddca5ece5b2d31e67d1a89e926` |
| Realtime `src/RealtimeClient.ts` | `983d229aa7f269f5572020f714b50a872c831ee562f8ce56436ca9ed0218bd6b` |
| Published Supabase `dist/index.mjs` | `05dc19f720aea11598f920c135cd223571f35022405c35aa3c7472144cdc6e23` |

The corrected build also pins six inputs in `patch-transport.mjs`: Realtime
`src/RealtimeChannel.ts` and `src/phoenix/channelAdapter.ts`, Supabase
`src/lib/fetch.ts`, and Phoenix 0.4.4 `assets/js/phoenix/socket.js`,
`channel.js`, and `push.js`. It rebuilds Phoenix's actual
`priv/static/phoenix.cjs.js` and `phoenix.mjs` first, for eight public artifacts.
No SocketAdapter source or installed file is patched. The builder records a
complete shared-input before/after inventory and four SDK-build tooling inputs.
Its direct 552-input records were observed during the failed bf7 build; no
corrected output resulted. The older receipts' persistence limits remain intact.

The packaged Supabase source imports unpublished `@supabase/tracing`, absent
from installed runtime dependencies. The offline builder extracts its exact
inlined implementation and tslib helper from the pinned published ESM bundle.
It records that extraction hash. It does not create a replacement tracing shim
or fetch an unpublished package. The dependency closure is physically copied
with nested symlinks rejected, version conflicts refused, and every shared
input hash checked again after compilation. Tool versions and generated entry
hashes are recorded. Nothing is installed into either dependency tree.

## Implemented protocol boundary

The Auth source receives explicit opaque operation contexts; supported nested
methods inherit their caller's context. Each independent root operation reads
its baseline before asynchronous provider work. A second read under the
cooperating commit mutex rejects a delayed old initial read. No stale operation
silently adopts a newer revision after its fetch or storage await.

The single canonical session slot contains one protocol envelope: epoch,
monotonic decimal revision, session or tombstone, verifier `null`, and ordinary
or recovery purpose. The supported implicit-mode prototype eliminates split
verifier/user writes. A commit compares its original revision and performs one
canonical write under the commit mutex. The successful write is the
linearization point; pending intent is not a completed transition. Old results
are refused before effects. There is no post-hoc removal/revocation to undo
an old operation. Ambiguous storage failure suspends this participant rather
than attempt rollback.

Save/remove/notification owners are statically inventoried. Unsupported
credential/enrollment/OAuth/PKCE/passkey surfaces fail before provider work.
Custom legacy SDK locks and split user storage fail configuration. This avoids
misattributing reentrant `pendingInLock` calls to an outer operation; it does
not claim that the legacy locking protocol was repaired.

Refresh provider work is coalesced by original epoch/revision/refresh token,
before the remote request, with one owner commit/notification. Only callers
in that explicit cohort may join that shared transition's actually committed
ticket under the mutex; unrelated late operations cannot rebase. Post-commit
reentrant refresh gets a new key and cannot await its unresolved outer observer.
Old flight cleanup is identity checked. Failure cooldown uses the installed
duration, additionally scoped to the original revision/token and bounded in
memory; B's new revision/token bypasses A's cooldown.

A separately named cross-tab provider lock covers each original canonical
revision, with no bearer in its name. A queued old tab revalidates its original
context after acquisition and discards before another provider request if a
successful refresh already changed the revision. It does not borrow the other
tab's result or silently rebase. B's new revision gets a different provider
lock, so old A network work cannot block it. The local explicit cohort shares
its actual result; failure cooldown is coordinator-local, not a claim of global
exactly-once provider behavior. The controlled mutex honors distinct lock names
so provider-lock-to-commit-lock acquisition cannot self-deadlock.

Proactive-error fallback reads the context-bound canonical session rather than
cast its envelope to Session. Retryable provider failures preserve even expired
credentials, following installed SDK semantics. A definitive error can
tombstone an expired session only if its refresh token and revision still
match. Current valid access tokens survive proactive failure.

Committed revision tickets guard deferred initialization, fresh
INITIAL_SESSION reads, ordinary Auth callbacks and versioned BroadcastChannel
delivery. A receiver compares shared current storage and delivers canonical
session data, never a broadcast's session body as authority. Unversioned
messages or raw legacy persistence suspend the participant. Observer callbacks
run synchronously under the delivery decision, but their promises are not
awaited under the lock. Synchronous throws and async rejection reach a redacted
independent error sink and cannot revoke a committed session. Any async
observer/caller must consume its original ticket again at its eventual effect.

The SupabaseClient raw Auth listener receives the same ticket. Its own
`changedAccessToken` update and Realtime dispatch are revision checked.
Realtime captures a ticket before any autonomous access-token callback, then
revalidates immediately around final token/manual-token flag/channel effects.
The final token must also match the current canonical credential (or the
anonymous key after sign-out); an old cached fallback cannot pass just because
the token callback started at a newer revision. `_authPromise` clears only if
it still refers to the exact promise being finished. An older completion
cannot clear the newer in-flight operation.

The corrected source extends that boundary downstream. Each channel operation
uses an opaque registered frame containing its original ticket/token.
Subscribe/join-payload updates, HTTP dispatch, channel Push buffers, Socket
buffers, rejoin scheduling and delayed encoder completion retain that frame.
Final `conn.send` checks the frame and captured connection. Supabase's final
`fetchWithAuth` dispatch checks the request-local frame after token/tracing
awaits; a B token read cannot rebase an A request. Frame metadata is stripped
from fetch options before actual dispatch. Untagged channel work fails closed;
heartbeat work receives a fresh nonprivate frame.

A cache update does not prove server reauthorization. The bounded prototype
therefore retires **all** existing channels with an old canonical frame,
removes them locally, closes their connection, and requires fresh channels and
joins. `private=false` is not assumed anonymous: RLS changes may remain
Auth-bound. Old socket open/error/close/message callbacks and delayed decoder
completion are connection-identity checked; channel delivery is frame checked.
A normal token refresh consequently drops subscriptions. A new fixture observes
that loss and then joins a fresh channel. This is an isolated compatibility
limit, not accepted finished application behavior. Adoption needs a reviewed
lifecycle restoring supported subscriptions. Stable anonymous/public flows
remain supported; stale authenticated/private work cannot acquire anonymous
fallback authority. Strict private-anonymous admission and LongPoll are
refused. Native WebSocket and the controlled FakeWebSocket send boundary are
in scope; arbitrary custom transport queues remain unqualified.

`consumeSessionResult` admits only result objects registered by the same SDK
coordinator and only while their committed revision is current. This is a
continuation protocol, not authorization. The future application facade must
apply it at all eventual UI/transport boundaries. No second Auth store/client
or role authority is introduced. Server role, capability, scope, recovery and
current AAL2 checks remain decisive; `nextLevel` is never treated as AAL2.

Recovery has immediate local purpose denial when its URL is recognized or
cleanup is requested. Canonical recovery purpose denies ordinary continuation
and MFA admission across cooperating tabs. Cleanup is asynchronous and
conditional on the exact token plus its original opaque committed result/ticket,
not a revision first sampled at cleanup time; lock failure or a
newer ordinary login prevents deletion. The design does not promise synchronous
cross-tab cleanup during pagehide/unmount, and performs no unrelated-key scan.

## Authored fake-provider qualification

The builtin Node suite imports actual rebuilt Supabase CJS and ESM public
entrypoints. Each synthetic tab has one real SDK client, shared controlled
storage/mutex, controlled Response.json and fetch, fake timer/BC ordering and
real Realtime objects/channels. Socket probes use a controlled FakeWebSocket;
no real connection/provider call occurs. Unexpected routes/network fail. Fixtures cover:

- Held MFA/refresh at fetch and JSON against committed sign-out, B login and
  same-subject different session; storage, SDK events, Realtime and caller result.
- Normal MFA/current `aal2` and refresh; current versus stale continuations.
- Delayed first storage read, no post-hoc verifier/session cleanup, rejected
  and held canonical writes, pending intent versus committed state.
- Reordered BC messages, legacy raw writer/unversioned message fail closed,
  incompatible legacy SDK lock configuration.
- Reentrant throwing observer, delayed async observer and isolated rejection.
- Immediate recovery denial, exact-instance conditional cleanup versus B,
  cleanup lock failure, canonical recovery in another tab and implicit recovery.
- Held implicit initialization versus B and delayed initialization event.
- Held Realtime token callback after B, current real-channel payload and old
  promise finalization while a newer Auth promise remains pending.

The original matrix had 60 scenarios. Reviewed corrections add helper,
refresh/error/cohort/recovery and public socket/HTTP cases, all NOT_RUN.
At exact source `0feceb77`,
the offline build completed with six public-entry artifacts and 552 shared
input hashes verified unchanged. Twelve selected CJS cases passed: held
MFA/refresh at fetch/JSON versus B/signout/same-subject new session. Each
scenario ran separately with one worker, so the scheduler could stop at the
first failure. Skipped scenarios were not counted as passes.

The thirteenth case (normal MFA/current AAL check) failed with actual SDK
`AuthInvalidJwtError`, code `invalid_jwt`: its signature segment was the literal
17-character `fixture-signature`, a forbidden base64url length (1 modulo 4).
Installed `src/lib/constants.ts:41` requires full 4-character blocks with only
0/2/3-character remainder, as enforced by `decodeJWT` at helpers.ts:195–198.
The bounded correction base64url-encodes that synthetic signature's bytes,
just as header/payload construction already did. The signature/epoch-only
successors left runtime validation and SDK-build inputs unchanged at that time.
Neither fixture correction has been rerun; later reviewed protocol corrections
now change the SDK-build inputs as described above.

A separate fixture source correction closes the identified per-call clock
dependence in implementation, pending execution. `createSessionFactory` reads
its supplied fixture clock once; the exported run-wide `session` uses one such
factory. Repeated label/subject/session expectations therefore use the same
expiry/token even when runtime seconds change. SDK/global clocks are never
replaced or frozen. Explicit `expiresAt`/`expiresIn` fixture inputs remain
available for intentional expiry cases. The new `fixtures.test.mjs` helper
case advances only a locally injected fixture clock by 17 seconds, checks
stable repeated tokens and distinct sessions, and verifies an intentional
expired deadline. That helper case is authored and NOT_RUN; the historical
60-scenario stopped-run receipt is preserved unchanged.

The immutable selected-run summary is
`scripts/acceptance/auth-session-protocol/QUALIFICATION-0feceb77.json`.
Complete stdout/stderr, per-scenario commands/PIDs/start/exits, memory samples
and hash manifest remain in ignored `.receipts/qualification-0feceb77` and
`.sandbox/sdk-PGu5zL/manifest.json` for independent local inspection. Build PID
3560 exited 0; esbuild child 10400 exited. Final fixture runner 10632 exited 1.
All 42 recorded owned PIDs were absent at 16:16:44.334Z and the slot was
explicitly returned to Root. Four pinned shared source/artifact hashes were
also rechecked after fixtures and remained unchanged.

New refresh fixtures use actual SDK 503 retry/backoff, not replacement methods
or clocks. Each retryable case allows 45 seconds; expected bounded backoff is
approximately 25.4 seconds. The next sequential fail-fast job needs an explicit
overall budget (ten minutes for the present suite) and complete receipts.
The authored `qualify.mjs` runner enforces that overall budget, a 60-second
child bound, one named case/worker at a time, exact clean source, full outputs
and direct/observed-worker process receipts. Discovery skips are never passes.
It stops at first failure and owns only its spawned process tree; Root retains
external memory/allocation and final process-absence checks. This runner is
also NOT_RUN.
Public getSession covers proactive/expired × retryable/nonretryable errors.
Additional public calls check explicit refresh error, provider coalescing,
cooldown, B work and reentrant refresh. Recovery includes delayed sampling of
a newer ordinary same-token revision, forged ticket refusal and current clear.
Channel probes cover normal authenticated/anonymous join/send, stale private
send after sign-out, disconnected queued join, delayed encode/decode/HTTP,
scheduled rejoin and refresh retirement/fresh-subscription availability.
ACK-required probes now hold a real public send's ACK across replacement or
sign-out, await a generic error within a fixture deadline, and then force a
late ACK and canceled timeout without resend. Another probe withholds B's
broadcast notification and forces the stale local timer to settle the send.
Ordinary successful ACK remains a separate positive case. These use actual
public channel methods and controlled transport replies; none has executed.

Four `.mjs` syntax checks and `git diff --check` passed at the source checkpoint.
Browser, live-provider, full application/type gates and the remaining 47
runtime scenarios are NOT_RUN. The rebuilt Auth/Realtime CJS/ESM and Supabase
CJS/ESM hashes belong only to that historical source. The new loader requires
manifest v2 with exact current build-input/output hashes and rejects those old
artifacts. No passing claim transfers to the corrected source.

## Remaining acceptance and adoption limits

This prototype is a bounded source experiment. It is not a releasable SDK
distribution or approved activation of MFA485. Required follow-ons include:

- Execute and independently review the exact-source matrix; add all remaining
  normal supported-writer/error/auto-refresh/visibility/restart permutations.
  Current fixtures do not prove every await or arbitrary browser scheduling.
- Qualify generated CJS and bundler-consumed Auth/Realtime ESM separately.
  Supabase's Node ESM entry resolves their CJS `main` in Node; passing that
  entry alone cannot establish browser ESM behavior.
- Regenerate/typecheck declarations and maps and run upstream compatibility
  suites; the current offline transpilation retains stock declarations.
- Produce a licensed versioned fork/tarball with complete immutable input/output
  inventory, reproducible isolated clean installation and lock qualification.
  No package/lock edits or npm installation are authorized in this lane.
- Implement and prove a browser cross-tab mutex and explicit rollout/migration
  barrier. Fixtures start from an explicitly seeded synthetic envelope.
  Empty/legacy stores are refused, never silently migrated. There is no claim
  that existing legacy tabs can be detected before their first incompatible act.
- Restore supported subscriptions through a reviewed fresh-channel/rejoin
  lifecycle. Retirement at every Auth revision is not accepted production
  continuity. Qualify custom transports separately; opaque transport queues
  are not proved by a guard at their invocation boundary.
- Resolve recovery lifecycle integration and facade/call-site transport/UI
  continuations under a separate exact protected lease. Existing direct app
  recovery writes and raw-client exposures remain unchanged and are blockers
  to adoption, not covered by this isolated prototype.

The original full build goal remains broader than this task. This work provides
reviewable implementation and reproducible synthetic qualification inputs;
production access, live login and independent release acceptance remain with
their existing owners. Keep MFA485 frozen until those boundaries are qualified.
