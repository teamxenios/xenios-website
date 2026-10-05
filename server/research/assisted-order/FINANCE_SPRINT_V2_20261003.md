# Finance release blockers, execution sprint v2

This is the isolated Session 03 finance lane from coordination base
`3eaa017fcbd28989c65ffc4bb439a554aa1f3f59`, whose inherited runtime is
`c0e25c73a0d789829ea213e2ee040c68e06f0a75`. It is not a fleet integration or
production release. The v2 pack supersedes older build-freeze instructions for
this explicitly authorized source-only lane.

Read-only recovery and the scoped session/lease are complete. No client,
imagery, MC-01 cart/media contract, predecessor migration, protected composition
seam, or shared release baseline is owned here. Branch-local continuity indexes
must be reconciled by ID; do not import this branch's old fleet records wholesale.

## Current blocker matrix

| Blocker | Status | Exact remaining boundary |
| --- | --- | --- |
| F1 | OPEN | Real independent manual source and approved operational grants are absent. A receipt helper or operator assertion is not source authentication. |
| Refund/void/dispute | OPEN | Only positive never-received cancellation exists. Returned funds, partial refunds and chargebacks need distinct immutable facts and governed current eligibility. |
| ADP-G1 | PARTIAL | New source candidate attributes one metadata-free event through an exact prior object binding, restores unrelated same-source eligibility, and retains the target hold. Early/unbound objects and broader quarantine resolution remain open; independent acceptance and controlled races are pending. |
| ADP-G2 | OPEN | A request has one permanently held attempt; safe abandonment, expiry and replacement are absent. |
| ADP-G3 | OPEN | Unknown creates, interrupted claims and legitimate recovery need further evidence-backed lifecycle handling. |
| ADP-G4 | OPEN | Any post-settlement graph change conservatively holds fulfillment, including benign late facts. |
| LENS-01 | PARTIAL | Legacy notice detection exists; preservation/no-send adoption and managed rollout are unresolved. |

No blocker is marked CLOSED by this handoff. The candidate derives risk attribution
from a preexisting exact provider object binding and durable bound create result.
It retains the original journal and the attributed request's conservative hold.
No supplied request ID, elapsed time, missing observation, note or screenshot
resolves quarantine or establishes payment.

## Frozen source and scope

- Branch: `codex/xenios-finance-release-blockers-20261003`.
- Tested source commit: `dfd8b9b09815357d6c92f9c00eadf1782325269a` (pushed).
- Tested source tree: `d00442d29aa884125c62f8a92d58b971cf47cecd`.
- Candidate: `supabase/candidates/20261003_research_assisted_order_provider_attribution.sql`.
- Candidate SHA256: `507376b80280b6a0f84bea020dfe34d52ea684d24c2861ef743d277928a9b53d`.
- Source candidate only: not registered in the migration DAG or applied to a managed database.

Unchanged M94 has canonical LF file SHA256
`91a20f681038a5e845137feb6556c4041b1645f6b2c8f9122bc7c9e85280f477`,
distinct normalized installer-definition digest
`5302be3131cca3dc97bc9d9a9bb40b0f8addab975aaa76c9b74b68343921d349`,
and Windows checkout raw file SHA256
`345044cfe435977946ad786cff97d23afbb50b0ea04c71ab1ce93443d0c25c36`.
The verifier checks Git lineage and canonical predecessor hashes. Do not
interchange these identities.

Three new private tables hold empty/default-off source policies, scoped actor
grants and immutable attribution receipts. The RPC takes an original journal ID
and scoped authority. SQL derives the request, validates exact optional session
and lineage, and requires strictly earlier finite witness times. Equal timestamps
fail closed. It locks request before provider fence and rechecks authorization.

A receipt removes only its exact journal row from source-wide risk and retains
the target hold. Original journal bytes/classification, create history, money,
audit and outbox records remain unchanged. A later fully specified event avoids
a false identity conflict through the receipt; changed payloads remain separate
unassigned conflicts. Revocation denies commands without erasing existing risk.
Schema/ACL attestation, forced RLS, immutable triggers and exact reapply remain.

No client, A/B/C, imagery, MC-01, predecessor migration, shared release control,
protected baseline or existing application runtime file was edited by this lane.
The B2B test and migration-DAG changes relative to inherited runtime already
exist in the coordination base; they are not finance-lane edits.

## Evidence discipline

Startup observations dated October 3 are in `finance-sprint-20261003/startup.json`:
Render reported live commit `79414143d4355d5d3d14cd5fe6e5a536dc68d99d`, and the
queried finance/provider objects were absent in managed Supabase. These are
dated read-only observations, not hosted qualification. Only fresh disposable
local databases were written.

Inherited full-suite result remains **FAILED**: 19,443 pass, 3 fail, 85 skip.
The prior separate passing diagnostics do not replace that aggregate.
All new runs use pinned Node `v20.19.0`. The evidence runner records raw logs,
arguments, source commit/tree, dirty state, source manifests and hashes. Source
manifests were equal at both boundaries; continuous filesystem attestation is
not claimed. Only this session's heartbeat records changed during the successful
functional run.

| Run | Result | Boundary |
| --- | --- | --- |
| `source-contract-20261005-01` | PASS: 11 tests / 1 file | Source `d2e12dc`; SQL/test bytes unchanged in final source. |
| `functional-20261005-01` | FAILED | Before candidate application, verifier passed a boolean to an object-only JSON parser. Logs retained; verifier fixed in `dfd8b9b`. Not a SQL defect or load diagnosis. |
| `functional-20261005-02` | PASS: 11 groups, 69 expected refusals, 1 reproduction | Source `dfd8b9b`; PostgreSQL 17.11; 377.263 seconds inside proof. |
| `focused-20261005-01` | PASS: 1,293 tests / 38 files | Source `dfd8b9b`; assisted-order tests, one worker. |
| `full-20261005-01` | FAILED: 19,078 pass / 2 fail / 85 skip; files 1,007 pass / 16 fail / 6 skip | 15 suites failed collection with `ENOSPC`; 2 inherited protected-baseline assertions failed. 1,440.780 seconds overall. |
| `races-deferred-20261005-01` | DEFERRED, expected driver exit 2 | Entry guard started no database and ran no lock/race cases. |
| Controlled lock/race proof | DEFERRED | Quiet-host precondition failed; no timing-sensitive attribution race run. |

The full aggregate remains FAILED. The 15 collection failures report
`ENOSPC: no space left on device, write`; their tests were not exercised in that
aggregate. A later C: observation found 1,174.0 MiB free, but the failing write's
path and exact capacity at failure were not captured. This is an environment
failure report, not evidence of a finance logic defect. The protected assertions
identify `server/static.ts` and the App/server composition seams. This lane did
not modify those files or their approved baselines. No baseline was re-cut, no
failure suppressed, and no passing diagnostic replaces either failed aggregate.
Typecheck/build were not run in this source-only SQL slice.

Raw evidence is in `finance-sprint-20261003/evidence/`; `evidence/index.json`
records file-byte hashes. Logs and JSON have local `-text` Git attributes to
preserve captured bytes. Source-manifest filenames use the receipt's compact
JSON map digest, which is distinct from the pretty JSON file-byte hash.

Both functional attempts used cached `postgres:17-alpine` image digest
`sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`,
`--pull=never`, no network, no published ports and tmpfs data. Fixtures were
synthetic; no real provider was authenticated. Each exact owned container was
removed and a subsequent inspect confirmed absence.

The proof reproduces the predecessor issue with bound A, settled B and pending C.
Attribution restores B eligibility and permits C settlement while A stays held
and existing records remain unchanged. Additional checks cover exact scopes,
actor/policy denial, contradictory lineage, session and chronological witnesses,
replay conflicts, aborts, failed transactions, revocation, private ACLs,
replica-mode immutability, stronger-isolation refusal and populated schema drift.

This worktree provides filesystem isolation, not compute isolation. Final
timing-sensitive lock/race proof requires a demonstrably quiet host. Loaded-host
results and timeout diagnoses will remain separate. No independent Claude
acceptance, production readiness, or successful hosted qualification is claimed.

## Remaining decisions and review

The six source audits and bounded next implementation slices are recorded in
`finance-sprint-20261003/audit.md`. F1 needs the actual authenticated independent
source/workflow, finality semantics, approved source-scoped actors, and a
provisioning/revocation procedure. No secret or raw bank/payment evidence should
be added to the repository. Refund/dispute release policy and LENS adoption need
explicit decisions; LENS also needs exact legacy inventory and a worker shutdown
and preservation/no-send plan. Technical G2/G3/G4 work remains open.

Controlled races need a quiet or isolated machine and adequate disk capacity.
Repeat the full aggregate after resolving the `ENOSPC` environment condition.
The separate race driver
requires a fresh quiet-host receipt or an explicitly labeled loaded-host
diagnostic; neither a passing diagnostic nor three precheck samples alone proves
the entire run remained controlled. Preserve in-run host evidence. No timeout
limit was relaxed. Host pressure alone is not used to infer a code defect.

Independent Claude acceptance is pending. Do not integrate or present the slice
as accepted, enable production grants, apply managed SQL or deploy from this
handoff. Any future managed mutation requires Samuel's separate current explicit
approval for an exact SHA after release qualification.

Automatic approval review rejected cross-chat coordination messages because it
did not recognize destination-specific authorization. No messages were sent and
no workaround was used; permission remains pending. This did not block the
disjoint source work. Branch-local continuity records must be reconciled by ID,
not imported wholesale over the live fleet registry.

**No production mutation, managed migration, live money action or email occurred.**
