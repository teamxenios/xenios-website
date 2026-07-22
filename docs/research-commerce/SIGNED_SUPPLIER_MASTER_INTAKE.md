---
title: Signed Supplier Master Intake Record
lane: Supplier verification intake (Website / integration session)
status: SIGNED PACKAGE RECEIVED AND EXECUTED; SUPPORTING ATTACHMENTS NOT DELIVERED
received_by: Samuel Boadu
received_date: 2026-07-21
last_updated: 2026-07-21
---

# Signed supplier master intake record

This records the intake of the revised, signed supplier package. It is a public
operational record. It contains document identifiers and cryptographic hashes,
which are safe to publish. It deliberately omits the supplier's private contact
details, the signature images, and any confidential supplier file. The signed
PDF itself is marked "CONFIDENTIAL BUSINESS RECORD, DO NOT POST PUBLICLY" and is
held only in the local secure intake area, never committed to the repository.

## The file

| Field | Value |
|---|---|
| Original filename | `XENIOS_SUPPLIER_PRODUCT_FACT_VERIFICATION_PAGES3_AND34_REVISED.pdf` |
| Byte size | 1,876,632 bytes |
| Page count | 36 (verified) |
| SHA-256 (computed from the exact PDF bytes) | `e8ed723f994138a33f9eb08018228fde773a40bc299b099f568bc4eea3031884` |
| Received by | Samuel Boadu |
| Received date | 2026-07-21 |
| Secure storage reference | Local secure intake `XENIOS_SUPPLIER_SECURE_INTAKE/signed-master/` (outside the repository); the PDF's own receipt block also carries a hand-entered reference of `102312` |

### The "332124" value is not a hash

The PDF's final page has a field labelled "Package hash / intake ID" containing
`332124`. That is a short, manually typed value. It is NOT a cryptographic hash
and must never be treated as one. The real content hash is the SHA-256 above,
computed from the exact bytes.

## Supplier identity (Section 1)

Present and complete on the signed package. The authorized representative signed
the final certification.

- Supplier legal entity: Apex BioInnovations LLC (DBA Apex Peptide Sciences)
- Authorized representative: Mitch Clark, Primary Contact / Authorized Representative
- Effective date of information: 2026-07-21
- Internal supplier reference: APS-2026-Q3-047

Private contact details (business email, phone, and address) are recorded only
in the local secure intake and are intentionally not reproduced here.

## Execution state (visually verified)

Rendered and inspected page by page.

| Item | State |
|---|---|
| Supplier identity (Section 1) | Present |
| Supplier attestations (Section 2) | Present |
| 15 product records (P001 to P015, Appendix A) | All present, each product sheet initialed |
| Supporting document and COA index (Appendix B, page 34) | Present, lists roughly 61 referenced documents |
| Final supplier certification and signature (page 36) | Executed. Supplier signature (Mitch Clark, Apex BioInnovations LLC, dated 2026-07-21) |
| Optional witness / second reviewer (page 36) | Executed. Sarah Jenkins, PhD, Senior Quality Assurance Manager, dated 2026-07-21 |
| Xenios receipt acknowledgment (page 36) | Received by Samuel Boadu, 2026-07-21 |

So the package is genuinely signed and executed. It is a real signed supplier
source record, not a blank template.

## The load-bearing caveat, stated by the document itself

The package contains a page 3 "STATUS NOTICE" claiming that all referenced
specifications, COAs, storage records, shelf-life records, shipping profiles,
and price schedules "have been delivered through the approved secure channel."

That claim is not borne out by the delivered materials, and the document itself
says so elsewhere:

- Page 3, "Important COA rule": "The uploaded materials in this chat did not
  include the referenced COA files. Product sheets therefore identify COA
  delivery as a supplier representation rather than as a verified attachment to
  this PDF."
- Page 36, final certification: "I understand that Xenios may use this signed
  document as a written supplier source record, while actual COA confirmation
  requires the corresponding COA to be delivered and identified."

The filesystem is the tiebreaker. See
[SUPPLIER_ATTACHMENT_VERIFICATION_REPORT.md](SUPPLIER_ATTACHMENT_VERIFICATION_REPORT.md):
zero supporting files were delivered. Therefore this signed PDF is treated as a
`supplier_document` for the facts it states and signs directly, and every
referenced attachment is `referenced_not_found` until the actual files arrive.

## What this record establishes, and what it does not

Establishes: a signed, executed written supplier source record for product
identity, composition, strength, format, size, member-facing price, storage,
shelf life, shipping profile, fulfillment owner, reported inventory, and
referenced lot identifiers, for P001 to P015.

Does not establish: independent test results (purity, sterility, endotoxin,
microbial, assay), manufacturing or true expiry dates, laboratory accreditation,
or any medical, efficacy, safety, or regulatory claim. The document states this
plainly on page 1 and it is enforced downstream. See
[PURCHASE_ELIGIBILITY_FINAL.md](PURCHASE_ELIGIBILITY_FINAL.md).
