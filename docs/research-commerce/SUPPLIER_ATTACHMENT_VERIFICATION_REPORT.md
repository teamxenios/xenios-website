# Supplier Attachment Verification Report

The revised signed package states that all referenced supplier specifications,
COAs, storage records, shelf-life records, shipping profiles, and price
schedules were delivered through the approved secure channel (page 3 status
notice; Appendix B marks every row "Secure Channel").

This report records whether the actual files physically exist. A document is
never marked `verified` because its ID appears in the signed PDF.

## Method

- Searched the recommended secure intake tree
  (`XENIOS_SUPPLIER_SECURE_INTAKE/`) and the download directory for any
  attachment file (specification, COA, storage, shelf-life, shipping, pricing,
  recall, inventory, fulfillment).
- The only supplier-related files present are versions of the verification PDF
  itself. No SPEC, COA, STORAGE, SHIP, PRICE, RECALL, INVENTORY, or FULFILLMENT
  file exists on disk.

## Result

| Metric | Value |
| --- | --- |
| Attachments referenced in Appendix B | 65 |
| Attachment files physically found | 0 |
| Attachments verified | 0 |
| State assigned to every referenced attachment | `referenced_not_found` |

Document states used: `referenced_not_found`, `received_unverified`, `verified`,
`rejected`, `superseded`. Every referenced document is `referenced_not_found`.

## Why this matters

Appendix B and page 3 assert secure-channel delivery, but page 3's own COA rule
and page 36's certification both concede the signed PDF is not a substitute for
actual COA delivery. Because no attachment file is present, no attachment can be
matched (document ID, SKU, lot, SHA-256, type, product/lot binding) and none can
be marked `verified`.

Every product sheet marks quality-document status "Actual COA attached." That
mark conflicts with page 3's COA rule and with the absence of the file, so each
is recorded as `conflict_inside_package`.

## Consequence for facts

- Facts the signed master states directly (name, composition, strength, format,
  size, SKU, price, storage, shelf-life statement, shipping profile, fulfillment
  owner, reported inventory, referenced lot IDs) are recorded as supplier
  evidence. See [SUPPLIER_FACT_RECONCILIATION_FINAL.md](SUPPLIER_FACT_RECONCILIATION_FINAL.md).
- COA-backed facts that require the actual document cannot be established:
  purity, sterility, endotoxin, microbial results, assay method, laboratory
  accreditation, manufacturing date, and expiry date. These remain
  `not_confirmed` for all 15 SKUs.

## Referenced-but-absent documents (Appendix B, by SKU)

Per SKU P001-P015: one supplier specification (`SPEC-Pxxx-vN`), one storage
profile (`STORAGE-Pxxx-v1`), one shipping profile (`SHIP-Pxxx-v1`), and one or
more COAs (`COA-Pxxx-LOT-0824x`, lot `0824x`). P001 references two COA lots
(0824A, 0824B). Package-level: `PRICE-SCHEDULE-2026-Q3` (confidential),
`RECALL-CONTACT-v2`, `INVENTORY-STATEMENT-2026-07`, `FULFILLMENT-SLA-v1`. Full
per-document list with states is in
[signed-supplier-master-facts.json](signed-supplier-master-facts.json)
(`attachments`).

## To clear this report

For each row, the actual file must arrive through the secure channel and be
matched: exact document ID, SKU, lot where applicable, SHA-256, readable file,
expected type, correct product/lot binding, reviewer, and timestamp. A COA or
lot may bind to exactly one SKU; cross-assignment is rejected by the import
loader. Until then, no attachment is `verified` and no COA-backed fact exists.
