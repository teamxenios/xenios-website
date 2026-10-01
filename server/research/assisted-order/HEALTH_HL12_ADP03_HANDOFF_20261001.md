# HL-12 ADP03 governed provider capture settlement

Status: frozen local candidate. Final SQL and serial preflight passed;
aggregate failed the unchanged strict protected-seam assertion.
Ready for exact independent review, not an accepted successor or release.
No managed action is authorized by this record.

Current source checkpoint: `2f0a975c1e051e7f23ccd3a9d5492431b8df1cdd`.
Tree: `55c15891b07be438a933d025a7381dd7f90a04e2`.
Final test checkpoint: `c3ab4bdf100fc70765928bfa13c24de5358f0a08` (cumulative
test-only commits `1bb6ca0`, `2259a2e`, `c3ab4bd`).
Final release-control checkpoint: `edf8526bdefc34b8e87fa6e46585573535dba6cd`
(cumulative `2d966b5`, `6198127`, `edf8526`). The complete current local SQL proof
supports `applyTwiceVerified`; this is not managed qualification. The completed
ADP03 aggregate below is separate from ADP02's results.

## Continuity

- Same branch: `codex/xenios-health-launch-implementation-20260930`.
- Base records: `4ad4bcfe8129b4069b79f3cce91773c894395c51`.
- ADP02 runtime: `27463d764ba01219c67081a3548ffdc3ff7d2b40`.
- ADP02 tree: `467c8556390ff9274a4adda5826eed7ab9603b23`.
- ADP02 final records: `9aa4700f8329f1b22736bd4bd8c3aefc788b0f8d`.
- ADP02 independent handoff: `4ad4bcfe8129b4069b79f3cce91773c894395c51`.
- Task: `HEALTH-HL12-ADP03-GOVERNED-CAPTURE-SETTLEMENT-20261001`.
- CLI-created new source migration:
  `supabase/migrations/20261001115512_research_assisted_order_quote_provider_settlement.sql`.

The ADP02 aggregate remains 19,149 passed, one failed, 85 skipped, exit 1,
no timeout. The strict protection assertion reports two unchanged baseline
mismatches. Its passing local SQL and preflight are separate evidence. That
aggregate does not qualify this unfinished successor. Earlier failures and
skips remain in the ADP02 receipt and are not rewritten here.

## Intended narrow contract

An explicit, server-confirmed admin command names one existing request and
authenticated journal record. The command body is empty. The browser cannot
supply an amount, currency, payment reference, actor grant or verified flag.
A separate source/account/mode-scoped policy and settlement grant are required;
reservation, execution, generic admin and manual-verifier grants do not suffice.

Fresh settlement must bind one full capture to the current accepted immutable
quote and the exact durable ADP02 payment identity. It must reject unsupported,
ambiguous, unbound, stale and adverse facts. It must atomically write canonical
observation, evidence claim, verification, paid event and held canonical outbox
obligation. The capture link is lineage, not a second payment ledger. Partial
graphs must fail at commit. No historic paid label becomes verified by adoption.

F4 recovery keeps its actual admin attribution. The financial transaction leaves
the held obligation; a subsequent atomic completion binds the canonical audit
receipt and releases that obligation. A failed completion must not erase the
financial record or invent that the original transaction never happened.
Recovery must survive actor revocation, process restart and audit-key rotation.
This preserves F4's audit-before-notification-dispatch policy, not a new
audit-before-fulfillment policy. While audit completion is pending, a complete
verified financial graph can remain eligible for the existing separately gated
supplier progression. The payment notification must remain held until its
canonical audit completes. HTTP 503 can mean committed verification with
follow-up pending, never proof that no financial transition happened.

Historical verification and current fulfillment eligibility are different.
The existing service-role `financial_state` RPC stays exactly
`{hasObservation, paymentVerified}`; the customer status projection exposes
optional `paymentVerified`, not that entire RPC shape. Later uncertainty must block progression
without rewriting historical verification. An old immutable receipt never
grants present eligibility. Existing supplier and fulfillment checks remain.

Capability parsers support exact old held schema and exact new evidence-scoped
schema revisions, with no optional security fields or permissive fallbacks.
Settlement itself requires only the new authority. Operational source remains
unconditionally null in startup. The flag alone cannot activate card payments.
No provider SDK, credentials, webhook, operational grant or real money is added.

Rollback after actual provider activity requires a new-schema-compatible build
that retains late-event ingress and effects recovery while disabling create and
settlement. Arbitrary older code may fail closed yet stop durable receipt of
late facts. Do not replay older function bodies, down-migrate, delete facts,
clear holds or amend protection baselines as rollback.

## Changed-path classification

Relative to base records `4ad4bcfe8129b4069b79f3cce91773c894395c51`:

- Runtime, eight paths: `server/index.ts`; assisted-order `http.ts`,
  `payment-effects.ts`, `supabase-repository.ts`,
  `payment/provider-execution.ts`, `payment/provider-journal.ts`,
  `payment/provider-settlement.ts`; and the new settlement migration named above.
- Tests/proofs, eleven paths: assisted-order `payment-effects.test.ts`,
  `supabase-repository.test.ts`, `provider-settlement-http.test.ts`,
  `provider-settlement-sql.test.ts`, `payment/provider-execution.test.ts`,
  `payment/provider-journal.test.ts`, `payment/provider-settlement.test.ts`;
  `supabase/verification/research_assisted_order_quote_provider_settlement_`
  files ending in `harness.mjs`, `http.ts`, `local.mjs`, `races.mjs`.
- Release controls, three paths: `docs/coordination/MIGRATION_DAG.json`,
  `supabase/MIGRATIONS.md`, `server/release-control-plane.test.ts`.
- Records only: `.xenios/**` and assisted-order `HEALTH_HL12_ADP03_*` records.
  Private scratch runners are not runtime or repository release controls.

The qualification receipt enumerates every changed path and every commit in
these categories, including intermediate fixture/control corrections. The
runtime SHA identifies source, not the later tree containing tests and records.

## Exact local reproduction

Use the combined qualification checkpoint containing the stated source, tests
and controls. Running only the runtime commit would omit the new test files.
Run each command serially; preserve each exit status and log independently.
These commands are local only and do not authorize a hosted database target.

```powershell
Set-Location 'C:/Users/sboad/.codex/worktrees/b22f/xenios-website'
$adp03Node = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe'
$adp03Npm = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node_modules/npm/bin/npm-cli.js'
$adp03SavedPath = $env:PATH
$adp03SavedDataset = $env:XENIOS_MASTER_OFFERINGS_DATASET
$env:PATH = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64;' + $adp03SavedPath
$env:XENIOS_MASTER_OFFERINGS_DATASET = Join-Path (Get-Location) 'server/research/master-offerings/data/member-safe-master-offerings.generated.json'
& $adp03Node --version
& $adp03Node $adp03Npm --version
& $adp03Node supabase/verification/research_assisted_order_quote_provider_settlement_local.mjs
& $adp03Node node_modules/vitest/vitest.mjs run server/research/assisted-order server/research/outbox-hl12-disposition.test.ts server/research/outbox-hl12-effects.test.ts server/research/master-offerings/early-access-catalog-coverage.test.ts client/src/research/assisted-order --maxWorkers=1 --no-file-parallelism
& $adp03Node node_modules/typescript/bin/tsc --noEmit
& $adp03Node $adp03Npm run build
& $adp03Node --import tsx scripts/acceptance/verify-migration-dag.ts
& $adp03Node --import tsx scripts/acceptance/verify-route-uniqueness.ts
& $adp03Node scripts/acceptance/verify-core-site-protection.mjs 4ad4bcfe8129b4069b79f3cce91773c894395c51 HEAD
& $adp03Node node_modules/vitest/vitest.mjs run server/release-control-plane.test.ts --maxWorkers=1 --no-file-parallelism
& $adp03Node node_modules/vitest/vitest.mjs run --maxWorkers=1 --no-file-parallelism
$env:PATH = $adp03SavedPath
$env:XENIOS_MASTER_OFFERINGS_DATASET = $adp03SavedDataset
```

The actual executions use the private `run-check.mjs` wrapper to retain separate
start/result JSON, stdout/stderr hash and bounded process snapshots. Its full
command arrays are in the receipt. The official Windows x64 Node archive
SHA-256 is `be72284c7bc62de07d5a9fd0ae196879842c085f11f7f2b60bf8864c0c9d6a4f`.
Node v20.19.0/npm 10.8.2 were invoked by full path; PATH changes were process-local.
The full suite retains conditional skips, including the separately gated PG16
verifier (`XENIOS_RUN_PG16_VERIFIER`/CI); do not label skipped cases as passes.
The SQL proof uses disposable PostgreSQL 17.11 with no network/published ports;
it is not the conditional PostgreSQL 16 or managed-platform qualification.

## In-progress evidence

- `adp03-effects-repository-initial`: Node 20.19.0/npm 10.8.2, real dataset reader,
  one worker, no file parallelism; 98 tests passed in two files, exit 0,
  1.02 seconds test time. Tested uncommitted source at records `fe54138`.
  This covers strict old/new F4 authority pairs and the controlled fulfillment
  conflict projection, not effective SQL or provider authenticity.
  Log SHA-256:
  `cd090d1218346303da2620dfb5d9e3e97985083a1b84da1c04c7c27a5e74c64d`.
- `adp03-service-unit-run1`: 339 passed, 19 failed, exit 1. New expectations
  omitted the explicit undefined argument in authority RPC mock calls. The
  failed run is retained, not relabeled. Log SHA-256
  `6b25568ac129209f764940f09771b0492cc5ae4e755f5aaec64404831ed27ddf`.
- `adp03-service-unit-run2`: corrected expectations, 358 passed in three files,
  exit 0, 1.36 seconds. Log SHA-256
  `159230969c2280e7757c38395a371c98f934a5e258deb877e14da5c1a2f47192`.
- `adp03-http-initial`: 23 passed, exit 0, 2.14 seconds; mounted protocol
  with synthetic admission, not hosted JWT/SQL qualification. Log SHA-256
  `93a56143679023be5dea3a3a763b330912bde38940fb03076481679860d010be`.
- `adp03-typecheck-initial`: passed, exit 0, 76.909 seconds. This diagnostic
  briefly overlapped the HTTP test above; it is not a serial final preflight.
  All these diagnostics tested uncommitted source and retain dirty-state receipts.
- `adp03-install-smoke1`: disposable PostgreSQL 17.11, exact no-network container
  cleanup confirmed; install/reapply, capability versions, actual full synthetic
  capture, replay, eligibility and populated reapply passed. SQL SHA-256
  `d419da94f92a086b94f4f8c17cefa2077da3a8f315490005c7c086b2282151cf`;
  proof 16.794 seconds, wrapper 17.311 seconds, exit 0. Log SHA-256
  `21ecbdb70ea6bf595a47ed3c3878ca622a4166dc19a3d9a3459c7aa633559989`.
  This smoke is not the comprehensive adversarial/HTTP proof.
  The subsequent source checkpoint adds inspected replica-mode immutability
  hardening. Its migration SHA-256 is
  `1470740bf17a0fbb9a2eeaffe9173712861a17da15d52b5492ca1f28e2c91e6f`;
  it is not the same SQL tested by smoke1. The difference was found by inspection,
  not a claimed reproduced exploit or failing diagnostic run.
- `adp03-sql-local-run1`: failed, exit 1, 104.360 seconds. The wrong-event
  fixture selected a private journal table inside a service-role command and
  received the correct ACL denial (42501), before its intended settlement
  refusal. The fixture now uses the append RPC's returned journal ID within
  the same rolled-back transaction. Runtime and permissions were not changed.
  Two SQL groups completed before failure. Exact disposable cleanup confirmed.
  Log SHA-256:
  `f15976e89cd64cdd9df03c6b9c95480f6fc2c9581a5ec4bfda8e3714f8c5f8ab`.
- `adp03-sql-static-run1`: eight source-contract tests passed, exit 0,
  0.292 seconds test time. This is not effective PostgreSQL evidence.
  Log SHA-256:
  `8531cb8e01aa20c994c2ca99a725d5e646b2e261ad0e132fadb57ae4493b7338`.
- `adp03-sql-local-run2`: failed, exit 1, 188.638 seconds. Eight SQL groups
  and all 11 mounted HTTP groups (154 SQL calls) completed before an incorrect
  fixture assertion: the established manual-verification receipt state is
  `paid`, not ADP03's `verified`. That expectation was corrected without
  changing runtime. Cleanup confirmed. Log SHA-256:
  `74b65f76d659a57014c1933d564478d64d42170c94b3544dd1575da1bd4f267b`.
  A separately inspected reverse-arbitration fixture now uses SQL
  `IS DISTINCT FROM` so a null error detail cannot pass its expected refusal.
  This latter fixture was not reached in run2; it was an inspection correction,
  not a reproduced runtime failure. Run3 is a separate diagnostic.
- Final composed SQL, serial preflight and failed aggregate completed below;
  no aggregate pass is inferred.

`adp03-sql-local-run3` failed, exit 1, 224.027 seconds. Thirteen SQL groups
and 11 HTTP groups / 154 SQL calls completed before the bare link-only insertion
test received the deferred foreign-key refusal (23503) rather than its expected
custom completeness refusal. It was rejected, not committed. The corrected test
explicitly forces the named completeness constraint, with a separate default
COMMIT assertion for 23503, instead of depending on internal deferred-trigger
order. No source change. Exact cleanup confirmed.
Log SHA-256 `2bb0c36a7c219d836254af58e314e0a0f692482e7dc769a7375dd4e5e82ab001`.

Additional-races-only diagnostics are separate from comprehensive proof:

- `adp03-races-smoke1`: failed, exit 1, 78.643 seconds. The cancellation
  contention fixture expected the original bridge's 40001, but the effective
  successor correctly refused with P0001 / `ASSISTED_ORDER_STALE_STATUS`.
  Its expectation was corrected, not runtime. Cleanup confirmed; log SHA-256
  `ff673523654f9ee2f533d0fcd5daac5b86de85b14ed47992b5d0a25b99b763c1`.
- `adp03-races-smoke2`: passed, four groups, 12 actual lock waits, 14 refusals,
  five rollback boundaries; exit 0, 111.849 seconds proof / 112.451 wrapper.
  Exact no-network PostgreSQL 17.11 container removed. Log SHA-256
  `3a5988e1eaa8a48915c9f7dcb3da5f3315d6aab7b1ec4d4e841c15384e4dc6f5`.
  This privately invoked the committed additional-races module only; it does
  not qualify the whole main proof, nor does it replace its failed earlier runs.

Peer inspection found no additional concrete authority defect; it is not
independent Claude acceptance. Proof limits remain explicit: synthetic admin
admission and normalized capture facts; the composed harness does not execute
`requireSupabaseAdmin` or JWT verification. It supplies a synthetic actor stamp,
then uses real viewer resolution, routes, services, repository and local SQL.
This is not managed PostgREST/JWT or processor authentication; real lock waits observed through
`wait_event_type = Lock`, without exact blocker/lock-target telemetry. Reverse
financial contention cases acquire the parent lock around an already-denied
competitor; they are not two admissible financial winners. Provider verification
F4 is composed with real SQL/audit recovery; ordinary supplier-progression
notification/audit sinks are synthetic no-ops. Partial-graph tests are synthetic
privileged staged writes plus actual transactional rollback, not an interruption
inside a live provider call.

## Final local SQL and preflight

`adp03-sql-local-final`: PASS at clean start/end
`9fb174c6f72ade139fc9db7b5a1a816432acf63b`, tree
`1ab5050dadb23404f5b57737795152993e97ff6d`, from
2026-10-01T12:41:37.037Z to 12:47:04.888Z. Node v20.19.0/npm 10.8.2,
PostgreSQL 17.11; 21 SQL groups, 149 expected refusals, 16 actual lock waits,
20 isolation cases included in the refusal count, 11 HTTP groups / 154 SQL
calls. Proof 327.110 seconds, wrapper 327.851 seconds, exit 0. Ten raw runtime
source hashes matched at start and end, not a continuous file attestation.
The PostgreSQL container had no network or published ports; composed HTTP uses
local Supertest. The driver
removed its exact owned container and confirmed subsequent inspect not_found;
this is driver evidence, not an independent hosted cleanup attestation.
Log SHA-256: `7e116fb768efd2e9dd9eabbf2e3039b69fce07a102d95987f73016f8ce9855ef`.

First preflight at clean `6198127ce37af2194d091e662884d27a79e1d9cd`
is NOT a passing preflight. Affected 1,424, typecheck, build,
DAG, route uniqueness and protection CLI passed, then controls finished
50 passed / one failed / one conditional skip, exit 1. The route census still
expected 452 call sites / 461 registrations instead of the actual 453 / 462.
`edf8526` corrected those exact counts without weakening uniqueness. Failed log:
`2e4665261d3a4697481d473ffef2081595781b1b35d8e0e28566700952372159`.

All seven checks were rerun serially under new `-final2` job identities at clean
`edf8526bdefc34b8e87fa6e46585573535dba6cd`, tree
`2a46f7a5b39f30f31e7dbca16e336fbd6c1727b4`. Same clean start/end for every
command; Node v20.19.0/npm 10.8.2, real dataset reader, one Vitest worker:

| Check | Actual result | Wrapper seconds |
| --- | --- | --- |
| Affected catalog/assisted-order | 1,424 passed, 47 files, zero skips | 65.158 |
| Typecheck | PASS, exit 0 | 11.187 |
| Production build / no-em-dash | PASS; 1,351 source / 225 build files, zero forbidden forms | 27.271 |
| Migration DAG | PASS, 52 nodes | 9.710 |
| Route uniqueness | PASS, 453 call sites / 462 registrations | 4.931 |
| Protection CLI | PASS, 38 hard hashes; two seam warnings remain | 0.403 |
| Release controls | 51 passed, one conditional PostgreSQL 16 skip | 81.766 |

Build retains existing mixed-import and chunk-size warnings. The protection CLI
pass is not the strict baseline assertion's pass. Child-process sampling is
bounded, not continuous runtime attestation; build sampling observed wrapper/npm,
not every nested build process. Exact commands, hashes and receipts are in
`HEALTH_HL12_ADP03_QUALIFICATION_20261001.json`.

Aggregate launch guard: the first launcher invocation refused before spawning
Vitest because the records commit had not been created (a message filename was
mistyped in the explicit Git staging list). Exit 1, no test execution or test
result. The unchanged clean-checkpoint assertion correctly prevented a dirty
start. This is separate from any subsequent aggregate result.

## Completed aggregate (failed, not timed out)

Job `adp03-full-suite-final`, Node v20.19.0/npm 10.8.2, real dataset reader,
one worker and no file parallelism:

- Start: 2026-10-01T13:00:56.897Z, clean
  `dc41f1a073aace6556a8a4f3a1f9e817c57ae02c`, tree
  `4ca883bc43422f02ebee12c6e423216e4a07861d`.
- Finish: 2026-10-01T13:20:31.463Z, clean
  `8cf46772ab5b15528fd6d46030741af38d3bbfb4`.
- 19,357 passed, one failed, 85 skipped; 1,018 passing files, one failed file,
  six skipped files. Exit 1, null signal; no timeout reported.
- 1,173.16 seconds Vitest / 1,174.566 seconds wrapper.
- Sole failed test: `server/core-site-protection.test.ts:387`, the unchanged
  clean-seam assertion reporting the two exact baseline mismatches below.
- Source, tests and controls match the frozen identities at recorded boundaries;
  only records commits occurred during the run. This is not continuous
  filesystem attestation. Both start and end were clean.
- Log SHA-256:
  `03719e7d35db5b42b0b2a9dab6c4bf702ffbe54f9a0f4779881944d7237c3ab5`.
- Twenty process samples identified 19 distinct child workers using the pinned
  Node path; the last sampled worker's executable path was unavailable. This
  does not attest every worker's full lifetime or resolve that missing path.

The full receipt preserves all earlier ADP03 run results, skipped cases,
commands, source/control hashes, process samples and commit/path classification.
Final SQL raw output is embedded. Other full logs are local artifacts with
hashes and receipts, not a fully portable archive of every intermediate run.
No isolated pass changes this aggregate's failed status. No protected hash or
assertion was weakened or amended.

## Unchanged external and release holds

Independent reviewer handoff: continue the existing Claude session, do not
repeat its `915a535` review as though it covered this source. Latest remote
reviewer tip observed read-only at 13:01 UTC was
`e7b74feb04567cac16d5b8bd089a7ae1218721d2`; report 23 covers runtime
`915a5354376f0f5e9c850e5fddd2b51be78d2e43`, not ADP01/02/03. Repository messages
record review dispatch and heavy-job coordination, not reviewer receipt,
execution or acceptance. Review this exact source/test/control combination for:

1. Strict capability compatibility and the unconditionally null startup source.
2. Actual admin admission plus separate source/account/mode/policy/grant scope;
   synthetic local middleware is an explicitly unproven production boundary.
3. Quote, attempt, capture, single-use evidence and exact economics binding;
   wrong actor/source/account, old schema, mixed versions and arbitrary body
   fields must not authorize settlement.
4. Atomic observation/claim/verification/paid-event/held-outbox completeness,
   replica-mode guards, concurrency, partial writes and source/grant revocation.
5. Replay after later facts or progression returns immutable history without
   clearing holds or granting present fulfillment eligibility.
6. Audit-before-notification-dispatch and recoverable F4 effects after actor
   revocation, response loss, restart and signing-key rotation.
7. Separate existing supplier gates, late-fact holds, no historical adoption,
   and compatibility-preserving rollout/rollback with late-event retention.
8. Exact startup protected diff/hash disposition, unchanged Research gateway
   baseline, test strength, failed/skipped-run separation and managed limits.

Prior finding identities remain visible: F1 operational evidence/grants; N2
void/refund/dispute and historical outcomes; HIST-FREEZE; ROLL-05;
ROLL-06-R1 / NEW-APP-ORDER; GUARD-NEWSTATE; ERR-ORDER / AVAIL / TEST-GAP /
QUOTE-CONTRACT; NEW-RECORD-*; CSP-02/03/04/05/08. Successor-local F4, X2,
account-history, HIST-02, N2 no-funds, ADP01/02/03 and HL11 work is not an
independent closure or a new severity census. Preserve the predecessor's
adjudicated findings until an exact successor review replaces them.

Future refund work must distinguish immutable captured-payment verification
from current balance/disposition. A refund received before settlement currently
prevents settlement; a later refund preserves verification and holds progress.
Neither case has governed refund-resolution authority. The existing no-funds
record is not a refund record. Do not widen that enum, invent refund finality,
rewrite payment history, clear uncertainty or enable live refund execution.

The real independent manual evidence source and grant workflow remain F1's
operational dependency. Provider authentication, actual replay guarantees,
processor/bank choice and activation are not proven by synthetic tests.
Void/refund/dispute and historical reconciliation remain separate engineering.
Price holds, catalog identity and imagery review remain unchanged. No current
Claude acceptance or new P0/P1/P2 census is claimed.

The protection manifest is not edited. New startup bytes need independent
review and any exact owner amendment; an older approval is not reusable.
Canonical Git blob hash pairs at source `2f0a975` are:

| Protected seam | Pinned baseline | Current source |
| --- | --- | --- |
| `server/index.ts` | `1d6594d6389e2ac67d9af85213854e05387899dfe0102fa577e447565e68c315` | `ba5800e604482af4f1ca56b08c43abd3d1207473a6e213ab99c22113471a4521` |
| `server/research/index.ts` | `b8db03cf7b51b2bd225e4f96c9cf3762f97188a7babcaf89591815c226263070` | `5b9f683b183a095e258908e0e0086888c71b7666b0e384367b1bfde0c4124188` |

The raw CRLF checkout hash for `server/index.ts` is different from its canonical
Git blob hash. Do not substitute the wrapper's raw-byte hash for this reviewed
baseline pair. No owner amendment is implied by recording it.

Managed roles, grants, RLS, PostgREST, history, secrets, isolated outbox and
rollback still need separate exact target qualification and fresh authority.

Production/staging mutated: no. Deployment, real email, money, procurement,
clinical actions, account grants and price release: none.
