# Signed Supplier Master Intake

Confidential business record. This public doc carries document IDs, hashes, and
states only. Supplier contact details, signatures, prices marked confidential,
and the actual supplier files are NOT in the repository; they live in the local
secure intake store (`XENIOS_SUPPLIER_SECURE_INTAKE/`, gitignored).

## The document

| Field | Value |
| --- | --- |
| Document | Xenios Research Supplier Product Fact Verification and Attestation (revised, pages 3 and 34) |
| Internal supplier reference | APS-2026-Q3-047 |
| Page count | 36 (verified) |
| Byte size | 1,876,632 |
| SHA-256 (computed from exact bytes) | `E8ED723F994138A33F9EB08018228FDE773A40BC299B099F568BC4EEA3031884` |
| Effective date | 2026-07-21 |
| Received by | Samuel Boadu |
| Secure storage reference | `local://XENIOS_SUPPLIER_SECURE_INTAKE/signed-master/` (never committed) |
| Supplier | Apex BioInnovations LLC (DBA Apex Peptide Sciences) [contact withheld from repo] |

The value `332124` printed in the document's "package hash / intake ID" field is
NOT a cryptographic hash. It is a manually typed placeholder. The authoritative
intake hash is the SHA-256 above, computed from the exact PDF bytes.

## What the document contains (verified by full read)

- Supplier identity and authorized representative (Section 1).
- Supplier attestations (Section 2), seven items marked with a check.
- Fifteen product sheets, P001 through P015 (Appendix A), each stating canonical
  name, composition, strength, format and size, SKU, member-facing price,
  storage, shelf-life basis, shipping profile, fulfillment owner, reported
  inventory, supporting document IDs, referenced COA IDs and lot numbers, and a
  typed representative initial (MC) with date 2026-07-21.
- A supporting-document and COA index (Appendix B, pages 34 and 35) listing 65
  documents, each marked "Secure Channel" delivery.
- A final supplier certification (page 36) with printed names and a Xenios
  receipt acknowledgment.

## Execution state (reported honestly)

- The PDF contains NO signature widget and NO digital signature (0 AcroForm
  fields). The signature blocks on page 36 contain the placeholder text "SIGN".
  Printed names and typed initials are present. This is a supplier-completed
  record with typed attestations, not a cryptographically executed signature.
- Whether the typed initials and printed names constitute a fully executed
  supplier signature is a founder/counsel determination, recorded as an open
  item below.

## The page-3 contradiction (material)

Page 3 carries two statements that conflict:

1. COA rule: "the referenced COA files" were not included, so product sheets
   "identify COA delivery as a supplier representation rather than as a verified
   attachment to this PDF."
2. Revised status notice: "All referenced supplier specifications, Certificates
   of Analysis (COAs), storage records, shelf-life records, shipping profiles,
   and price schedules are included with this submitted package and have been
   delivered through the approved secure channel."

Page 36's certification resolves the conflict in the conservative direction:
"Xenios may use this signed document as a written supplier source record, while
actual COA confirmation requires the corresponding COA to be delivered and
identified."

## Intake result

- The signed master PDF IS on file and hashed. It serves as `supplier_document`
  evidence for the facts it directly states (name, composition, strength,
  format, size, SKU, price, storage, shelf-life statement, shipping profile,
  fulfillment owner, reported inventory, referenced lot IDs).
- The referenced attachments (specifications, COAs, storage records, shelf-life
  records, shipping profiles, price schedule, recall contact, inventory
  statement, fulfillment schedule) were NOT received at intake. See
  [SUPPLIER_ATTACHMENT_VERIFICATION_REPORT.md](SUPPLIER_ATTACHMENT_VERIFICATION_REPORT.md).
- Machine-readable facts: [signed-supplier-master-facts.json](signed-supplier-master-facts.json).

## Open items

- Founder/counsel: confirm the execution status of the signed master (typed
  initials plus printed names, no digital signature) before any fact is promoted
  to member-displayable.
- The COA and supporting files must arrive through the secure channel and be
  matched per the attachment report before any COA-backed fact or purchase
  eligibility can advance.
