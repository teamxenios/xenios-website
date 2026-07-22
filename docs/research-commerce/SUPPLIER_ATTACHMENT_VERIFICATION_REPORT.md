---
title: Supplier Attachment Verification Report
lane: Supplier verification intake (Website / integration session)
status: NO SUPPORTING ATTACHMENTS DELIVERED; ALL REFERENCED DOCUMENTS referenced_not_found
last_updated: 2026-07-21
signed_master_sha256: e8ed723f994138a33f9eb08018228fde773a40bc299b099f568bc4eea3031884
---

# Supplier attachment verification report

The signed package (Appendix B) references roughly 61 supporting documents. The
package's page 3 STATUS NOTICE claims they "have been delivered through the
approved secure channel."

This report verifies that claim against the actual filesystem. The rule, from
the launch prompt and from the package's own page 3 COA rule, is absolute: a
document is not verified because its identifier appears in a signed PDF. It is
verified only when the actual file physically exists, is readable, is the
expected type, and is tied to the correct product or lot.

## Result: nothing was delivered

The secure intake directory `XENIOS_SUPPLIER_SECURE_INTAKE/` was created with all
nine expected subfolders (coa, supplier-specifications, storage, shelf-life,
shipping, pricing, recall, other-quality-documents, signed-master). A full census
of every subfolder, plus a scan of the Downloads folder, found:

- Attachment files present: **0**
- The only supplier file on disk is the signed master PDF itself.

Therefore every referenced document below is `referenced_not_found`. None can be
hashed, type-checked, or tied to a product or lot, because none exists.

## Document states (the controlled vocabulary)

- `referenced_not_found`: named in the signed PDF, no actual file delivered. (All of them, today.)
- `received_unverified`: a file arrived but has not passed matching and review.
- `verified`: file exists, readable, correct type, correct product or lot, reviewed.
- `rejected`: file arrived but failed matching or review.
- `superseded`: replaced by a newer revision.

## Referenced document census (Appendix B), all referenced_not_found

| # | Document ID | SKU | Type | Lot | State |
|---|---|---|---|---|---|
| 1 | SPEC-P001-v3 | P001 | supplier specification | n/a | referenced_not_found |
| 2 | COA-P001-LOT-0824A | P001 | COA | 0824A | referenced_not_found |
| 3 | COA-P001-LOT-0824B | P001 | COA | 0824B | referenced_not_found |
| 4 | STORAGE-P001-v2 | P001 | storage profile | n/a | referenced_not_found |
| 5 | SHIP-P001-v1 | P001 | shipping profile | n/a | referenced_not_found |
| 6 | SPEC-P002-v2 | P002 | supplier specification | n/a | referenced_not_found |
| 7 | COA-P002-LOT-0824C | P002 | COA | 0824C | referenced_not_found |
| 8 | STORAGE-P002-v1 | P002 | storage profile | n/a | referenced_not_found |
| 9 | SHIP-P002-v1 | P002 | shipping profile | n/a | referenced_not_found |
| 10 | SPEC-P003-v1 | P003 (KLOW) | supplier specification | n/a | referenced_not_found |
| 11 | COA-P003-LOT-0824D | P003 (KLOW) | COA | 0824D | referenced_not_found |
| 12 | STORAGE-P003-v1 | P003 (KLOW) | storage profile | n/a | referenced_not_found |
| 13 | SHIP-P003-v1 | P003 (KLOW) | shipping profile | n/a | referenced_not_found |
| 14 | SPEC-P004-v2 | P004 | supplier specification | n/a | referenced_not_found |
| 15 | COA-P004-LOT-0824E | P004 | COA | 0824E | referenced_not_found |
| 16 | STORAGE-P004-v1 | P004 | storage profile | n/a | referenced_not_found |
| 17 | SHIP-P004-v1 | P004 | shipping profile | n/a | referenced_not_found |
| 18 | SPEC-P005-v2 | P005 | supplier specification | n/a | referenced_not_found |
| 19 | COA-P005-LOT-0824F | P005 | COA | 0824F | referenced_not_found |
| 20 | STORAGE-P005-v1 | P005 | storage profile | n/a | referenced_not_found |
| 21 | SHIP-P005-v1 | P005 | shipping profile | n/a | referenced_not_found |
| 22 | SPEC-P006-v1 | P006 | supplier specification | n/a | referenced_not_found |
| 23 | COA-P006-LOT-0824G | P006 | COA | 0824G | referenced_not_found |
| 24 | STORAGE-P006-v1 | P006 | storage profile | n/a | referenced_not_found |
| 25 | SHIP-P006-v1 | P006 | shipping profile | n/a | referenced_not_found |
| 26 | SPEC-P007-v2 | P007 | supplier specification | n/a | referenced_not_found |
| 27 | COA-P007-LOT-0824H | P007 | COA | 0824H | referenced_not_found |
| 28 | STORAGE-P007-v1 | P007 | storage profile | n/a | referenced_not_found |
| 29 | SHIP-P007-v1 | P007 | shipping profile | n/a | referenced_not_found |
| 30 | SPEC-P008-v1 | P008 | supplier specification | n/a | referenced_not_found |
| 31 | COA-P008-LOT-0824I | P008 | COA | 0824I | referenced_not_found |
| 32 | STORAGE-P008-v1 | P008 | storage profile | n/a | referenced_not_found |
| 33 | SHIP-P008-v1 | P008 | shipping profile | n/a | referenced_not_found |
| 34 | SPEC-P009-v2 | P009 | supplier specification | n/a | referenced_not_found |
| 35 | COA-P009-LOT-0824J | P009 | COA | 0824J | referenced_not_found |
| 36 | STORAGE-P009-v1 | P009 | storage profile | n/a | referenced_not_found |
| 37 | SHIP-P009-v1 | P009 | shipping profile | n/a | referenced_not_found |
| 38 | SPEC-P010-v1 | P010 | supplier specification | n/a | referenced_not_found |
| 39 | COA-P010-LOT-0824K | P010 | COA | 0824K | referenced_not_found |
| 40 | STORAGE-P010-v1 | P010 | storage profile | n/a | referenced_not_found |
| 41 | SHIP-P010-v1 | P010 | shipping profile | n/a | referenced_not_found |
| 42 | SPEC-P011-v1 | P011 | supplier specification | n/a | referenced_not_found |
| 43 | COA-P011-LOT-0824L | P011 | COA | 0824L | referenced_not_found |
| 44 | STORAGE-P011-v1 | P011 | storage profile | n/a | referenced_not_found |
| 45 | SHIP-P011-v1 | P011 | shipping profile | n/a | referenced_not_found |
| 46 | SPEC-P012-v1 | P012 | supplier specification | n/a | referenced_not_found |
| 47 | COA-P012-LOT-0824M | P012 | COA | 0824M | referenced_not_found |
| 48 | STORAGE-P012-v1 | P012 | storage profile | n/a | referenced_not_found |
| 49 | SHIP-P012-v1 | P012 | shipping profile | n/a | referenced_not_found |
| 50 | SPEC-P013-v2 | P013 | supplier specification | n/a | referenced_not_found |
| 51 | COA-P013-LOT-0824N | P013 | COA | 0824N | referenced_not_found |
| 52 | STORAGE-P013-v1 | P013 | storage profile | n/a | referenced_not_found |
| 53 | SHIP-P013-v1 | P013 | shipping profile | n/a | referenced_not_found |
| 54 | SPEC-P014-v1 | P014 | supplier specification | n/a | referenced_not_found |
| 55 | COA-P014-LOT-0824O | P014 | COA | 0824O | referenced_not_found |
| 56 | STORAGE-P014-v1 | P014 | storage profile | n/a | referenced_not_found |
| 57 | SHIP-P014-v1 | P014 | shipping profile | n/a | referenced_not_found |
| 58 | SPEC-P015-v1 | P015 | supplier specification | n/a | referenced_not_found |
| 59 | COA-P015-LOT-0824P | P015 | COA | 0824P | referenced_not_found |
| 60 | STORAGE-P015-v1 | P015 | storage profile | n/a | referenced_not_found |
| 61 | SHIP-P015-v1 | P015 | shipping profile | n/a | referenced_not_found |
| 62 | PRICE-SCHEDULE-2026-07 (naming example on page 3; the supplier-cost field on the sheets defers to it) | all | price schedule | n/a | referenced_not_found |

## Consequence

No COA-dependent fact can be verified. Purchase eligibility for every SKU is
blocked on the COA and active-lot requirements until the actual files arrive.
See [PURCHASE_ELIGIBILITY_FINAL.md](PURCHASE_ELIGIBILITY_FINAL.md).

## To clear this blocker

Deliver the actual files through the approved secure channel, each named with
the exact document ID above so it can be matched, hashed, type-checked, and tied
to its product or lot. Place them in the matching `XENIOS_SUPPLIER_SECURE_INTAKE`
subfolder. On arrival, each moves from `referenced_not_found` to
`received_unverified`, then to `verified` once matched and reviewed. Only then can
the COA-dependent eligibility requirements pass.
