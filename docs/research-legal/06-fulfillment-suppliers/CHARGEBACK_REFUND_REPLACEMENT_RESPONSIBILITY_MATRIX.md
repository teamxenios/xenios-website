# Chargeback, Refund, and Replacement Responsibility Matrix

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-FUL-013 |
| Title | Chargeback, Refund, and Replacement Responsibility Matrix |
| Audience | fulfillment_partner |
| Required member state | n/a (partner agreement) |
| Trigger | Partner onboarding. Must be executed with the Master Fulfillment Agreement (XR-FUL-001) before the first fulfillment order, since it allocates the cost of every failed order. |
| Route | offline agreement |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for claim, chargeback, and evidence records] |
| Acceptance event | Wet or electronic signature by an authorized representative of each party; executed copy retained by both parties. |
| Withdrawal supported | No. Allocations change only by written amendment; the relationship ends through XR-FUL-001 and XR-FUL-014. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-FUL-001, XR-FUL-004, XR-FUL-006, XR-FUL-009, XR-FUL-011, XR-FUL-012, XR-FUL-014, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. Purpose

This Matrix is part of the Master Fulfillment Agreement (XR-FUL-001) between [ENTITY] ("Xenios") and [ENTITY] ("Mitch"). When an order fails (wrong item, lost package, temperature failure, defect, fraud, or a payment dispute), two questions arise: what does the member receive, and who bears the cost between Xenios and Mitch. This Matrix answers the second question. Every allocation in Section 4 is a proposal pending negotiation, and none is agreed until counsel-approved language is executed. [COUNSEL: negotiate and confirm every allocation in this document.]

## 2. Fixed principles (not negotiable in this Matrix)

1. Xenios alone decides the member remedy. Member-facing outcomes follow Xenios's published policies: no ordinary returns; verified damage, loss, incorrect item, missing item, or temperature compromise may receive full replacement or full refund. Mitch never promises a member anything.
2. Returned or compromised product is never restocked, whoever pays for it. Disposition follows the Quality Agreement (XR-FUL-004) destruction and quarantine rules.
3. Allocation between the parties never delays the member remedy. Xenios makes the member whole first; the parties settle between themselves through the monthly invoice (XR-FUL-012).
4. Consumer rights are always subject to applicable law. This Matrix allocates costs between the parties; it does not limit any member right.
5. Safety events (potential adverse event, contamination, counterfeit concern, recall) are handled under the Quality Agreement and prompt-notification duties first; cost allocation comes second.

## 3. Evidence standard

Each claimed failure is classified using records both parties already generate: the order API record (accepted, lot, tracking, ship time), the daily inventory and lot feed (XR-FUL-005), carrier scans and claim outcomes, temperature indicator or logger data for validated packouts (XR-FUL-006), member-submitted photos collected by Xenios, and quality records (XR-FUL-004). The party asserting a cause outside its own responsibility provides the supporting records. Disputed classifications go through the settlement dispute process in XR-FUL-012 Section 5.

## 4. Responsibility matrix

"Cost" in this table means, as applicable: the product cost of the replacement or the refunded amount, replacement shipping and packaging, and carrier claim handling. All cost-owner entries are proposals pending negotiation. [COUNSEL: confirm each row.]

| Failure cause | Definition and typical evidence | Member remedy (Xenios decides) | Proposed cost owner | Notes |
| --- | --- | --- | --- | --- |
| Fulfillment error | Wrong item, wrong quantity, missing item, wrong address applied by Mitch (differs from order data), missed lot rule or FEFO rule, missed handling instruction. Evidence: order API record versus what shipped. | Replacement or full refund | Mitch [COUNSEL] | Includes reshipping cost. If the address was wrong in Xenios's order data, the row shifts to Xenios [COUNSEL]. |
| Carrier loss | Package never delivered or lost in transit on a conforming shipment. Evidence: tracking, carrier claim. | Replacement or full refund | Carrier claim first; residual to [COUNSEL: propose Xenios if Mitch shipped conforming and filed the claim on time; Mitch if claim rights were lost through late filing or bad documentation] | Mitch files and pursues carrier claims for shipments it tendered; cargo coverage (XR-FUL-011) may respond. |
| Temperature failure | Excursion or spoilage on a temperature-controlled shipment. Evidence: indicator or logger data, packout records, transit time versus validated maximum. | Replacement or full refund | Mitch if the packout deviated from the validated configuration or was represented as temperature-controlled without validation data; [COUNSEL: allocate where the validated packout was followed and transit ran long, among Mitch, carrier claim, and Xenios] | The pack rule is absolute: Mitch must never tell Xenios a shipment is temperature-controlled without validation data. Unvalidated representation shifts the full cost to Mitch [COUNSEL]. |
| Quality defect | Inherent product defect: manufacturing, composition, contamination at origin, incorrect label from the supplier. Evidence: COA, lot records, complaint and CAPA record. | Replacement or full refund; possible lot action | Upstream supplier recovery first; residual allocation [COUNSEL: depends on the ownership model chosen in XR-FUL-012 Section 2.1 and supplier terms in XR-FUL-002] | Never restocked. May trigger recall duties and recall coverage (XR-FUL-011). |
| Member fraud | False non-delivery or false damage claim by the member. Evidence: delivery scan, signature where used, photo review, order history, risk signals. | Per Xenios policy and applicable law; Xenios may refuse the claim | Xenios [COUNSEL] | Member relationship risk belongs to Xenios (it owns members, payment, and support). Mitch cooperates with evidence. Large-order review (authorize, review, capture) is Xenios's fraud control. |
| Processor chargeback | Cardholder dispute through the payment processor, any reason code. Evidence: processor case file, delivery evidence, acceptance records. | n/a (processor process governs) | Xenios bears the chargeback and fees, except where the underlying cause is a row above, in which case the underlying row's owner bears the product and shipping cost while Xenios bears processor fees [COUNSEL] | Xenios owns the processor relationship. Mitch must supply tracking, lot, and delivery evidence within [CONFIG: evidence window, proposed 3 business days] of request; failure to supply usable evidence in time shifts the loss to Mitch [COUNSEL]. |

## 5. Process

1. Intake: Xenios receives the member claim or processor notice (members contact research@xeniostechnology.com; support routes are member-facing).
2. Classification: Xenios proposes a cause row within [CONFIG: classification window, proposed 5 business days], attaching evidence. Mitch may contest with evidence within [CONFIG: contest window, proposed 5 business days].
3. Remedy: Xenios executes the member remedy on its own timeline, independent of allocation.
4. Settlement: agreed allocations post as credits or charges on the next monthly invoice (XR-FUL-012 Section 4.3). Contested rows follow the XR-FUL-012 dispute process.
5. Trend review: repeated failures of one cause class (for example, recurring fulfillment errors or temperature failures) are a quality signal reviewed under the Master Fulfillment Agreement, and may justify SLA consequences or transition acceleration (XR-FUL-014). [COUNSEL: confirm thresholds.]

## 6. Relationship to other documents

Member-facing policies (the no-ordinary-returns policy, refund and replacement policy, and damage, loss, incorrect item, and temperature concern policy in docs/research-legal/04-commerce-product/) control what members see and receive; this Matrix only allocates cost between the parties and must never be quoted to members. Insurance and third-party claims follow XR-FUL-011. Quality and recall duties follow XR-FUL-004.

## Open items for counsel

- [COUNSEL: negotiate and confirm every cost-owner allocation in the Section 4 matrix; all are proposals pending negotiation.]
- [COUNSEL: confirm retention period for claim, chargeback, and evidence records (metadata table).]
- [COUNSEL: confirm the wrong-address split (Mitch-applied versus Xenios order data) in the fulfillment error row.]
- [COUNSEL: confirm carrier-loss residual allocation and the effect of lost claim rights.]
- [COUNSEL: allocate temperature failure where the validated packout was followed, and confirm full Mitch responsibility for unvalidated temperature representations.]
- [COUNSEL: allocate quality-defect residual cost pending the ownership model decision (XR-FUL-012 Section 2.1) and supplier terms (XR-FUL-002).]
- [COUNSEL: confirm member-fraud and processor-chargeback allocations, including the fee split and the evidence-window loss shift.]
- [CONFIG: evidence window (proposed 3 business days), classification window (proposed 5 business days), contest window (proposed 5 business days).]
- [COUNSEL: confirm trend-review thresholds that trigger SLA consequences or transition acceleration (Section 5).]
- Overlap: the member-facing REFUND_AND_REPLACEMENT_POLICY.md, NO_ORDINARY_RETURNS_POLICY.md, and DAMAGE_LOSS_INCORRECT_ITEM_TEMPERATURE_CONCERN_POLICY.md (docs/research-legal/04-commerce-product/) must stay consistent with the member-remedy column here; counsel to reconcile if any drift.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
