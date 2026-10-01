# Provider quarantine isolation and inquiry receipt successor

This handoff continues the existing core lane from pushed records
`1af1d48d1e3fad340e0461ba2263559b1ea599b5`. It preserves the LENS-01 detection
correction, the existing imagery lane and Claude reviewer, and all prior runs.
It does not claim completed provider reconciliation or production readiness.

Branch: `codex/xenios-health-launch-implementation-20260930`.
Session: `codex-xenios-health-launch-implementation-20260930`.
Runtime source: `c0e25c73a0d789829ea213e2ee040c68e06f0a75`.
Runtime tree: `1771d18bad91b89e95414bebb8b574dc32729687`.
Test-only SHA: `aeae38eb914dc2990bf073b8ea871247c76d4bc8`.
Release-control SHA: `22f8d390c730460aa3e695f84213de6bd41ea1b2`.
The preceding component-only source is `c9677cbe2a9a8f64a790c922c96476a072cf1cca`; the final runtime includes
that form correction and the additive SQL successor.

## Implemented scope and remaining limits

Claude report24 at `76607458e30a64746d227150ff1dbab3475dd64a` reviewed the older
`8f240828df93ad45f31609d85460bd9d111047ec` candidate. Its F4 and HIST-02 closures
remain separate from this unreviewed successor. No later Claude acceptance is
inferred. The current fetch confirmed core local/origin equality at1af1d48 and
that reviewer tip; imagery had advanced to2100636, beyond the attachment's
approximate5df310f checkpoint. No imagery source was merged or independently
requalified here.

The new migration94 replaces the global unbound-event predicate in all six
effective consumers: uncertainty, create context, settlement admission,
financial eligibility, prospective canonical-row admission and paid transition.
Each now uses the request's immutable reservation and source identity. Sources
uniquely bind provider namespace, account and test/live mode. Claimed request
metadata never establishes exposure. Revocation, expired leases and terminal
request status never erase it.

The seventh affected business-rule function refuses a first reservation into an already
quarantined source before insertion. This preserves the otherwise valid
manual-only order instead of stranding it through a new held attempt. Existing
request-then-fence locks and READ COMMITTED requirements are retained. Two
private helpers and one partial source index are added. The fingerprint and
integrity functions are additionally advanced for the seal (nine replaced
functions in total). The exact predecessor
seal is validated and the effective graph resealed atomically; old migration
bytes, function OIDs, RPC allowlist and authority response shapes are preserved.

This is **partial ADP-G1**, not complete attribution or quarantine resolution.
Same-source provider-exposed orders remain conservatively held even when the
particular unknown event may concern another order. No event can be dismissed,
deleted, rewritten or assigned by an operator-selected target. No new financial
fact, verification, source or grant is created. The next resolution slice must
positively establish independent event/object/order binding and retain original
history; elapsed time, a note, missing observations or a chosen order cannot do
that. G2-G4 and refund/void/dispute remain open.

The legacy B2B component correction binds supplier/partner confirmations
and clipboard output to the exact submitted email, pathway and summary. An
editable later draft is not labelled submitted by a delayed response. Same-tab
duplicate submissions and stale unmount/clipboard completions are guarded.
This is presentation and mounted-component request ownership, not durable
network idempotency, transport cancellation or proof of real email delivery.
The canonical contact endpoint and all business/account authorities are unchanged.
**The browser pass discovered that this is not a current mounted public-journey
fix.** App.tsx redirects all four legacy B2B entrypoints to newer clarity pages
before the Research router. The component regressions mount the form directly;
they do not prove current /partners behavior. No protected route was changed to
make this component reachable, and no current public receipt regression closure
is claimed. The source remains a separately classified legacy-component fix.

## Local qualification

The full-suite run is still in progress. Completed clean-checkout checks at
`8722ece67315a62cd19d8f7e6f8ef1a8ff15a719` are: affected tests 1,368 PASS /
one existing conditional database SKIP across43 files; typecheck PASS;
build PASS (1,353 runtime-source and226 production-build files, zero forbidden
customer-facing em-dash forms); DAG53 PASS; routes462 registrations/453 call
sites PASS. The CLI protection gate FAIL remains unchanged:37 hard hashes pass,
static hash mismatch, three seam warnings, plus inherited broad-branch
out-of-zone paths against origin/main. No baseline or assertion was weakened.
The final receipt archive and complete aggregate result will be recorded before
this handoff is issued. Existing failed, filtered and diagnostic runs stay distinct.

Disposable PostgreSQL17.11 run2 passed14 groups,27 refusals and8 real
explicit-release lock races, including an executed old-M93 reproduction.
It applied94 first/twice/populated, preserved source hashes and records, and
removed its exact no-network container. This ran at committed runtime c0e25c73
with then-uncommitted tests and controls; it is not a clean-checkout claim.
The harness's subsequent inspect returned an error after successful removal;
this is not independent continuous resource attestation. The earlier install
smoke, missing-supplierAssignmentId fixture failure, and TS2322 test-mock typing
failure remain separate executions, not reclassified passes.

## Browser evidence and open observations

The clean production build was served through actual pageGate/static middleware
at `http://127.0.0.1:63145/partners#inquiry`, with disabled integration config,
signed-out viewer fixture, a fresh loopback origin and a private347-file snapshot.
Distribution inventory SHA256:
`be74889162cb0c6d0ef3437c9bdf4805bb47a6650a3230218988798b4ec46d53`.
Launcher SHA256:
`fe89aae8b3d2eb2d7a26a0ceba7c773086a19f036c67636d9ac723df216b951b`.
Build receipt SHA256:
`e280bdfa2433e75d6062acd656edf0992d54f6f74268e3813cf8c70554de687f`.

Chrome confirmed the current clarity inquiry forms and /research/partners
redirect to /partners. No legacy #b2b-email control was mounted. The initially
planned delayed legacy receipt check therefore could not qualify that form;
no POST was attempted. Actual Submit Inquiry navigation focused #inquiry.
Observed319x332 CSS viewport, document client/scroll311 and horizontal overflow0
are measurements only: native page zoom is UNVERIFIED, not200% or400% evidence.

JOURNEY-FRAGMENT-01 is an open, newly observed layout issue, not a pass: the
69px fixed header overlaps the inquiry heading (heading top47.089/bottom99.880).
The install suggestion initially covered additional content; it was dismissed
locally and the heading overlap remained. Screenshots and DOM/measurement JSON
preserve both states. No severity or independent acceptance is inferred.
The account-support ambiguous-response copy issue is separately queued from
read-only code inspection; it was not browser-reproduced or repaired in this slice.

The preview was stopped with Ctrl-C. It reported final integrity PASS, exact
snapshot removal and zero accepted/completed/interrupted/refused synthetic
contacts. The PTY shell returned exit1 on interruption; it is not a zero-exit
test. A subsequent read-only check found no process42108/listener63145 and no
snapshot directory. Existing unrelated previews were not stopped. The preview
never mounted real Auth, contact delivery, SQL, mail, payment or worker services;
in-process network denial/CSP is not an OS sandbox or production-CSP proof.

All commands use private Node `v20.19.0`, npm `10.8.2`. The official archive
SHA-256 remains `be72284c7bc62de07d5a9fd0ae196879842c085f11f7f2b60bf8864c0c9d6a4f`.
Only process-local PATH is prepended; the wrapper records exact commands,
revisions, dirty state, log hashes and sampled worker executable provenance.
Sampling is not continuous process or filesystem attestation.

The Supabase and Postgres skills informed private ACLs, exact schema checks and
the unchanged lock/isolation boundary. Current [Supabase function security](https://supabase.com/docs/guides/database/functions)
and [PostgreSQL 17 transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html)
were checked. The current changelog's17.11 upgrade notice was inspected; no
database upgrade or managed extension operation was performed.

## Changed paths and reproduction

- Runtime: `client/src/research/b2b/PartnershipInquiryForm.tsx` and
  `supabase/migrations/20261001160730_research_assisted_order_provider_quarantine_isolation.sql`.
- Tests: the existing form test, new `provider-quarantine-sql.test.ts`, and new
  `research_assisted_order_provider_quarantine_local.mjs` and `_races.mjs`.
- Release controls: migration DAG, ledger and exact pending-source test map.
- Records: this handoff, raw receipts, scoped task/lease/session and continuity
  state. No protected baseline, catalog/price source, imagery or predecessor
  migration was edited.

Run from this worktree, never against a managed database:

```powershell
$node20 = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe'
$env:PATH = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64;' + $env:PATH
$env:XENIOS_MASTER_OFFERINGS_DATASET = (Resolve-Path 'server/research/master-offerings/data/member-safe-master-offerings.generated.json').Path
& $node20 supabase/verification/research_assisted_order_provider_quarantine_local.mjs
& $node20 node_modules/vitest/vitest.mjs run server/research/assisted-order client/src/research/b2b --maxWorkers=1 --no-file-parallelism
& $node20 node_modules/typescript/bin/tsc --noEmit
& $node20 C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node_modules/npm/bin/npm-cli.js run build
& $node20 --import tsx scripts/acceptance/verify-migration-dag.ts
& $node20 --import tsx scripts/acceptance/verify-route-uniqueness.ts
& $node20 scripts/acceptance/verify-core-site-protection.mjs
& $node20 node_modules/vitest/vitest.mjs run --maxWorkers=1 --no-file-parallelism
```

Migration94 canonical LF SHA-256:
`91a20f681038a5e845137feb6556c4041b1645f6b2c8f9122bc7c9e85280f477`.
Its exact dependency is93. Managed application remains PENDING. Do not replay
91-93 after94, weaken gates or use deletion as rollback. Preserve all evidence
and compatible late-event ingress, disable new provider work where separately
authorized, and roll forward with independently reviewed source.

## Remaining findings and next work

- ADP-G1: platform-wide manual-order contamination corrected locally; same-source
  attribution and governed resolution remain open. No complete finding closure.
- ADP-G2: attempt abandonment/expiry and safe replacement remain open.
- ADP-G3: recovered unknown creates, interrupted claims and retries remain open.
- ADP-G4: benign late/retrieve facts versus present fulfillment remain open.
- REFUND-ABSENT: only governed never-received cancellation exists. Void, requested
  versus confirmed refund, partial/full refunds, dispute and unresolved balance
  require an append-only disposition model separate from historical verification.
- LENS-01: detection stays locally corrected; historical notice adoption and the
  managed executor remain unresolved. No deletion, relabelling, resend or fake
  verification was introduced.
- F1: real processor/manual evidence source and operational grants remain absent.
  This blocks activation, not provider-independent engineering.
- GATE-01 and SEAM-GOV-01: protected baselines remain unchanged. The attachment's
  suggested Access Hub approval is conditional, not an actual owner decision.
  Exact review and owner approval are still required before any amendment.
- HL-11 keeps424 canonical/423 customer rows and genuine binding/price holds;
  this slice releases no price. HL-01/admin session work remains its own local
  evidence. HL-17 product direction and remaining public journeys stay queued.

Known prior-review blockers remain two P1 findings (F1, GATE-01) and six P2
items (G1-G4, REFUND-ABSENT, LENS-01). This is an ID-based reconciliation, not a
new whole-site severity count or independent acceptance. No P0 was reported by
that review; no fresh zero-defect assertion is made.

Continue with evidence-backed provider reconciliation shared by G1-G4 and the
financial-disposition model, preserving the immutable historical ledger. Do not
hardwire a processor or substitute optional visual work for payment correctness.
The imagery lane received the new private5-6 calibration authorization through
its existing chat; public publication and Batch1 mass rendering are not cleared.
The existing Claude should review exact successors and retain separate core and
imagery verdicts. Repository messaging requests coordination; it is not evidence
that Claude is running or has accepted these bytes.

No deployment, managed migration, hosted configuration, merge, price release,
account grant, real email, money, procurement or clinical action occurred.
Historical production observations remain dated historical evidence; production
was not freshly requalified in this source-only turn.
