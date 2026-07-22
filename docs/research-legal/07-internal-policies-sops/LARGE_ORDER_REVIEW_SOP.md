# Large Order Review SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-027 |
| Title | Large Order Review SOP |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | An order meets a large-order trigger: total over $1,000, quantity inconsistent with ordinary individual use, or a fraud or risk rule fires |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for review decisions and authorization records] |
| Acceptance event | n/a (internal SOP; adoption recorded in the decision log; the member-facing disclosure and delayed-capture consent are XR-COM-010 and XR-COM-011) |
| Withdrawal supported | no (internal SOP, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-005, XR-POL-026, XR-POL-028, XR-COM-010, XR-COM-011, XR-COM-001 |
| Sources | See 00-register/SOURCE_REGISTRY.md; Master pack 01 (Final Canonical Master Product Spec) section 22; Master pack 06 sections 12 to 13 |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This SOP defines how Xenios reviews large or unusual orders before capture and shipment. The goals are, in order: keep members safe from quantity mistakes, keep Xenios safe from fraud and chargebacks, and keep every product inside its approved lane and eligible states. The member-facing version of these rules is the Large and Unusual Order Review Terms (XR-COM-010); the payment consent that authorizes delayed capture is XR-COM-011. This SOP is internal and controls what reviewers actually do.

## 2. Trigger rules

An order enters manual review when any of the following is true:

- order total exceeds $1,000 (launch value; [CONFIG: large-order dollar trigger, admin-configurable]),
- quantity of any SKU, or the mix of SKUs, is inconsistent with ordinary individual use (for example multiples of the same peptide SKU beyond a plausible personal quantity, or quantities suggesting resale),
- a fraud or risk rule fires (see the signal catalog in the Fraud Prevention SOP, XR-POL-028),
- the member's recent order velocity, combined across orders, crosses [CONFIG: velocity threshold], even if no single order crosses the dollar trigger.

Triggers are evaluated server-side at checkout. Reviewers cannot waive a trigger in advance, and no member-facing control exists to bypass review.

## 3. Payment handling: authorize, then capture

The recommended flow from the canon is: authorize the payment at checkout, hold capture, review, then capture only after approval.

- At checkout, the processor authorizes the full amount. No capture, no fulfillment release, and no inventory pick occurs until the review outcome is approve.
- Processor support for authorize-then-capture, the authorization hold window, and any reauthorization mechanics must be confirmed before this flow goes live. [COUNSEL: confirm with the processor the supported authorization window and the rules for capture after review; if unsupported, approve an alternative such as immediate capture with expedited refund on rejection, and reconcile XR-COM-011 accordingly.]
- If the authorization would expire before review completes, the reviewer either completes the review immediately or cancels and asks the member to reorder; silent reauthorization requires confirmed processor and consent support.

## 4. Review timing

- Target: approximately 2 hours from trigger to decision during staffed hours.
- Infinity monitors the deadline for every order in review and alerts Samuel as the deadline approaches and again when it lapses.
- Orders triggered outside staffed hours are queued and the clock is disclosed accordingly in the member communication; the target remains approximately 2 hours of staffed time. [CONFIG: staffed review hours.]

## 5. Reviewer checklist

Work the checklist in order and record an answer for every line:

1. Identity and account: account age, verified email and phone, identity verification state, any prior fraud flags or claim history.
2. Quantity plausibility: is the quantity consistent with ordinary individual use given the SKU, the member's order history, and any active subscriptions for the same product? Duplicated SKUs across recent orders count.
3. Fraud signals: billing and shipping mismatch, new payment method on a large first order, address or device anomalies, referral or commission attribution on the order (self-referral risk), and any signal from XR-POL-028.
4. State and lane eligibility: server-side lane controls confirm every SKU in the order is enabled, in stock, and eligible for the destination state per the jurisdiction matrix. An ineligible SKU fails the order regardless of payment quality.
5. Product state: no SKU in a blocked inventory state (expired, quarantined, recalled, documentation review) per the FEFO block rules.
6. Payment quality: AVS and CVV results and processor risk score, where available.

Resale suspicion is a lane problem, not just a fraud problem: Xenios has no wholesale program yet, and consumer orders that look like resale are declined and pointed to the future wholesale lane placeholder.

## 6. Outcomes

- Approve: capture the authorization, release fulfillment, record the decision.
- Request information: ask the member a specific question through the account or Telegram (never for payment data, passwords, or ID documents over Telegram). The clock pauses while waiting; Infinity tracks the pause.
- Modify with consent: offer the member a reduced quantity or a split; only the member can accept, and acceptance is recorded.
- Decline: cancel the order and release or void the authorization promptly. Give a neutral reason.
- Escalate: suspected fraud goes to XR-POL-028 investigation; the order stays uncaptured while investigated.

Decision authority: any trained reviewer may approve an order that passes every checklist line. Any decline, modification, resale suspicion, or checklist failure goes to Samuel. During the founding phase Samuel personally reviews every triggered order; the delegation threshold is [CONFIG: reviewer delegation threshold].

## 7. Member communication

- Tell the member promptly that the order is in a standard review, the expected timeframe, and that the card has been authorized but not charged (or the confirmed alternative wording per section 3).
- Use calm, neutral language. Never disclose which rule fired, the fraud signal details, or internal scores.
- Never promise a delivery date while the order is in review; estimated dates follow the shipping promise rules only after release.
- All emergency or medical content in a member's message routes to emergency services language and, where relevant, the safety escalation path; reviewers do not give product usage advice.

## 8. Records

Retain per order: trigger reason, checklist answers, evidence pulled, decision, decision maker, timestamps for each step, authorization and capture references, member communications, and any escalation link, under XR-POL-005. Monthly, review triggered-order volume, decision mix, false-positive rate, and elapsed-time performance so the [CONFIG] thresholds can be tuned with evidence.

## Open items for counsel

- [COUNSEL: confirm processor support and rules for authorize-then-capture, authorization hold windows, and reauthorization; approve fallback flow if unsupported.]
- [CONFIG: large-order dollar trigger] (launch value $1,000), [CONFIG: velocity threshold], [CONFIG: staffed review hours], [CONFIG: reviewer delegation threshold].
- [COUNSEL: confirm the neutral decline language and whether any state law requires a specific adverse-action style notice for declined consumer orders.]
- [COUNSEL: confirm retention period for review and authorization records under XR-POL-005.]
- [COUNSEL: reconcile this SOP with XR-COM-010 and XR-COM-011 so the member-facing terms match the internal flow exactly.]

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
