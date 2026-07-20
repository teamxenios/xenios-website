# Recall SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-024 |
| Title | Recall SOP |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | Adoption before any product commerce; invoked when a recall is opened by the recall owner from any trigger in section 3 |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for recall records, understood to be a multi-year minimum] |
| Acceptance event | n/a (internal SOP; adoption recorded in the decision log; fulfillment-partner duties acknowledged under XR-FUL-008) |
| Withdrawal supported | no (internal SOP, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-005, XR-POL-019, XR-POL-020, XR-POL-021, XR-POL-022, XR-POL-023, XR-COM-018, XR-FUL-005, XR-FUL-008 |
| Sources | See 00-register/SOURCE_REGISTRY.md; Master pack 06 sections 12 to 16 (inventory states, lot traceability, recall, member issues, destruction); Master pack 07 sections T and U; FDA recall guidance for industry |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This SOP states how Xenios Research executes a product recall: pulling a defective or potentially harmful lot out of sale, out of transit where possible, and out of members' hands, with evidence at every step. It covers every physical product Xenios sells, across both fulfillment owners during split fulfillment (Mitch for peptide and Quantum inventory during approximately the first 60 days, Xenios for supplements). The member-facing counterpart is the Recall Notification Terms (XR-COM-018); the partner-facing counterpart is the Recall and Product Concern Schedule (XR-FUL-008).

## 2. The canon flow

Every recall runs the same fixed sequence. No step is skipped, and each step produces a record.

```text
recall opened
-> stop sale
-> stop shipment
-> identify lots
-> identify members
-> notify
-> track response
-> reconcile
-> close
```

## 3. Triggers and opening

1. A recall evaluation opens from any of: a supplier or manufacturer recall notice; a regulator notice or request; an internal quality finding (receiving, stability, excursion evaluation under XR-POL-020); a confirmed complaint or complaint cluster (XR-POL-021); an adverse event or serious adverse event pattern (XR-POL-022, XR-POL-023); or a fulfillment partner report under XR-FUL-008.
2. Infinity (the internal operations system) alerts Samuel Boadu immediately when any trigger fires. Samuel is the recall owner and the named accountable human; only the recall owner opens or closes a recall.
3. Opening creates the recall record: recall identifier, date and time opened, trigger and evidence, products and lots in scope (scope may widen during the recall, never silently narrow), and the working risk statement.
4. [COUNSEL: define when a regulator must be notified that a recall is underway, per product lane, and whether a formal recall classification framework applies to each lane. Xenios does not self-assign a regulatory classification without counsel.]
5. Counsel is engaged at opening for any recall involving a possible health risk.

## 4. Stop sale

1. Every in-scope lot moves to `recalled`, a blocked inventory state under XR-POL-019. The block is system-enforced: recalled stock cannot be picked, allocated, or counted available.
2. The storefront removes or disables purchase of in-scope SKUs where the defect is SKU-wide, or continues sale only from clean lots where the defect is lot-specific and the quality decision owner documents that boundary.
3. Product subscriptions with an in-scope SKU are paused for the affected item so no new charge or shipment fires during the recall. Waitlist notifications for the SKU are suspended.

## 5. Stop shipment

1. Both fulfillment owners halt all unshipped orders containing in-scope lots at once: allocated, picked, and packed units are pulled back and re-marked `recalled`. The partner's duty and its clock are set in XR-FUL-008.
2. For orders already with the carrier, Xenios attempts interception or return-to-sender where the carrier supports it, and records the attempt and outcome per shipment.
3. Nothing stopped at this step re-enters inventory except through the reconcile step with a documented disposition.

## 6. Identify lots

1. The lot boundary is established from lot records (XR-POL-019), receiving records, supplier data, and the trigger evidence: which lots, produced or received when, held where, in what quantities.
2. Traceability must run in both directions, and this is the step that proves it: from any order, identify the fulfillment owner, lot, quantity, packer, carrier, tracking number, ship date, and destination; from any lot, identify every affected order. The pick-time lot assignment required by XR-POL-019 is what makes this possible.
3. Inventory on hand at both owners is physically counted for the in-scope lots and compared to system quantities; discrepancies are logged and chased, not ignored.

## 7. Identify members

1. From the lot-to-order traceability, Xenios lists every member who received, or was shipped, any in-scope unit: member reference, order, shipment, quantity, delivery status.
2. The list is complete before notification starts, and additions (from scope widening) trigger the same notification path immediately.
3. Member identities and health-adjacent inferences from the list are handled as sensitive data: access is limited to the recall owner and those executing notification, and none of it goes to advertising platforms or to the fulfillment partner beyond what shipping-level execution requires.

## 8. Notify

1. Members are notified per the Recall Notification Terms (XR-COM-018): by email from research@xeniostechnology.com and by member portal notice. Telegram may carry a pointer to the notice but is never the system of record and never carries the full detail.
2. The notice states, in plain language: what product and lots are affected, how to identify them (label, lot number, order history), what the concern is, what to do now (stop use; and either destroy per instructions or hold for return for documentation and destruction), and the remedy: full replacement or full refund. Recalled product is never restocked.
3. The notice contains no medical advice. It directs anyone with a health concern to their own licensed healthcare provider and emergencies to 911. If a member reports a health effect in response, that message is routed under XR-POL-022 or XR-POL-023.
4. Suppliers and the fulfillment partner are notified per XR-FUL-008. [COUNSEL: define regulator notification content and timing per lane, and whether public notice beyond direct member notice is ever required for this member-only program.]
5. Notification wording for any recall involving a possible health risk is reviewed by counsel before sending, within the urgency the risk allows.

## 9. Track response

1. Every notified member gets a per-member response state: notified (with channel and timestamp), delivery confirmed or bounced, responded, remedy chosen, product confirmed destroyed or returned, remedy delivered.
2. Bounced or unanswered notifications get documented retries on a schedule set in the recall record ([CONFIG: retry cadence and attempt count]), switching channels where available.
3. Effectiveness is measured: percentage of affected units accounted for. The recall owner sets the target and decides, with counsel where a regulator is involved, when response tracking may stop.

## 10. Reconcile

1. The recall record reconciles the arithmetic: units received into inventory, units on hand and blocked, units stopped pre-shipment, units intercepted, units in members' hands, units confirmed destroyed, units returned, units unaccounted for.
2. Returned and recovered units are destroyed under documented disposition (XR-POL-019 destruction rules): never restocked, never resold, no matter how the package looks.
3. Unaccounted units are listed with the attempts made; the closure decision must address them explicitly.

## 11. Close

1. The recall owner closes the recall only when: notification and response tracking are complete to the documented standard, reconciliation balances or its gaps are dispositioned, remedies are delivered, destruction is documented, and any regulator interaction is concluded on counsel's advice.
2. Closure produces a closure report: timeline, scope, effectiveness numbers, root cause as best established, and the CAPA (opened under XR-POL-021) that addresses the cause.
3. All recall records are retained per XR-POL-005 and survive membership cancellations.

## 12. Readiness

1. Before production commerce, a mock recall runs end to end on synthetic orders: pick a lot, trace to orders both directions, generate the member list, draft the notice, and reconcile. The launch acceptance tests in Master pack 06 include lot assignment and tracking for this reason.
2. The mock recall repeats [CONFIG: cadence, initial annually] and after any material change to fulfillment structure, such as the end of the split-fulfillment period.

## Open items for counsel

- [COUNSEL: regulator notification duties, timing, and any formal recall classification framework per product lane; whether Xenios ever self-executes a "market withdrawal" versus a recall, and who decides.]
- [COUNSEL: review the member notice template against XR-COM-018 and applicable consumer protection law; confirm whether public notice beyond direct member notice can ever be required.]
- [COUNSEL: confirm recall record retention period in XR-POL-005.]
- [COUNSEL: confirm the allocation of recall execution duties and cost between Xenios and the fulfillment partner in XR-FUL-008, including the stop-shipment clock and recovered-product custody.]
- [CONFIG: notification retry cadence and attempt count; mock recall cadence.]
- Overlap: XR-COM-018 (Recall Notification Terms) is the member-facing counterpart; counsel to reconcile so the member terms and this SOP describe the identical flow.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
