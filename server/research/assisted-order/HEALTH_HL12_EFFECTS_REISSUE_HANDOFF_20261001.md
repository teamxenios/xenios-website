# HL-12 durable effects and historical quote reissue: exact successor

Continued the existing core lane. No restart, merge, managed apply, deployment,
price release, account grant, real email, money, procurement or clinical action.
**Ready for Claude exact-successor review. Production promotion NOT READY.**

## Exact identities

| Kind | Identity |
| --- | --- |
| Branch | codex/xenios-health-launch-implementation-20260930 |
| Worktree | C:/Users/sboad/.codex/worktrees/b22f/xenios-website |
| Runtime | 3da909542a152552331074176f966f820600e948 |
| Runtime tree | e644ab4368c01e0a75ac5a89c6c09dbf8f8e7f2d |
| Test/proof | 02dfaccdd3227d13f6fdddc889ef4ec34dae7188 |
| Release-control | 0d21416f52bfe3e4b364e70495d609199384c5e6 |
| Clean-worktree full-suite checkpoint | 5b3dc7702695374adb19b22b033026123bb34540 |
| Full-suite checkpoint tree | a4361c3a5067e763335a008ce2dd5113aac7e16b |
| F4 source, included unchanged | 3562c03f3bd26b4a9ec165c0f17b1f96256abb23 |
| F4 source tree | 1375cba028094f3f0cae87055dc7907511a758b0 |
| F4 test/proof | 062a0286523aca10e3b83ac4ded0b3402dbe2dd5 |
| F4 release-control | 0f91db72f2b466a82051e957decb22cf0f352c87 |
| F4 records | 1ac68cdd5c8150351de0908cda08aae8cac38431 |

All identified commits are pushed. Later records tip contains this handoff,
qualification receipt and corpus updates only. Read the exact source, not an
older browser tab or development preview, for review.

## Changes and commit classification

F4 source changes13 files, fully enumerated in
`HEALTH_HL12_DURABLE_EFFECTS_HANDOFF_20261001.md`. It adds atomic canonical outbox
obligations, canonical audit-before-release, autonomous bounded recovery,
dispatch validation, mounted readiness, truthful account history and uppercase
UUID receipt handling. Its15 test/proof files, failed reproductions, five SQL
iterations and final1,255-test affected-area pass remain separately recorded.

HIST-02 source adds exactly one file:
`supabase/migrations/20261001044200_research_assisted_order_quote_history_reissue.sql`.
Only the existing `research_assisted_order_quote_issue` RPC is replaced.
Its signature and pricing/snapshot implementation remain byte-identical to the
predecessor below the financial prechecks. The two payment-stage statuses can
obtain a first quote or replace an unaccepted offer, including an expired one.
The parent request is locked before checking status, accepted quotes, every
observation, verification and paid-event history. All financial-history cases
remain held; an expired accepted quote is never permission to reprice it.

HIST-02 test/proof commit adds five files:

- `server/research/assisted-order/quote-history-reissue-http.test.ts`.
- `server/research/assisted-order/quote-history-reissue-sql.test.ts`.
- `supabase/verification/research_assisted_order_quote_history_reissue_local.mjs`.
- Matching `_precheck.sql` and `_postcheck.sql`.

Release-control commits touch only `docs/coordination/MIGRATION_DAG.json`,
`supabase/MIGRATIONS.md` and `server/release-control-plane.test.ts`. They pin
pending87/88/89 to exact ancestor source bytes; no applied state was promoted.
Other commits are handoff/corpus/coordination records. No runtime or tests were
edited during the aggregate; only heartbeat and external path-reservation
records changed. No protection baseline, timeout, scan scope or allowlist changed.

## Qualification, separated by run

Private Node **v20.19.0**, npm **10.8.2**, full executable path throughout.
Official archive checksum/provenance is retained in the F4 handoff. Both initial
workers and later observed workers used that exact executable. No permanent PATH
change or system-wide install. The full suite explicitly enabled the real
checked-in master-offerings dataset reader.
The hashed initial process snapshot contains the initial workers only. Later
PIDs38248/9556 were observed through the process-inspection tool during the run;
that later observation is not part of the hashed initial snapshot.

| Run | Result |
| --- | --- |
| F4 broad affected-area regression | 1,255 passed/44 files; exit0;100.02s. Earlier failed/filtered and SQL iterations remain separate in its handoff. |
| HIST-02 mounted protocol | 20 passed; exit0;1.95s. Synthetic auth/RPC ports, not SQL eligibility proof. |
| HIST-02 SQL source contract | 6 passed; exit0;0.330s. |
| HIST-02 disposable PostgreSQL17.11 run1 | PASS; exit0;79.490s; apply twice. No failed development runs; expected predecessor refusals/negative cases labeled within run1. |
| Final typecheck | PASS, `tsc --noEmit`, exit0. |
| Final production build | PASS, exit0; client29.68s/server882ms; source1339/build225 files, zero forbidden em-dash forms. Existing chunk/import warnings retained. |
| Migration DAG | PASS,48 canonical checksums; exit0. |
| Route uniqueness | PASS,458 registrations/449 call sites; exit0. |
| **Full suite at5b3dc77** | **18,657 passed / 4 failed / 85 skipped**, exit1;912.99s. Files996 pass/4 fail/6 skip. |
| Separate unchanged serial scan diagnostic | 25 passed/3 files; exit0;9.92s, original5s test limits. **Does not change the aggregate result.** |

The four aggregate failures are:

1. One protected-seam assertion, reporting both `server/index.ts` and
   `server/research/index.ts` against their unchanged baselines.
2. `server/pgcrypto-qualification.test.ts`: real-repository scan timeout5000ms.
3. `server/research/early-access/preview-harness.guard.test.ts`: production-tree
   isolation scan timeout5000ms.
4. `server/research/products-diagnostics/customer-price-authority.test.ts`:
   superseded-price reachability scan timeout5000ms.

The unchanged serial diagnostic passing supports a timing-related diagnosis,
not a clean aggregate or permission to weaken the scans. Preserve prior full
runs:95e040a was18,398 pass/5 fail/85 skip,exit1,1588.11s; d6f99e0 was18,382
pass/2 fail/85 skip,exit1,606.34s. Claude's separate915a535 run was1,062 pass,
1 skip,1 expected protection failure. Do not sum or relabel any of these runs.

Structured receipt and artifact hashes:
`HEALTH_HL12_QUALIFICATION_3da9095.json`. Full raw logs remain local under
`C:/Users/sboad/.codex/tmp/health-hist02-20261001/`; they are not portable committed
logs. Full log SHA256 `654d3a8738ac8302c6789f0543cd7c442c0a07c890fbddc4b4b45f88f33c98ea`.
The receipt records exact command, timestamps, clean tested head/tree, worker
provenance, exit1 and the distinct diagnostic log/hash.

HIST-02 SQL log: `.codex/tmp/research_assisted_order_quote_history_reissue_run1.log`,
SHA256 `5d51b006536631a144ae4c23f72c2bbe845113dbfc3c557cf037e0ddac8b05c0`.
Proof SHA256 `6e130df143064d1c4f347ef78c65e13a9b0ef4c6f13f979a441bb03fa8d7c262`.

The proof establishes both predecessor payment-stage first-quote refusals and
true expired-offer refusal; exact economics preservation; no accepted repricing;
Care/held/price override/zero/duplicate/extra-line/total-limit refusals; atomic
rollback after supersession; ACLs and guard drift; and seven independent-session
race scenarios. It observes actual `wait_event_type='Lock'`, not only sleeping.
Specific parent-row attribution follows the source and isolated setup; it does
not record lock-target or `pg_blocking_pids` telemetry. Final synthetic counts:
17 quotes/6 accepted/5 observations/1 genuine synthetic-path verification,
1 held outbox/0 audit. No delivery, backfill or real financial evidence. Exact
owned no-network/no-port disposable container was removed.

## Reproduce locally

Use the records tip for these source bytes so tests and registration are present.
Coordinate heavy jobs with the existing Claude and image lanes first.

```powershell
$pinnedNode = 'C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64\node.exe'
$env:PATH = 'C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64;' + $env:PATH
$env:XENIOS_MASTER_OFFERINGS_DATASET = Join-Path (Get-Location) 'server/research/master-offerings/data/member-safe-master-offerings.generated.json'
& $pinnedNode node_modules/vitest/vitest.mjs run --maxWorkers=2
& $pinnedNode node_modules/vitest/vitest.mjs run server/pgcrypto-qualification.test.ts server/research/early-access/preview-harness.guard.test.ts server/research/products-diagnostics/customer-price-authority.test.ts --maxWorkers=1 --no-file-parallelism
& $pinnedNode node_modules/vitest/vitest.mjs run server/research/assisted-order/quote-history-reissue-http.test.ts server/research/assisted-order/quote-history-reissue-sql.test.ts --maxWorkers=1 --no-file-parallelism
& $pinnedNode supabase/verification/research_assisted_order_quote_history_reissue_local.mjs
& $pinnedNode node_modules/typescript/bin/tsc --noEmit
& 'C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64\npm.cmd' run build
& $pinnedNode --import tsx scripts/acceptance/verify-migration-dag.ts
& $pinnedNode --import tsx scripts/acceptance/verify-route-uniqueness.ts
```

The two HIST-02 files were originally run separately, not as a combined26-test
run. The combined command above is a reproduction convenience, not another
claimed executed result. F4 commands and all failed reproductions remain in its
handoff. Build/typecheck/full-suite commands were actually executed as recorded.

## Independent review, gates and managed limitations

Existing Claude branch last observed at `e7b74feb04567cac16d5b8bd089a7ae1218721d2`;
report23 reviews915a535. Exact successor requests were pushed for3562c03 and
3da9095. Dispatch is not receipt, active review or acceptance. Local peer source
audits are not Claude. No current independent P0/P1/P2 recount is asserted.

F4, HIST-COPY/account history, X2 and HIST-02/HIST-02-R1 are implemented and
locally verified, awaiting exact successor review. F1, N2 and ADP-01 remain open.
Carry the predecessor's HIST-PROG/F7-R1/SQL-06/SQL-13/ROLL-06 closures and SQL-01
containment separately. Other P3s, historical freeze/disposition, F8 remainder,
expected-fingerprint/replay limitations and broad browser/test gaps remain visible
in the F4 handoff and report23; do not close them through this narrow change.

Both protection hash pairs are recorded in the F4 handoff. The previously
approved663268f amendment is complete and does not authorize the new index
bytes. Claude reviewed the unchanged Research gateway as suitable for explicit
owner amendment, but none was received. Neither baseline was changed here.

Migration89 checksum `4f44f9df4a47148685d015ddf3d492b1d73ee6fea4e9ab674163ea1efb49cc69`;
dependency88, after86/87. Ledger87/88/89 sections contain the exact source hashes,
pre80 inventory/freeze decision, finance-off/grant-empty state, app-after84,
readiness requirements and preservation-only roll-forward rollback. Exact
non-production target/hosted origin, managed ledger/role ownership/PostgREST,
per-file executor/history procedure and scoped authorization remain prerequisites.
Do not bulk-replay the chain or historical bodies, erase records, synthesize
historical verification, infer no-funds from absence, or reuse old production GO.

No new browser/real zoom, hosted Auth/PostgREST, managed permissions, bank/provider,
actual recipient delivery or operational grant qualification occurred. The HTTP
and SQL proofs are separate, not an HTTP-to-PostgREST-to-SQL integration run.
Mock prices16927/6250/10750 do not release Product Control prices.

## Parallel lane and next exact work

Batch0 imagery source184d820a2a20152649b67892ec0a5467857d5290, tree
7743b87b312df84b396880b9159413b8144afba0; recordsd7747d4d9dce97b8f389b6128f64f0beafe1e84a.
Its records show25 generic class candidates/25 receipts, zero approvals, public
assets or runtime integration. Contact sheet and headless Chrome154 decode25/25
exist; this is not independent visual approval. Existing reviewer dispatch was
corrected in that lane; Batch1 remains review-gated.

Separate media-decoupling branch `codex/xenios-media-commerce-decoupling-20261001`
starts at67d75c968085ca0d8256636f6cf46aebcaa1a597/tree31791ce897833db8c12b35d5de0288f500a97f6c.
Its initial claim2c635af56eddc3e6fa691776faceef6bd9805b0d and explicit later exact
path expansions are mirrored in core ownership. Do not claim the broad catalog
lease over those paths. It removes only media readiness and false image-release
copy, preserving all non-image authority. No lane source merged or asset approved.
Core informed the lane when the full-suite/diagnostic heavy-job window cleared.

Next financial priority: N2 as a mounted, SQL-enforced positive disposition
authority, with default-off/null-adapter/grant-empty operational posture. Preserve
`hasObservation` and `paymentVerified` as facts; add cancellation eligibility
separately. Bind complete current observation/correction evidence under the
parent lock; forbid terminally resolved evidence from later verification or
reuse. Use independent disposition evidence, scoped grants, immutable records,
atomic events/effects and replay-safe recovery. Do not treat money returned as
no-funds. Keep historical paid, provider void and refund execution held until
their distinct authority/policy exists. Existing commerce refund code is not
drop-in: unrelated order/claim FKs, pi_/re_ assumptions, USD-only and partial
refund terminalization must not become the assisted-request authority.

True operational decisions: manual evidence provider/workflow, disposition versus
refund authorization policy, historical reconciliation criteria and applicable
refund/cancellation rules. The deferred card processor does not block neutral
engineering. Continue HL-11 exact424/423 reconciliation (mounted420/419 remains),
product details and public/account/partner/supplier/admin journeys without new
prices, discounts, commissions, partnership or clinical claims. Preserve the17
approved display cents, genuine holds and Coming soon-only partners.

Supabase and Postgres best-practices skills informed request-first locking,
bounded transactions, private helper ACLs and explicit local-versus-managed
evidence boundaries. No skill extended the user's external-action authorization.
