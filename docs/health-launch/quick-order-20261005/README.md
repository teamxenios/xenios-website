# Quick Order isolated implementation

Work in progress. Source base `756a906877dbc174b7e228a259d2faa9c3af48ca`, tree
`787432948d9464880df1dcfc5dff58eec7d889aa`, received independent **SOURCE ACCEPT**
at reviewer commit `04cbbee0d3d3ab32dfd6ae9002b82837423f6265`; count-typo correction
`fffa33a6b3407b407b2b43d3c5a5c7054887f590` changes no disposition. This is not
release qualification. Do not merge the coordinator branch.

Implementation now resides in `client/src/research/quick-order/` and
`server/research/health/quick-order/`. See [RELOCATION.md](RELOCATION.md) for the
path-only P1 correction, successor source/evidence and revised pending proposal.
Pushed relocated source `f1e467f74b01ae2ab866bb791a3c11d657a5d69c`, tree
`6bc4fd7a7483822d4af87a3c07ab7263c0fbc377`: static checks pass; successor tests
await a serialized reservation. Real intake remains disabled/incomplete.
Historical pre-relocation module source: `4abd2c5cd4bd039309b32b97b117a67fc6a4d292`,
tree `3fb70d98dc354e6a6049744b5bb15b741d5ba50b`. Its containment correction passed
10 focused tests; original `3b0048d`184-test evidence is retained without pooling
counts or claiming a full successor rerun. See [QUALIFICATION.md](QUALIFICATION.md) for provenance,
resource-deferred typecheck and missing full-App/durable proof;
[APPROVAL_MATRIX.md](APPROVAL_MATRIX.md) for the two concrete source decisions.

- Chat: `01a10d78-0981-7150-9292-c5cde2730d4d`
- Branch: `codex/xenios-health-quick-order-20261005`
- Worktree: `C:/Users/sboad/.codex/worktrees/389a/xenios-website`
- Session/task: `codex-health-quick-order-20261005` / `HEALTH-QUICK-ORDER-20261005`
- Assigned model/effort: GPT-6 Astra Ultra (task configuration, not changed by a prompt).
- Coordinator: `01a103a8-5684-7272-89e5-3c42eefcd593`
- Exact lease: original module paths retained for removal plus `client/src/research/quick-order/**` and `server/research/health/quick-order/**`, this evidence directory, own session and exact handoff. Zero shared module files. Other fleet entries remain intact. Integrator release was verified in records `38c723964358c18b8c5090f2f9a0aa92f74601b0`.

## Current port and service map

| Port | Canonical binding | Outstanding requirement |
| --- | --- | --- |
| session | `createAssistedOrderViewerResolvers().customer` | Approved composition and client auth/session reset; purpose-bound session CSRF, no new guest issuance |
| config | `AssistedOrderService.config`, published policy reader, canonical form acknowledgments | Exact published terms must be approved for Health audience; no demo terms or draft promotion |
| listCatalog | `createAssistedOrderMasterCatalogCallbacks().list` | Apply authorized Health visibility before totals; bounded full scan, no historical count assumption |
| resolveItem | same callbacks `.resolve` | Destination authority required; provider/RUO/held cannot become ordinary requests |
| rate limit | `rateLimitHit` with durable failure deny + `requestIp` | Actual deployment/proxy qualification |
| getExisting | Missing in canonical repository | Actor-key durable lookup before new-write currentness checks |
| commit | Existing `research_assisted_order_submit` is insufficient | Structured evidence, actor replay, current legal/catalog/pathway guards, atomic outbox obligation |
| operator | existing admin service/reader/component | Governed declaration extension plus actual authorized readback |

Observed local application listener: PID18936, pinned Node20 executable running
`scripts/preview-research.mjs`, ports5001/62976/62977. Its workdir/served SHA was not
established and it was not started, stopped or used by this lane. No matching
test/build job was seen. First memory sample706MiB, subsequent coordinator sample
1263MiB; disk about27GiB. Full aggregate/build/DB/browser qualification is not
cleared by the lightweight slot reservation.

Read-only hosted observation2026-10-05: Render service `srv-d8s9vej7uimc7384dfcg`,
deploy `dep-daqft3vf3r2c73b7e88g`, source `79414143d4355d5d3d14cd5fe6e5a536dc68d99d`,
live, autoDeploy off. Supabase production active/healthy; managed staging inactive.
No schema census, customer read, hosted mutation, migration, email or deployment.

## Package evidence

Package v0.1.0 from the supplied extracted directory. `evidence/package-files.json`
records every source file hash. `evidence/package-baseline.json` preserves the
original integrator's exact commands/exits/raw tool output under Node20.19.0 and
npm10.8.2: literal npm test FAIL (Windows wildcard), explicit two-file Node run
47PASS/0FAIL/0SKIP, syntax check PASS. Reused with coordinator authorization,
not presented as newly executed here, integration acceptance or DB durability.
Portable explicit test enumeration is required for the successor.

## Holds

No protected mounts, privacy dependencies, schema candidates, manifests or
operator roots have been edited. Real intake remains disabled. The current
`/health/quick-order` path is not yet mounted and is classified public by the
existing marketing boundary; changing a helper indirectly would still require
the protected behavior approval. The package's historical b0e818f and guessed
routes.ts are not authority.

Pending exact Core hash approvals, GATE-01, intended subscription/product plan,
all six subscription buying prerequisites, MC01 compatibility/adoption chain,
D/E real delivery limits and Finance/provider holds remain unchanged.

Source review: BLOCKED / implementation in progress. Managed nonproduction:
NOT RUN. Real intake: NOT READY. Payment/subscription/clinical readiness: unchanged.
