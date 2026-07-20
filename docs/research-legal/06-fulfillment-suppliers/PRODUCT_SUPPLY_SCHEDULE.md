# Product Supply Schedule

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-FUL-002 |
| Title | Product Supply Schedule |
| Audience | fulfillment_partner |
| Required member state | n/a (partner schedule) |
| Trigger | Executed with the Master Fulfillment Agreement (XR-FUL-001). Complete Product Master Data is due before the first Fulfillment Order for any SKU. |
| Route | offline agreement |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for product master and lot records] |
| Acceptance event | Wet or electronic signature by an authorized representative of each party, as a schedule to XR-FUL-001. |
| Withdrawal supported | No. This schedule ends with the Master Fulfillment Agreement's termination and transition provisions. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-FUL-001, XR-FUL-004, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. Purpose

This schedule defines the Product Master Data that Mitch must provide to Xenios for every SKU Mitch holds or fulfills, when it is due, how it is kept current, and what happens when it is missing or wrong. Capitalized terms have the meanings in the Master Fulfillment Agreement (XR-FUL-001).

Why this exists: Xenios cannot lawfully or safely present, sell, ship, or support a product it cannot fully describe. The website, the shipping engine, the shelf-life system, the quality process, and the classification review all consume this data. A SKU with incomplete Product Master Data is not sellable and not shippable.

## 2. Covered SKUs

2.1 This schedule covers every peptide and research SKU Mitch holds for Xenios. The current range is the 15 SKU records P001 through P015, plus any Quantum inventory held in storage under Section 6 of XR-FUL-001.

2.2 Quantum SKUs require the same Product Master Data even though they have no commerce lane. Storage without documentation is not acceptable.

2.3 New SKUs may be added only by written agreement, and only after complete Product Master Data is delivered and accepted.

## 3. Required Product Master Data, per SKU

Mitch must provide every field below for every SKU. "Unknown" is an acceptable interim answer only if flagged as such in writing with a date by which the answer will be supplied; a silent blank is not.

### 3.1 Identity

- exact product name,
- Xenios SKU code,
- supplier or manufacturer,
- manufacturing location.

### 3.2 Composition and format

- composition,
- amount per unit,
- format,
- container closure,
- case configuration.

### 3.3 Commercial

- unit cost,
- suggested price if any,
- current stock,
- allocated stock,
- minimum order quantity.

### 3.4 Lot and shelf life

- lot or batch identifier,
- manufacture date,
- expiry date or approved retest date (every lot must carry one of the two),
- shelf-life basis (manufacturer label, stability study, supplier quality document, or approved quality determination; a verbal claim is not a basis).

### 3.5 Storage and transport

- labeled storage range,
- light and moisture protection requirements,
- transport range,
- freeze and thaw limitations,
- excursion procedure reference (per the Quality Agreement, XR-FUL-004).

### 3.6 Quality documents

- COA for every lot,
- sterility, endotoxin, identity, and purity documents where applicable to the product type.

### 3.7 Classification

- Mitch's stated regulatory and commercial classification for the SKU, with its basis.

Mitch's classification statement is an input, not a conclusion. Xenios treats every product as a research product whose classification and permitted marketing lane are under formal review, and every SKU receives a written classification memorandum on the Xenios side before commerce. Mitch's statement never substitutes for that review.

## 4. Delivery and format

4.1 Initial delivery: the complete Product Master Data set for all covered SKUs is due before launch, as part of the Mitch Fulfillment Readiness Response, and in any event before the first Fulfillment Order for the SKU concerned.

4.2 Format: a structured, machine-readable format agreed with Xenios [CONFIG: file format and template, pending integration decisions], delivered over the secure channel required by Section 10 of XR-FUL-001. Never through personal email.

4.3 Xenios acceptance: Xenios reviews each SKU record for completeness and internal consistency (for example, a refrigerated storage range with no transport range fails review). A SKU is accepted only when every required field is present or has a flagged, dated interim gap that Xenios has approved in writing.

## 5. Update duties on change

5.1 Mitch must send an updated record promptly, before the change takes operational effect where possible, whenever any of the following changes for a covered SKU:

- supplier, manufacturer, or manufacturing location,
- composition, amount, format, or container closure,
- unit cost or minimum order (subject to the price-change notice duty in XR-FUL-001 Section 13.2),
- a new lot enters storage (new lot record with manufacture date, expiry or retest date, and COA),
- an expiry or retest date is corrected or extended (with the quality basis for the change),
- storage, transport, freeze/thaw, or protection requirements change,
- any quality document is superseded, withdrawn, or found to be wrong,
- Mitch's stated classification changes or is questioned by any supplier, carrier, insurer, or authority.

5.2 A change to shelf-life or storage data is also a quality event and follows the Quality Agreement (XR-FUL-004) in parallel.

5.3 Xenios reflects accepted updates in its product master, shipping profiles, and shelf-life system. Until an update is accepted, the prior accepted record governs operational decisions, and Xenios may block sale or shipment of the affected SKU.

## 6. Consequences of missing or inaccurate data

6.1 A SKU without complete accepted Product Master Data is blocked: not displayed for sale, not reservable, not shippable. This mirrors the launch acceptance test that out-of-stock and documentation-missing states block fulfillment.

6.2 If inaccurate Product Master Data causes a shipment error, a shelf-life failure, or a wrong storage or transport decision, the remedy and cost allocation follow XR-FUL-001 Section 18 and the financial settlement schedule.

6.3 Repeated or material data failures are a material breach of XR-FUL-001.

## 7. Records

Both parties retain Product Master Data records, including superseded versions and correction history, per the Retention and Deletion Schedule (XR-POL-005). Corrections supersede old records without erasing them, so the state of knowledge at any past date can be reconstructed for traceability, recall, and audit purposes.

## Open items for counsel

- [COUNSEL: confirm retention period for product master and lot records] (metadata table, Section 7).
- [CONFIG: file format and template for Product Master Data delivery] pending integration decisions (Section 4.2).
- Confirm the legal weight of Mitch's classification statements (Section 3.7): representation, warranty, or informational input only.
- Confirm whether the Mitch Fulfillment Readiness Response should be attached to this schedule as an exhibit or incorporated by reference in XR-FUL-001 only.
- Confirm the price-change notice mechanics referenced from XR-FUL-001 Section 13.2 apply to unit-cost changes reported under Section 5.1.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
