# Claude independent review: Codex slice `10d23aa` (shipping charge out of customer catalog, HL-19)

## Identity

- **Subject:** `10d23aaed52136e59e50b6987b6bd8ecf3acc3fa`, tree `3bb55068b2e9e1cee46219efd212475c4230a7a9`, on
  `codex/xenios-health-launch-implementation-20260930`. The parent is `8c163a2`.
- **Records-only tip:** `890edd90cffcf61c72afa539d4173dba6e924fa6`.
- **Runtime paths changed:**
  - `server/research/master-offerings/service.ts`
  - `server/research/master-offerings/service.test.ts`
  - `server/research/master-offerings/early-access-catalog-coverage.test.ts`
- `package.json` and `package-lock.json` are unchanged.
- **Reviewed:** 2026-09-30 12:08-12:15 CT. Checks worktree `C:/xenios-wt/closeout-review` detached at `10d23aa`,
  private Node v20.19.0.

## What changed

`MasterOfferingCatalogService` gains `isCustomerCatalogOffering()`, which excludes
`family === "shipping_and_fulfillment" && subcategory === "Shipping Service"`. It is applied to:
- `select` (the listing);
- `count`;
- `priceList`;
- slug lookup (`detail` and `variant`).

The source dataset row is preserved.

## Checks run by Claude

| Check | Result |
| --- | --- |
| Reach | The assisted-order storefront reads through `service.select` for both the listing and submit-time re-resolution (`server/research/assisted-order/production-catalog.ts:327,339,435`). FedEx therefore cannot be listed, priced, exported or submitted there. The other `readCatalog()` callers read live Product Control products, where FedEx has no product (it is unbound). |
| Focused tests: `server/research/master-offerings/**`, `server/research/assisted-order/**`, `client/src/clarity/pages.test.tsx` | 61 files passed and 1 skipped. 728 tests passed and 13 skipped. |
| `early-access-catalog-coverage.test.ts` (walks the **real committed 420-row dataset** through the Early Access viewer and submit-time resolution) | 13 of 13 ran and passed. It shows 419 customer rows, 417 priced, 2 on request (BAM15, Syringes), FedEx absent, Syringes retained, and no zero or negative price. |
| Mutation check: the old `service.ts` against the new tests | 6 of 16 **fail**, as they should. Restored clean afterwards. |
| `tsc` | exit 0 |

## Disposition

**PASS** for the slice. HL-19 is closed in source, provided the founder confirms the reviewer's reading that
GRP-0364 "FedEx Standard Overnight" is a shipping charge. That question is still open. If the founder says it is a
product, this slice must be reverted.

## Notes

- **P3, key by id.** The exclusion is keyed on `family` plus `subcategory` text. These are catalog classification
  fields, not display copy, so this does not breach the 2026-08-21 rule. But nothing ties it to the exact row.
  - A regenerated dataset that relabels the subcategory would silently re-expose the row.
  - A new row given that subcategory would silently disappear.
  - Preferred: an explicit, id-keyed ledger disposition (GRP-0364, or its offering id) in the reconciliation
    authority, with a test that the count of excluded rows is exactly 1.
- **Order charge.** The comment says shipping is "an order charge". No shipping charge is added to the
  assisted-order estimate, and none was added before. When the paid-order path (HL-12) records a quote, shipping
  must be an explicit quote line or an explicit "shipping confirmed separately" statement, never an implicit amount.
