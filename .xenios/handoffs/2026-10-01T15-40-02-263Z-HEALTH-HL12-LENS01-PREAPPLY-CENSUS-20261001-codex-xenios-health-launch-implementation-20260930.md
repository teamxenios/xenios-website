# HL12 LENS-01 pre-apply census correction

Status: bounded local qualification complete. Detection only; legacy adoption remains unresolved and managed application is not authorized.

Branch: `codex/xenios-health-launch-implementation-20260930`.
Session: `codex-xenios-health-launch-implementation-20260930`.
Task: `HEALTH-HL12-LENS01-PREAPPLY-CENSUS-20261001`.
Base: pushed `abf151a47006bce54bd35c76b5a6ec006500e097`, tree `4bdaf94b1324ca1b17170d1133a1ce74f93b24fb`.
Application runtime remains `6d64d3e5d90fef9e49d3414244f77f486231b59e`, tree `10c6783e01a7b2fe9b1b60693ab501a6a5229ba4`. No application runtime or migration changes in this slice.

## Reviewer finding and correction

Claude report24 at `76607458e30a64746d227150ff1dbab3475dd64a` independently reviewed `8f240828df93ad45f31609d85460bd9d111047ec`. It confirmed that the old pre80 census could report no frozen requests while migration88 later refuses existing paid outbox notices. This could strand an individually applied chain between87 and88. That exact earlier report is preserved separately and does not accept the later UI work or this correction.

The read-only pre80 census now requires M71 plus the canonical historical outbox, not future financial tables. It preserves request-status and frozen-row result sets and adds a versioned notification result. It mirrors the unchanged88 predicates: exact paid canonical status template; reserved payment-verification event key; malformed canonical status envelope. No delivery-status filter or request join is used. Sent, delivered, cancelled, terminal-order and orphan-reference notices all count. The paid/key union is distinct-row based; delivery breakdown covers the union of all three blocker predicates, excluding unrelated valid notices.

The initial-install pre88 census repeats these predicates and additionally blocks on any existing verification, while preserving its previous inventory and fingerprints. An already-installed88 target uses its postcheck instead; this conservative initial-apply census does not classify valid bound post-install rows as adopted.

Both scripts run in a read-only repeatable-read transaction with10s statement/2s lock timeouts. `row_security=off` makes restricted visibility fail rather than report a filtered zero; it does not grant access or bypass RLS. Require every result set and successful transaction completion. Missing schema, insufficient privilege, RLS-filtered access, timeout or partial output is unavailable evidence, not a pass. A completed clear count is labelled `CLEAR_COUNTS_ONLY_NOT_AUTHORIZATION`. Historical request freezes and in-flight payment-stage/F1 impact still require separate disposition.

The Supabase and Postgres skills informed least-privilege, bounded-query and no-false-zero handling. Current [PostgreSQL row security and timeout documentation](https://www.postgresql.org/docs/current/runtime-config-client.html) and [transaction documentation](https://www.postgresql.org/docs/current/sql-set-transaction.html) were checked. No managed connection, DDL, grant or role configuration was performed by these census scripts.

## Unchanged authority and rollout hold

All migration80–93 bytes stay unchanged. In particular87 remains canonical audit promotion, and88 still refuses legacy adoption; cancelling a notice does not satisfy its predicate. No deletion, resend, template/key relabeling, invented verification or predicate bypass is permitted. A future governed no-send preservation mechanism requires its own independently reviewed source and exact founder disposition. No such disposition is supplied here, and the census correction alone does not close the complete LENS-01 finding.

The rollout plan now names87 alongside80/81/83 as lacking BEGIN. A future reviewed executor must provide an outer transaction and local timeouts for those exact files; for88's own BEGIN/COMMIT, bounded connection-level settings must precede the unchanged file. No executor or timeout choice has been qualified for a managed target. Stop on first error; preserve per-file outcomes and actual history. Freeze legacy paid writers and dispatch in a separately approved window and recensus; a stale zero cannot authorize later application. Known unsafe predecessor replays are listed explicitly.

ADP-G1 through ADP-G4, real F1 evidence/grant workflow, refund/void/dispute, SEAM-GOV-01 Access Hub product disposition, protected hash amendments, browser and full integration qualification remain open. The existing Claude and imagery/media lanes are preserved. No managed apply, deploy, merge, hosted configuration, price release, account grant, real email, funds, procurement or clinical action occurred.

## Local evidence

Release-control/census source: `510e957170e044a2d449058567ea6961b6d52eae`, tree `4e14a032c9d9303ff698455b28be0b4708d0d371`. Test-only successor: `eab674057ef9ea81bad575e6a330fc25cdeaadf9`. Exact clean qualification checkpoint: `610dde1930737b9d91494352d9d342a7000a4a5f`, tree `793a0d3dc0edc0584525ef90f45b350430074eeb`.

Seven separate executions are archived at `evidence/hl12-lens01-preapply-census-20261001/raw-checks-final.json`, SHA256 `119547caee27f4620812d5b7b50534b9435cee1ef4ad786c71aef562e87debd4` (106,523 bytes). Exact raw logs, all seven matching receipt hashes, commands, start/end identities, dirty states and available process snapshots are preserved. Collector source/hash is embedded. This is packaging, not another test run.

| Run | Result | Wrapper seconds | Revision |
| --- | --- | --- | --- |
| `lens01-focused` | 107 PASS, 2 files, 0 SKIP, exit0; Vitest9.04s | 20.712 | `abf151a`, frozen precommit census/tests |
| `lens01-outbox-focused` | 16 PASS, 2 files, 0 SKIP, exit0; Vitest31.31s | 39.956 | `abf151a`, frozen precommit census/tests |
| `lens01-effects-local` | FAIL, exit1; incorrect extra `node` argument, module-not-found before any DB operation | 3.497 | `abf151a` |
| `lens01-effects-local-corrected` | PASS, exit0; existing comprehensive effects proof, PostgreSQL17.11;413.813s proof, exact-container cleanup | 415.780 | `abf151a`, frozen existing proof/census; new independent proof and records developed separately |
| `lens01-census-local` | PASS, exit0;9 groups,11 expected refusals,6 isolated databases;41.767s proof; cleanup confirmed | 42.896 | clean `610dde1`, clean end |
| `lens01-typecheck-final` | PASS, exit0 | 36.858 | clean `610dde1` |
| `lens01-dag-final` | PASS, exit0;52 nodes, canonical checksums verified | 9.234 | clean `610dde1` |

The first focused invocation accidentally included a third nonexistent filter path, `server/research/notifications/outbox-hl12-payment-effects.test.ts`; only the two actual files ran. It is not a three-file pass. The subsequent separate16-test run uses the real outbox files. The command-assembly failure is not relabelled as a SQL test failure or a clean pass. No test run timed out. The dedicated proof deliberately produces a2s database lock-timeout refusal to verify unavailable evidence; that is an expected test case, not a timed-out runner.

All runs invoke private Node `v20.19.0`, npm `10.8.2`. The verified official Windows archive SHA256 remains `be72284c7bc62de07d5a9fd0ae196879842c085f11f7f2b60bf8864c0c9d6a4f`. Test workers use one worker/no file parallelism; core heavy jobs were serialized and coordination was requested in the repository mailbox. This does not attest the absence of other workers' activity. The existing real catalog dataset environment is present, but this SQL proof does not read the catalog and is not new whole-catalog evidence. Bounded process snapshots show pinned executables where sampled, not continuous attestation; fast failures may lack snapshots. Docker's PostgreSQL runtime is independently recorded as17.11 with image digest `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24` for the new proof.

The new proof independently reproduces old census output0 against8 paid notices plus2 reserved keys with one overlap, so9 adoption rows across all seven historical delivery statuses. It separately proves reserved-key-only refusal,12 malformed envelopes, a genuine synthetic predecessor verification, missing outbox, permission and RLS denial, and an actual lock timeout. Before/after stored-row/attempt/schema serializations match across refused88; no binding column appears. A separate clean-notification target applies88 twice without fabricating verification, even though its independent historical-request freeze remains nonzero. Exact unchanged source bytes and cleanup of all six databases with the owned no-network/no-port container are asserted.

The old census is loaded from exact Git revision `abf151a47006bce54bd35c76b5a6ec006500e097` and embedded with its hash `c4c4f01b16dec06d6155e9dae1db0817847856937be285924348c4ac1630448c`. The new census SHA256 is `02f77640557395d6ed0e919c629fcd1c5ab3a2c6aa511144beb93d1ed183ca1c`; pre88 `1f4cec17bded2f6e5ccfd5334be0ff9206ac30630602b91dce45ac974171eef7`; proof `e7b46618f0f2543277f2b795b24eefc658e65845ec8b273b33b46989cfc157ee`.

### Reproduction and changed-path classification

Run from the repository root with the private Node directory prepended to the process-local PATH only. The exact executed argument arrays are in the receipts.

```powershell
$node20 = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe'
$env:PATH = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64;' + $env:PATH
$env:XENIOS_MASTER_OFFERINGS_DATASET = (Resolve-Path 'server/research/master-offerings/data/member-safe-master-offerings.generated.json').Path
& $node20 node_modules/vitest/vitest.mjs run server/research/assisted-order/payment-effects-sql.test.ts server/research/assisted-order/payment-effects.test.ts --maxWorkers=1 --no-file-parallelism
& $node20 node_modules/vitest/vitest.mjs run server/research/outbox-hl12-effects.test.ts server/research/outbox-hl12-disposition.test.ts --maxWorkers=1 --no-file-parallelism
& $node20 supabase/verification/research_assisted_order_quote_effects_local.mjs
& $node20 supabase/verification/research_assisted_order_quote_pre80_preflight_local.mjs
& $node20 node_modules/typescript/bin/tsc --noEmit
& $node20 --import tsx scripts/acceptance/verify-migration-dag.ts
```

- Release controls: the two read-only census SQL files and `supabase/MIGRATIONS.md`.
- Tests: the new pre80 local proof, compatibility changes to the existing effects local proof, and two added static source-contract tests in `payment-effects-sql.test.ts`. Existing assertions are retained.
- Records: this packet, raw evidence/receipts and the scoped `.xenios` task/lease/session/state/message/handoff entries.
- Application runtime, all migration bytes, dependency files, protected baselines and imagery/media sources: unchanged by LENS-01.

No build rerun was needed for this control/test-only slice. The current application runtime's clean build at47074f2 remains its own evidence:1353 source/226 build files, zero forbidden forms. Protection remains red exactly as recorded in the admin-session packet. No fresh full aggregate or browser/native-zoom result is inferred. ADP03's earlier19,357 PASS/1 FAIL/85 SKIP remains a failed earlier aggregate, not current release qualification.

## Exact next reviewer work and engineering order

Review this control source and its test-only successor separately from the admin runtime. Verify exact predicates, all-delivery-state coverage, no false zero, no historical adoption, unchanged migration checksums and preserved failed-run classification. LENS-01 detection is locally corrected; adoption and the managed executor remain unresolved. No whole finding closure or production-ready census is asserted.

Next financial priority is ADP-G1, followed by G2–G4 and governed refund/void/dispute. Read-only design inspection found global checks in six effective functions: provider_uncertainty (91), provider_create_context (92), provider_settlement_guard, financial_eligibility, provider_settlement_row_allowed and provider_financial_guard (93). A local TypeScript helper or a NULL-to-request equality substitution is insufficient. Any future append-only attribution must positively bind independent source/account/mode/event evidence, preserve the original journal, enforce distinct proposal/approval authority, invalidate stale contexts and retain a hold on the attributed target even if already settled. Unresolved money is not no-funds, and an operator-picked target is not evidence. The sealed SQL graph, canonical audit contract and all six decisions require a consistent additive successor and disposable race/rollback proof. This is a design note, not an implemented resolution or grant procedure.
