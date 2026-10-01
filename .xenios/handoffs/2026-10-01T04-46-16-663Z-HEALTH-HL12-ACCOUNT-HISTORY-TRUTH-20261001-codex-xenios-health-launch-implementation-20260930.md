# HL-12 durable verification effects and account-history truth

Source implementation checkpoint. Not a production GO, payment activation,
managed qualification or claim that the complete Health site is finished.

## Exact candidate and continuity

- Existing branch: `codex/xenios-health-launch-implementation-20260930`.
- Existing worktree: `C:/Users/sboad/.codex/worktrees/b22f/xenios-website`.
- Existing session: `codex-xenios-health-launch-implementation-20260930`.
- Prior runtime: `915a5354376f0f5e9c850e5fddd2b51be78d2e43`, tree
  `c3793ba4b83031bce7841a1ba6df78bda5e10731`; prior records `61853e28c2e6a803340f9f9cb5f4eabe480e0961`.
- Coordination-only checkpoint: `4197a961bf6a54c44a1eb710c738d80112187521`.
- Pushed runtime: `3562c03f3bd26b4a9ec165c0f17b1f96256abb23`.
- Runtime tree: `1375cba028094f3f0cae87055dc7907511a758b0`.
- Pushed test/proof commit: `062a0286523aca10e3b83ac4ded0b3402dbe2dd5`.
- Release-control commit: `0f91db72f2b466a82051e957decb22cf0f352c87`.
  Final records commit is the later corpus handoff/branch tip, not runtime bytes.

Latest independent Claude branch observed: `e7b74feb04567cac16d5b8bd089a7ae1218721d2`.
Report23, `docs/review/xenios-health-launch-review-20260930/23_REVIEW_915a535_SUCCESSOR.md`,
and its historical preflight proposal were read completely. That report reviews
**915a535**, not this successor. Preserve its independent run of1,062 pass,
1 skip and1 expected protection failure separately from all runs below.
Its independent severity count was P0 none, P1 F1, P2 F4/N2/HIST-02/ADP-01.
No new independent severity recount or successor acceptance is asserted here.

## Implemented source: exactly13 files

- `payment-effects.ts`: exact readiness probes, canonical audit preparation,
  bounded20-row serial recovery, validated keyset envelope, poison-row progress,
  wraparound retry and overlapping-tick guard. Existing audit receipts survive
  verifier revocation and audit-key rotation. No browser retry credential.
- `audit-store.ts`: branded existing authority exposes canonical preparation;
  no parallel audit system and no logger masquerading as durable authority.
- `outbox.ts`: recover on the existing worker; no second queue/timer. Recheck
  immutable financial notice binding immediately before dispatch. Only generic
  errors/counts are logged by the new recovery path.
- `server/index.ts`: financial routes require both durable audit and effects
  readiness, in addition to the existing default-off flag. Ordinary intake is
  preserved when finance is off. Manual evidence remains unconfigured.
- `http.ts`: refuse absent recovery before verification; committed effects are
  opportunistically completed and durably retried. Pending503 no longer tells
  the original actor to retry a financial action.
- `service.ts`: remove the obsolete actor-dependent one-shot effects method.
- `finance.ts`: canonicalize UUIDs only, fixing uppercase request receipt500;
  validate immutable verifier labels against the canonical audit constraints.
  Prices, evidence references, currency and actor labels are not canonicalized
  into different business facts.
- `member-order-history.ts`, shared `member-history.ts`, client
  `request-read.ts` and `AssistedRequests.tsx`: validate the complete owner-bound
  history envelope before any financial read; up to100 rows in chunks of4.
  Missing financial RPC/null retains neutral legacy copy; malformed or failed
  other reads surface unavailable rather than an empty successful history.
  Both mounted account and member views distinguish verified payment from
  fulfillment and from historical/regressed operational labels.
- Migration87 promotes the canonical audit candidate byte-for-byte. Migration88
  extends the canonical outbox with a unique verification-bound held intent.
  Verification, paid event and intent commit or roll back together. Canonical
  audit append and held-to-pending release are one transaction. Immutable
  identity/recipient/payload, no delete/truncate/direct unaudited release.

The new SQL refuses malformed or padded status vocabulary before the email
renderer can trim it. It rejects unauditable verifier labels before committing
payment, including controls/invalid trim/oversize UTF-16 input. Five bounded
service-role RPCs are exposed; helper functions remain private. It refuses
existing genuine verification rows without adoption and creates no historical
verification. SQL binds structural canonical audit receipts; it **does not**
independently validate HMAC alias cryptography. That remains the existing
trusted server adapter boundary.

The15 test/proof files strengthen owner isolation, authority readiness,
malformed envelopes, grant-independent recovery and atomicity. Three obsolete
one-shot service tests were removed with their removed method and replaced by
durable recovery/outbox/mounted-wiring tests. No protection assertion, timeout
or catalog fingerprint was weakened.

## Finding disposition and remaining work

| Finding | Disposition for3562c03 |
| --- | --- |
| F4/X3 | Implemented and locally verified; independent Claude verification pending. Held canonical outbox row is the durable obligation, not a proposed second obligation queue. |
| HIST-COPY/account history | Implemented in both mounted views, locally tested; independent verification pending. |
| X2 within F8/F8-R | Uppercase UUID receipt mismatch reproduced and repaired. Does not close all correction/error-mapping cases. |
| F1 P1 | OPEN operational prerequisite: independently authoritative manual payment source and controlled grant procedure. No hosted adapter/grant activated. |
| N2 P2 | OPEN engineering: governed no-funds, void, refund and historical disposition. Missing evidence is not proof of no funds. |
| HIST-02/HIST-02-R1 P2 | OPEN at this exact runtime: payment-stage first quote and expired unaccepted quote reissue. |
| ADP-01 P2 latent | OPEN engineering: durable provider attempt/event/quarantine authority. Provider assertions remain held. |
| HIST-FREEZE P3 | OPEN managed disposition/freeze decision; no fabricated old verifications. |

Carry forward Claude's predecessor closures HIST-PROG, F7-R1, SQL-06, SQL-13,
ROLL-06, and continuing SQL-01 containment without relabeling them a review of
this successor. Preserve ROLL-05, ROLL-06-R1, TRUNC-EVID/NEW-EVIDENCE-TRUNCATE,
GUARD-NEWSTATE, QUOTE-CONTRACT, ERR-ORDER, AVAIL, F5-R, F9 policy, remaining
F8/F8-R and CSP-01/02/03/04/05/08. Local effects postchecks improve
TRIG-ENABLED/POSTCHECK-COVERAGE only for their specified objects, not every
predecessor. Broader TEST-GAP/browser/integration qualification remains open.

HL-11 is not changed here. Source426 rows reconcile to424 canonical variants:
418 retained plus6 new minus2 superseded from the old420; exclude stable
GRP-0364 shipping for423 merchandise targets. Current mounted420/419 is still
an acknowledged gap. New GRP-0425 Oxytocin10mg10750 replaces0407, and0426
Hexarelin5mg6250 replaces0402; never alias their new identities onto old price
UUIDs. Other additions0421/0422/0423/0424 remain source-backed with genuine
holds, including unresolved0422 component split. Preserve17 approved display
cents including Tesamorelin16927,242 withheld Care projection prices,
canonical Product Control prices and the two genuinely quote-only rows.
Superpower/Mito Health remain Coming soon, not purchasable partner claims.

## Separate local evidence (do not sum these runs)

All authoritative commands use private Node `v20.19.0`, npm `10.8.2`.
Previously verified official Windows x64 archive SHA-256:
`be72284c7bc62de07d5a9fd0ae196879842c085f11f7f2b60bf8864c0c9d6a4f`.
No system-wide install or permanent PATH edit. Vitest runner38572 and child38364
were observed using the private Node executable; child-provenance artifact below.

| Run | Actual result |
| --- | --- |
| Account-history predecessor reproduction | 4 failed,94 name-filter skips; exit1;52.90s |
| Account-history four files | 159 passed; exit0;16.48s |
| Outbox unsupported CLI option | `--minWorkers` rejected before collection; exit1; no test result |
| Outbox corrected invocation | 34 passed/2 files; exit0;5.82s |
| Early F4 four-file runs | Separately156 pass/9.35s and159 pass/4.92s; exit0 each |
| Valid actor-label reproduction | 2 failed,81 filtered skips; exit1;1.07s |
| Malformed status reproduction | 7 failed,84 filtered skips; exit1;1.06s |
| F4 after corrections | 175 passed/4 files; exit0;7.21s |
| X2 uppercase reproduction | 6 failed,20 filtered skips; exit1;1.23s; mounted HTTP500 reproduced |
| Final delegated four-file run | 188 passed; exit0;11.04s |
| Final SQL source assertions | 8 passed; exit0;0.761s |
| Final broad serial regression | **1,255 passed/44 files**, no failures/skips; exit0;100.02s |
| Final typecheck | `tsc --noEmit`, exit0 after final source; no stdout file was created |
| Final production build | exit0; client16.48s/server0.735s; source1339/build225 files, zero forbidden em-dash forms |
| Migration DAG | 47 nodes, canonical checksums PASS; exit0 |
| Route uniqueness | 458 registrations/449 call sites PASS; exit0 |
| Protection CLI, bounded4197a96..062a028 | 38 hard hashes PASS; two seam differences reported; exit0, not seam approval |
| Release-control plus protection tests | 87 passed,1 failed,1 conditional PG16 skip; exit1;139.61s. One unchanged seam-baseline assertion reports the two paths below. |

Earlier account/typecheck and an overlapping intermediate build also passed,
but only the final typecheck/build bind the frozen runtime. Build emitted
existing chunk-size/dynamic-static-import warnings; JSDOM emits unsupported
scrollTo warnings. Neither is relabeled a failure or silently suppressed.

Final broad regression ran on4197a96 plus the exact dirty source/test bytes
subsequently committed as3562c03 and062a028. No source/test edits occurred during
that run. It is an affected-area regression, **not the full repository suite**.
The last full suite at95e040a remains18,398 pass/5 fail/85 skip,exit1,1588.11s.
The earlier d6f99e0 run18,382 pass/2 fail/85 skip,exit1,606.34s is separate.
No fresh full suite was run here; resource-controlled full integration is still
required after remaining protection/implementation issues are reconciled.

Disposable SQL proof runs, each separately preserved:

| Run | Result |
| --- | --- |
| 1 | PASS62.517s on initial effects SQL |
| 2 | PASS51.644s, initial SQL with label/postcheck cases |
| Envelope reproduction | Expected FAIL12.720s: malformed existing status accepted |
| 3 | FAIL25.882s: fixture expected old error category |
| 4 | FAIL52.271s: psql fixture alias casing |
| 5 | **PASS96.570s**, final exact SQL/proof; exit0 |

Final PostgreSQL17.11 image ID
`sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`.
No-network disposable container, no published ports, synthetic fixtures and
exact owned-container cleanup. Final counts30 verifications/30 intents/30 paid
events/1 audit,29 held, historical verifications0. The one synthetic sent label
tests a guard and is **not email delivery**. Proof covers apply twice, M71-only
pre80 counts, actual roles, interruption rollback, adoption refusal, ten malformed
status envelopes, nine invalid labels, valid Unicode/512-unit labels, eight exact
function signatures/search paths, replica-trigger drift,25 tied-ms keyset rows,
revoked grants, two-connection rotated-key completion and dispatch binding.

### Reproduction commands (PowerShell, repository root)

```powershell
$pinnedNode = 'C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64\node.exe'
$env:PATH = 'C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64;' + $env:PATH
& $pinnedNode --version
& 'C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64\npm.cmd' --version
$env:XENIOS_MASTER_OFFERINGS_DATASET = Join-Path (Get-Location) 'server/research/master-offerings/data/member-safe-master-offerings.generated.json'
& $pinnedNode node_modules/vitest/vitest.mjs run server/research/assisted-order client/src/research/assisted-order shared/research/assisted-order server/research/status-recovery client/src/research/member-orders client/src/research/account-portal/views/orders-requests.test.tsx client/src/research/pages/member/Orders.test.tsx server/research/master-offerings/early-access-catalog-coverage.test.ts server/research/early-access-wall.test.ts server/research/outbox.test.ts server/research/outbox-hl12-effects.test.ts --maxWorkers=1 --no-file-parallelism
& $pinnedNode node_modules/typescript/bin/tsc --noEmit
& 'C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64\npm.cmd' run build
& $pinnedNode supabase/verification/research_assisted_order_quote_effects_local.mjs
& $pinnedNode node_modules/vitest/vitest.mjs run server/release-control-plane.test.ts server/core-site-protection.test.ts --maxWorkers=1 --no-file-parallelism
& $pinnedNode --import tsx scripts/acceptance/verify-migration-dag.ts
& $pinnedNode --import tsx scripts/acceptance/verify-route-uniqueness.ts
& $pinnedNode scripts/acceptance/verify-core-site-protection.mjs 4197a961bf6a54c44a1eb710c738d80112187521 062a0286523aca10e3b83ac4ded0b3402dbe2dd5
```

Run on this branch's records tip, whose source remains3562c03, so regression
files and migration registration are present. Do not run a local proof while
Claude is using the shared Docker resources without coordinating first.

Local artifact directory: `C:/Users/sboad/.codex/tmp/health-effects-20261001/`.

- `focused-final.log`: SHA256 `ce74dee62c31751037b62f6deb9d7c860d301fa8e00b321d318d31ac6c0c47c3`.
- `focused-child-provenance.json`: `768366d2c977192d0865fed0e8f33f25d955ddf62bbc2406635fcc662961d033`.
- `build-final.log`: `a8f510c2b44cf529fe4734e4e7025067506eefe29ad3be051df1f8a568c950bd`.
- SQL runs: sibling `.codex/tmp/research_assisted_order_quote_effects_run1.log`
  through `run5.log`, plus `research_assisted_order_quote_effects_envelope_repro.log`.
- Final SQL log SHA256 `7c84b4bc323244a4ecc611df893d67f1682e8d8feb8ebf5a161dd1b43ee69e44`.
- Final local proof SHA256 `3ae9d2b76b87eba993b9ff7aabeb324f15834b689c02cc5a2794a99411f82e12`.

These full logs are local artifacts, not committed portable evidence. The
committed proof, assertions, commands and summaries support reproduction. A
read-only artifact-hashing command returned exit1 for the nonexistent empty
typecheck log; this is not a typecheck/test failure. An earlier process capture
succeeded, followed by an unrelated nonexistent-path read; keep that command
exit separate from the actual test exit0.

## Protection, rollout and limitations

The approved two-hash amendment at663268f is complete and is not being repeated.
There are now two differing seam paths under one unchanged baseline assertion:

| Path | Pinned hash | Current LF hash |
| --- | --- | --- |
| server/index.ts | 1d6594d6389e2ac67d9af85213854e05387899dfe0102fa577e447565e68c315 | 48cd4cab1c63524f7d3ec602a53cafc147564fa8df28998d603bc9854ac49222 |
| server/research/index.ts | b8db03cf7b51b2bd225e4f96c9cf3762f97188a7babcaf89591815c226263070 | 5b9f683b183a095e258908e0e0086888c71b7666b0e384367b1bfde0c4124188 |

Claude23 reviewed the unchanged Research gateway diff as safe and appropriate
for an explicit owner amendment. No such approval was received. New index
bytes need their own exact review/approval; do not extend the old approval.

Migration87 checksum `a6814b1c8f0cd42b24cc9f3ca17e3950d82811ada75abb8dba698441900457b0`;
88 checksum `8121e537df0f3028b73be5c03b66912b8a04498c8d646aa7f5d1edba4071f743`.
See the new87/88 section in `supabase/MIGRATIONS.md` for exact source,
dependencies, default-off rollout, historical freeze go/no-go, app-after84,
effects-readiness87/88, managed ACL/PostgREST requirements and preservation-only
roll-forward rollback. Pre80 inventory is implemented and locally tested, not
an executed managed preflight. NEW-APPLY-MECHANISM remains open: a reviewed
per-file transactional executor and managed-history procedure are still needed.
Exact managed identity/ledger/schema/role posture are not freshly observed.

No managed SQL, hosted configuration, deployment, price release, real-user grant,
email, money, procurement or clinical action occurred. No new real-browser,
native zoom, live auth, hosted PostgREST, provider/bank or recipient-delivery
qualification is claimed. No runtime code from the image lane was merged.
Existing image chat was messaged to continue its own Batch0 without duplicate
rendering; its progress is lane-reported, not independently accepted here.

**Ready for Claude exact-successor verification. Production promotion NOT READY.**
Provider choice is not blocking the remaining provider-independent engineering.
