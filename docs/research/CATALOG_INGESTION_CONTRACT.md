# Catalog ingestion contract, general platform lane

Written 2026-08-14 (Phase 0 of the full-platform build). This records the measured
state and the decided design before the code lands, and it must stay honest as the
code evolves.

## Sources

- Canonical structured source: `XENIOS_MASTER_CATALOG_ONLY_2026-08-13.xlsx`, sheet
  `MASTER CATALOG`, 420 data rows, verified this session: families 242 `503A Clinical
  Formulations` / 135 `Research Peptides & Materials` / 20 `Supplements` / 16
  `Research Capsules` / 3 `Topicals & Regenerative` / 2 `Research Supplies` / 2
  `Shipping & Fulfillment`; channels 244 provider / 121 RUO / 32
  classification-pending / 20 supplement / 3 topical; 418 rows with a usable
  `Suggested Sell Price`, 2 without (BAM15 500 mcg; Syringes & Alcohol Swabs).
- Visual reference: the matching PDF.
- The workbook carries private procurement fields (Selected Supplier, Buy Cost,
  Original Quote, Gross Profit/Margin, Alternative Supplier/Cost, Savings,
  Offers/Suppliers Compared, Selection Rationale, Source File/Location,
  Quality/Regulatory Notes, Supplier Notes). These may never reach a member
  projection; the existing exporter/builder ban lists already name every one.

## The decided pipeline (one workbook family, one parse, two artifacts)

`scripts/research/export-kris-launch-a.py` already parses this exact workbook into
the gitignored private intake (all columns). The build step gains a second output:

1. `kris-launch-a-catalog.generated.json` stays exactly as it is (Kris lane,
   untouched this run per the founder scope override).
2. `member-safe-master-offerings.generated.json` is REGENERATED from the same
   intake to the 420-row canonical universe, replacing the superseded 1,121-product
   planning dataset (old workbook, `sourceRowCount` 1236, generated 2026-08-13).

## Mappings

- Identity: `Group ID` is source lineage; offering ids remain content-hashed
  (`mo_` prefix), slugs from family + product + specification, duplicate-refused.
- Family (workbook to contract; five additive vocabulary values, same slugs the
  Kris artifact already uses): `503A Clinical Formulations` ->
  `clinical_formulations_503a`, `Research Capsules` -> `research_capsules`,
  `Research Peptides & Materials` -> `research_peptides_materials`,
  `Research Supplies` -> `research_supplies`, `Topicals & Regenerative` ->
  `topicals_regenerative`, `Supplements` -> `supplements` (existing),
  `Shipping & Fulfillment` -> `shipping_and_fulfillment` (existing).
- Channel to displayState (visibility is separate from purchasability, always):
  `Clinical / Provider Only` -> `care_pathway`; `Supplier Catalog / Classification
  Pending` -> `approval_required`; `RUO Research`, `Supplement`, `Nonclinical /
  Topical` -> `request_access` for the display-only launch. Only a runtime Product
  Control cart selection can ever upgrade an action to a purchase; display states
  never do, which `catalog-pricing.test.ts` pins.
- Prices: NEVER in this artifact. `Suggested Sell Price` becomes member-audience
  Product Control price rows (draft -> approve via the mounted admin RPCs, versioned
  and audited), read through the one AuthoritativePriceResolver path. Until a row's
  exact binding + approved price exist, the surface renders `Price on request`.

## Acceptance for the regenerated dataset

SOURCE_ROWS 420; every row resolved exactly once; PRICED 0 inside the artifact by
design (418 arrive as Product Control data); families and channels match the
verified accounting; privacy scan zero hits; `verify-master-offerings-dataset.ts`
updated to pin the NEW counts deliberately in the same commit.

## Rollout ladder

Mount dark (`RESEARCH_MASTER_OFFERINGS_ENABLED` unset), census moved deliberately,
wall read-bypass added; then founder/admin-only scope; then named members; then all
members. The Kris lane, its routes, artifact, entitlement, and wall admissions stay
byte-identical throughout.
