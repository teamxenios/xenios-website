# Main session execution log

Append-only coordination record for the serialized release manager. This file
records engineering facts and decisions; it is not a substitute for Git,
GitHub, Supabase, or Render evidence.

## 2026-07-27T02:13:11.637Z — production baseline frozen

- Production Git SHA:
  `ae6533f57de6619b9656c866312f953ccb7eca8d`.
- Render deployment: `dep-d9j9687aqgkc739gvru0`, reported `LIVE`.
- Production source is PR #84 integration.
- Zero fabricated products, prices, inventory, lots, COAs, orders, providers,
  revenue, roles, seeds, or Care records were authorized.
- Care remains disabled and off the Research critical path.

## 2026-07-27T02:13:11.637Z — prohibited candidates recorded

- PR #80 exact head `f646708d45d4a6e4e7acf4e2653e44746baef184`
  remains changes-required and is prohibited from merge, migration, and deploy.
- PR #85 exact head `12759c2567246ee83ed71aad9ffa4b517d31e8aa`
  is an isolated draft without exact-SHA QA acceptance and is prohibited from
  shared integration or deploy.

## 2026-07-27T02:13:11.637Z — release-control findings opened

- `HIGH-ROUTE-CAPABILITIES-DUPLICATE`: two owners register
  `GET /api/research/capabilities`; the earlier registration shadows commerce.
- `HIGH-ADMIN-PAGE-PRIVACY`: `/admin/research` is outside the Research page
  gate and is served without the private no-store/noindex document posture.
- These are explicit correction units. They must not be waived by editing
  evidence or weakening authorization.

## 2026-07-27T02:13:11.637Z — control-plane implementation started

- Branch: `chore/main-release-control-plane`.
- Exact base: `ae6533f57de6619b9656c866312f953ccb7eca8d`.
- Writer: Website 2 release-control-plane unit.
- Scope: coordination state, ownership, release and migration graphs, external
  input registry, release-manifest schema, and pure-TypeScript acceptance
  validators.
- No application, domain, migration, production, provider, or data mutation is
  in scope.

## Required append protocol

Each future entry must include:

1. UTC timestamp.
2. Exact base/head/deployed SHA where applicable.
3. Actor/lane and bounded scope.
4. Test and independent-review evidence.
5. Production effect, including explicit `none`.
6. Rollback identity for any production-changing action.

Never rewrite an earlier fact to conceal drift. Append a correction that names
the superseded entry.

## 2026-07-27T02:24:52Z — cross-session state collision reconciled

- While the control-plane focused suite was starting, the authoritative
  `CURRENT_PRODUCTION_STATE.json` was replaced by a concurrent read-only
  production reconciliation with schema version 2.
- The newer snapshot records existing account continuity, the live founding
  activation bridge, exact migration history, safe production counts, and PR
  #85 replacement head `30b0f6b708c936e2ba1631e4a57f1c5b8c2c54c4`.
- The schema version 2 state was preserved exactly. Validators, release graph,
  and ownership metadata were adapted around it rather than overwriting newer
  evidence.
- Concurrent application hotfix files are owned by the Website 2 shared
  integration unit and remain outside this control-plane writer's scope.
- Production effect: none. No merge, migration, deployment, or data mutation
  occurred during reconciliation.

## 2026-07-27T02:31:00Z — PR #85 replacement prohibited

- Website 6 returned CHANGES REQUIRED for exact PR #85 head
  `30b0f6b708c936e2ba1631e4a57f1c5b8c2c54c4`.
- Three HIGH findings remain: exact signed-media bucket/object binding,
  required-input as-of identity, and an atomic full Product Control snapshot
  with exact PostgreSQL timestamp precision.
- The read-only integration preflight remains useful collision evidence, but
  no integration candidate may be created from this head.
- Rejected predecessor `12759c2567246ee83ed71aad9ffa4b517d31e8aa`
  remains prohibited. Website 3 owns the replacement.
- Production effect: none. No merge, migration, deployment, or data mutation
  occurred.

## 2026-07-27T03:05:00Z — PR #86 production gate accepted

- Website 6 post-deploy accepted exact source
  `4f71648aa5684ebec70f14b7e09268331c522969` deployed as current main
  `d494150668de2ede8a61fd0d28bc9ff9a75def26`.
- Render deployment `dep-d9jcfkuk1jcs73fi5r1g` is LIVE. No migration applied.
- Read-only verification passed health, capability GET/HEAD/POST ordering,
  downstream member/admin authentication, no-store/no-cache/no-referrer/noindex
  headers, 1440/720/375/320 browser boundaries, and release-window error logs.
- Production counts remained members 2, applications 2, outbox 42, required
  inputs 0, launch controls 0, Product Control rows 0, and Care disabled.
- Rollback identity: prior main
  `ae6533f57de6619b9656c866312f953ccb7eca8d`; no rollback was required.

## 2026-07-27T03:05:00Z — PR #85 accepted source preflighted

- Website 6 exact-SHA accepted PR #85 source
  `dc11623d27fa59cb51b6cfe653f143633c7ae9ed` on source base
  `ae6533f57de6619b9656c866312f953ccb7eca8d`.
- Prohibited predecessors `12759c2567246ee83ed71aad9ffa4b517d31e8aa`,
  `30b0f6b708c936e2ba1631e4a57f1c5b8c2c54c4`, and
  `0472905dff10c45239b7f95834e1086c3b3c5f59` remain excluded.
- Read-only collision preflight against current production `d4941506` is clean,
  with expected merge tree `f0a8fa4e813a0087c24103b73547e65a77afe31e`
  and no release-control-plane file overlap.
- PR #85 is not included in PR #87; its separate integration candidate remains
  pending. Production effect: none.

## 2026-07-27T02:49:00Z — PR #86 GitHub checks completed

- Exact PR #86 head `4f71648aa5684ebec70f14b7e09268331c522969`
  now has GitHub test, typecheck, and build success.
- The candidate remains unmerged and undeployed pending Website 6 exact-SHA
  acceptance and Website 2 final integration preflight.
- Production effect: none.

## 2026-07-27T02:47:00Z — PR #86 replacement ownership assigned

- PR #86 corrected head is
  `4f71648aa5684ebec70f14b7e09268331c522969` on exact production base
  `ae6533f57de6619b9656c866312f953ccb7eca8d`.
- Independent exact-SHA review accepts the full production-order correction.
  GitHub typecheck/build pass; the test check remains in progress.
- `FILE_OWNERSHIP.json` now assigns the exact 12-path shared-hotfix allowlist
  to Website 2 without overlapping the broader reserved integration rule.
- Prohibited predecessor `225455615eda0c420996929379a5a1f9d535b4e8`
  remains excluded.
- Production effect: none. No merge, migration, deployment, or data mutation
  occurred.

## 2026-07-27T02:43:00Z — PR #85 second replacement prohibited

- Website 6 returned CHANGES REQUIRED for exact PR #85 head
  `0472905dff10c45239b7f95834e1086c3b3c5f59`.
- Two HIGH findings remain: exact completeness and metadata for the active
  per-product display-blocking required-input set, and a shared five-minute
  upper bound for signed-media access.
- The collision preflight is retained as evidence only. No integration
  candidate may be created from this head.
- Production effect: none. No merge, migration, deployment, or data mutation
  occurred.

## 2026-07-27T02:39:00Z — replacement intake and collision boundary

- PR #85 second replacement is frozen at
  `0472905dff10c45239b7f95834e1086c3b3c5f59` on exact production base
  `ae6533f57de6619b9656c866312f953ccb7eca8d`.
- Read-only preflight confirmed the exact 12-file domain boundary, CI
  test/typecheck/build success, a clean merge tree
  `aecf5da0475ad4dd169fb0ff8bb71a431bb1d9bc`, and no collision with the
  release-control-plane files. Website 6 acceptance remains pending.
- PR #86 head `225455615eda0c420996929379a5a1f9d535b4e8`
  is prohibited after a full-order route finding. The separate shared-hotfix
  worktree owns its replacement.
- The release-control-plane worktree removed its overlapping runtime hotfix
  edits. The four restored runtime files hash exactly to their production-base
  Git blobs and are excluded from this candidate.
- Production effect: none. No merge, migration, deployment, or data mutation
  occurred.

## 2026-07-27T02:35:06Z — second cross-session state collision preserved

- During final control-plane verification, the authoritative schema-version-2
  production snapshot changed again after the first reconciliation.
- The newer snapshot hash is
  `f953a1c7ffb29cf6dd57f3e569655e6baab335e570166ed50c6a6e102c0f5175`.
  It preserves production `ae6533f57de6619b9656c866312f953ccb7eca8d`
  and Render `dep-d9j9687aqgkc739gvru0`, while recording exact PR #85 head
  `30b0f6b708c936e2ba1631e4a57f1c5b8c2c54c4` as prohibited after three
  independent HIGH findings.
- The newer authoritative state was preserved exactly. The release graph,
  ownership record, validators, and focused tests were checked against that
  state without rewriting it.
- Concurrent capability-route and integration-preflight files remain outside
  this control-plane writer's ownership.
- Production effect: none. No merge, migration, deployment, or data mutation
  occurred.
