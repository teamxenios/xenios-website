# Refund and Replacement SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-026 |
| Title | Refund and Replacement SOP |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | A member submits a damage, loss, incorrect item, missing item, or temperature concern claim; or a refund or replacement is otherwise proposed internally |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for claim, resolution, refund, and disposition records] |
| Acceptance event | n/a (internal SOP; adoption recorded in the decision log) |
| Withdrawal supported | no (internal SOP, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-005, XR-POL-019, XR-POL-025, XR-POL-027, XR-POL-028, XR-COM-007, XR-COM-008, XR-COM-009, XR-FUL-007, XR-FUL-008, XR-FUL-013 |
| Sources | See 00-register/SOURCE_REGISTRY.md; Master pack 06 (Shipping, Storage, Shelf-Life, and Fulfillment Master) sections 10, 15, 16, 18 |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This SOP tells internal reviewers how to handle a verified claim of damage, loss, incorrect item, missing item, or temperature compromise, from evidence intake through resolution, payment mechanics, product disposition, and records. It implements the member-facing Refund and Replacement Policy (XR-COM-009), the Damage, Loss, Incorrect Item, and Temperature Concern Policy (XR-COM-008), and the No Ordinary Returns Policy (XR-COM-007).

Baseline rules this SOP never overrides: Xenios does not accept ordinary returns (no opened returns and no routine unopened returns, for product integrity and chain of custody). Verified claims may receive a full replacement, a full refund, or a partial replacement or refund where appropriate. Affected product is never restocked. All outcomes are subject to applicable law, and the final policy requires counsel, processor, insurer, and fulfillment review.

## 2. Claim intake

A claim record is opened when a member submits, through the member account or support channel:

- order number and affected item,
- issue type (damage, loss, incorrect item, missing item, temperature concern),
- delivery date,
- photos of the product and the packaging,
- the temperature indicator reading when the shipment carried one.

Telegram may carry the conversation, but Telegram is never the system of record: the claim, evidence, and resolution live in the claim record. Do not ask the member to ship the product back as a routine step; retrieval happens only if the disposition decision requires it and is arranged by Xenios.

## 3. Evidence review

The reviewer verifies, in order:

1. Order match: the order, item, quantity, and delivery date match system records.
2. Carrier data: tracking events, delivery scans, and any carrier damage or loss notation. For loss claims, confirm the tracking state supports non-delivery.
3. Fulfillment owner: identify whether Mitch (peptides and Quantum) or Xenios (supplements) fulfilled the affected item, and pull the lot and packer from the fulfillment record. Responsibility between Xenios and the partner follows the Chargeback, Refund, and Replacement Responsibility Matrix (XR-FUL-013).
4. Photos: consistent with the claimed issue, correct product and label, no signs of substitution.
5. Temperature concern only: the reviewer does not judge product quality. Support cannot guess. The evidence (indicator reading, transit time, weather lane, packout used) goes to the quality decision owner defined in the SKU master and the Temperature Control and Excursion Schedule (XR-FUL-007), who evaluates against approved stability data and records release-or-destroy reasoning for the remaining lot stock where relevant.
6. Fraud screen: check for repeat claims, claim velocity, resale signals, or referral-fraud overlap. Suspicious claims route to the Fraud Prevention SOP (XR-POL-028) before resolution.

## 4. Resolution options

- Full replacement of the affected item, shipped at no charge.
- Full refund of the affected item, including its allocated shipping charge where the whole order failed.
- Partial replacement or partial refund where only part of the order is affected.
- Denial, with a plain-language reason, where the evidence does not verify the claim. Denials of temperature claims must cite the quality decision, not a support judgment.

Store credit may be offered as an option but the member may choose the refund path; store credit is never forced where a refund is due.

## 5. Resolution authority and thresholds

- Up to [CONFIG: internal reviewer resolution limit, per claim] : a trained internal reviewer may approve replacement or refund once evidence is verified.
- Above [CONFIG: internal reviewer resolution limit] , or any claim involving a temperature compromise, a suspected fraud signal, a repeat claimant, or a peptide product: Samuel approves personally.
- Samuel is the final internal authority on every contested or denied claim.
- No reviewer may resolve their own order or a claim from a person they referred.

## 6. Processor mechanics

- Refunds are issued only through the payment processor, to the original payment method. Never cash, never a peer-to-peer transfer, never a manual card entry.
- If a chargeback is already open on the transaction, do not issue a parallel refund. Handle the dispute through the processor's dispute flow and record the outcome; a refund after a lost dispute would pay twice.
- Replacements are created as zero-charge orders linked to the original order so lot traceability and shipping analytics stay intact.
- Partial refunds use the processor's partial refund mechanics against the original charge. Record the amount, the reason code, and the approver.
- [COUNSEL: confirm processor rules on refund timing windows and on refunds after settlement, and whether insurer notification is required above a loss threshold.]

## 7. Disposition of affected product

Affected product is never restocked, even if the package looks unopened. The reviewer sets the disposition:

- Member retains or discards: default for verified damage and temperature claims where retrieval adds no value; instruct safe disposal in plain language, with no dosing or administration commentary.
- Retrieve and quarantine: only when the quality decision owner, insurer, or a carrier claim requires physical evidence.
- Destruction: quarantined product is destroyed with a documented disposition record per Master pack 06 section 16 and the FEFO and Expiry Management SOP (XR-POL-019).

Where carrier fault is documented, file the carrier claim and record it; the member's resolution never waits on the carrier's payout.

## 8. Records and analytics

Each claim record retains: intake data, evidence, review notes, quality decision where applicable, resolution, approver, processor references, disposition, and carrier claim reference, under XR-POL-005. Monthly, roll claims into the shipping analytics review (damage rate, loss rate, temperature concerns, replacements, carrier claims) so packaging, carrier, and packout decisions improve. Recurring lot-linked claims escalate to the recall path (XR-FUL-008) and are an input to mock recall scope selection (XR-POL-025).

## 9. Timing

Target first substantive response to a claim within [CONFIG: claim response target, recommended 2 business days] and resolution within [CONFIG: claim resolution target] of complete evidence. Infinity tracks claim age and alerts Samuel to overdue claims.

## Open items for counsel

- [CONFIG: internal reviewer resolution limit]: set the dollar threshold above which Samuel must approve personally.
- [CONFIG: claim response target] and [CONFIG: claim resolution target].
- [COUNSEL: confirm refund and replacement outcomes against state consumer protection law, and where state law requires a refund this SOP does not contemplate.]
- [COUNSEL: confirm processor refund and dispute mechanics, and insurer notification thresholds.]
- [COUNSEL: confirm retention period for claim and disposition records under XR-POL-005.]
- [COUNSEL: reconcile this SOP with XR-COM-008, XR-COM-009, and XR-FUL-013 so authority and responsibility splits match across all four documents.]

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
