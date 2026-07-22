# Complaint Handling SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-021 |
| Title | Complaint Handling SOP |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | Adoption at program launch; invoked whenever an inbound message is triaged as a quality complaint rather than a support question |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for product complaint and CAPA records] |
| Acceptance event | n/a (internal SOP; adoption recorded in the decision log) |
| Withdrawal supported | no (internal SOP, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-005, XR-POL-019, XR-POL-020, XR-POL-022, XR-POL-024, XR-COM-008, XR-COM-009, XR-COM-019, XR-MEM-023, XR-FUL-004 |
| Sources | See 00-register/SOURCE_REGISTRY.md; Master pack 06 sections 13, 15, 18 (traceability, member issue intake, analytics); Master pack 07 sections T and U (Quality; adverse events and product concerns) |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This SOP states how Xenios Research takes in, records, investigates, resolves, and learns from quality complaints about its products. A quality complaint is any report that a product may be defective, compromised, mislabeled, contaminated, incorrect, or otherwise not what it should be. This SOP covers the peptide and research SKUs and, once authorized for sale, supplements. It is one lane of the six-way separation defined in the Adverse Event SOP (XR-POL-022): support question, quality complaint, product concern, possible adverse event, serious adverse event, emergency. This SOP owns the quality complaint lane and hands off the others.

## 2. Quality complaints are not support questions

1. A support question is about the service: an order status, a plan, an account, a shipping estimate. It is answered by support in the normal flow (Telegram, target response approximately 12 hours).
2. A quality complaint is about the product itself. It gets a complaint record, an investigation, and a documented outcome. It is never closed by a chat reply alone.
3. Triage happens at first contact. Whoever reads the message first (support staff or Infinity, the internal operations system) classifies it. When in doubt between support question and quality complaint, classify as a quality complaint. When any health effect is described, route under XR-POL-022 instead, immediately.
4. Misclassification is corrected without penalty; the record keeps both the original and corrected classification so triage quality can be reviewed.

## 3. Intake

1. Channels: Telegram (text or 60-second voice), email to research@xeniostechnology.com, and the member-facing product concern instructions (XR-COM-019). Telegram is never the system of record: the complaint record lives in the platform database, and members are never asked to send plan PDFs, ID documents, payment data, or raw health media over Telegram.
2. Every complaint record captures at intake: complaint identifier; date and time received; channel; the member reference; the product and SKU; the lot identifier (from the order record if the member cannot read the label); the order and the specific fulfillment shipment (one member order may be multiple fulfillment orders and tracking numbers under split fulfillment); the complaint description in the member's own words; photos of product, label, and packaging where offered; and the delivery date.
3. Linkage is mandatory: product, lot, order, and shipment are linked on the record before investigation starts. If the lot cannot be established, the investigation widens to all lots that could have filled that order line, using the pick-time lot assignment records from XR-POL-019.
4. Intake acknowledgment to the member is factual: the complaint is recorded, what happens next, and the resolution options under XR-COM-008 and XR-COM-009. No quality opinions, no medical advice, no safety reassurance.

## 4. Investigation

1. Owner: Samuel Boadu, Founder, is the complaint decision owner during the founding phase. Support staff gather facts; they do not decide outcomes.
2. Steps, scaled to the complaint's seriousness:
   - Review the lot record: expiry or retest status, storage history, transport, any excursions (XR-POL-020), receiving checks, and the COA where one exists.
   - Review the shipment: fulfillment owner, packer, packout used, carrier, transit time, and season.
   - Check for siblings: other complaints on the same lot, SKU, packout, or lane.
   - Quarantine when indicated: if the complaint plausibly indicates a lot-level defect, the remaining stock of that lot moves to `quarantined` (a blocked state under XR-POL-019) pending the outcome.
   - Notify the supplier or fulfillment partner where the facts implicate them, under the Quality Agreement (XR-FUL-004), and request their investigation input.
3. Every investigation ends in a documented finding: confirmed, not confirmed, or indeterminate, with the evidence relied on. Indeterminate findings on a safety-relevant attribute are treated conservatively (quarantine stands, product is not released).

## 5. Resolution

1. Member remedies follow XR-COM-008 and the Refund and Replacement Policy (XR-COM-009): full replacement, full refund, or a partial remedy where appropriate, for verified damage, loss, incorrect item, missing item, or temperature compromise. There are no ordinary returns; complained-of product is never restocked, and any requested return is for documentation and destruction only.
2. The closing message to the member states the resolution and, where a return or disposal is needed, the exact instructions. It does not state investigation conclusions about safety, and it never includes medical advice.
3. The complaint record closes only when: the finding is documented, the remedy is delivered, any supplier notification is sent, and any CAPA decision (section 6) is made.

## 6. CAPA

1. CAPA (corrective and preventive action) is the documented fix for the cause, not the symptom. A CAPA is opened when a complaint is confirmed and the cause could recur: a packout weakness, a supplier defect, a labeling error, a picking error, a carrier lane problem.
2. A CAPA record carries: the triggering complaint identifiers, the cause analysis, the corrective action (fixing this occurrence), the preventive action (stopping recurrence), the owner, the due date, and the verification that the action worked.
3. CAPA outcomes that change validated configurations (for example a packout change) route back through the relevant validation before use.

## 7. Escalation triggers

1. Any complaint describing a health effect, however minor, is routed under the Adverse Event SOP (XR-POL-022) at once. The complaint record stays open and links to the adverse event record.
2. Any complaint indicating a lot-level defect that has already shipped to other members triggers lot traceability (from the lot, identify every affected order) and a recall evaluation under the Recall SOP (XR-POL-024). Infinity alerts Samuel immediately.
3. Emergencies described in any inbound message route to emergency services (911 in the US) per the standing support boundary; no complaint workflow delays that.

## 8. Trend review

1. Monthly, complaints are reviewed in aggregate alongside the shipping analytics: counts by SKU, lot, complaint type, fulfillment owner, carrier, lane, and season; damage, loss, and temperature-concern rates; replacement and refund volumes.
2. The review looks for signals a single complaint cannot show: a lot with multiple independent complaints, a packout that fails in summer, a carrier lane with repeated damage. Signals feed CAPAs, supplier discussions under XR-FUL-004, and, where warranted, the recall evaluation in XR-POL-024.
3. The trend review is documented, with decisions and owners, and retained per XR-POL-005.

## Open items for counsel

- [COUNSEL: confirm the minimum retention period for product complaint and CAPA records in XR-POL-005, per product lane.]
- [COUNSEL: confirm which complaint-handling and recordkeeping duties formally attach to Xenios per product lane once the classification memoranda conclude (research SKUs versus dietary supplements), including whether supplement complaint records must follow a specific federal standard.]
- [COUNSEL: review the allocation of complaint investigation duties between Xenios and suppliers or the fulfillment partner in XR-FUL-004 for consistency with this SOP.]
- [COUNSEL: confirm the member-facing closing-message rules in section 5 against consumer protection requirements.]
- Overlap: the worktree contains earlier drafts under docs/compliance/ (including CONSENT_REGISTRY.md) and docs/risk/. Counsel to reconcile any overlapping complaint or vendor duties there with this SOP.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
