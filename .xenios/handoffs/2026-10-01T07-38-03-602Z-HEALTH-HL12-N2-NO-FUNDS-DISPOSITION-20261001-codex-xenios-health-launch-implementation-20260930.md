# HL-12 N2: positive no-funds evidence and explicit cancellation

Source and tests locally qualified with an explicit failed release gate. Not
release approval or independent Claude acceptance. The final aggregate completed
18,856 PASS /1 FAIL /85 SKIP, exit1. The only failure is the unchanged protected
seam-baseline assertion covering two paths; no timeouts occurred in this run.
The prior failed aggregate remains a separate failure.

## Exact candidate

- Runtime source: `cb9b8d66a3cec93dd4d9a26fab25ed1d399f9bbb`
- Runtime tree: `033621b0cbdeb426caad8e00f6da842bec672a6a`
- Test-only commit: `e46f5d4de21250e3bb8e69445521b96ca5a6dbea`
- Release controls: `9ce940f6914a957e244dac95ff2b0252550bd2b8`
- Node: `v20.19.0`; npm: `10.8.2`, isolated official Windows x64 runtime.
- Migration canonical Git-blob SHA-256:
  `512799646a0779dcaa88ea036a9920ff2f54c33b48ff831825e9870dcd0b8881`.

The source commit contains seven runtime files. The next commit contains ten
tests/local-proof files. Release controls register ledger90/DAG49 and the exact
459 registrations/450 call sites; no protected hash or test timeout changed.
Coordination and handoff commits do not change the runtime candidate.

## Current local evidence

Full suite at clean frozen `03bf5933a08352e14865622358f0adfbb7f27c7f` completed
at2026-10-01T07:29:10.419Z: 1004 passing files,1 failed,6 skipped;
18,856 passing tests,1 failed,85 skipped;1081.49s,exit1. No source/test writes
occurred during the run. Later HEAD changes were records only. Private Node
v20.19.0/npm10.8.2 and process snapshots attest the runner, Vitest and rotating
child workers using the same isolated Node executable. The real catalog dataset
reader was enabled, with one worker and no file parallelism.

Final build at the same clean checkpoint passed in24.080s. Its no-em-dash gate
checked1343 source files and225 production-build files with zero forbidden forms.
Exact commands, revisions, timestamps, log hashes, child-runtime snapshots, all
14 wrapper runs and four separate SQL runs are indexed in
`HEALTH_HL12_N2_QUALIFICATION_cb9b8d6.json`. Full-suite log SHA-256:
`6f985a2fff6ef3ceef46b3eee225fa94ed2869be0698a7a1baeb37eb93dcb7f5`.
Neither the narrower protection CLI pass nor earlier passing diagnostics
overrides the aggregate failure at `server/core-site-protection.test.ts:387`.

Final N2 disposable SQL run4 passed in137.830s, exit0, PostgreSQL17.11:
116 expected refusals,13 independent-connection races and9 composed mounted
HTTP/service/SQL groups (65 real service-role calls). Container cleanup passed.
This is a precommit working-tree proof, not a run started at the source SHA;
its exact migration bytes match the committed source. Apply-twice means twice
before adding N2 dispositions, not arbitrary replay on a populated database.

Affected run2 passed1020 tests across39 files in82.12s, exit0. It includes the
real dataset reader, catalog coverage, assisted-order, customer status and
account history. Application source remained fixed; a coordination-only commit
changed HEAD during this precommit qualification. Typecheck run2 passed on the
final namespace-hardened source. Migration DAG accepted49 nodes/checksums.

Pinned runtime: `C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe`.
Official archive SHA-256:
`be72284c7bc62de07d5a9fd0ae196879842c085f11f7f2b60bf8864c0c9d6a4f`.
Commands/results/provenance live in
`C:/Users/sboad/.codex/tmp/health-n2-20261001/`; final proof log is
`C:/Users/sboad/.codex/tmp/research_assisted_order_quote_no_funds_disposition_run4.log`,
SHA-256 `36b9d3e31f07f7b619495749ece0dffe181b2f0e035f7b2607b5443a7a1150f5`.

## Scope and authority

Continues the existing `codex/xenios-health-launch-implementation-20260930`
branch after source `3da909542a152552331074176f966f820600e948`, tree
`e644ab4368c01e0a75ac5a89c6c09dbf8f8e7f2d`, records
`8de6c81d88d7f66ea6dc07f4006b9a8fc4a7de97`. The N2 exact-path lease was pushed
in coordination-only commit `55954aa127dbb93a061e615ab089aa3c8163bc30`.

This first N2 slice supports only an independently sourced, terminal
`never_received` receipt plus explicit cancellation of a current accepted quote
in `reviewing`, `payment_pending` or `payment_review`. Zero or net-zero balances,
missing records, source timeouts, screenshots, typed statements, superseded
observations and historical paid labels cannot establish this fact. Returned
money is not classified as never received.

Void, refund, provider, historical-paid and post-fulfillment resolutions remain
held. This is not a claim that all N2 work is complete. No historical verification
is invented and no original observation, source claim, correction, accepted
quote, paid verification or fulfillment fact is erased.

## Mounted application

The existing verified-admin middleware protects one explicit POST:

`/api/admin/research/assisted-orders/:requestId/financial-dispositions/no-funds/cancel`

The strict request is `{ evidenceHandle, intent: "cancel" }`. It contains no
trusted amount, currency, actor, financial outcome, source receipt or graph
fingerprint. The adapter's configured source namespace must have an exact active
actor grant before lookup; an active grant for another source is insufficient.
The returned receipt must match that captured namespace. Even an original actor
with two active source grants cannot replay through a different source.
The service obtains a private SQL-authorized context before the
independent source lookup, passes a frozen whole observation/correction graph,
and rebinds the returned immutable receipt to the exact request/quote/graph.
Lookup is abortable and bounded to five seconds. A failure preserves the hold.

`RESEARCH_ASSISTED_ORDER_DISPOSITIONS_ENABLED` defaults off. Readiness requires
the canonical audit authority and exact disposition-effects SQL authority. The
production evidence adapter remains explicitly `null`; no live financial source
or grant procedure has been invented. Installing SQL or flipping this flag does
not configure independently verifiable evidence.

The browser receipt contains only disposition/request identity, kind, terminal
state, resolution time and replay status. Source identities, graph and actor
remain private. A post-commit recovery failure reports that cancellation was
recorded and follow-up remains pending; it never claims payment verification.

## Effective SQL and durable effects

The CLI-generated pending source migration is
`supabase/migrations/20261001062651_research_assisted_order_quote_no_funds_disposition.sql`.
It extends the canonical financial tables and outbox; no parallel order, price,
audit or notification system is introduced.

The command locks the request before making the financial decision, checks a
separate actor/source grant, rechecks the accepted quote and bounded complete
graph, and consumes a source receipt once. Evidence, disposition, cancellation,
status event and held canonical outbox obligation belong to the same transaction.
New financial writes and status revival are refused after terminal disposition.
Existing immutable facts remain intact, including corrections and source claims.

The source schema installs zero operational grants. The three new private tables
force RLS and revoke direct access from public, anon, authenticated and service
roles. Only seven exact RPC signatures are service-executable; helpers stay
private. Supabase's permissive function defaults are explicitly revoked.
Managed preflight must independently establish the legacy canonical outbox
(ledger3), `extensions.pgcrypto`, effective predecessor guard bodies, actual
function-owner/BYPASSRLS posture and trusted audit-HMAC adapter. DAG ordering alone
does not attest these conditions.

The existing worker recovers a bounded keyset page before claiming notices.
Recovery binds the original actor, timestamp, request and transition to the
existing canonical audit adapter, then releases the held notice atomically.
It does not need the original actor's still-active grant or a repeated source
lookup. Restart, competing recovery and HMAC key rotation do not create a second
notification identity. Poison rows do not indefinitely starve later work.

The last-mile dispatcher independently validates the stored envelope. A stripped
foreign key or reserved event key/copy cannot turn the financial notice into an
ordinary cancellation. Ordinary pre-migration nonfinancial cancellation notices
do not depend on the new SQL. Existing paid-notification protections run first.
Assisted-order mail remains the existing plain-text format.

## Boundaries and next decisions

The trusted future evidence adapter, not a JSON shape or a service-role caller's
assertion, must authenticate the operational source. Local synthetic receipts do
not establish a bank integration, provider event authenticity, authority to
cancel real orders or permission to send communications. SQL enforces binding,
grant, finality, single-use and atomicity; it cannot authenticate a bank itself.

Before activation, identify the actual evidence workflow, source namespace,
scoped actor-grant process and applicable cancellation/refund policy. Separately
qualify the full exact pending predecessor chain in managed non-production,
including PostgREST and hosted authentication/permissions. No migration history
repair or arbitrary predecessor replay is authorized. Preserve financial records
and keep the feature disabled if qualification fails; roll forward through a
reviewed repair rather than dropping evidence.

The former exact two-hash owner approval remains applied and is not reusable.
This slice changes `server/index.ts` again. Its new normalized hash is
`216273c135e859b54a6bc5a4e58abc563d1e44e2415470b9718d499340b4e666`, versus pinned
`1d6594d6389e2ac67d9af85213854e05387899dfe0102fa577e447565e68c315`.
The unchanged Research gateway remains actual
`5b9f683b183a095e258908e0e0086888c71b7666b0e384367b1bfde0c4124188`, pinned
`b8db03cf7b51b2bd225e4f96c9cf3762f97188a7babcaf89591815c226263070`.
Neither baseline is amended here. The hard-file CLI result is not equivalent to
the still-required clean-seam assertion and exact owner approval.
The bounded N2 CLI comparison from records `8de6c81` to frozen `03bf593` passed:
27 changed paths,38 curated hard-file hashes verified, seven explicitly listed
test paths and one touched seam (`server/index.ts`). It reports both changed
seam contents without failing. This narrower CLI PASS does not override the
whole-suite seam-baseline failure and does not qualify the entire historical
branch-versus-main diff.

No managed migration, hosted configuration, deployment, merge, price release,
account grant, real email, money movement, procurement or clinical action was
performed. Previous browser/zoom evidence is not reclassified as this successor's
browser qualification. The latest observed Claude tip remains
`e7b74feb04567cac16d5b8bd089a7ae1218721d2`, reviewing `915a535`, not this N2 source.
An exact-successor request is not evidence that the reviewer has run it.

## Evidence interpretation

The PostgreSQL proof uses a disposable PostgreSQL 17.11 container with no network
and no published ports. Synthetic owner setup installs the canonical outbox
worker DML permissions, service-role BYPASSRLS and permissive Supabase-like
default function/table privileges, then checks that the new financial schema
revokes them. These are fixtures, not a read of any managed role configuration.

The composed helper uses real Express, viewer resolution, route, command service,
canonical audit adapter, recovery and effective service-role SQL through local
`docker exec psql`. Authentication stamps and independent source receipts are
synthetic. It does not validate an actual bank/feed, provider signature, managed
PostgREST, hosted JWT or browser interaction. It never dispatches the stored
synthetic messages. Worker delivery tests replace the delivery port.

Interrupted-write qualification tests transaction rollback and a post-commit
recovery failure/restart. It is not crash-injection at every database instruction,
a physical database recovery exercise or a managed-network fault test.

Development failures must remain separate from later passes:

- SQL run1 reached nine lock races, then its deferred-edge fixture attempted a
  prohibited second active observation for the same reference.
- SQL run2 reached nine races, then the corrected deferred-edge fixture supplied
  a label where `corrected_by` requires a UUID.
- SQL run3 reached the repaired race, then the synthetic outbox role lacked the
  predecessor's worker DML privileges and refused before the tested trigger.
- The source-namespace reproduction failed two tests with 80 filtered/skipped;
  the corrected focused run passed 174 tests across three files.
- The first added worker-render assertion incorrectly expected HTML from the
  existing plain-text mail port: 10 passed/1 failed. Its correction preserved
  the runtime format and passed all 11 tests, including the actual truthful text
  and absence of internal disposition identity in the customer message.

These are not relabeled as successful runs. Their local logs and exact hashes,
and the final proof/full-suite result, belong in the qualification receipt.

## Exact local reproduction

Use a clean checkout containing source, tests and controls above. Do not check
out the source commit alone and expect later test/proof files to be present.
The clean qualification checkpoint is
`03bf5933a08352e14865622358f0adfbb7f27c7f`, tree
`65bc1b1016146a9e54f9b52edd10402f49533c8d`. Later coordination-only changes do not
alter the runtime or test files. These commands are local only:

```powershell
$nodeExe = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe'
$npmCli = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node_modules/npm/bin/npm-cli.js'
$env:PATH = "C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64;$env:PATH"
$env:XENIOS_MASTER_OFFERINGS_DATASET = (Join-Path (Get-Location) 'server/research/master-offerings/data/member-safe-master-offerings.generated.json')
& $nodeExe --version
& $nodeExe $npmCli --version
& $nodeExe node_modules/typescript/bin/tsc --noEmit
& $nodeExe $npmCli run build
& $nodeExe node_modules/vitest/vitest.mjs run server/research/assisted-order server/research/outbox-hl12-disposition.test.ts server/research/outbox-hl12-effects.test.ts server/research/master-offerings/early-access-catalog-coverage.test.ts client/src/research/assisted-order --maxWorkers=1 --no-file-parallelism
& $nodeExe supabase/verification/research_assisted_order_quote_no_funds_disposition_local.mjs
& $nodeExe node_modules/tsx/dist/cli.mjs scripts/acceptance/verify-migration-dag.ts
& $nodeExe node_modules/tsx/dist/cli.mjs scripts/acceptance/verify-route-uniqueness.ts
& $nodeExe node_modules/vitest/vitest.mjs run --maxWorkers=1 --no-file-parallelism
```

PATH above affects only the current PowerShell process and children, never the
machine/user setting. Docker is required for the disposable PostgreSQL command.
Do not run it alongside another heavy qualification job. This concise focused
command is a reproduction selection; exact executed selections and counts belong
to each logged run, not an inferred result for this command.

## Narrow independent-review request

Review the exact N2 source and its F4/HIST-02 predecessors, not `915a535` again.
Prioritize scoped-source authorization before lookup/replay, immutable complete
graph identity, grant and graph races, positive terminal receipt freshness,
single-use evidence, atomic cancellation and held outbox, grant-independent
canonical audit recovery, truthful post-commit503, and last-mile notice validation.
Recheck provider/historical-paid holds and separate fulfillment gates. New
provider-journal work must hold N2 while any provider attempt is uncertain.

Return finding IDs, exact reviewed SHA/tree, executed versus inspected evidence,
protected old/new hash disposition and managed preflight prerequisites. No
protection amendment, real evidence source/grants, managed migration, mail or
production action is authorized by this packet. N2's remaining void/refund and
historical outcomes must stay visible even if this narrow no-funds slice passes.
