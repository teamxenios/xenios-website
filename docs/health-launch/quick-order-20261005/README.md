# Quick Order isolated implementation

Current review599 source repair: **3e82154724ede74b7c5f361f280739eedd60db25**, tree **04958ec1567b74bccd84e423e179e6269faf6bee**.
The repair is committed locally; automatic approval review rejected its push.
Original reviewer acceptance is pending. Exactly ten SQL/verifier files and
three server composition tests changed; all55 frozen references and53 historical
evidence files are preserved. All behavior remains NOT RUN.

[Current handoff](../../../.xenios/handoffs/quick-order-20261005-handoff.md) ·
[source inventory](evidence/review-599-source-3e82154.json) ·
[held 5C delta](HELD_5C_REVIEW_599_DELTA_20261007.md) ·
[residual matrix](REVIEW_599_RESIDUAL_MATRIX_20261007.md).

The source census is19 (8/7/4); submitted-only closed marker discovery retains
malformed-submitted refusal, missing external hashes now fail, and proposed
header assertions are separated from required pins. Root Helmet supplies
no-referrer; only its cache headers are predicted absent. No red/green observed.
Qualification EXPIRED at2026-10-06T21:43:37Z: G1 consumed, five unused groups
expired, zero available. No current slot or resource observation. Guard/commit
bodies stay held; Quick Order remains unavailable.

## Historical checkpoints below

These sections and their receipts retain the earlier source and qualification
history. Their old current/awaiting/unused wording is not present authority;
review599 and the current repair records above control.

Current SQL candidate source: [SQL_CANDIDATE_DRAFT_STATUS_20261006.md](SQL_CANDIDATE_DRAFT_STATUS_20261006.md),
source 7d027e4dff130214cb71954e2de548be5747cd0c, tree 3819c5f4efed71bd12d5e759593e71c580d96cc3. Ten new draft files plus two permitted test refinements;
SQL, verifiers and tests NOT RUN. Wrapper/replay readers and held publication
metadata are drafted; guard/commit bodies remain unimplemented. Quick Order
remains unavailable. Exact inventory and external source receipts are bound in
[the handoff](../../../.xenios/handoffs/quick-order-20261005-handoff.md).
The [held design amendment](HELD_WRITER_COMMIT_DESIGN_AMENDMENT_20261006.md)
awaits the original reviewer's disposition. Earlier checkpoints below are historical.

Current composition-test source: [COMPOSITION_TEST_SOURCE_20261006.md](COMPOSITION_TEST_SOURCE_20261006.md),
source `5fd2e4c74d31562281493013489bb41949979b88`, tree
`99ca9ae54298a30c860cfea924d08797a1dc4c9e`. Four new test candidates; runtime
unchanged. Tests NOT RUN. The required static/Vite privacy headers are absent
in frozen source; exact patch `8392d243` is proposed and unapplied. This source
finding is not an observed red. All 15 frozen references and 24 pre-existing
module files match. Original HTTP red/green and operational holds remain.

Current shared-source checkpoint: [SHARED_INTEGRATION_SOURCE_20261006.md](SHARED_INTEGRATION_SOURCE_20261006.md),
source `9118a82633e9f10637764c896ce2a6e53ad1e3eb`, tree
`5142b61564921cbe892099c8ef55896935508fa9`. Approved shared patch plus exact UI
readback correction, proposed RPC-name constant and synthetic test source. Tests
NOT RUN; independent review pending. A separate provider-journal fixture amendment
is prepared but unapplied. Do not deploy the reader before its future RPC is
installed and qualified. Customer intake, actual readback and payments stay held.

Current pure S4 checkpoint: [S4_DECODER_CONTRACT_20261006.md](S4_DECODER_CONTRACT_20261006.md),
source `10208fea644f069f58ddeaa8993db4df5eb4469d`, tree
`6e0a8003baa8743d243f06bf18c025f649a95152`. Three new projection/decoder/test
files only; no existing runtime changed. Tests NOT RUN; independent review pending.
The separately approved shared integration is the next slice, not part of this
checkpoint. No RPC, durable storage, notification or operation is proved.

Current source-stage checkpoint: [S2_S3_SOURCE_20261006.md](S2_S3_SOURCE_20261006.md).
Source `ac36e60fe5e91b1217722e7f2a2711fd62a64559` applies the exact disabled mount,
privacy and PWA correction plus six test files. Source review and execution remain
pending. G1 was consumed/refused at17:54:58Z on October6:1205MiB<1536; zero tests.
No current slot, durable request, operator readback, payment or deployment.

Work in progress. Source base `756a906877dbc174b7e228a259d2faa9c3af48ca`, tree
`787432948d9464880df1dcfc5dff58eec7d889aa`, received independent **SOURCE ACCEPT**
at reviewer commit `04cbbee0d3d3ab32dfd6ae9002b82837423f6265`; count-typo correction
`fffa33a6b3407b407b2b43d3c5a5c7054887f590` changes no disposition. This is not
release qualification. Do not merge the coordinator branch.

The current HTTP ownership correction and authored, unrun regressions are in
[HTTP_CORRECTION.md](HTTP_CORRECTION.md). Pushed source
`fd023e8c03baa2326baf707c944bcd25dce7f453`, tree
`46de8f772bb04c20eb09d9b8d3fbfacc44d9dd4e`; exact handoff and static receipts
bind the 24-file module inventory. Targeted red/green execution is deferred.
No current qualification slot exists. Implementation resides in `client/src/research/quick-order/` and
`server/research/health/quick-order/`. See [RELOCATION.md](RELOCATION.md) for the
path-only P1 correction, successor source/evidence and revised pending proposal.
Historical pure-relocation source `f1e467f74b01ae2ab866bb791a3c11d657a5d69c`, tree
`6bc4fd7a7483822d4af87a3c07ab7263c0fbc377`: static checks pass; successor tests
remained NOT RUN by this builder. Reserved Node2 precheck503MiB<512MiB refused launch; the bounded
slot was released without retries. Real intake remains disabled/incomplete.
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
- Exact lease: `client/src/research/quick-order/**` and `server/research/health/quick-order/**`, this evidence directory, own session and exact handoff, now extended by the13 exact S2/S3 paths in `evidence/s2-s3-lease-extension-20261006.json`. Old prefixes were removed after verifying zero tracked or remaining files. Only our existing task/session/lease entries in the three branch-local registries may be updated; no whole-registry lease. Other fleet entries and global timestamps remain intact. Integrator non-active handoff was verified in records `38c723964358c18b8c5090f2f9a0aa92f74601b0`; its literal state is `handoff`, not `released`.

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
test/build job was seen. The earlier 706 MiB claim has no preserved raw receipt
and is withdrawn as qualification evidence; no historical measurement is
reconstructed. Use the exact dated resource receipts in `QUALIFICATION.md` and
`RELOCATION.md`. Those historical samples grant no current qualification slot.

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

The protected mount/privacy/PWA source is now edited under the explicit S2/S3
grant. The exact intake route is mounted disabled and classified sensitive by
the marketing and PWA boundaries. These are source facts, not tested or deployed
capabilities. Schema candidates, operator roots, manifest and verifier remain
unchanged by this slice. The package's historical b0e818f and guessed routes.ts
are not authority.

Pending exact Core hash approvals, GATE-01, intended subscription/product plan,
all six subscription buying prerequisites, MC01 compatibility/adoption chain,
D/E real delivery limits and Finance/provider holds remain unchanged.

Doc37 accepted pure relocation; doc38 accepted fd HTTP source with limits,
leaving its targeted execution pending. The ac36e60 mount/PWA successor awaits
independent review and qualification. Managed nonproduction: NOT RUN. Real
intake: NOT READY. Payment/subscription/clinical readiness: unchanged.
