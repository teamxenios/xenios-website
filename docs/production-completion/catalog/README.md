# Catalog completion dry run

This directory is a deterministic, sanitized reconciliation of the checked-in
canonical catalog plus the 2026-09-15 commercial intake. It is not a production
write plan. A read-only production observation now provides exact point-in-time
identity coverage for all 439 Product Control variants; it does not authorize
any production merge, archive, deactivation, binding, price, or availability
change.

## Result

The reconciled source-scope union contains 513 rows:

- `direct_buy`: **0**
- `assisted_order`: **124**
- `care_required`: **242**
- `unavailable`: **147**

The union is 420 checked-in canonical variants, 71 September intake rows that
have no exact canonical match, and 22 additional live physical `R360-*` SKU
identities. The other 105 September rows overlay exact canonical variants and
are not double-counted.

The read-only production observation at
`2026-09-22T12:24:27.955302Z` found 439 active approved variants: all 417
checked-in `GEN-GRP-*` binding tuples matched production by variant UUID,
product UUID, and SKU, with zero mismatches; the other 22 physical variants are
legacy `R360-*` rows. Each legacy row has one exact audited canonical
counterpart and inherits that counterpart's `assisted_order` disposition. Each
also emits a blocking identity conflict. This mapping is reconciliation
evidence only, not merge or deactivation authority.

The earlier `439 - 420 = 19` observation was only a net count delta. Its exact
composition is 22 live legacy physical identities minus three repo-only
unbound canonical rows. There are now zero unidentified live variants.

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
- The sanitized live projection also excludes price amounts, author identities,
  fulfillment/supplier identity, inventory/lot data, and customer data. It
  retains only exact catalog identity/state fields and active-price counts.
- Safe live projection SHA-256:
  `083ca4a92df3ddf9caca7bc8b293311ef1f3a134632b1ebaef388090bab378ee`.
  Its 417-row canonical and 22-row legacy partitions are
  `90d94350c9b83cd20e69dce835af1f36af078a98b91951f42bdf52c876fe904e`
  and `4dbe817c5ab6342a93c3b41e3554ab8972dbe30e2244519271e2e8992b89cc23`.

The conflict report contains 332 events affecting 180 source-scope rows:

| Conflict | Count |
|---|---:|
| `below_launch_margin_floor_on_wholesale_proxy` | 26 |
| `canonical_approval_required` | 2 |
| `canonical_identity_missing` | 71 |
| `identity_or_lane_verification_required` | 52 |
| `lane_requires_verification` | 49 |
| `live_legacy_identity_alias_requires_adjudication` | 22 |
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

- `config/research/production-completion/catalog-live-identity-closure-20260922.json`
  — sanitized point-in-time live identity evidence, exact binding verification,
  and the 22 evidence-only legacy mappings.
- `catalog-reconciliation.json` — all 513 source-scope rows and per-row
  prerequisite evidence.
- `direct-buy-batch.json` — empty by design; the source set cannot satisfy the
  direct-purchase gate.
- `assisted-order-batch.json` — exact canonical/bound RUO request-access rows.
  Missing or sub-floor price/proxy economics stay in this
  operator-assisted lane with Price on request and explicit conflicts. It also
  contains the 22 exact legacy physical SKU dispositions, each without identity
  mutation authority.
- `care-required-batch.json` — only explicit canonical 503A clinical rows.
- `unavailable-batch.json` — unmatched, absent-current-intake, approval-gated,
  unbound, or non-product rows.
- `conflicts.json` — sanitized blocking/review events, including one explicit
  identity-adjudication conflict for every legacy physical SKU.

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
