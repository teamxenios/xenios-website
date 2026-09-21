# Catalog completion dry run

This directory is a deterministic, sanitized reconciliation of the checked-in
canonical catalog plus the 2026-09-15 commercial intake. It is not a production
write plan and it is not complete live-production coverage.

## Result

The reconciled source-scope union contains 491 units:

- `direct_buy`: **0**
- `assisted_order`: **102**
- `care_required`: **242**
- `unavailable`: **147**

The union is 420 checked-in canonical variants plus 71 September intake rows
that have no exact canonical match. The other 105 September rows overlay exact
canonical variants and are not double-counted.

The production-completion sprint declares 439 live variants, but this lane was
not supplied the exact 439-row live snapshot. The checked-in canonical artifact
contains 420 variants. The unidentified 19-variant live/canonical delta is an
external blocker and is deliberately absent from all action rows. Therefore the
four batches are exact only for
`canonical_catalog_plus_2026_09_15_commercial_intake`; they must not be described
or applied as complete production coverage.

## Evidence boundaries

- All 39 `PRICING REVIEW` rows match the September catalog by exact SKU,
  normalized product/configuration, and precedence-selected retail.
- All 68 product rows from `MISSING PRODUCTS` match the 68 `EXP-*` rows by exact
  normalized product/configuration and precedence-selected retail.
- Every Seth review status is `Review`; all emitted retail values are labeled
  pending candidates, never approved active prices.
- Price precedence is encoded as Seth recommendation, Seth current selling
  price, current master retail, then a provisional 2.5x fallback only when a
  wholesale value is explicitly verified and supported. The current result is
  106 Seth recommendations, 68 current-master prices, two pending prices, and
  zero provisional fallbacks.
- `Current Wholesale / Unit` is treated only as a wholesale-cost proxy. It is
  not landed cost. Actual landed cost is unverified for every row and remains a
  direct-buy blocker.
- The vendor RFQ has 101 request rows and **zero** rows with any populated vendor
  response field. Supplier, capacity, inventory, COA/lot documentation, shipping
  origin, and fulfillment are therefore not verified.
- The financial model has 18 open blocking launch gates. It is corroborating
  planning evidence, not current Product Control authority.
- The 35% launch margin floor is not invented: the exact source is
  `XENIOS_MASTER_PEPTIDE_CATALOG_WHOLESALE_RETAIL_DEMAND_2026-09-15(1).xlsx`,
  `Executive Summary!A11:C11` (`Low margin below 35%` / `Requires commercial
  review before activation`).
- Identity matching is exact normalization only. No fuzzy, semantic, supplier,
  price, or demand-based match is accepted. Normalized product names must be
  equal, and the only duplicate-label resolution uses an exact
  form/subcategory equality check.
- Supplier identities, wholesale values, raw notes, and client demand counts are
  excluded from every checked-in artifact.

The conflict report contains 310 events affecting 158 source-scope units:

| Conflict | Count |
|---|---:|
| `below_launch_margin_floor_on_wholesale_proxy` | 26 |
| `canonical_approval_required` | 2 |
| `canonical_identity_missing` | 71 |
| `identity_or_lane_verification_required` | 52 |
| `lane_requires_verification` | 49 |
| `negative_margin_on_wholesale_proxy` | 23 |
| `non_product_service_row` | 2 |
| `not_in_current_september_intake` | 73 |
| `product_control_binding_missing` | 1 |
| `retail_amount_not_cent_exact` | 5 |
| `retail_price_missing` | 2 |
| `wholesale_quote_required` | 4 |

Five source retail amounts are not exact cents. Their exact decimal strings are
preserved in `candidateRetailAmount`; `candidateRetailCents` remains `null`
until a rounding decision is explicitly approved.

## Artifacts

- `catalog-reconciliation.json` — all 491 source-scope units and per-unit
  prerequisite evidence.
- `direct-buy-batch.json` — empty by design; the source set cannot satisfy the
  direct-purchase gate.
- `assisted-order-batch.json` — exact canonical/bound RUO request-access rows.
  Missing or sub-floor price/proxy economics stay in this
  operator-assisted lane with Price on request and explicit conflicts.
- `care-required-batch.json` — only explicit canonical 503A clinical rows.
- `unavailable-batch.json` — unmatched, absent-current-intake, approval-gated,
  unbound, or non-product rows.
- `conflicts.json` — sanitized blocking/review events and the external 19-variant
  live snapshot blocker.

## Reproduce and verify

Run the generator with the four reviewed workbooks. The policy refuses any
filename or SHA-256 drift and writes only this directory:

```powershell
$python = 'C:\Users\sboad\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
& $python scripts/research/production-completion/reconcile_catalog.py `
  --september-catalog '<download-path>\XENIOS_MASTER_PEPTIDE_CATALOG_WHOLESALE_RETAIL_DEMAND_2026-09-15(1).xlsx' `
  --seth-pricing '<download-path>\XENIOS_SETH_PRICING_REVIEW_FORM_2026-09-04.xlsx' `
  --financial-model '<download-path>\XENIOS_RESEARCH_MASTER_FINANCIAL_PRODUCT_AFFILIATE_MODEL.xlsx' `
  --vendor-rfq '<download-path>\XENIOS_VENDOR_PEPTIDE_SOURCING_RFQ_AND_DEMAND_MASTER_2026-09-15(1).xlsx'
```

Append `--check` to regenerate in memory and verify all six JSON outputs
byte-for-byte without writing.

Focused tests:

```powershell
& $python scripts/research/production-completion/test_catalog_reconciler.py -v
```
