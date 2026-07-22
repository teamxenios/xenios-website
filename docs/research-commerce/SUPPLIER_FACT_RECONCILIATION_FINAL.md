# Supplier Fact Reconciliation (Final)

Reconciles the revised signed supplier master (SHA-256
`E8ED723F994138A33F9EB08018228FDE773A40BC299B099F568BC4EEA3031884`, 36 pages)
against the legacy catalog (`server/research/products-data.ts`) and the prior
reconciliation ([SUPPLIER_FACT_RECONCILIATION.md](SUPPLIER_FACT_RECONCILIATION.md)).

Machine-readable output: [signed-supplier-master-facts.json](signed-supplier-master-facts.json)
(165 facts, 65 attachments, 15 SKUs).

## Headline

- The signed master provides supplier-stated values for all 15 SKUs. This is the
  first written supplier document behind the catalog's product facts.
- It **corrects** the legacy catalog on many facts. 32 facts differ from the
  legacy values and are recorded `corrected_by_supplier` with the legacy value
  preserved as conflict history. The legacy catalog was not overwritten.
- No fact is promoted to member-displayable, and no SKU becomes purchase
  eligible, because the COA-backed quality documents were not delivered (see the
  attachment report) and the document's execution state is a pending
  founder/counsel item.

## Classification vocabulary

Per the intake instructions: `confirmed_by_signed_supplier_master`,
`confirmed_by_attachment`, `corrected_by_supplier`, `withdrawn`,
`still_unresolved`, `conflict_inside_package`.

Mapped to the code's provenance model (`shared/research/catalog.ts`): non-COA
facts land as `supplier_reported` with source `supplier_document`; the COA fact
lands as `not_confirmed`. `supplier_reported` is visible to Samuel for
reconciliation, is NOT member-displayable, and does NOT satisfy the commerce
gate. Promotion to `confirmed` requires actual COA delivery plus a
founder/counsel decision.

## Result by fact class

| Fact class | Count | Reconciliation status | Code confirmation |
| --- | --- | --- | --- |
| Non-COA facts matching legacy or newly stated | 118 | confirmed_by_signed_supplier_master | supplier_reported |
| Non-COA facts overriding a wrong legacy value | 32 | corrected_by_supplier | supplier_reported (legacy kept in history) |
| COA facts (per SKU) | 15 | referenced_not_found / conflict_inside_package | not_confirmed |

## The 32 corrections (legacy was wrong)

Prices: essentially every SKU. The legacy catalog priced products roughly two to
four times the supplier-stated member price (for example P001 legacy `$339.99`
vs signed `$89.99`; P007 legacy `$209.99` vs signed `$149.99`). All are
`corrected_by_supplier`.

Strengths that changed materially (legacy -> signed):

| SKU | Legacy strength | Signed strength |
| --- | --- | --- |
| P001 | 15 mg / 15 mg | 5 mg BPC-157 / 5 mg TB-500 (10 mg total) |
| P002 | 10 mg / 10 mg / 50 mg | GHK-Cu 50 / BPC-157 10 / TB-500 10 (70 mg total) |
| P003 (KLOW) | 5 / 5 / 10 / 5 mg | GHK-Cu 50 / BPC-157 10 / TB-500 10 / KPV 10 (80 mg) |
| P007 | 10 mg | 5 mg |
| P008 | 5 mg | 2 mg |
| P009 | 500 mg | 100 mg |
| P010 | 10 mg | 5 mg |
| P011 | 10 mg | 5 mg |
| P012 | 10 mg | 5 mg |
| P013 | 250 mcg x 100 | 1500 mcg per capsule, 60 capsules |
| P014 | 10 mg x 60 | 10 mg per capsule, 30 capsules |
| P015 | 10 / 10 / 2 mg | Semax 5 / Selank 5 / DSIP 5 (15 mg total) |

Every legacy value is retained in the JSON `conflictHistory`, marked
`superseded_unverified_legacy`. Nothing was silently overwritten.

## KLOW (P003)

- Prior disputed value (legacy): composition `TB-500, BPC-157, GHK-Cu, KPV`;
  strength `5 mg / 5 mg / 10 mg / 5 mg`. The prior content review declined to
  guess even the ingredient set.
- Signed selected value: KLOW Peptide Stack, composition GHK-Cu; BPC-157;
  TB-500; KPV (Lys-Pro-Val); strength GHK-Cu 50 mg / BPC-157 10 mg / TB-500
  10 mg / KPV 10 mg (80 mg total); SKU APS-KLOW-80; member price `$149.99`.
- Supporting PDF page: 8 (sheet) and 9 (continuation). PDF SHA-256 as above.
- Attachment IDs: `SPEC-P003-v1`, `STORAGE-P003-v1`, `SHIP-P003-v1`,
  `COA-P003-LOT-0824D` (lot 0824D).
- Actual COA presence: NO (`referenced_not_found`).
- Final eligibility: BLOCKED, pending the actual COA and a founder/counsel
  promotion decision. The ingredient set is now supplier-stated (composition
  `confirmed_by_signed_supplier_master`); the strength is
  `corrected_by_supplier` from the disputed legacy ratio. No KLOW-specific
  bypass was created; KLOW runs through the same gate as every SKU.

## Epithalon / Epitalon (P011)

- Canonical spelling selected: **Epithalon** (matches the Guide content and the
  signed sheet's primary title).
- Alias retained so existing links and searches keep working: **Epitalon**
  (recorded in the product record's `nameAliases`).
- The signed sheet header is "Epithalon / Epitalon" and the body "Epithalon
  (Epitalon)", so both spellings are supplier-acknowledged.

## Still unresolved / conflicts

- Every COA and quality-document fact: `still_unresolved` pending actual file
  delivery.
- The "Actual COA attached" mark on all 15 product sheets:
  `conflict_inside_package` (contradicts the page-3 COA rule and the absent
  files).
- Confidential wholesale/cost values and the price schedule: not extracted into
  any public doc; held in the confidential intake.
