# MC-01 current-Core reconciliation

Status: implementation and local qualification in progress; no independent
acceptance or release claim. The same session resumed on 2026-10-05 after a
host pause; its branch, dirty source and ownership checkpoint were preserved.

## Scope and exact base

- Session: `codex-mc01-reconciliation-20261003`.
- Branch: `codex/xenios-mc01-reconciliation-20261003`.
- Worktree: `C:/Users/sboad/.codex/worktrees/2227/xenios-website`.
- Verified Core coordination base: `3eaa017fcbd28989c65ffc4bb439a554aa1f3f59`.
- Core runtime source: `c0e25c73a0d789829ea213e2ee040c68e06f0a75`.
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

## Evidence obtained so far

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
  preserve their separate invocations and collector hashes.

The collector records launcher/version, arguments, timestamps, exit codes,
source hashes at invocation boundaries, log hashes and dirty state. It does not
continuously attest the filesystem or every child process. Core confirmed its
heavy work completed before this lane's broad affected/typecheck/build window.

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

Historical passing tests are context only. This successor requires its own
focused and integration results, exact source SHA/tree and source candidate
hash. Existing Core protection failures remain separate and will not be
hidden by baseline or assertion changes.
