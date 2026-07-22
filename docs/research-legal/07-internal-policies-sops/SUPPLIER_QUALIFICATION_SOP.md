# Supplier Qualification SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-017 |
| Title | Supplier Qualification SOP |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | Runs before any purchase from a new supplier, before any supplier's SKU passes the commerce gate (XR-POL-016), and at every requalification date or for-cause trigger. |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for supplier files, qualification decisions, and disqualification records] |
| Acceptance event | n/a (internal SOP; adoption recorded by founder approval with version and date) |
| Withdrawal supported | No. Internal versioned SOP; a later approved version supersedes this one. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-005, XR-POL-016, XR-POL-018, XR-FUL-002, XR-FUL-004, XR-FUL-016 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FDA dietary supplement CGMP regulations |
| Review date | 2026-07-19 |

## 1. Purpose and scope

No product enters the Xenios Research catalog from an unqualified supplier. This SOP defines how a supplier is qualified before first purchase, what documents must be on file, who decides, how often qualification is renewed, and how a supplier is disqualified.

Covered supplier categories:

1. Peptide and research material suppliers (the sources behind SKU records P001-P015 and future SKUs).
2. Supplement brands and their distribution channels (Momentous, Pure Encapsulations), where Xenios acts as an authorized reseller.
3. Quantum's manufacturer and source chain, which additionally carries its own full approval list and stays out of commerce until that list closes.

The fulfillment partner (Mitch) is not qualified under this SOP; the Master Fulfillment Agreement (XR-FUL-001) and Quality Agreement (XR-FUL-004) govern that relationship. Where Mitch receives inventory directly from a supplier, the supplier must still be qualified here first.

## 2. The instrument: XR-FUL-016

Initial qualification and requalification both use the Supplier Qualification Questionnaire (XR-FUL-016) as the standard instrument. The questionnaire collects the supplier's written answers on identity, manufacturing source, testing, documentation practice, recall capability, and insurance. Verbal answers are not answers: every qualification fact must exist in writing in the supplier file. XR-FUL-016 is drafted in the fulfillment-suppliers batch; this SOP and that questionnaire must stay reconciled (see Open items).

## 3. Initial qualification

Steps, in order:

1. Business need: the SKU pipeline (XR-POL-016) identifies why this supplier is needed. No speculative onboarding.
2. Identity and provenance: legal name, address, website, years operating, and the actual manufacturing source. If the supplier is a reseller or broker, the chain back to the manufacturer is documented. An unverifiable chain fails qualification.
3. Questionnaire: XR-FUL-016 sent, completed, and reviewed.
4. Document collection: per Section 4, for each product category the supplier will provide.
5. Risk review: answers and documents reviewed against the requirements; gaps listed in writing; the supplier answers gaps in writing.
6. Approval decision: per Section 5.

## 4. Document collection

Minimum file contents by category. "Where relevant" applicability per SKU is recorded in the Product Master Data (XR-FUL-002).

Peptide and research material suppliers:

1. Supplier identity and manufacturing source documentation (Section 3).
2. Certificate of analysis (COA) practice: a sample COA, the issuing laboratory, and whether testing is in-house or third-party. Per-lot COAs are then required at receiving (XR-POL-018).
3. Test methodology for identity and purity, and sterility and endotoxin testing where relevant to the product type.
4. Stability, storage, and transport requirements per product.
5. Labeling samples.
6. Recall capability: a named contact and a written description of how the supplier notifies customers of a problem lot.
7. Insurance evidence appropriate to the category. [COUNSEL: confirm required insurance types and limits for research material suppliers.]

Supplement brands (authorized reseller lane):

1. Written reseller authorization naming Xenios. Without it, no purchase and no listing, per the program rule that no supplement is sold until reseller authorization is confirmed.
2. Product authenticity and chain of custody: purchases only through the brand's authorized channel.
3. CGMP evidence for the manufacturer (certificate or audit summary consistent with FDA dietary supplement CGMP regulations).
4. Label and Supplement Facts samples, allergen information, and NDI status where relevant.
5. Serious adverse event responsibility allocation in writing, per the program's compliance checklist. [COUNSEL: confirm the written allocation of dietary-supplement serious adverse event responsibilities between brand and reseller.]
6. Lot and expiry practices, storage requirements, and recall procedure.
7. Commercial terms affecting publishing: content rights, MAP terms, margin, fulfillment path, and returns handling (these feed the XR-POL-016 commerce gate).

## 5. Approval decision

1. Samuel Boadu makes every qualification decision, in writing, with date. The possible outcomes are: approved, conditionally approved, or rejected.
2. Conditional approval names the missing items, the deadline, and what is allowed meanwhile (typically: nothing member-facing; at most a limited evaluation purchase that never enters sellable inventory). [CONFIG: whether evaluation purchases are permitted at all during the founding phase.]
3. Approval creates an approved supplier list entry: supplier, scope (categories and SKUs), decision date, conditions, requalification date, and the named accountable contact on each side.
4. Scope is real: a supplier approved for one category is not approved for another. Adding scope is a new qualification decision.

## 6. Requalification

1. Cadence: every supplier is requalified on a fixed schedule, [CONFIG: requalification cadence, e.g. every 12 months], using XR-FUL-016 refreshed and a documentation currency check.
2. A supplier past its requalification date is treated as not qualified for new purchase orders until requalified; already-received stock follows Section 7 assessment only if a concern exists.
3. For-cause requalification triggers, any of which start an immediate review regardless of cadence: a failed or missing COA, a quality complaint or possible adverse event traced to the supplier's product, a recall in the supplier's chain, a change of manufacturer or manufacturing site, a lapse in reseller authorization or insurance, a credible authenticity concern, or repeated documentation errors.

## 7. Disqualification

1. Samuel may disqualify a supplier at any time, in writing, with the reason recorded.
2. Immediate effects, in order: purchase orders stop; the supplier's SKUs re-enter the XR-POL-016 commerce gate (commerce disabled first, investigated second); on-hand stock from the supplier is assessed and, where a lot-level concern exists, quarantined under XR-POL-018; the fulfillment partner is notified for any affected inventory it holds.
3. If the disqualification reason implies risk in already-shipped product, the recall and product concern flows (XR-FUL-008, XR-COM-018, XR-COM-019) are triggered; disqualification never quietly buries a shipped-product risk.
4. A disqualified supplier may be re-qualified only through the full initial qualification process, with the disqualification history in the file.

## 8. Records

The supplier file holds: the questionnaire and answers, all collected documents with dates, gap correspondence, every decision with actor and date, requalification history, and any disqualification record. Files are retained per XR-POL-005. Corrections supersede prior records without erasing them, so the state of qualification on any past date can be shown.

## Open items for counsel

- Retention period for supplier files and decisions (metadata table).
- Required insurance types and limits for research material suppliers (Section 4).
- Written allocation of dietary-supplement serious adverse event responsibilities between brand and reseller (Section 4).
- [CONFIG: whether evaluation purchases are permitted during the founding phase] (Section 5) and [CONFIG: requalification cadence] (Section 6).
- XR-FUL-016 (Supplier Qualification Questionnaire) is being drafted in the fulfillment-suppliers batch: reconcile its question set with the document requirements in Section 4 so the questionnaire collects exactly what this SOP requires.
- Confirm the minimum qualification bar for peptide and research material suppliers given that product classification lanes are under formal review: does counsel require additional supplier representations for that category before any purchase.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
