# HL-12 ADP02 provider create ownership and recovery

Status: pushed candidate frozen for final local qualification, not a release.

## Exact candidate

- Runtime: `27463d764ba01219c67081a3548ffdc3ff7d2b40`.
- Runtime tree: `467c8556390ff9274a4adda5826eed7ab9603b23`.
- Test-only: `8f56a7f500da36dbe37818b50f26b611ecb78b23`.
- Release controls: `a16f562d94dc907728fd0d8c708d48d098e3c1f8`.
- Final local SQL and preflight passed; aggregate result is pending below. Earlier
  diagnostics do not constitute the final full-suite result.

## Continuity and scope

- Same branch: `codex/xenios-health-launch-implementation-20260930`.
- Frozen predecessor runtime: `e9f221c974f45831a7ad1a13bcb2bd6d8198db42`.
- Predecessor tree: `30e570b77d19de0ebdb8b40765334a8f98cea5e0`.
- Predecessor handoff: `77cdeaec34ae19bbcc9615f75887d21fe86f0746`.
- Active task: `HEALTH-HL12-ADP02-PROVIDER-CREATE-RECOVERY-20261001`.
- New migration: `supabase/migrations/20261001102904_research_assisted_order_quote_provider_execution.sql`.
- Existing ADP01 migration, tests and qualification records remain unchanged.

This successor implements provider-independent preparation and readback only.
It does not authorize settlement, payment verification, paid status, capture,
void, refund, fulfillment, historical-paid adoption, or removal of uncertainty.
There is no selected processor, operational source, policy or execution grant.
The mounted application supplies `source: null` unconditionally, including when
the feature flag is true. No webhook is mounted by this slice.

## Contract

An authenticated admin command names an existing held provider attempt and has
an empty body. The server, not the browser, supplies actor and source identity.
The database independently derives the accepted quote, exact amount/currency,
acceptance and request identity. A separately configured execution grant and
explicit replay policy are required in addition to the earlier reservation.

Durable create ownership precedes the transport call. A short committed claim
owns one dispatch; no database transaction remains open over a network call.
The first claim fixes the create key and replay deadline. Later retry claims
cannot extend that deadline or change the body. Existing bound provider objects
are retrieved, not created again. A repeated claim receipt is not new permission
to dispatch. Concurrent callers without ownership wait.

The adapter boundary requires independently returned provider object fields,
including provider/account/mode, quote/order metadata, exact amount/currency and
external identities. Echoing the create request is not evidence. The core
contains no processor SDK, credentials, provider defaults or live configuration.
An actual provider adapter and independently verified operational policy remain
unimplemented and unqualified.

The first comprehensive diagnostic exposed no failure in its included cases,
but a later targeted clock reproduction did: a behind or backward-jumping
application wall clock could permit create after the database replay deadline.
That failed run is retained below. The implemented narrow correction
adds a database-issued dispatch duration and capability, and deducts monotonic
elapsed time measured before the claim RPC. An application wall clock cannot
grant a fresh replay window. Final qualification must include this correction;
the earlier comprehensive pass cannot be relabeled as covering it.
This does not attest database clock discipline or a real provider's delayed
delivery, abort and expired-key semantics. Those require operational adapter
qualification. Client timing alone is not a guarantee of exactly one external
network call or one provider-side effect.

Normalized allowlisted results are retained immutably, including unknown and
conflicting observations. Raw responses, signatures, client secrets and tokens
are neither persisted nor returned. Provider payment and optional session
identities are write-once and scoped to the existing unique source/account/mode.
A later observation may establish a previously absent optional session identity,
but cannot replace a non-null one. No result makes an order paid.
Result replay returns its own immutable observation, not later binding state.
The separate context read reports the current binding. A public `recorded`
receipt does not clear a later conflict, global hold or financial restriction.

Timeout, interrupted persistence and response loss do not mean no funds.
Recovery uses the same key and body only within an explicitly granted replay
guarantee; otherwise the attempt remains held for reconciliation. Late responses
to an issued claim are retainable even after lease or grant revocation. This
does not authorize a new dispatch after revocation. The committed claim is the
authorization linearization point; revocation cannot atomically recall an
external call already authorized by that claim.

Bound-object retrieval may proceed despite an existing journal or global hold
after the active lease ends. This narrow readback exception cannot create a
second object, replace a binding, settle money or clear the hold. A configured
source/policy/actor and exact accepted quote are still required.

Source adapter revisions and per-source policies are immutable except for first
revocation. Operational source/policy rotation is not implemented here. The
unique provider/account/mode namespace cannot be bypassed with a replacement
source alias; a controlled, reviewed successor would be required for rotation.

## Database boundary

The additive migration requires the exact final ADP01 v2 installation, not just
a matching version label or a self-consistent different predecessor. It keeps
the journal v2 held capability contract and adds execution v1 with actual
READ COMMITTED required. Stronger/stale snapshots are refused rather than
silently downgraded. The schema-definition seal is drift detection, not an
arbitrary database-owner defense or proof that provider facts are authentic.

Five private forced-RLS tables hold policy, execution grants, claims, results
and identity bindings. Only the exact service-role RPC surface is permitted;
direct client table writes and internal-helper calls remain denied. Triggers
derive claims/results, enforce immutability, and remain enabled in replica mode.
Financial decisions and existing uncertainty fences are not weakened.

Only disposable local PostgreSQL testing is authorized. No migration has been
applied to managed staging or production. Managed roles, effective functions,
PostgREST isolation, ledger history, audit/outbox dependencies and rollback must
be independently qualified under new exact scoped authority.

Rollback means disabling new ingress/execution while preserving all claims,
results, journal entries, bindings and financial holds, then reviewed roll-forward.
Do not delete external-effect evidence, replay old financial function bodies,
or downgrade the active schema to make a hold disappear.

## Evidence accounting

The diagnostic runs below preceded the committed freeze. Final exact commands,
results and records tip will be added after local qualification. The runtime,
test and control commits above are distinct and pushed.

The predecessor aggregate remains a separate run: 18,998 passed, one failed,
85 skipped, exit 1, no timeouts. Its sole failure is the unamended protected
Research gateway seam assertion. It is not a passing aggregate and does not
qualify ADP02 changes. Existing owner approval for two older baseline amendments
does not approve current or future bytes. The protection manifest is unchanged.

Early diagnostics retained separately:

- `adp02-http-initial`: 50 passed in two files, exit 0. Mounted protocol tests
  include synthetic admission; this is not live Supabase JWT qualification.
- `adp02-execution-unit-run1`: 97 passed in one file, exit 0. Mocked source/RPC
  unit checks are not actual provider or database proof.
- `adp02-install-smoke1`: first install, repeat install and both capability
  readers passed on disposable no-network PostgreSQL 17.11; cleanup confirmed.
  This tested earlier migration bytes, before a subsequently identified missing
  session-identity comparison against earlier journal observations. A passing
  installation smoke did not demonstrate that semantic case.
- `adp02-execution-unit-run2`: 107 passed, exit 0, before clock correction.
- `adp02-sql-local-run1`: 19 SQL groups, 105 expected refusals, four actual
  lock-wait races, 23 isolation cases and ten HTTP/service/SQL groups (100 calls)
  passed; all four recorded runtime hashes stayed unchanged. Exact disposable
  PostgreSQL 17.11 container cleanup passed. This run precedes clock correction
  and combines source, grant and policy revocation in one scenario, not three
  independent revocation proofs.
- `adp02-sql-static-run1`: eight source-contract tests passed, exit 0. Static
  tests are separate from effective database behavior.
- `adp02-clock-repro-run1`: two failed, 107 filtered/skipped, exit 1. Both
  behind and backward-jumping application-clock cases dispatched after the
  simulated database deadline. This is a real reproduced timing defect, not
  an environmental timeout. Log SHA-256
  `06361da000b6249fc184efddde54b1da43798f7ca7cb32a4d5fc4deb7cf01d81`.
- `adp02-clock-fixed-run1`: the same two clock regression assertions passed,
  128 other tests filtered/skipped, exit 0. The claim fixture now includes the
  newly required database timing fields. This is a targeted pass, not a suite.
- `adp02-execution-unit-run3`: 124 passed, six failed, exit 1. Newly added
  monotonic-clock parameterized cases supplied a number instead of a readings
  array, making the fixture return undefined before claim. The run remains
  failed; it is not replaced by the subsequent correction.
- `adp02-execution-unit-run4`: corrected parameterized fixture, 130 passed,
  zero skipped, exit 0. Log SHA-256
  `db3a883e47f12ec93a9a5c75b0a3a35c64f8e2c7bb17d1aff1fcc99ae47bf2c3`.
- `adp02-sql-local-run2`: corrected timing source, 20 SQL groups, 116 refusals,
  four lock-wait races, 23 isolation cases and 11 HTTP groups (108 SQL calls),
  exit 0, 229.430 seconds; cleanup confirmed. Independent grant-only and
  policy-only revocations passed. Its relative-clock fixture was subsequently
  strengthened, and replica-mode/overload cases were added for the final run.
- `adp02-typecheck-initial`: failed, exit 2, TS2345. The expired dispatch branch
  used an internal failure string outside the shared provider contract. A narrow
  correction uses the existing `REJECTED` value and an explicit return type;
  no shared enum or gate was widened.
- `adp02-execution-unit-run5`: type correction, 130 passed, exit 0.
- `adp02-typecheck-fixed`: passed, exit 0, 10.365 seconds.
- `adp02-routes-initial`: passed, 461 registrations across 452 call sites,
  exit 0. This includes the new default-off, source-null admin prepare route.

Final clean database qualification `adp02-sql-local-final` ran at
`4166afd204f7e60594d15bd4578744e769d24d30`, tree
`c302243ba81f15ffd26707b6ab9ddf06bb1eb87d`: 21 SQL groups, 138 expected
refusals, four actual lock-wait races, 23 isolation cases (included in refusals),
and 11 mounted HTTP/service/SQL groups with 108 SQL calls passed. Exit 0;
234.589 seconds proof, 235.123 seconds wrapper; PostgreSQL 17.11. The no-network,
no-published-port disposable container was removed. Runtime hashes and HEAD
were unchanged; only this handoff record was dirty at the end. Log SHA-256:
`c4d07d78db04dac1b02ee45dac8d7a77c19a3480878c9c88c68d0aaa083c6eff`.

The final clock case fixes application wall time explicitly inside the issued
window while the real database lease has expired: zero transport calls. All
five replica-mode write guards and an unexpected executable authority overload
were exercised. Grant-only and policy-only revocation were tested independently.
Actual old ADP01 v2 execution refusal was tested; the uncommitted pre-timing
ADP02 schema was not independently reinstalled. Sampled Node process paths are
not continuous lifetime attestation. This local pass does not replace the
pending aggregate, managed qualification or independent review.

Final serial preflight used Node 20.19.0/npm 10.8.2 and the real dataset reader:
1,216 affected tests passed in 43 files, no skips, 81.18 seconds; typecheck
passed in 21.261 seconds; build passed in 45.243 seconds with zero forbidden
forms across 1,349 source and 225 production-build files. Migration DAG passed
51 nodes; route uniqueness passed 461 registrations/452 call sites. Release
controls passed 51 tests with one existing conditional PostgreSQL 16 skip,
75.98 seconds. Local PostgreSQL 17.11 proof does not replace that skipped test.
The protection CLI verified 38 hard hashes and warned on two changed seams;
it does not replace the stricter aggregate seam assertion. No gate was weakened.

Preflight began at clean `4569a2719a22d2b0a1730c8734d4e12447074886`;
later commands ran across records-only coordination commits/edits at
`8c462596281e6607e551f95d59c17b9980acae93`. Source, tests and controls stayed
frozen. Exact per-command dirty states remain in the receipts; not every
preflight command began with a clean records directory. The aggregate must
start at its own clean committed checkpoint and preserve its actual exit status.

Protected seam hashes at this runtime (canonical Git blobs, not CRLF checkout
bytes) remain a required independent review and possible owner amendment:

| Path | Pinned baseline | Current runtime |
| --- | --- | --- |
| `server/index.ts` | `1d6594d6389e2ac67d9af85213854e05387899dfe0102fa577e447565e68c315` | `dde2f0bedf94f64600c19741b5137b53b857e98651150f07e4c82a52395db3be` |
| `server/research/index.ts` | `b8db03cf7b51b2bd225e4f96c9cf3762f97188a7babcaf89591815c226263070` | `5b9f683b183a095e258908e0e0086888c71b7666b0e384367b1bfde0c4124188` |

Do not reuse a previous runtime's hash pair as approval for this one. This
slice changes only the startup file of these two paths; the second seam is a
previously unresolved baseline. No protection manifest amendment was made.

The exact pre-timing service and migration and the timing-fixed pre-typecheck
service are privately archived with hashes matching the recorded diagnostics.
Original uncommitted test bytes were not independently hashed, so byte-for-byte
archival reproduction of every intermediate fixture is not claimed.

The authoritative local runtime is the private official Windows x64 Node
`v20.19.0`, npm `10.8.2`; archive SHA-256
`be72284c7bc62de07d5a9fd0ae196879842c085f11f7f2b60bf8864c0c9d6a4f`.
Commands invoke the binary by full path and change PATH only for child processes.
Wrapper receipts preserve command, dataset, start/end revision, dirty state,
exit status, elapsed time and log hash. Child-runtime samples do not constitute
continuous ancestry attestation; intermediates such as `cmd.exe` can hide
grandchildren from Node-only CIM sampling. Missing observations remain missing.

## Local reproduction boundary

Use a separate clean review checkout of the recorded qualification checkpoint,
with the exact Node 20.19.0 dependencies already installed. Do not reset another
worker's checkout or run simultaneous heavy jobs. The runtime SHA alone does
not include the later test-only and release-control commits; compare the named
commits to establish the tested source equivalence. Exact original invocation,
working directory, real dataset and child-runtime observations belong to the
qualification receipt. Fresh reproduction must use new log names.

From that checkout, these are the underlying commands (no managed connection):

```powershell
$xeniosNode20 = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe'
$xeniosNpm20 = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node_modules/npm/bin/npm-cli.js'
$xeniosOriginalPath = $env:PATH
$xeniosOriginalDataset = $env:XENIOS_MASTER_OFFERINGS_DATASET
try {
  $env:PATH = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64;' + $xeniosOriginalPath
  $env:XENIOS_MASTER_OFFERINGS_DATASET = Join-Path (Get-Location) 'server/research/master-offerings/data/member-safe-master-offerings.generated.json'
  & $xeniosNode20 --version
  & $xeniosNode20 $xeniosNpm20 --version
  & $xeniosNode20 supabase/verification/research_assisted_order_quote_provider_execution_local.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Local SQL proof failed; preserve this run.' }
  & $xeniosNode20 node_modules/vitest/vitest.mjs run server/research/assisted-order server/research/outbox-hl12-disposition.test.ts server/research/outbox-hl12-effects.test.ts server/research/master-offerings/early-access-catalog-coverage.test.ts client/src/research/assisted-order --maxWorkers=1 --no-file-parallelism
  if ($LASTEXITCODE -ne 0) { throw 'Affected tests failed; preserve this run.' }
  & $xeniosNode20 node_modules/typescript/bin/tsc --noEmit
  if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed.' }
  & $xeniosNode20 $xeniosNpm20 run build
  if ($LASTEXITCODE -ne 0) { throw 'Build or no-em-dash gate failed.' }
  & $xeniosNode20 --import tsx scripts/acceptance/verify-migration-dag.ts
  if ($LASTEXITCODE -ne 0) { throw 'Migration DAG failed.' }
  & $xeniosNode20 --import tsx scripts/acceptance/verify-route-uniqueness.ts
  if ($LASTEXITCODE -ne 0) { throw 'Route uniqueness failed.' }
  & $xeniosNode20 scripts/acceptance/verify-core-site-protection.mjs 77cdeaec34ae19bbcc9615f75887d21fe86f0746 HEAD
  if ($LASTEXITCODE -ne 0) { throw 'Hard protection check failed.' }
  & $xeniosNode20 node_modules/vitest/vitest.mjs run server/release-control-plane.test.ts --maxWorkers=1 --no-file-parallelism
  if ($LASTEXITCODE -ne 0) { throw 'Release controls failed.' }
  & $xeniosNode20 node_modules/vitest/vitest.mjs run --maxWorkers=1 --no-file-parallelism
  # Preserve the aggregate's actual exit status, failures and skips. A passing
  # protection CLI with seam warnings is not a passing protection assertion.
  $xeniosAggregateExit = $LASTEXITCODE
  Write-Output "Aggregate exit status: $xeniosAggregateExit"
} finally {
  $env:PATH = $xeniosOriginalPath
  $env:XENIOS_MASTER_OFFERINGS_DATASET = $xeniosOriginalDataset
}
```

The SQL proof uses the existing cached PostgreSQL 17.11 image, `--pull=never`,
no network and no published ports; it inspects the actual version and removes
only its exact owned disposable container. It is not a managed migration runner.
Project `tsc` excludes test files and the verification TypeScript fixture; their
execution through Vitest/tsx is not a separate strict typecheck of those files.

## Remaining work

The selected payment/evidence provider and real authorized grant procedure remain
external dependencies for actual adapters and activation. Provider-neutral
settlement, governed void/refund, historical reconciliation and public journeys
remain engineering work, not blocked on choosing a processor. Managed qualification,
independent successor review and the separate protection amendment remain open.
Do not infer that a processor decision blocks this provider-neutral engineering.

The next financial slice must bind a qualified durable capture journal entry to
the existing canonical observation/verification/paid-event authority, with one
immutable capture link, exact single-use evidence and atomic existing outbox
obligation. Current `bound` journal classification is not capture authority.
Generic provider-string verification must remain refused. System-versus-admin
audit attribution and separate fulfillment eligibility need explicit coverage;
an own-attempt exception cannot become a blanket uncertainty bypass. None of
that settlement work is represented as implemented by this held-only slice.

The current 424-canonical / 423-customer catalog reconciliation and genuine
holds remain intact. Care prices remain withheld in the Research projection,
not removed from Product Control. Product/public/account/admin/supplier journeys
remain queued after payment correctness. No replacement prices, discounts,
commissions, partnerships or credentials are invented.

The imagery and media-decoupling lanes remain separate. Batch 0 has 25 generated
non-public candidates, zero approved/public/integrated assets. No re-render or
integration is authorized merely by the stale earlier zero-render checkpoint.
Independent Claude review remains separate; no ADP02 acceptance is claimed.

Deployment status: not deployed. No hosted configuration, operational account grant, price
release, real email, money, procurement or clinical action was performed.
