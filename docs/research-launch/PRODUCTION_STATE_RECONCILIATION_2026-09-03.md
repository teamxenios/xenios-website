# Production-state reconciliation — 2026-09-03 (Phase A)

Operator: `claude-phase-a-production-truth-20260903` (Claude Fable 5.1), on branch
`claude/phase-a-production-truth-20260903` cut from the exact live commit.
Scope: records and control-plane only. **Nothing was deployed, no migration was
applied, no Render setting or environment variable was changed, and no
application behaviour changed.** Authorization: Samuel's "PHASE A AUTHORIZED —
PRODUCTION-TRUTH RECONCILIATION" (2026-09-03).

## 1. Verified live identity (read-only, `2026-09-03T21:05:46Z`)

| Fact | Observation |
| --- | --- |
| Render workspace / service | `tea-d8nhh6a8qa3s73f4ocj0` / `srv-d8s9vej7uimc7384dfcg` (`xenios-website`) |
| Live deployment | `dep-daatp715efls738v00dg`, status `live`, trigger `api` (commit-pinned), created `2026-08-31T19:57:16Z`, live `2026-08-31T19:58:17Z` |
| Live commit | `50c2d35cf543724fad17a61d9d5c36cf81fe5f21` — "Open Xenios Care with manual access requests" |
| Branch carrying the live commit | `codex/xenios-care-research-postlaunch-20260831` (head `50c2d35c…`) |
| Render service branch | `release/early-access-code-session-checkout`, `autoDeploy: no`, `autoDeployTrigger: off` |
| Release branch head before reconciliation | `3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212` (three deploys behind live) |
| Public health | `https://xeniostechnology.com/api/health` 200; `commerceEnabled false`, `supabaseConfigured true`, `adminConfigured true`, `turnstileConfigured false` |
| Render origin health | `https://xenios-website.onrender.com/api/health` 200 |
| Assisted-order config door | `/api/research/early-access/assisted-orders/config` 200 |
| Lineage | `3daa3f4a…` and the final recut RC `1fd84ad2…` are ancestors of `50c2d35c…`; `ace92fd6…` is not |
| Migrations | none changed since `1fd84ad2…`; `supabase/` and `MIGRATION_DAG.json` node content unchanged |

## 2. Drift found

| Record | Claimed | Actual |
| --- | --- | --- |
| `docs/coordination/CURRENT_PRODUCTION_STATE.json` production block | `3daa3f4a…` / `dep-da94g05g1s2s7396lkv0` | `50c2d35c…` / `dep-daatp715efls738v00dg` |
| `docs/coordination/ACTIVE_RELEASE_GRAPH.json` `productionSha` + baseline node | `production-3daa3f4a` AUDITED_BASELINE | live is `50c2d35c…` |
| `docs/coordination/FILE_OWNERSHIP.json` `productionBaseSha` | `3daa3f4a…` | `50c2d35c…` |
| `docs/coordination/MIGRATION_DAG.json` `productionSha` | `3daa3f4a…` | `50c2d35c…` |
| `server/release-control-plane.test.ts` constants | `PRODUCTION_SHA` = `3daa3f4a…`, frozen clock `2026-08-28T04:05Z` | live `50c2d35c…`; clock must admit the new evidence |
| `.xenios/PROJECT_STATE.json`, `.xenios/RELEASE_STATE.json` | current release `3daa3f4a…` | `50c2d35c…` |
| `release/early-access-code-session-checkout` (Render's configured branch) | `3daa3f4a…` | a branch-head deploy would have rebuilt the superseded Aug 25 baseline and erased the recut, the full site, Care access and `/health` |

## 3. Deploy chain that the records now carry

| Commit | Deployment | Live at | Disposition |
| --- | --- | --- | --- |
| `3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212` | `dep-da94g05g1s2s7396lkv0` | 2026-08-29T02:47:15Z | rollback after `eb659d81`; superseded baseline |
| `1fd84ad2b3320dada4da7f58012d4311e5cd1639` | `dep-daabqagn74is73aejn80` | 2026-08-30T23:31:55Z | final recut RC on Samuel's exact-SHA GO; endpoint diff PASS 16/11/0/0; config 200; superseded |
| `abe03ca3a836dffb10699c0c39883119e2a8f816` | `dep-daaqncid0e5s739067tg` | 2026-08-31T16:29:36Z | Care/Research post-launch; superseded |
| `72b6f1380e13f09dec67684035ed44a1d2740408` | `dep-daarr3ajnfac73a93co0` | 2026-08-31T17:45:49Z | health entrypoint; superseded |
| `50c2d35cf543724fad17a61d9d5c36cf81fe5f21` | `dep-daatp715efls738v00dg` | 2026-08-31T19:58:17Z | **live baseline; rollback target and scan base for the next release** |

## 4. Coupled changes made (one records commit)

- `docs/coordination/history/CURRENT_PRODUCTION_STATE_2026-08-30.json` and
  `ACTIVE_RELEASE_GRAPH_2026-08-30.json`: byte copies of the pre-flip records,
  referenced from `historicalSnapshots` by Git blob SHA.
- `CURRENT_PRODUCTION_STATE.json`: production block → live identity (with
  `liveSince`, `deployedFromBranch`, `deployTrigger`); `runtimeConfig` re-read;
  evidence replaced by five 2026-09-03 records observing `50c2d35c…` (service
  identity, deploy chain, Git branch identity, public health, origin health);
  candidates `runtime-freeze-2d662a0d` / `evidence-freeze-c0156916` moved to
  deployed-and-superseded states and `deployed-final-rc-1fd84ad2` added;
  `knownRisks` closes the final-RC gate and records the drift closure plus two
  open non-blocking follow-ups (see §6).
- `ACTIVE_RELEASE_GRAPH.json` (+ `.mmd`): `productionSha` → `50c2d35c…`;
  `production-50c2d35c` is the single `AUDITED_BASELINE`; `production-3daa3f4a`
  becomes `historical_production_baseline` / `SUPERSEDED_PRODUCTION_BASELINE_20260830`;
  `deployed-final-rc-1fd84ad2` added; `final-rc-packet` resolved; lineage edges
  added; `releaseOrder` rewritten for the live baseline, the deploy chain and the
  release-branch fast-forward.
- `FILE_OWNERSHIP.json`: `productionBaseSha` → `50c2d35c…`, `productionBaselineReconciledAt` → `2026-09-03T21:05:46Z`.
- `MIGRATION_DAG.json`: `productionSha` → `50c2d35c…`, `productionBaselineReconciledAt` → `2026-09-03T21:05:46Z` (node content unchanged; no migration shipped).
- `server/release-control-plane.test.ts`: `NOW` → `2026-09-03T21:10:00Z`,
  `PRODUCTION_SHA` → `50c2d35c…`, baseline node id → `production-50c2d35c`,
  reconciled-at pins → `2026-09-03T21:05:46Z`, manifest stale/future fixture dates
  moved relative to the new clock. No validator logic changed.
- `.xenios/RELEASE_STATE.json`, `.xenios/PROJECT_STATE.json`,
  `.xenios/SESSION_REGISTRY.json`: current release, rollback, scan base,
  deploy history and this session recorded; `canonicalBranch` returns to
  `release/early-access-code-session-checkout`.
- `docs/coordination/CURRENT_PRODUCTION_STATE.md`: identity table and this
  reconciliation; earlier sections retained as history.

## 5. Verification

Pre-commit, in the Phase A worktree (host Node, records as committed):

| Gate | Result |
| --- | --- |
| `npm run check:release-control-plane` | exit 0 |
| `vitest run server/release-control-plane.test.ts` | 51 passed, 1 intentional skip, 0 failed |
| `verify-production-state` (expected production `50c2d35c…`, branch `release/early-access-code-session-checkout`) | `Trusted release baseline accepted: 50c2d35cf543724fad17a61d9d5c36cf81fe5f21 / dep-daatp715efls738v00dg.` exit 0 |
| `verify-migration-dag` | 35 nodes, canonical checksums verified, exit 0 |
| `verify-route-uniqueness --sha 50c2d35c…` | 411 static Express API registrations across 402 call sites, exit 0 |
| `vitest run server/core-site-protection.test.ts` | 35/35 |
| `BASELINE_IDENTITY_CONTRADICTION` | absent |

The same control-plane program is then executed in the pinned LF environment
(`node:20.19.0-bookworm`, LF clone, network-isolated) on the reconciliation
commit; its logs are mirrored under `CONTROL/EVIDENCE/phase-a-20260903/` and
the result is stated in the Phase A return. The release branch is fast-forwarded
only after that run passes.

## 6. Open, non-blocking follow-ups

1. `scripts/release/critical-endpoint-expectations.json`,
   `scripts/evidence/evidence-manifest.template.json` and
   `scripts/evidence/routes.public.json` still express reviewed deltas relative
   to `3daa3f4a…`; re-derive them against `50c2d35c…` before the next release's
   endpoint diff and evidence run (most former INTENTIONAL_CHANGE rows are now SAME).
2. The Step 1 UX hotfix `b8359eba179fb7a901df58be6b949b3956a43c39` is not in the
   live lineage; port it file-by-file against `50c2d35c…` and re-gate; never
   deploy it as-is.
3. `docs/research-launch/*RC_2026-08-2*`, the release manifests and the
   2026-08-28/29 review packets remain evidence-freeze-bound historical records;
   they intentionally still name `3daa3f4a…` as their base.

## 7. Boundaries honoured

Deployments: 0. Migrations: 0. Render settings changed: 0. Environment
variables changed: 0. Application, test-logic, evidence-tooling or attribution
behaviour changed: 0. The only ref change beyond the working branch is the
fast-forward of `release/early-access-code-session-checkout` to the
reconciliation records successor of the live commit, which contains
`50c2d35c…` and therefore all Aug 31 Health/Care work; auto-deploy remains off.
