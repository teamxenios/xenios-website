# Provider-neutral Health continuation, source only

This is an implementation handoff, not production GO or an HL-12 completion claim.
Branch: `codex/xenios-health-launch-implementation-20260930`.
Starting records: `377555759cdf6cbd9bf1e7167ac61c107b19a832`.
Current runtime: `947f6ee7739bf2a1381b4b29a4f9d132c751d64c`.
Runtime tree: `03ccddee03fbad2966655c2ce1a3cb46c468d8d5`.
Tested release-control/records HEAD: `95e040a300e23ce5eb4ebc0dd7e5039f76aa818c`.
Initial independent Claude report read: reviewer branch at
`e6b5293834a85634c3fc9c657d52fa5fe92b5531`, report 18 for runtime `7600943`.
Later reports19-21 were read at `211a8fed26cc9c12633951b38353f30e4e6bf3d2`;
the latest reviewed core runtime is `fe45550`, not this successor.
Claude has not been represented as reviewing this successor or running now.

## Decision and authority

The founder's current instruction makes the processor choice a future adapter
configuration, not a block on provider-independent engineering. No Stripe SDK,
token syntax, merchant assumption or provider retention default is introduced.
Card payments remain unavailable. Manual evidence authority remains unconfigured
until an independently authorized source exists. No account/finance grants,
hosted configuration, managed migration, real email or funds were changed.

The financial chain remains the existing request and canonical order lineage,
accepted immutable quote, attempt/evidence, verification, governed paid status,
then separate fulfillment eligibility. The provider contract is transport and
admission code only: durable attempt/event persistence is still required before
it can be mounted. A verified payment is not stock, supplier, Care, shipping or
procurement permission.

## Implemented slices

- `c042599`: processor-neutral adapter boundary and negative tests. Exact
  request/order/quote/version/acceptance/amount/currency binding; account and
  test/live scope; authenticated event admission; provider-key retention supplied
  explicitly; ambiguous creation cannot silently make another payment. Refund
  and dispute events have their own identities/amount rules. No live adapter.
- `fe45550`: HL-23 bounded rolling-window anonymous session mint budget, separate
  from password failure counters. It remains process-local, not distributed.
- `a46531b5df038ab07a0f0bb2ca51146c5b9952b4`: pending SQL migration
  `20260930230541_research_assisted_order_quote_evidence_corrections.sql`, SHA-256
  `434885ea1f61f424f88ac827e8f57775be3ec9dc93c0896ecabd681cf69a0f66`.
  Immutable original/replacement observations, permanent evidence-to-request
  claims, UUID observer binding, observed-money cancellation hold, NULL-safe
  quote acceptance, private financial-state projection and stable verification
  replay after fulfillment progression. No historical actor UUID backfill.
- Mounted manual observation supports explicit independently checked correction;
  verified-paid workflow reads durable evidence before advancing to the existing
  separate supplier-assignment gate. Historical labels remain held.
- Owner-confirmed customer status mounts quote review and explicit acceptance,
  with exact line/total/receipt validation and a disabled card option.
- Both status surfaces derive payment wording from durable verification presence.
  P-17 authority/session/token exchange is unchanged. Old payment promises are
  replaced only in presentation, not in stored audit records.
- Verification retries enqueue existing audit/outbox effects with immutable
  verification identity/time/actor and stable dedupe keys. Refused verification
  produces no effects. Sink failure is visible and retryable, not swallowed.

## Evidence and limitations

Authoritative local runtime: private Node v20.19.0, npm 10.8.2. Original archive
provenance remains in the preceding handoff. No Node24 result is promoted here.
Focused runs are separate, not additive aggregate claims: provider boundary
53 passed; HL-23 73 passed; F4 finance/service 77 passed; wiring 16 passed;
customer/P-17 141 passed with later parser/copy 63 passed. Final integration
results and exact source/tree are appended below when frozen.

SQL was applied twice on a fresh disposable PostgreSQL17.11 container with
M71 and the four pending HL-12 predecessors. Existing two-connection verify
race, foundation proof, bound-access proof and new correction proof passed.
Local PostgREST16.3 on loopback passed owner/wrong-owner, anonymous/direct-table
denial, revoked unbound verifier, request-bound replay, immutable receipt fields
and private financial projection. These are synthetic local tests, not managed
Supabase, live Auth, real bank evidence or browser qualification.

Failed development runs remain distinct: two new SQL fixture attempts failed
address/identity constraints; an earlier foundation regression expected only a
unique violation and now accepts the exact stronger terminal/ref-use refusal;
a real new replay-query bug cleared the first-verification actor and caused a
NOT NULL refusal, fixed with a separate stored replay actor variable and a fresh
database rerun. One container startup probe ran before PostgreSQL was ready.
None is relabeled as a successful run. The previous whole-suite result at
`7600943` remains 18,200 pass / 2 fail / 85 skip, not a clean aggregate.

## Remaining source and operational work

- Durable server-created provider attempt/event store, atomic replay/single-use
  integration and mounted provider-neutral ingress; only then implement the
  selected authenticated provider transport. The historical provider schema
  lacks merchant-account/mode scope. Current migration85 explicitly refuses
  new/replayed provider observations and legacy provider verification until
  durable authenticated authority exists. It is a hold, not that authority.
- Real independently authorized manual feed/controlled import adapter and an
  audited founder-authorized finance grant procedure. No invented bank feed or
  grant is supplied. Same observer UUID remains the current policy; two-person
  verification is not inferred from this engineering work.
- Governed no-funds/refund/dispute resolution, aggregate refund conservation,
  cancellation completion and historical-paid resolution. Adapter refund
  requests are pending intents, not proof that money was returned.
- Paid, audit and outbox currently use separate transactions. Explicit retries
  repair interrupted effects, but autonomous reconciliation/transactional effect
  intents are not yet implemented. Existing log-line audit mode is not durable
  audit; rollout requires the durable authority and qualification.
- Supplier-assignment evidence is the existing gate, not a new assertion that
  procurement or clinical eligibility is authorized. Full canonical conversion
  and supplier authority still require composed end-to-end qualification.
- HL-11 exact source reconciliation remains open (420 committed dataset versus
  approved intended variants; latest-row selection and binding alignment need
  repair). Preserve 17 approved display cents including16927, Hexarelin6250,
  Oxytocin10750, Care presentation holds and FedEx GRP-0364 shipping identity.
  No new price release, discount or commission is authorized.
- Product details, remaining public/account/partner/supplier/admin journeys and
  imagery integration remain in queue. Preserve the separate clean/pushed c502
  imagery worktree at5c96f9e, its unresolved NOT MERGEABLE review, and the existing
  Claude reviewer. No optional program-card redesign.
- The prior `server/routes.ts` and `server/index.ts` bytes passed Claude report19
  review; explicit owner-authorized baseline amendment remains unrecorded.
  The new `server/research/index.ts` gateway edit additionally needs exact QA
  confirmation. Research index is a permitted reported seam, not a hard file
  lock, but the unchanged clean-seam test still fails its drift. No baseline
  was repinned, allowance widened, assertion skipped or timeout increased.

## Historical-paid reconciliation and rollback runbook

Before any separately authorized managed apply, obtain aggregate read-only
counts of historical paid rows without verification, manual observations without
an observer UUID, cross-order duplicate evidence and current pending effects.
Record exact schema/migration history, source bytes and backups without raw bank
details, credentials, customer PII or payment evidence in this corpus.

Keep unresolved historical paid orders on hold. A paid label, free-text note,
browser receipt, screenshot, fabricated acceptance or guessed actor is not
verification. Reconciliation needs an independently authenticated transaction,
the actual accepted quote/version/total/currency, a real actor grant and a
reviewed resolution operation. That historical resolution operation is not yet
implemented; do not call the current new-order quote flow a backfill tool.
If any fact is missing, record the missing fact and preserve the hold.

Do not cancel an observed/verified payment using free text. A no-funds decision,
authorized refund intent, confirmed refund fact and fulfillment disposition are
distinct records; none may erase the original observation or verification.

Rollback is disable financial ingress, preserve every financial/audit/outbox
row, and roll forward under an exact reviewed migration. Do not remove the
guards, drop evidence tables or replay old permissive paid code to restore
liveness. Existing nonfinancial customer/support journeys remain available.

## Local reproduction

Use full-path `C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64\node.exe`.
Temporarily prepend that directory to this process's PATH before npm so child
workers inherit Node20; do not edit the permanent/system PATH.

1. Run `node_modules/vitest/vitest.mjs run server/research/assisted-order client/src/research/assisted-order shared/research/assisted-order server/research/status-recovery server/release-control-plane.test.ts --maxWorkers=1 --no-file-parallelism`.
2. Run `node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`.
3. Run private `npm.cmd run build` (includes source/build no-em-dash gates).
4. For reproduction of the earlier correction/foundation proofs, use only a
   disposable `postgres:17-alpine` container. Wait for `pg_isready`.
   Apply `supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql`,
   M71, then pending migrations191323,193033,202413,205725,230541 in that order.
   Reapply only230541 to test that historical correction schema's idempotence.
5. Set `XENIOS_HL12_PG_CONTAINER` to that disposable name. Run
   `supabase/verification/research_assisted_order_quote_payment_concurrency_local.mjs`.
   Pipe the correction, foundation and bound-access local SQL proof files into
   container `psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres`.
6. Local PostgREST16.3 may bind only127.0.0.1:31334 using the synthetic secret
   embedded in the local test script. Run the local PostgREST proof. No hosted
   URL or credential is an acceptable substitute. Stop disposable resources.
7. For the current provider-hold proof, run
   `node supabase/verification/research_assisted_order_quote_provider_hold_local.mjs`.
   This self-contained script creates and removes its own no-network/no-port
   disposable database. It tests the predecessor chain through230541, proves
   the old provider flaw, and tests234614 preflight/rollback and repeat apply.
   The intended current source migration order is M71,191323,193033,202413,
   205725,230541,234614. Do not casually replay an older replacement-function
   migration after234614 or substitute a managed database for this proof.

## Earlier frozen source checkpoint

Runtime source: `3c897f4dc019b6f420aa85da5e0d792814cd801e`.
Runtime tree: `70673c588919ca626ce5cb7db4c6984f9e8684d8`.
`4decc9f` is a runtime decoder hardening change plus tests despite its historical
`test:` commit subject; do not classify it as test-only.
`3c897f4` adds HL-24/25 session/cart retry and help paths. Unknown cart
configuration never grants fallback commerce; the assisted alternative requires
its independently enabled service. Six focused files /57 tests pass.

Combined focused run on the preceding worktree: 633 pass,1 fail,1 skip among635
tests. The sole failure was a DAG rollback-document path not yet written when
the run began. After writing this actual runbook, the separate release-control
rerun passed51 with1 existing skip. Do not combine those into a fictitious clean
aggregate. The final financial-projection tests separately passed11/11.
Typecheck passed. Final frozen-source build/full-suite evidence follows in the
exact records handoff, and no prior full-suite result is transferred to this SHA.

Additional disposable two-connection correction race passed: one immutable
replacement, one replay, and a subsequent verification race produced one
verification/paid event/replay. Invalid replacement leaves no correction or
claim residue. Changed replay and superseded observation verification refuse.
The original fixture11 remained unchanged. Test script:
`supabase/verification/research_assisted_order_quote_correction_race_local.mjs`.

All migration statuses remain PENDING. No deployment or hosted mutation.

## Integration run and review follow-through

At tested HEAD `d6f99e04f3b9613ea5c309f06e199bb188d05097` (the runtime above),
private Node v20.19.0 and npm10.8.2 ran `npm test -- --maxWorkers=2`.
The completed aggregate is **18,382 passed, 2 failed, 85 skipped**, across
1,001 files (994 pass,1 fail,6 skip),606.34 seconds, exit1. The two failures
are the unchanged `server/routes.ts` and `server/index.ts` protected hashes.
Do not label this run clean or transfer it to a subsequent runtime.

Captured native final output (including the two failures and aggregate):
`C:/Users/sboad/.codex/tmp/health-provider-neutral-d6f99e0/full-suite-final-output.txt`,
SHA-256 `fe5e02f3aebdd68f29c492e922e813065b4c64f3bee860397c93d3990dddfb7f`.
The PowerShell transcript in that directory records start/end/exit, but omitted
native stdout; it is not the complete test log. The separate final-output file
is explicitly partial console capture. Child worker provenance is preserved in
`child-worker-provenance.json`, SHA-256
`8eabbb45648c9d51b78f3296e4e0f5304b725cf695784d10484ededaa90d476d`.
Runner PID20536 and
observed child PIDs35680/35696 used the private full-path Node20 binary. No
worker is claimed to use Node20 solely from the parent's reported version.
Typecheck and production build passed separately before this run; source1336
and build224 scanned files had zero forbidden customer-facing em dashes.

Later independent reviewer tip `211a8fed26cc9c12633951b38353f30e4e6bf3d2`
contains reports19,20,21. Report20 reviews `fe45550`, not this final successor.
Its exact protected-file review passes the two prior seam edits, but the
owner-authorized baseline amendment is still unrecorded and the gate stays red.
Claude's SQL-01 provider forgery, F10 quote gateway and EA-01 capacity findings
were taken into the next bounded source repairs. No claim of Claude acceptance
of those repairs is made.

`2dc7d6264d7c6286f49c711d729a268868752327` adds only exact anchored quote
GET/HEAD and quote-accept POST gateway admissions. A real gateway reproducer
first failed1/passed80; after repair gateway plus finance passed98/98. These
admissions reach downstream ownership denial, never grant quote authority.
`268e691` removes contradictory legacy `actionRequired` payment promises from
presentation only. Its original reproducer failed1 with48 tests filtered out;
the separate full UI rerun passed65/65. Nonfinancial instructions and stored
records remain intact. EA-01 capacity repair separately passed76/76 across
four files; exhausted budgets survive rotation, while below-budget entries can
be evicted by oldest last attempt.

Imagery truth refreshed read-only: worktree `c502` is now clean at pushed
`5c96f9e86dc8dd7b6944bfd6c991e283cd49ccec`, not the earlier dirty checkpoint.
Claude report21 says NOT MERGEABLE (IMG-01 unapproved public bytes plus image
identity/runtime-authority gaps). No imagery was merged or modified here.

The non-UTF8 legacy `.xenios/DECISIONS.md` was preserved rather than re-encoded
incidentally. The current provider-neutral founder decision is recorded here
and in the dated Health project/release entries: processor choice is deferred,
and earlier Stripe preference is not a selection. No secret or payment
destination is needed in these records.

## Latest source after the reproduced defects

Runtime `947f6ee7739bf2a1381b4b29a4f9d132c751d64c`, tree
`03ccddee03fbad2966655c2ce1a3cb46c468d8d5`, supersedes the earlier checkpoint.
This includes gateway2dc7d62, status268e691, capacity05e413c and SQL947f6ee.
Migration85 is `20260930234614_research_assisted_order_quote_provider_hold.sql`,
canonical SHA-256 `6596f26125c6279717168276fe96132056c9aa3ef150606583fbaf9045c208fe`.
It depends on pending84 and is also PENDING. No previous SQL bytes changed.

The Node20 disposable PostgreSQL17.11 proof reproduced predecessor SQL-01,
then proved new/replayed provider observation and legacy verification refusal,
NULL-safe request binding (SQL-10), provider insertion backstops, zero residue,
manual correction/verification/replay, and actual role-based ACL denial. Existing
provider verifications cause a preflight refusal requiring explicit historical
reconciliation. Two agent proof runs and one root rerun passed separately;
there were no failed development runs for this narrow migration. Root log:
`C:/Users/sboad/.codex/tmp/health-provider-neutral-d6f99e0/provider-hold-proof.log`.
The root rerun exited0 and removed only its own no-network/no-port container and
tmpfs data. This is local SQL evidence only, not new PostgREST or managed proof.

The actual whole-catalog reader separately passed13/13 after the application
fixes. It still measures the420-row artifact/419 merchandise projection:
175 numeric prices,242 withheld Care prices,2 genuine quote-only rows. The424
intended canonical-row regeneration and provenance binding repair remain open.

Open review items are not silently closed by these fixes. F1 actual independent
manual evidence/grant workflow remains unavailable. F4 still needs durable
autonomous effects (an actor revocation can prevent an endpoint retry). F9 is
not a two-person-control policy. HIST-02, SQL-06/09, normalized currency,
append-only grant/verifier authority, governed withdraw/refund/cancellation,
provider authenticated-event quarantine/attempt persistence and composed
supplier assignment eligibility remain work. Follow reports19/20 by finding ID;
source fixes require Claude's exact-successor confirmation. No new browser or
true-zoom result is asserted for this customer quote UI.

## Final local qualification of tested HEAD95e040a

The machine-readable receipt is `HEALTH_HL12_QUALIFICATION_95e040a.json` beside
this document. `HEALTH_HL12_CHANGED_PATHS_95e040a.json` classifies every one of
the50 changed paths from starting records3775557 through tested HEAD95e040a:
18 application files,2 pending migrations,17 tests/local proofs,3 release-control
files and10 records. Later checkpoint commits are records only, not new runtime.

Private Node v20.19.0 / npm10.8.2: typecheck PASS (exit0), production build PASS
(exit0), source1336/build224 scanned files with zero forbidden em-dash forms.
The existing chunk-size/dynamic-import warnings are retained in the build log.
The local archive SHA-256 is
`be72284c7bc62de07d5a9fd0ae196879842c085f11f7f2b60bf8864c0c9d6a4f`,
matching the previously obtained official SHASUMS256 entry. No system install
or permanent PATH change. Full-suite runner16052 and observed workers33428/3092
used the same full-path private Node binary; the receipt indexes actual process
provenance rather than inferring child versions from npm's parent.

`npm test -- --maxWorkers=2` completed **18,398 passed /5 failed /85 skipped**,
1,001 files (991 pass/4 fail/6 skip),1588.11s,exit1. Started
2026-09-30T23:57:54.8438456Z and finished2026-10-01T00:24:26.5160629Z.
No source/test/gate bytes changed during that run. Native stdout/stderr is in
`C:/Users/sboad/.codex/tmp/health-provider-neutral-95e040a/full-suite.log`, SHA-256
`84c558cd196e9b544d77a5e8b11055362fa07be76b97fa97c6066cc30044e409`.
The protected tests failed two assertions covering THREE mismatch paths:
`server/routes.ts`, `server/index.ts` and the newly changed
`server/research/index.ts`. Expected/actual hashes are in the receipt.
The other three failures are the unchanged5000ms scan timeouts in
`rls-invariants.test.ts`, `preview-harness.guard.test.ts` and
`customer-price-authority.test.ts`.

Diagnostic runs remain separate: three-file serial rerun13 pass/1 timeout,
exit1,21.23s (only price scan still timed out). A read-only standalone reproduction
then scanned1279 production TS/TSX files,13 identifiers and13,146,773 bytes in
140.17ms with zero forbidden occurrences. The unchanged price-test file alone
then passed5/5,exit0,1.06s with the original5000ms limit. These results do NOT
convert the aggregate to PASS. Free host memory was observed near420MiB during
the long run; execution contention is plausible, not a conclusively established
root cause. No full-suite retry solely to rewrite the record was performed.

Separate final controls: migration DAG PASS44 canonical-checksummed nodes;
route uniqueness PASS458 registrations across449 call sites. No current release
manifest acceptance, browser/true-zoom result or managed qualification is implied.
The prior d6f99e0 and7600943 aggregate runs and failed development reproductions
above remain separate. The receipt hashes all final local logs, including the
failed isolated rerun. Raw logs remain local; committed receipts do not claim
the raw logs themselves are in Git.

## Next exact engineering queue and independent reviewer handoff

Review exact947f6ee/tree03ccddee, prioritizing SQL-01/SQL-10 provider and NULL
binding repairs, F2/F3/F5/F6/F7/F8 behavior, F10 gateway, EA-01 capacity and
quote UI. Preserve every unresolved finding and distinguish a fail-closed hold
from a completed operational workflow. Obtain exact gateway QA confirmation
before any deliberate protection-owner baseline recut in its own approved commit.
No review of this successor or clean aggregate is asserted.

Next provider-independent work is F4 durable verification effects: extend the
canonical outbox with a non-sendable held intent committed with verification,
then reuse the existing durable audit authority for idempotent recovery without
the original actor's still-active grant. Qualify interrupted/concurrent writes,
held dispatch denial, actual ACLs and historical no-backfill on disposable SQL.
This is a proposed next slice, not implemented in947f6ee. Do not create a second
audit/outbox authority or activate a mail provider. Durable provider attempts,
normalized authenticated events/quarantine and governed refund/cancellation
follow without waiting for a processor selection.

Parallel public work can continue exact HL-11 source reconciliation and the
existing admin quote panel, retaining source-backed holds. The approved master
workbook exists at `C:/Users/sboad/Downloads/XENIOS_MASTER_CATALOG_AFFILIATE_PRICING_2026-08-16.xlsx`,
SHA-256 `6478ad0d3f710b75c6bf0c5f5e56ff1189ab2a2a4439cab23c2a28498134ea6f`;
do not ask the founder to repeat it or bind new identities by array position.
424 intended canonical rows are not the already-tested420-row artifact. Preserve
Care price withholding, Product Control money, approved cents, GRP-0364 shipping,
the GRP-0422 hold and both Coming soon-only blood-test cards. Do not integrate
the NOT MERGEABLE imagery candidate. No optional program-card redesign.

Hosted mutations, managed migration applies, account grants, real email, real
money, price release, procurement, clinical actions and deployment: NONE.
Independent successor acceptance and production readiness: NOT CLAIMED.
