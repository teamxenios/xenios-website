# Xenios Health catalog action checkpoint

Session: `codex-xenios-health-launch-implementation-20260930` (local Codex).
Task: `CATALOG-ACTION-UNIFICATION`.
Branch/worktree: `codex/xenios-health-launch-implementation-20260930`, `C:/Users/sboad/.codex/worktrees/b22f/xenios-website`.
Base: `8e0271e9c03d7724df9437e8723aac2edc9afcb7`.
Pushed source SHA/tree: `10d23aaed52136e59e50b6987b6bd8ecf3acc3fa` / `3bb55068b2e9e1cee46219efd212475c4230a7a9`.
Prior public-entry runtime slice: `93b018304ce7f63cd02e8abc64da3523115fd2bd`.

## Completed

The source dataset still contains its 420 historical rows. A `Shipping Service` entry under `shipping_and_fulfillment`, currently FedEx Standard Overnight, is now excluded from customer catalog list/count/detail/variant/price-list projections. An `Included Supply`, currently Syringes & Alcohol Swabs, remains visible. No source row was deleted, no product price was changed, and no shipping amount was reclassified as a product price. The real-dataset walk now reaches 419 customer offerings and preserves all 417 bound Product Control prices. This is a narrow correction to independent finding HL-19, not closure of HL-11 or HL-12.

## Verification

Private Node `v20.19.0`, npm `10.8.2` (worktree dependencies installed under that runtime).

- Focused source/data tests: 21 passed across three files.
- Full `server/research/master-offerings` set: 403 passed, 13 skipped across 46 files.
- `npm run check`: pass.
- Protected/release-control tests: 88 passed, one skipped.
- `npm run build`: pass; source gate 1,332 files, build gate 224 files, zero forbidden customer-facing em dashes. Existing bundle warnings non-fatal.

No full suite or live browser/managed database run for this slice. Claude has not reviewed this successor. No staging/production mutation, migration, deploy, real email, payment or supplier action.

## Remaining release blockers and next work

- HL-11: founder-decided catalog is not regenerated. The 426-row workbook/reconciliation evidence includes the three now-excluded rows GRP-0421/0423/0424, GRP-0422 formulation hold, and confirmed GRP-0425/0426 retail cents. The generator requires a private intake artifact that was not supplied in this session; do not fabricate it or publish Product Control prices from historical records.
- HL-18: 17 affected half-cent/float rows need exact-decimal authority and founder-approved cents before a live price release.
- HL-12: mounted assisted-order SQL accepts an arbitrary non-empty verification id without binding amount/currency to an accepted quote. This requires source/SQL correction and independent managed qualification; local pure-service tests are insufficient.
- The overnight `02`, `03`, `17`, `18`, and pricing-ledger files under their stated filenames were not mounted. The linked original UX/vision Google Docs and repository source records were read.
- Exact staging M71 then P-17 prerequisite/authorization remains separate. Production promotion is not authorized.

Next first command: `git show --stat 10d23aaed52136e59e50b6987b6bd8ecf3acc3fa`.
