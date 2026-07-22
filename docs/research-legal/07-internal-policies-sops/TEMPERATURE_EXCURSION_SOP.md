# Temperature Excursion SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-020 |
| Title | Temperature Excursion SOP |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | Adoption before the first temperature-sensitive lot is received; invoked whenever a temperature excursion is detected or reported at receiving, in storage, in transit, or by a member |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for excursion, evaluation, and destruction records] |
| Acceptance event | n/a (internal SOP; adoption and fulfillment-partner acknowledgment recorded in the decision log and under the Quality Agreement) |
| Withdrawal supported | no (internal SOP, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-005, XR-POL-019, XR-POL-021, XR-COM-006, XR-COM-008, XR-COM-009, XR-FUL-004, XR-FUL-007 |
| Sources | See 00-register/SOURCE_REGISTRY.md; Master pack 06 sections 6, 10, 11 (shipping profiles, temperature and excursion, packout validation); Master pack 07 section T (Quality) |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This SOP states what happens when a temperature-sensitive product leaves its defined temperature range. It applies to every SKU whose shipping profile is controlled, refrigerated, or frozen, at every point Xenios or its fulfillment partner controls: receiving, storage, packout, and transit. It also covers member-reported temperature concerns after delivery. The goal is a single deterministic path: quarantine, record, evaluate against approved stability data, then release or destroy. Nobody guesses, and support never improvises a quality answer.

## 2. Definitions

1. Excursion: any period during which a unit or lot is outside its labeled storage range or defined transport range, including a freeze event for a freeze-sensitive product.
2. Labeled storage range: the temperature range on the product label or in the supplier quality documentation.
3. Transport range: the range permitted during shipment, defined per SKU in the SKU master.
4. Approved stability data: manufacturer or supplier documentation, a stability study, or an approved quality determination that states what temperature stress the product tolerates and for how long.
5. Quality decision owner: the named human who decides release or destroy. During the founding phase this is Samuel Boadu, Founder.

## 3. Prerequisites in the SKU master

No temperature-sensitive SKU is sellable until its SKU master record defines all of the following. A shipping profile is never inferred from the product name.

1. Labeled storage range.
2. Transport range.
3. Maximum allowable excursion (magnitude and duration), sourced from approved stability data, or an explicit statement that no excursion allowance exists.
4. Freeze sensitivity, heat sensitivity, and light sensitivity.
5. Required temperature monitor or indicator, if any.
6. Seasonal packout requirements, validated under the packout validation program (summer and winter protocols, coolant, insulation, payload, transit time, worst-case delay, with retained temperature curves and an approved configuration).
7. The quality decision owner.

Temperature-Controlled shipping is offered to members only for validated services, consistent with XR-COM-006.

## 4. Detection channels

An excursion can surface through any of these channels, and every channel leads into the same flow in section 5:

1. Receiving: inspection of inbound lots, including any shipper indicator or data logger.
2. Storage: monitoring at the storage location of either fulfillment owner (Mitch for peptide and Quantum inventory during the split-fulfillment period, Xenios for supplements). Partner duties are set in the Temperature Control and Excursion Schedule (XR-FUL-007).
3. Transit: a tripped indicator, a data logger readout, or a carrier delay beyond the validated packout's worst-case transit assumption.
4. Member report: a member reports a temperature concern after delivery through the Damage, Loss, Incorrect Item, and Temperature Concern process (XR-COM-008), including photos and the indicator state when one is present.

## 5. The excursion flow

The flow is fixed: quarantine, record, evaluate, then release or destroy.

1. Quarantine. The affected units or lots move immediately to `excursion pending` (a blocked state under XR-POL-019). They cannot be picked, shipped, sold, or counted as available. For a member report, the affected order lines are flagged and any related unshipped stock from the same lot is quarantined pending evaluation.
2. Record. The excursion record captures: SKU and lot, quantity affected, location and custody at the time, the temperature reached and duration (as best documented), the detection channel, indicator or logger evidence, and who recorded it. The lot record under XR-POL-019 is updated. Infinity (the internal operations system) alerts Samuel.
3. Evaluate. The quality decision owner compares the documented excursion against approved stability data for that SKU and lot. If the data covers the excursion (magnitude and duration within the documented allowance), the product may be released. If the data does not cover it, or no approved stability data exists for the condition, the product is not released. Missing data is a destroy or hold outcome, never a release. A hold is only used while requesting specific supplier stability documentation, with a due date.
4. Release or destroy. The decision, its basis (the specific stability document relied on), the decision owner, and the date are recorded. Released stock returns to `available` and re-enters FEFO. Destroyed stock follows a documented destruction disposition and is never restocked. There is no third outcome, and no unit ships while `excursion pending`.

## 6. Support never guesses

1. Customer support has no authority to evaluate an excursion, reassure a member that a product is fine, or advise use, storage recovery, or disposal beyond the label. Support may not speculate about product quality in any channel, including Telegram.
2. The only support actions for a temperature concern are: acknowledge, collect the intake facts required by XR-COM-008 (order, item, issue, delivery date, photos, packaging, indicator state), quarantine-flag the order, and route to the quality decision owner.
3. No medical advice, no dosing direction, and no safety assurance is ever given. If a member describes a possible health event connected to the product, the message is routed under the Adverse Event SOP (XR-POL-022) immediately, and emergencies are directed to emergency services (911 in the US).

## 7. Customer-facing communication rules

1. Members receive factual status, not quality opinions: the concern is recorded, the product decision is being evaluated, and the resolution options are those in XR-COM-008 and the Refund and Replacement Policy (XR-COM-009): full replacement or full refund for a verified temperature compromise, partial remedies where appropriate.
2. A member is never asked to return a temperature-compromised product to sellable inventory; where a return is requested for evaluation or disposal, it is for documentation and destruction only.
3. Communications never state that an excursion was "harmless" or that the product is "safe". If the evaluation releases a lot, the member communication states that the product met its documented stability criteria, nothing more.
4. If the evaluation results in destruction of a lot with other affected shipped orders, the affected members are identified through lot traceability and handled under XR-COM-008; if the finding indicates a wider defect, the Recall SOP (XR-POL-024) is invoked.

## 8. Records and trend review

1. Every excursion, evaluation, decision, and destruction is retained per XR-POL-005, with the evidence (indicator photos, logger data, stability document relied on) attached.
2. Monthly shipping analytics include temperature concerns by SKU, lane, season, and carrier. A repeating pattern (same lane, same packout, same carrier) triggers a review of the packout validation and, where warranted, a CAPA under the Complaint Handling SOP (XR-POL-021).

## Open items for counsel

- [COUNSEL: confirm the minimum retention period for excursion, evaluation, and destruction records in XR-POL-005.]
- [COUNSEL: confirm any regulatory notification duties triggered by an excursion-related destruction or a released-after-excursion decision, per product lane, once product classification review concludes.]
- [COUNSEL: review the customer-facing communication rules in section 7 for consistency with consumer protection law, including what may be said about a released lot.]
- [COUNSEL: confirm the allocation of excursion evaluation authority between Xenios and the fulfillment partner in XR-FUL-004 and XR-FUL-007 matches this SOP (Xenios's quality decision owner decides; the partner detects, quarantines, and reports).]
- Overlap: the worktree contains an earlier draft at docs/risk/VENDOR_RISK_STANDARD.md. Counsel to reconcile partner monitoring duties there with XR-FUL-007 and this SOP.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
