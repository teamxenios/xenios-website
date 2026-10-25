# Product image coverage

Source of truth: `XENIOS_RESEARCH_COMPLETE_MASTER_2026-08-01_V3.xlsx`, sha256
`e2f7a8e1a59fbda8e01af1fc090112b8b51cc20bf30a890bab53c1d38dbc7f47`, sheet
**"48 Product Image Manifest"**.

The sheet is 1182 rows: two title rows, one header row, and **1179 data rows**. Every number
below is computed from those 1179 rows by `server/research/product-media/coverage.ts`. The
tables are rendered by that module and asserted against this file by
`server/research/product-media/coverage.test.ts`, so this document cannot drift from the code
without the suite failing.

No image asset was generated, downloaded, commissioned, or fabricated to produce this report.
It counts what the workbook states, and the workbook states that nothing is approved yet.

## Headline

| Measure | Count |
| --- | ---: |
| Manifest data rows | 1179 |
| Rows with an **approved asset** | **0** |
| Rows **pending design** (Xenios original artwork still to be made) | 65 |
| Rows **blocked on rights** (a third party must authorise the image) | 947 |
| Rows **blocked on identity** (exact product, strength, or label unresolved) | 159 |
| Rows **blocked on claims review** | 8 |
| Assets held in the registry | 0 |

The five buckets are exhaustive and sum to 1179.

### Why approved is zero, stated plainly

Every one of the 1179 rows carries an empty **File Path** cell and the status **"Needed"**. The
workbook records no approved asset for any product, so the honest coverage figure is zero, and
the code refuses to report anything else. A row with no asset resolves to the image state
`NONE`, which is a real state a surface must be able to render. It does not resolve to a
placeholder dressed up as a product photograph.

## Per category

| Category | Rows | P0 | Approved | Pending design | Blocked on rights | Blocked on identity | Blocked on claims review |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Supplements | 893 | 0 | 0 | 0 | 893 | 0 | 0 |
| Peptides & Research | 86 | 86 | 0 | 0 | 0 | 86 | 0 |
| Competitor Expansion Candidate | 73 | 73 | 0 | 0 | 0 | 73 | 0 |
| Bloodwork & Testing | 42 | 21 | 0 | 0 | 42 | 0 | 0 |
| AI, Tracking & Education | 24 | 0 | 0 | 24 | 0 | 0 | 0 |
| Memberships & Programs | 20 | 0 | 0 | 20 | 0 | 0 | 0 |
| Care & Telemedicine | 12 | 12 | 0 | 0 | 12 | 0 | 0 |
| Quantum & Regenerative | 8 | 8 | 0 | 0 | 0 | 0 | 8 |
| Provider & Performance Network | 7 | 0 | 0 | 7 | 0 | 0 | 0 |
| Shipping & Fulfillment | 7 | 0 | 0 | 7 | 0 | 0 | 0 |
| White Label & Partners | 7 | 0 | 0 | 7 | 0 | 0 | 0 |
| **Total** | **1179** | **200** | **0** | **65** | **947** | **159** | **8** |

## By rights path

The rights path decides what a lawful asset for the row could even be. A row whose only lawful
source is an official brand feed can never be satisfied by a render we draw ourselves, and a
render we draw can never be recorded as that brand's photograph.

| Rights path | Rows |
| --- | ---: |
| THIRD_PARTY_RIGHTS_REQUIRED | 935 |
| XENIOS_GENERATED_RENDER | 159 |
| XENIOS_ORIGINAL_ARTWORK | 65 |
| LICENSED_THIRD_PARTY | 20 |

Read across the two tables: **935 of 1179 rows (79 percent) cannot move at all until a third
party grants rights**. That is the single largest constraint on image coverage, and it is not an
engineering constraint. The 65 `XENIOS_ORIGINAL_ARTWORK` rows are the only ones we can complete
entirely on our own.

## Shape of the manifest

| Measure | Count |
| --- | ---: |
| Distinct SKUs | 1152 |
| Rows carrying a variant | 376 |
| Rows whose variant is a real strength (for example `15 mg / 15 mg`) | 126 |
| P0 rows | 200 |
| P1 rows | 979 |
| Competitor expansion candidate rows | 73 |
| Rows with no SKU in the workbook | 3 |

The 126 strength bearing rows are where the strength mismatch check bites hardest: those are the
rows where a generic vial carrying the wrong printed strength would make a false statement about
what the buyer receives. The remaining 250 variant rows are formats (`Capsules`, `Panel`,
`Add-on Testing Panel`) that make no strength claim.

## Open data gaps found while building this

These are gaps in the source workbook, reported rather than filled in.

1. **Three supplement rows carry no SKU.** `IMG-01095` (Longevity Essentials NAD+), `IMG-01098`
   (Uplift+), and `IMG-01112` (Rejuvenate+) have `-` in the SKU column and `-` as alt text. No
   asset can be bound to them by identifier until a SKU exists. Reported as
   `MISSING_PRODUCT_IDENTIFIER`.
2. **The 73 competitor expansion candidate rows are not Xenios offers.** They are coverage and
   gap references. The registry refuses to attach any imagery to them, and no competitor image is
   ever reused for any row.
3. **No rights record exists anywhere yet.** The workbook names the rights path per row but
   carries no grant, holder, date, or evidence pointer. Until a real grant is on file, the model
   refuses to record any supplier or licensed photograph at all.

## What the code enforces

`shared/research/product-media/` and `server/research/product-media/`.

### The rule that matters most

A Xenios generated render is metadata-tagged `generated_product_render` and **may never be
labelled `supplier_photograph`**. This is the image system's version of writing a certificate of
analysis we do not hold.

It is enforced structurally, not by convention:

- `ProductMediaAsset` is a branded type. The only way to obtain one is
  `createProductMediaAsset`, so there is no object literal path around the gate.
- `provenanceTag` is derived from `sourceType` inside the factory. A caller cannot pass it, so a
  caller cannot set a photograph tag on a render. A smuggled `provenanceTag` field is ignored.
- Every photographic source type (`official_brand`, `licensed_supplier`,
  `commissioned_photography`) requires `RIGHTS_ON_FILE` plus a complete `RightsRecord` with a
  named holder, a grant date, and an evidence pointer. `RIGHTS_NOT_REQUIRED` is refused
  explicitly on those types, because it is the shape a caller would reach for to skip the gate.
- `reclassifySourceType` refuses every transition that upgrades a render or a placeholder into a
  photograph. The pixels did not change, so the claim about them may not change.

`asset.test.ts` walks all three photographic source types against all four rights statuses and
asserts every combination without a record is refused. `registry.test.ts` repeats the matrix at
the write boundary.

### The four automated checks

1. **Missing media** (`MISSING_MEDIA_STATE`, `MISSING_PRODUCT_IDENTIFIER`). Every active product
   row has an image state. The state may be `NONE`. What is not allowed is silence.
2. **Strength mismatch** (`STRENGTH_MISMATCH`, `UNDECLARED_STRENGTH_ON_IDENTITY_IMAGE`). No image
   may sit on a variant whose strength differs from the strength printed on the pictured item. A
   published card, hero, label, or package image on a strength bearing variant must state the
   strength it shows. Comparison is component by component, in order, with no unit conversion:
   `1 mg` and `1000 mcg` print differently on a label, and the label is what the reader sees.
3. **Nothing unsafe on an active product** (`BROKEN_ASSET`, `COMPETITOR_SOURCED_ASSET`,
   `PLACEHOLDER_PUBLISHED`, `UNRELATED_ASSET`, `EXPANSION_CANDIDATE_ASSET`). A published asset
   needs stored bytes, a checksum, verified identity, a non placeholder source, and provenance
   that names no competitor.
4. **Hygiene** (`DUPLICATE_MISMATCHED_LABEL`, `MISSING_ALT_TEXT`, `OVERSIZED_FILE`,
   `ORPHANED_ASSET`). One file cannot be two products or two strengths at once. Alt text of `-`
   is missing alt text, not alt text.

Findings are `blocking` or `advisory`. Blocking means a surface must not publish.

### What this lane deliberately did not do

No image was generated, downloaded, hotlinked, or commissioned. No brand asset was fetched. No
rights status was recorded that the manifest does not evidence, which is why every rights status
in the system today is absent rather than pending or held. The system, the states, and the
verification are complete while the coverage stays at zero, and that gap is the true state of the
work.

## Next unblocks, in order of leverage

1. Open an official brand assets or reseller media account per supplement brand. That is the
   only thing that moves the 893 supplement rows.
2. Resolve exact product, strength, and label identity for the 86 peptide rows so the rendered
   vial programme can start. These are all P0.
3. Commission the 65 original artwork rows, which need nobody's permission.
4. Assign a SKU to the three supplement rows that have none.
