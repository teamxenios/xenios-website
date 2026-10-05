# MC-01 current-Core reconciliation

Status: implementation in progress; no independent acceptance or release claim.

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
- Root: cart browser adapter, integration tests and this evidence directory.

Follow-on signed-media, persistent-cart and adversarial reviews use separate
subagent assignments after earlier workers finish. No worker owns A/B/C shell
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
previously named `research-product-media`. Source will align on the upload
bucket without broadening trust to arbitrary URLs or publishing assets.

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
