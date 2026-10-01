# HL12 LENS-01 pre-apply census correction

Status: local qualification in progress. Detection only; legacy adoption remains unresolved and managed application is not authorized.

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

Results and exact qualification identities will be appended after the frozen scripts complete. New SQL proof uses only synthetic records in an owned no-network disposable database. Static source checks are supplemental, not substitutes for query execution. No new whole-catalog or full-suite result is implied by setting the existing dataset environment.
