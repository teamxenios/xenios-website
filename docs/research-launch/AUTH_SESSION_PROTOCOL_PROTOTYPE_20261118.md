# Auth session protocol prototype — 2026-11-18

Status: isolated physical-copy build passed at exact source
`0feceb775b108d35842848112518a98d8345e0d6`. Twelve CJS race scenarios passed;
scenario 13 failed on the synthetic JWT's malformed base64url signature.
Qualification stopped there: 47 scenarios and all ESM runtime scenarios remain
NOT_RUN. Fixture-only signature and per-run epoch corrections are authored but
NOT_RUN, along with a new independent helper case.
MFA485 remains unmerged. The application, canonical
browser helper, package files, lockfile and shared dependencies are unchanged.

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

`consumeSessionResult` admits only result objects registered by the same SDK
coordinator and only while their committed revision is current. This is a
continuation protocol, not authorization. The future application facade must
apply it at all eventual UI/transport boundaries. No second Auth store/client
or role authority is introduced. Server role, capability, scope, recovery and
current AAL2 checks remain decisive; `nextLevel` is never treated as AAL2.

Recovery has immediate local purpose denial when its URL is recognized or
cleanup is requested. Canonical recovery purpose denies ordinary continuation
and MFA admission across cooperating tabs. Cleanup is asynchronous and
conditional on the exact expected token plus revision; lock failure or a
newer ordinary login prevents deletion. The design does not promise synchronous
cross-tab cleanup during pagehide/unmount, and performs no unrelated-key scan.

## Authored fake-provider qualification

The builtin Node suite imports actual rebuilt Supabase CJS and ESM public
entrypoints. Each synthetic tab has one real SDK client, shared controlled
storage/mutex, controlled Response.json and fetch, fake timer/BC ordering and
real Realtime objects/channels. No fixture connects a socket or calls a real
provider; an unexpected route/network call fails. Fixtures cover:

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

The Auth protocol matrix has 60 scenarios; the new fixture helper adds one
independent case. At exact source `0feceb77`,
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
just as header/payload construction already did. Runtime validation and SDK
source/build inputs are unchanged. This correction has not been rerun.

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

Four `.mjs` syntax checks and `git diff --check` passed at the source checkpoint.
Browser, live-provider, full application/type gates and the remaining 47
runtime scenarios are NOT_RUN. The rebuilt Auth/Realtime CJS/ESM and Supabase
CJS/ESM hashes must still match the prior manifest before reuse in the next
explicitly allocated job; no passing claim transfers to the corrected fixture.

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
- Resolve recovery lifecycle integration and facade/call-site transport/UI
  continuations under a separate exact protected lease. Existing direct app
  recovery writes and raw-client exposures remain unchanged and are blockers
  to adoption, not covered by this isolated prototype.

The original full build goal remains broader than this task. This work provides
reviewable implementation and reproducible synthetic qualification inputs;
production access, live login and independent release acceptance remain with
their existing owners. Keep MFA485 frozen until those boundaries are qualified.
