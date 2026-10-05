# MC-01 current-Core reconciliation

Status: implementation and scoped local qualification complete; awaiting
independent Claude acceptance. No acceptance or release claim. The same
session resumed on 2026-10-05 after a host pause; its branch, dirty source and
ownership checkpoint were preserved. All workers have stopped writing.

## Scope and exact base

- Session: `codex-mc01-reconciliation-20261003`.
- Branch: `codex/xenios-mc01-reconciliation-20261003`.
- Worktree: `C:/Users/sboad/.codex/worktrees/2227/xenios-website`.
- Verified Core coordination base: `3eaa017fcbd28989c65ffc4bb439a554aa1f3f59`.
- Core runtime source: `c0e25c73a0d789829ea213e2ee040c68e06f0a75`.
- Pushed successor source: `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6`.
- Successor source tree: `f5953b8e148196c4ea71839cdd40a4e06b5f9fd1`.
- Ownership checkpoint: `63a80f2b56dc4082616ce8059bb6c2803eabba62`.
- Historical MC-01 source: `f453d7e25ac3bdee4e42365d2b0b6a513b9e6da5`.
- Historical handoff: `b38db0ae2ee0c679ec2eeb31b324f6204669dfb7`.
- Execution instructions: local `Xenios_Execution_Sprint_2026-10-03_v2`, session 02.

This is a specialist source reconciliation, not a merge of the historical
branch or a release integration. The old worktree was clean and preserved.
Only its stale active lease/task state was reconciled from its pushed handoff;
historical continuity files were not imported wholesale. Other lanes' state,
protected files, registered migrations, migration DAG and ledger remain owned
by their existing writers.

## Delegated ownership

Root holds the exact `MC01-RECONCILIATION-20261003` path lease and serializes
registry edits and commits. Subagents share this checkout with disjoint files.

- Contracts/cart worker: shared product-admin and cart-selection contracts,
  server cart selection, Product Control release gating and existing admin
  required-input notice, each with its focused tests.
- Projection/browser worker: catalog projection, catalog browser adapter and
  Product Control catalog reader consistency token, each with tests.
- SQL worker: new dated source candidate/rollback note and disposable verifier.
- Root: cart browser adapter, activation integration regression, source contract
  reconciliation and this evidence directory.

Follow-on signed-media, persistent-cart and read-only adversarial reviews used
separate disjoint assignments after earlier workers finished. No worker owns A/B/C shell
or assisted-order presentation paths. Root integrates; Claude is the later
independent acceptance authority and has not been contacted by this lane.

## Current hosted observations

Read-only Render connector checks on 2026-10-03 confirmed live commit
`79414143d4355d5d3d14cd5fe6e5a536dc68d99d`, deployment
`dep-daqft3vf3r2c73b7e88g`, with automatic deployment off. This is distinct
from the undeployed Core source above. The Render monitoring skill informed
these identity checks, not a new general production health qualification.

A read-only Supabase migration-history query found the newest managed version
`20260921172323` (`research_assisted_order_member_history_20260921`). A separate
history query found zero names matching `media_commerce_decoupling`. This is a
bounded history observation, not full managed function-body qualification.
Both observations were refreshed unchanged on 2026-10-05; selected nonsecret
fields and the exact history query are in `evidence/hosted-read-only-final.json`.
No hosted state was written. No deploy, managed SQL application/registration,
payment, email or image publication occurred.

## Design constraints

Media is presentation metadata. Missing, rejected, ambiguous, malformed,
expired or unsigned images must produce null/fallback without creating or
removing catalog, pricing, pathway, cart, quote, fulfillment or activation
authority. Canonical product/variant identity, audience, price, inventory,
readiness, holds, required documents and activation remain authoritative.

The reserved primary-image input key is ignored before commerce binding
validation, including malformed metadata on that image row. Unknown non-image
keys and missing/duplicate/wrongly bound real commerce inputs still refuse.

The upload default and storage migration name the private bucket
`research-product-media-production`; catalog signing and narrow URL checks
previously named `research-product-media`. Source now aligns on the upload
bucket without broadening trust to arbitrary URLs or publishing assets.

## Historical change reconciliation

| Disposition | Current-Core implementation |
| --- | --- |
| Retained design | Three exact commerce bindings (SKU, family, storage); primary image is optional presentation. Cart selection ignores source media and emits no media. Admin notices explain the optional image. |
| Retained authority | Canonical product/variant, current price, audience, inventory/COA, required non-image inputs, domain release controls and process-sealed activation checks remain. Product Control does not manufacture commerce approval. |
| Rewritten binding filter | Ignore the reserved `product_content.primary_image` key even with malformed legacy domain/record metadata or duplicates. Unknown non-image keys cannot acquire that exemption or replace a real binding. |
| Rewritten projection/browser | Image failure produces null without dropping the card/detail or changing availability. Raw malformed media containers and fields are bounded. Private keys in a media subtree discard only media; private keys elsewhere still invalidate the projection. |
| Added reader isolation | Raw media is excluded from snapshot identity. Media-only database reads degrade separately, and optional image inputs do not affect `missingInputCount` in list/bulk/single reads. Other summary fields, timestamp precision, content, variants and prices remain checked. |
| Rewritten signing | Per-image synchronous/rejected storage failures and malformed signing results are isolated. The signer and both narrow URL validators agree on the production media bucket. |
| Rewritten persistence | Legacy media is stripped before put/claim RPCs; the SQL candidate strips it before command/snapshot hashes. Three unique versioned commerce references and both exact domains remain mandatory. The stale 50-unit test uses the existing canonical 100-unit maximum. |
| Rewritten SQL proof | Same six current predecessor bodies, but complete pinned DAG ancestry, malformed image metadata, affected-domain governance invalidation and sixteen real image/input RPC lifecycle transitions are now exercised. |
| Rejected imports | No old `.xenios` files or historical proof claims imported wholesale. No old branch merge/cherry-pick, registered migration/ledger/DAG change, protected baseline change, imagery artifact or A/B/C presentation edit. |

The only retained legacy media failure code/type members are compatibility
vocabulary. No runtime caller reads `selection.media`, and the old combined
display-binding export has no runtime consumers. Adding/removing/rejecting an
image cannot grant missing activation or satisfy missing storage/price/audience/
inventory authorities. Quote and fulfillment authorities are preserved; no
financial, supplier, legal or shipping rule is replaced by image readiness.

Internal adversarial review discovered the media-query and blocker-count
couplings above. Their fixes include bulk and fallback reader regressions and
strict non-media read/mutation refusal controls. The reviews are internal
engineering evidence, not independent Claude acceptance.

## Qualification evidence

The pushed source is `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6`. The affected
run occurred immediately before that commit with an unchanged dirty source;
all its captured final source hashes match the committed working files. UI,
TypeScript, build, punctuation, DAG and protection checks used that pushed source. Later
changes are records plus the collector's TypeScript-loader correction, not
runtime, test or SQL changes. Receipts preserve actual HEAD and dirty state.

| Check | Result | Receipt/log label |
| --- | --- | --- |
| Affected integration tests | PASS: 4,177 tests; 17 skipped; 209 passing files and two skipped | `affected-run1` |
| Additional Product Control UI | PASS: 59 tests in one file | `product-control-ui-final` |
| TypeScript | PASS: `tsc --noEmit`, 210.505 seconds | `typescript-run1` |
| Production build | PASS: 57.429 seconds; existing mixed-import/chunk-size warnings retained | `build-run1` |
| No customer-facing em dash | PASS: 1,353 source files and 226 built files | `build-run1`, `no-em-dash-correct-launch` |
| Migration DAG | PASS: 53 nodes and canonical checksums | `migration-dag-final` |
| SQL verifier syntax | PASS | `sql-syntax-final` |
| SQL exact source/DAG proof | PASS | `sql-source-final` |
| Disposable PostgreSQL proof | PASS: PostgreSQL 17.11, synthetic state only | `sql-local-run1` |
| Protection against agreed Core base | FAIL: inherited `server/static.ts` hash mismatch; no MC-01 out-of-zone paths | `protection-current-core-final` |
| Default protection against `origin/main` | FAIL: inherited out-of-zone branch history and same static-file hash mismatch | `protection-default-final` |
| Diff whitespace | Source and edited records PASS; full staged records flag verbatim raw-log whitespace | `evidence/diff-check-final.json` |

The separate `no-em-dash-final` attempt failed before scanning because its
launcher omitted the TypeScript loader. Its failure receipt is retained; the
collector was corrected to use `--import tsx`, and the separately named retry
passed. The production build had already passed both punctuation scans.

The protection baseline and assertions were not changed. Git blobs for
`server/static.ts`, `client/src/App.tsx`, `server/index.ts`,
`server/research/index.ts` and the protection manifest match the agreed Core
base exactly. The default comparison used local `origin/main`
`6077a6bbb276acf9669c1419c735a9327f8740b1`, confirmed equal to remote main.
Core remains responsible for the inherited protection finding. Registered
migrations, DAG and ledger were not edited by this lane.

- Broad affected run: 4,177 passed, 17 skipped, 209 passing files and two skipped
  files (211 total), exit 0, 276.927 seconds wrapper / 270.82 seconds Vitest.
  All captured source hashes were unchanged at the invocation boundaries.
  The explicit 211-file argument list and raw output are retained in
  `evidence/affected-run1.json` and `.log`. This covers catalog, cart, persistent
  cart, Product Control, activation, canonical Early Access catalog/eligibility,
  shared/browser adapters and related customer cart tests. It is not a whole
  repository full-suite result.
- Initial focused run: 89 passed across eight files, exit 0. This was a dirty
  development checkout before the later service/persistence/reader tests.
  Its raw log is retained as `evidence/initial-focused.log`.
- Disposable SQL run: exit 0, Node 20.19.0, PostgreSQL 17.11, 258.522 seconds.
  Ten exact prerequisite files, six function bodies and the complete relevant
  DAG closure passed. The log includes the old media-gate reproduction,
  precheck refusals, approval invalidation/reapproval, eight image-input and
  eight media RPC transitions, non-image negative controls, put/claim replay
  and hash/snapshot invariance, forced RLS and private RPC/DML boundaries.
  Grouped assertions are not represented as an invented framework test count.
- Exact candidate LF SHA-256:
  `365728cbc40a60ce3d5ffacbbbd09fd8d716c0413ddb1171565ed50563c9ffa4`.
- SQL raw log SHA-256:
  `ed672198661d5f8c55efdb64856cc54d3422ce651f1e92e4d98031713dbc97c5`.
- `evidence/sql-local-run1.json` accurately records that other runtime/test
  files changed while this first SQL proof ran. The SQL candidate and verifier
  hashes individually stayed unchanged. It is not a clean-checkout or idle-host
  claim. The proof has no timing-sensitive finance races. Its no-network,
  no-port container and tmpfs database were removed by the verifier.
- Separate verifier syntax and exact source/DAG checks passed. Raw receipts
  preserve their separate invocations and collector hashes. These checks
  preceded the last runtime/test edits; their unchanged SQL candidate and
  verifier still match the pushed source. `evidence/final-boundary-verification.json`
  verifies all receipt/log hashes and compares each proof to its proper scope.

The collector records launcher/version, arguments, timestamps, exit codes,
source hashes at invocation boundaries, log hashes and dirty state. It does not
continuously attest the filesystem or every child process. Core confirmed its
heavy work completed before this lane's broad affected/typecheck/build window.
Every raw log, including empty successful syntax/typecheck output and failed
attempts, is explicitly retained despite the repository's log ignore rule.
The evidence directory pins log bytes with `-text` to preserve their hashes
across Windows/Linux checkouts. Initial and final collector hashes differ
because the incremental capture and launcher were corrected during this task.
The complete staged diff check flags original CRLF output, a Vite reporter's
trailing space and blank log endings. Those raw bytes are retained, not trimmed.
The source-commit diff and final edited-record diff excluding only `evidence/*.log`
pass whitespace checks. No source assertion or protection baseline was relaxed.

## Bucket and later managed migration requirements

The default bucket mismatch is fixed in source. The Product Control upload
constructor still supports `RESEARCH_PRODUCT_MEDIA_BUCKET`; a custom override
outside the pinned default bucket/origin safely falls back and is not newly
supported for customer display. Hosted bucket objects were not qualified or
published by this task.

Later managed work belongs to the designated integrator and requires a new
exact-action authorization. It must inspect actual target functions, ACLs,
history and the current migration DAG, then qualify the pending persistent-cart
predecessor and its six-node dependency closure plus four base SQL sources.
The source-only candidate is
`supabase/candidates/20261003_research_media_commerce_decoupling.sql`; the exact
ten predecessor paths are pinned in
`supabase/verification/research_media_commerce_decoupling_local.mjs`.

The candidate requires zero rows across all four persistent-cart history
tables. Existing history needs a separate preservation/adoption design; this
candidate does not rewrite or delete it. Affected image-bearing readiness
domains must be paused, and old approvals are invalidated with an audit.
Canonical non-image manifest approval and a separate launch transition remain
required. No domain is auto-enabled. A second unregistered apply deliberately
refuses exact predecessor drift, so this is not an apply-twice success.

Only after independent exact-SHA review, managed preflight and registration of
a separately approved additive successor may that executor consider apply,
postchecks and compatible runtime promotion. The rollback policy preserves
history and requires a reviewed roll-forward after commit. Current source
retains inherited member billing and activation-boundary policies; this media
slice neither requalifies those policies nor closes unrelated launch blockers.

## SQL and release limits

SQL stays under `supabase/candidates/` and is absent from the registered DAG
and ledger. The disposable proof must reproduce the relevant prerequisite
chain and exact predecessor fingerprints. No managed application is implied.
The predecessor still counts media as readiness; runtime-only deployment
would not establish complete decoupling against that old SQL contract.

Historical passing tests are context only. The successor's own results, exact
source SHA/tree and candidate hash are recorded above. Existing Core protection
failures remain open and visible. This lane is ready for independent exact-SHA
Claude review; it is not ready for autonomous deployment or managed SQL apply.
