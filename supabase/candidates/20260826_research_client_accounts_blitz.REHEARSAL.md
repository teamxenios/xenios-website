# Client-account candidate disposable attack rehearsal

This directory contains executable evidence for
`20260826_research_client_accounts_blitz.sql`. It supersedes narrative-only
counts. The migration remains an **unapplied candidate**: this rehearsal does
not register it in a ledger or DAG and does not authorize any environment run.

Run from Windows PowerShell or PowerShell 7 with Docker available:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\supabase\candidates\20260826_research_client_accounts_blitz.rehearse.ps1
```

The runner hardcodes
`postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20`,
requires its sole local RepoDigest and image ID to equal that digest, and
requires `linux/amd64`. It starts one randomly named container with
`--pull=never --network none`, mounts only this candidate directory read-only,
and destroys that exact container in `finally`. It accepts no environment URL
and cannot contact Supabase.

## Deterministic sequence and assertions

1. Bootstrap synthetic roles/dependencies, hostile default privileges,
   pass-aware result tables, and normalized public catalog/data inventory.
2. Apply pass 1 and capture its exact logical-object delta: six tables, ten
   functions, six triggers, two identity sequences, six row types, every
   explicit and implicit index, all constraints, policies, and helper
   functions.
3. Attempt an in-place second apply. Only nonzero SQLSTATE `P0001` with exact
   text `client-accounts blitz: one of the target tables already exists;
   reconcile before applying` is accepted; normalized catalog and data must
   remain byte-for-byte logically unchanged.
4. Run both the broad suite and the stable-ID narrative suite, execute the
   explicit non-`CASCADE` rollback, and require exact baseline restoration and
   absence of the captured first-apply delta.
5. Apply pass 2, require the same logical-object delta as pass 1, rerun both
   suites, and require the same exact rollback proof.
6. Require both-pass result completeness, the exact 18-v1 + 12-v2 counted map,
   V2-7 as additional only, and zero duplicate or unmapped executions.

## Observed results (2026-08-28)

Two complete runs exited 0 under Docker Engine 29.5.3. Both produced the same
logical-result fingerprint:

```text
REHEARSAL_LOGICAL_RESULT_SHA256=7b84af47bdcc99f471e5ef986b34e1e13347377686d75b0baa89b94a2eff1703
```

Per pass, the broad suite recorded 37 expected refusals and 11 positive
invariants. The mapped narrative suite recorded 33 stable executable IDs:

- v1: 18 counted historical rows, represented by 19 executions (18 refusals
  plus the positive assertion that `accepted` is unrepresentable).
- counted v2: 12 executions (V2-1 is the successful `draft → revoked` positive
  with a null approval bundle; the other 11 are expected refusals).
- additional V2-7: two current-schema refusals, not counted in 18 + 12.

Across both passes that is 74 broad refusals, 22 broad positives, 62 mapped
refusals, and 4 mapped positives. A14's historical `accepted → queued` setup is
no longer constructible because both CHECK vocabularies exclude `accepted`;
its executable replacements prove that exclusion and that `sent → queued` is
refused. V2-7's historical revoke/edit/reapprove/queue success is superseded by
the current stricter revoked-terminal and immutable-history rules; the harness
does not liberalize the schema to recreate the old path.

Both runs also proved identical apply deltas, the exact state-preserving rerun
refusal, and two exact baseline rollbacks. All fixtures were synthetic and
both randomly named containers were destroyed.

## Rehearsed input SHA-256 values

```text
da388c62bb7482622521db087ac8439bcea0ab1967e42221c68e1cf9fd608919  20260826_research_client_accounts_blitz.sql
a9aad83261a28beef3a86deed11def0a594f73c33aa8b11258a5db083f9e769b  20260826_research_client_accounts_blitz.attack-map.json
c4f5c4b46123f61ad399b66a2b27bc604aa4338d6b105a808c1188c678ba81b1  20260826_research_client_accounts_blitz.disposable-bootstrap.sql
00b3e6e46a4d994ad30061d6c6d536c75c1d1367c1c551c544cb53036533299a  20260826_research_client_accounts_blitz.capture-objects.sql
f1081726ac886a44b44eea14dd6d3fd0547cf2e2d7a518397fc2af33e15e9b0a  20260826_research_client_accounts_blitz.attacks.sql
c2f5e93b5b865c19cf98b4ed17389f7133a40abbf8ef758b6f9eca68ddeed377  20260826_research_client_accounts_blitz.narrative-attacks.sql
ff296b4786bc338d108b20bd03a89b183bfa5592a8393022a716c3f138490588  20260826_research_client_accounts_blitz.rollback.sql
df1fff3c9cb2998a14ee02e549dfd9cc9f8f24f17a08e717274fcc6757f92cbf  20260826_research_client_accounts_blitz.verify-rollback.sql
fbdc0b1f1eb30c7f7edb2ae8f4c4b8e3a189c7229c10f8551f3ab19730f0d8e3  20260826_research_client_accounts_blitz.rehearse.ps1
```

Independent review and an explicit decision on the stricter A14/V2-7
supersession remain required. Founder approval, migration-ledger registration,
and `MIGRATION_DAG.md` registration remain required before any non-disposable
execution.
