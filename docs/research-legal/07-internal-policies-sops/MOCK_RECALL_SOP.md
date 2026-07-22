# Mock Recall SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-025 |
| Title | Mock Recall SOP |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | Scheduled mock recall exercise per the configured cadence; also run after any material change to fulfillment ownership, inventory systems, or lot recording |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for mock recall protocols, results, and remediation records] |
| Acceptance event | n/a (internal SOP; adoption and fulfillment-partner participation recorded in the decision log and under the Recall and Product Concern Schedule) |
| Withdrawal supported | no (internal SOP, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-005, XR-POL-019, XR-POL-026, XR-COM-018, XR-FUL-004, XR-FUL-005, XR-FUL-008 |
| Sources | See 00-register/SOURCE_REGISTRY.md; Master pack 06 (Shipping, Storage, Shelf-Life, and Fulfillment Master) sections 12 to 14; FDA product recall guidance |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This SOP defines how Xenios rehearses a product recall before a real one is ever needed. A mock recall is a timed, documented exercise that proves Xenios can trace a lot to every affected order, trace an order back to its lot, stop sale and shipment, reconcile quantities, and prepare member notifications, without actually sending a notice or destroying product.

It covers every sellable product lane: peptide and research products, supplements, and any future approved lane. It covers both fulfillment owners under the split model: Mitch (fulfillment partner) for peptide and Quantum inventory during approximately the first 60 days, and Xenios for supplements. This SOP governs the rehearsal only. A real recall follows the recall procedure in the Recall and Product Concern Schedule (XR-FUL-008) and the member-facing Recall Notification Terms (XR-COM-018).

## 2. Roles

- Recall Coordinator: Samuel Boadu. Initiates the exercise, times it, signs the findings, and owns remediation.
- Fulfillment partner: Mitch participates whenever the selected lot sits in partner-held inventory. Partner participation obligations sit in the Quality Agreement (XR-FUL-004) and the Inventory and Lot Reporting Schedule (XR-FUL-005).
- Infinity (internal tooling): tracks the exercise deadline, records elapsed times, and alerts Samuel to overdue steps. In a real recall Infinity alerts Samuel immediately when a recall is opened.

## 3. Cadence

- Run a mock recall at least [CONFIG: mock recall cadence, recommended at least every 6 months during the founding phase].
- Run an additional exercise within [CONFIG: window, recommended 30 days] after any of: a change of fulfillment owner, a new warehouse or storage location, a new inventory or order system, or a real recall or product concern that exposed a trace gap.
- Alternate scope so that, across a rolling year, exercises have covered at least: one partner-fulfilled peptide lot, one Xenios-fulfilled supplement lot, and one order that split into multiple fulfillment orders.

## 4. Scope selection

For each exercise the Recall Coordinator selects one shipped lot, chosen either at random or risk-weighted toward temperature-sensitive or high-volume SKUs. Do not announce the selected lot to the fulfillment partner before the clock starts; the exercise measures real retrieval, not prepared answers. Record the selection basis.

## 5. Exercise procedure

### 5.1 Initiation and timing

Open a mock recall record with a unique exercise ID, the selected lot, the start timestamp, and the participants. Start the clock. Target completion for the full trace is [CONFIG: trace target, recommended 4 elapsed hours]. Infinity monitors the clock.

### 5.2 Forward trace (lot to orders)

From the selected lot, identify every affected order and, for each: fulfillment owner, quantity shipped, packer, carrier, tracking number, ship date, and destination. This mirrors the traceability requirement in Master pack 06 section 13.

### 5.3 Backward trace (order to lot)

Select one affected order and trace it back to lot, receiving record, and expiry or retest date, using the lot records maintained under the FEFO and Expiry Management SOP (XR-POL-019).

### 5.4 Quantity reconciliation

Reconcile the lot: quantity received must equal quantity shipped plus quantity on hand plus quantity quarantined, destroyed, or otherwise dispositioned. Any unexplained variance is a finding.

### 5.5 Stop-sale and stop-shipment simulation

Verify, without changing live member-facing state where avoidable, that the systems can: set the affected SKU to a blocked state, place remaining lot inventory into the recalled or quarantined inventory state, and block picking of that lot. If a live state change is used, restore it and record the restoration. Confirm the block list in XR-POL-019 section on blocked stock would have caught the lot.

### 5.6 Notification dry run

Draft, but do not send, the member notification using the Recall Notification Terms (XR-COM-018) as the template source. Verify that current contact details (email, and Telegram link state where connected) exist for every affected member. Verify the response-tracking fields (notified, responded, resolved) can be populated. No real member communication is sent during a mock recall.

### 5.7 Close

Stop the clock. Record elapsed time per step and end-to-end.

## 6. Pass criteria

- Forward and backward traces complete within the configured target.
- 100 percent of affected orders identified with fulfillment owner, tracking, and destination.
- Quantity reconciliation balances with zero unexplained units.
- Stop-sale and stop-shipment controls demonstrably work.
- A complete, accurate draft notification could have been sent to every affected member.

## 7. Gap findings and remediation

Every miss against the pass criteria is logged as a finding with: description, root cause, severity, owner, and due date. Remediation is verified in the next exercise, or sooner for severe findings. A severe finding (for example, an untraceable lot or a member who could not be notified) triggers an immediate corrective plan and, at Samuel's discretion, an out-of-cycle re-exercise. Findings that reveal a live product risk exit this SOP and follow the real recall and incident paths (XR-FUL-008, and the Incident Response Plan where data or systems are involved).

## 8. Records

Retain for each exercise: the protocol as run, the exercise record, elapsed times, reconciliation worksheet, the unsent draft notice, findings, and remediation evidence, under the retention schedule (XR-POL-005). These records are internal and are not member-facing.

## Open items for counsel

- [CONFIG: mock recall cadence] and [CONFIG: trace target hours]: confirm the operational values and whether any regulator, insurer, or supplier agreement dictates a minimum cadence.
- [CONFIG: window after material change] for the triggered re-exercise.
- [COUNSEL: confirm retention period for mock recall records under XR-POL-005.]
- [COUNSEL: confirm whether mock recall obligations for the fulfillment partner are adequately covered in XR-FUL-004 and XR-FUL-008, or need an explicit clause.]
- [COUNSEL: confirm whether any product lane, once classified, carries a mandatory recall-readiness or reporting standard that this SOP must reference explicitly.]

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
