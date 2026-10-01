# Health HL-12 history and immutable quote successor

Implementation checkpoint, not a release or payment activation approval.

## Exact identities and ownership

- Branch: `codex/xenios-health-launch-implementation-20260930`.
- Worktree: `C:/Users/sboad/.codex/worktrees/b22f/xenios-website`.
- Session: `codex-xenios-health-launch-implementation-20260930` (continued, not replaced).
- Prior source: `947f6ee7739bf2a1381b4b29a4f9d132c751d64c`; prior records: `49234f8a2dd804845245a18056a73904b320158a`.
- Exact owner-approved two-hash amendment: `663268fdf537da9349327c097d431dabeef56a70`.
- New runtime: `915a5354376f0f5e9c850e5fddd2b51be78d2e43`.
- Runtime tree: `c3793ba4b83031bce7841a1ba6df78bda5e10731`.
- Regression/proof commit: `240628f700daf8c72d720c045fda2519826cada2`.
- Final test-only successor: `c181db5d07384fdd3a3549feb13d76190af6ffa3`.
- Release-control registration: `74b043d4432a2d1c7fe620b6a6754e4ea7e816f2`.
- Independent reviewer branch observed at `c2e4beaa796015dd08134c009c0aaebbbb48644f`; report22 including its947f6ee addendum read completely. Latest independently reviewed core runtime remains947f6ee. Claude has NOT reviewed915a535 in the evidence available here.
- Image lane observed at `8ece3abd1c873a588f0e835a6dccc3a364d877a9` (merge of the prior core into its own lane, following757b825). Not integrated here; no new render or acceptance claim inferred from that merge.

## Implemented changes and classification

Runtime commit changes exactly four files:

- `server/research/assisted-order/service.ts`: historical/current post-payment states require durable verification before any status change; all cancellation checks consult the financial authority. An old paid label never becomes evidence.
- `server/research/assisted-order/supabase-repository.ts`: retain owner-authorized payment evidence after fulfillment advances or the timeline contains paid. Missing financial RPC on write preflight is a controlled409 hold, never inferred no funds.
- `server/research/status-recovery/supabase-store.ts`: retain verification in P-17 after advancement, preserving session and exact-subject authorization before the financial read.
- `supabase/migrations/20261001024018_research_assisted_order_quote_history_immutability.sql`: additive historical progression trigger; immutable issued/accepted quote snapshots, controlled issued-to-accepted/superseded transitions, no delete/truncate; parent-first acceptance locks and terminal/historical acceptance refusal. Existing provider hold and private unbound verifier preserved.

Test/proof commits change five test files (financial-projection, service, http-e2e, payment-status-copy, member-history-status) and add the local SQL proof plus PII-free pre/postchecks. No production fixture or verification is created. The later member-history-status fixture change explicitly expects the new second financial read, preserving all no-fallback and authorization tests.

Release-control changes register migration86 against its immutable source/hash and update the exact-source regression assertion. Records/corpus changes describe evidence and residuals only. No price, catalog, imagery, protected routes.ts/index.ts source, P-17 migration or provider configuration changed.

## Finding disposition

| Finding | This successor |
| --- | --- |
| F7-R1 | Owner status and P-17 repaired locally. Account history still renders the bare operational paid label and remains a separate residual; do not claim all payment copy is complete. |
| HIST-PROG | Mounted service and effective local SQL now hold unverified supplier_processing/shipped/delivered/closed states, missing timelines and regressed states with paid history. Genuine verification still permits separate fulfillment progression. Independent review pending. |
| SQL-06 | Snapshot mutation/deletion/truncation refused by additive SQL, including owner-level synthetic probes. Independent review pending. |
| Terminal quote acceptance | Reproduced acceptance after cancellation, repaired with parent-first locks. Existing exact accepted receipt replay permitted only for nonterminal, nonhistorically-held requests; no new acceptance after paid history. |
| ROLL-06, narrow | Missing financial-state RPC on transition preflight now returns409. This does not solve every absent-schema RPC or qualify app-before-migration rollout. |
| HIST-02 | OPEN: issuing a first quote for existing payment_pending/payment_review requests is still disallowed by the older quote_issue function. No replacement price invented. |
| F1 | OPEN P1: actual manual evidence-source/workflow and authorized verifier-grant procedure unconfigured. This is independent of the deferred card-processor choice and does not block provider-independent engineering. |
| N2 | OPEN: governed no-funds/void requires independently authoritative disposition, not missing evidence, timeout, free text or a superseded observation. No refund/cancellation authority invented. |
| F4 | OPEN: durable atomic outbox intent, autonomous audit/effect recovery and mounted durable-audit readiness gate still needed. Actor-dependent retry is not durable recovery. |
| ADP-01 | OPEN: provider attempt/event/quarantine persistence, authenticated adapter and release qualification remain. Fake provider observation/verification stays held. |
| ROLL-05 | OPEN: arbitrary older-migration replay can restore obsolete RPC bodies/ACLs. New guards remain additive; pre/postchecks record fingerprints but do not prove all predecessor replay safe. |

Also preserve F8 short-reason/uppercase-UUID behavior, account-history wording, evidence-reference canonicalization/claim disposition, exact HL-11 424-variant reconciliation, product details, public/account/partner/supplier/admin journeys, image review/integration and browser/release qualification. No independent P0/P1/P2 recount is asserted for the new runtime.

## Separate test evidence

All Node tests use the private full-path Node `v20.19.0`; npm is `10.8.2`. Child command PATH is prepended only for that process, never installed permanently. Official Node Windows x64 archive SHA-256 previously verified against official SHASUMS: `be72284c7bc62de07d5a9fd0ae196879842c085f11f7f2b60bf8864c0c9d6a4f`.

Runs overlap and MUST NOT be summed or relabeled:

| Run | Result |
| --- | --- |
| HIST-PROG focused predecessor reproduction | 6 failed,2 passed,58 name-filter skips; exit1;1.12s. One fixture reached the old concurrent-update path instead of the expected financial hold. |
| Service after repair | 66 passed; exit0;1.18s. The command also named a nonexistent http.test.ts filter; only service.test.ts actually ran. |
| F7 focused predecessor reproduction | 2 failed,41 name-filter skips; exit1;1.09s. |
| F7 projection/copy/existing customer page | 119 passed across3 files; exit0;41.87s. |
| F7 P-17 directory plus financial projection | 90 passed across7 files; exit0;12.40s. |
| Missing-authority reproduction | 1 failed,29 name-filter skips; exit1;0.786s, generic error instead of controlled conflict. |
| Missing-authority repair/projection file | 30 passed; exit0;0.533s. |
| Mounted HTTP first test run | 18 passed,1 failed; exit1. Test fixture used trackingReference instead of required trackingId. No source relaxation. |
| Mounted HTTP corrected fixture | 19 passed; exit0;1.58s. |
| Mounted HTTP with absent-RPC cases | 21 passed; exit0;1.44s. |
| Combined assisted-order and P-17 server run1 | 508 passed,1 failed,24 files; exit1;45.67s. Existing shipped-status fixture supplied the status payload as financial state. Log focused-server.log. |
| Combined run2 after fixture correction | 509 passed,24 files; exit0;27.59s. Same source, no gate weakened. Log focused-server-run2.log. |
| Local PostgreSQL proof run1 | PASS, exit0;25.915s; PostgreSQL17.11. One run split into before/after logs, not two runs. |
| Local PostgreSQL proof run2 | PASS, exit0;27.311s; PostgreSQL17.11. Tightened TRUNCATE assertion requires exact immutable-quote detail. |
| Typecheck | PASS, exit0; npm run check. Runtime915a535 with final test and release-control overlays. |
| Production build and permanent no-em-dash gate | PASS, exit0; runtime1338 files/build224 files, zero forbidden customer-facing forms. Existing mixed-import and large-chunk warnings remain. |
| Release-control plus core protection tests | 87 passed,1 failed,1 existing conditional PG16 skip; exit1;74.26s. The sole failure is the unchanged Research gateway clean-seam baseline. Release-control file itself passes. |
| Migration DAG | PASS, exit0;45 nodes, canonical Git-blob checksums verified. |
| Route uniqueness | PASS, exit0;458 static registrations across449 call sites. |
| Protection CLI at74b043d | PASS, exit0;17 changed paths,38 hard hashes verified; Research gateway reported as seam drift, not hidden. |

The SQL proof creates a no-network, no-published-port temporary container and synthetic tmpfs database, applies predecessors, reproduces prior defects inside rollback, applies exact new bytes twice, and tests guards/ACLs/isolation/verification and independent-connection races. Both its own containers were removed. No historical verification backfill. Run1 cancellation won the race; run2 acceptance won before cancellation; both serialize and refuse subsequent terminal acceptance.

Verifier grants and payment evidence references in that disposable proof are synthetic, not independently authenticated bank evidence. Successful progression preserves the existing separate supplierAssignmentId/trackingId checks; those free-text gates do not prove composed supplier fulfillment eligibility.

Migration SHA-256: `0956316142dd52724729b1653f0d3732b2c45e17074e64ad7f8888582407243f`.
Final proof LF SHA-256: `0b2dcf2d1e1b2bbdf9707cb620cc71c7308281e85594251a60b50632f84872a4`.
Local run2 log SHA-256: `2806c0513b8c213d0a33fd7551e176cfa324a75252d49a41ded184249fafe833`.

Logs: `C:/Users/sboad/.codex/tmp/health-history-915a535/` and `C:/Users/sboad/.codex/tmp/research_assisted_order_quote_history_immutability_run2.log`. Failed targeted reproductions without separate files remain in tool output and the explicit results above. Those are not a fresh aggregate run.

Log SHA-256 receipts (local files, not portable managed evidence):

| Log under health-history-915a535 | SHA-256 |
| --- | --- |
| focused-server.log | d59c1b4d06412bc60b8b63a73dc8dc25f7d2716a7f1fe4d4925ead97ca881e5e |
| focused-server-run2.log | 8105f9ec8c7c121dd1ea01e852a9ab1462f69d49849185a37c741d0bf5055064 |
| typecheck.log | 93ea5c8bbb17193449a166753a0a48eb8c290a6edd19513920756cda8af19e1a |
| build.log | b6e2cf9baa23a9dc23b666590f3ffa5100a53baa17c22a42b829dc40d6b2d5a8 |
| release-tests.log | cc86dc34f9d2b5a4880459c669f67e22da425479499b314320896e8ee97c7e8e |
| dag.log | 743bfb853dc88e960a023531d44abeb2821bedd49b7aa4ce067b45ba6e616b1c |
| route.log | 8f8fef46ee1231e01ad24bca1123c3e6938f8ca1aeed5401355b589b13fdfcb4 |
| protected.log | 3547241cae0fa1560424b2ed4063b2329e6bb7bd8c560ba78072f96e0bbd616d |

The actual DAG/route invocations used the same full-path Node with `--import tsx scripts/acceptance/verify-migration-dag.ts` and `--import tsx scripts/acceptance/verify-route-uniqueness.ts`. The npm equivalents below are reproduction commands. The release-test run used both exact test paths below at74b043d. No test limits or skips were added.

The earlier exact95e040a full suite remains **18,398 passed /5 failed /85 skipped, exit1,1588.11s**. Separate prior full suite and later isolated diagnostic results remain in `HEALTH_HL12_QUALIFICATION_95e040a.json`. No full suite was rerun in this narrow slice: the Research gateway protection assertion is a known integration blocker, and no merge/integration or production promotion occurred. A resource-controlled full suite remains required at the integration boundary; do not claim this runtime has passed it.

## Reproduction and operational limits

From the existing worktree, use these exact executables; preserve failures independently:

```powershell
$env:PATH = 'C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64;' + $env:PATH
& 'C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64\node.exe' node_modules/vitest/vitest.mjs run server/research/assisted-order server/research/status-recovery --maxWorkers=1 --no-file-parallelism
& 'C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64\node.exe' supabase/verification/research_assisted_order_quote_history_immutability_local.mjs
& 'C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64\npm.cmd' run check
& 'C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64\npm.cmd' run build
& 'C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64\node.exe' node_modules/vitest/vitest.mjs run server/release-control-plane.test.ts server/core-site-protection.test.ts --maxWorkers=1 --no-file-parallelism
& 'C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64\npm.cmd' run verify:migration-dag
& 'C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64\npm.cmd' run verify:route-uniqueness
& 'C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64\node.exe' scripts/acceptance/verify-core-site-protection.mjs 49234f8a2dd804845245a18056a73904b320158a HEAD
```

Migration86 is source-only/PENDING and requires85 and its predecessors. Its precheck is not valid on a managed target lacking80-85. A managed plan must identify actual migration history and exact approved target first. Keep finance disabled; rollback is preserve data/guards and roll forward under separate authority, never replay an old financial migration, remove holds, fabricate evidence or delete audit/payment history.

The two-hash approval did not approve Research gateway baseline changes or later source edits. Approved routes.ts/index.ts bytes remain unchanged. Research gateway remains a reported seam and its clean-baseline test remains red. Do not weaken the assertion.

No deployment, managed migration, hosted configuration, account grant, real email, real money, procurement, clinical action, price release, or staging/production mutation. No new browser, native zoom, managed PostgREST or live customer qualification. Local mounted HTTP tests use real application adapters/services with synthetic infrastructure ports; local SQL proof is separate and not a composed hosted-app claim.

## Next exact work / independent handoff

Claude should review exact runtime915a535/treec3793ba4 and its test/proof successors, giving payment priority over imagery. Preserve the existing reviewer session, do not claim a review is running without evidence. Recheck F7 after progression, HIST-PROG across missing/regressed history, actual verification progression, immutable quote economics and accept/cancel concurrency, and controlled absent-schema refusal. All open findings above remain visible.

Next implementation: durable verification outbox/audit recovery in the canonical stores with a separately reviewed mounted readiness gate; then governed no-funds/refund disposition, provider-neutral persisted attempts/events, HIST-02 and exact HL-11. Do not introduce another financial authority or displace this work with optional program cards. Keep existing price holds, approved cents and Coming soon-only decisions unchanged.
