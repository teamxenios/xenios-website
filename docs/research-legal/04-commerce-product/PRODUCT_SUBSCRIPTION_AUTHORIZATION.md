# Product Subscription Authorization

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-COM-002 |
| Title | Product Subscription Authorization |
| Audience | member |
| Required member state | active member |
| Trigger | enrollment in a per-product subscription at checkout or from a product page |
| Route | /research/member/checkout and /research/member/subscriptions |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); the authorization record, disclosures shown, and each charge record retained to meet legal, tax, and audit duties; minimum [COUNSEL: confirm period] |
| Acceptance event | separate, unbundled checkbox per product subscription + timestamp + document version + the exact disclosures displayed + member reference, recorded server-side |
| Withdrawal supported | Yes. The member can cancel any product subscription at any time through self-service, at least as easily as enrollment. Records of past authorized charges are retained. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-COM-001, XR-COM-003, XR-COM-013, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Negative Option Rule page |
| Review date | 2026-07-19 |

## 1. What this document is

This Product Subscription Authorization (the "Authorization") is the consent a member
gives when enrolling a specific product in a recurring subscription. A product
subscription is a negative-option plan: after enrollment, Xenios charges the member's
payment method and ships the product on a recurring schedule until the member cancels.
Because charges continue without a new confirmation each cycle, this Authorization is
captured separately for each product the member subscribes to, and it is never bundled
into a general terms checkbox.

This Authorization is separate from the $25 recurring monthly membership fee, which has
its own authorization document. Cancelling a product subscription does not cancel the
membership, and cancelling the membership is handled under the membership documents, with
product subscriptions handled according to their own state.

## 2. Subscriptions are not yet enabled

Product commerce, including subscriptions, is currently disabled. No subscription can be
created, and no recurring product charge can occur, until counsel approval is complete,
this document is formally published, and commerce is formally enabled through server-side
controls. This draft creates no present authorization.

## 3. What the member authorizes

By enrolling a specific product, the member authorizes Xenios, through its payment
processor, to:

1. Charge the member's selected payment method the disclosed recurring amount for that
   product, plus the per-order shipping charge and applicable tax, on the disclosed
   schedule.
2. Continue those charges until the member cancels, pauses, or the subscription ends
   under these terms.
3. Ship the product to the member's designated address on the corresponding schedule.

The authorization is per product. Subscribing to one product authorizes charges for that
product only. Each additional product subscription requires its own enrollment and its
own recorded consent.

## 4. Disclosures shown before enrollment

Before the member confirms enrollment, the enrollment screen states, clearly and
conspicuously, next to the consent control:

- the product and quantity per cycle,
- the recurring charge amount in US dollars, including the subscription discount applied,
- the delivery and billing frequency selected (candidate frequencies are every 30, 60, or
  90 days),
- the date of the first charge and the date of the next charge after that,
- that shipping ($12.95 standard per order, an admin-configurable launch rate) and
  applicable tax are added to each cycle's charge,
- that charges recur automatically until the member cancels,
- how to cancel, with cancellation available at least as easily as enrollment,
- and the cutoff for changes before each cycle (see XR-COM-003).

The member's account subscription page shows, at all times, each active subscription's
product, amount, frequency, next charge date, and next shipment date.

## 5. Discounts

Subscription pricing may include a percentage discount off the one-time price. Discount
percentages are [CONFIG: admin-configurable per product and per frequency; no permanent
tiers are published until unit economics are complete]. The discount in effect at
enrollment is disclosed on the enrollment screen. If a discount percentage changes later,
the change applies prospectively with advance notice under Section 8, never
retroactively.

## 6. How charges work

- Each cycle, the recurring amount plus shipping and tax is charged to the member's
  stored payment method on the scheduled charge date, and a corresponding order is
  created and fulfilled under the Product Order Terms (XR-COM-001).
- Each charge generates an email receipt identifying the product, amount, and next charge
  date.
- Subscription orders are subject to the same availability, eligibility, and review rules
  as one-time orders, including lane and state eligibility and large-order review. If a
  cycle cannot be fulfilled, the member is notified and the charge for that cycle is
  refunded or not captured.
- If a charge fails, Xenios may retry it [CONFIG: retry count and spacing] and will
  notify the member. Continued failure pauses the subscription rather than accruing debt.

## 7. Cancelling, pausing, and changing

The member can cancel a product subscription at any time through self-service on the
subscription page, without contacting support, without a retention obstacle, and at least
as easily as enrollment. Cancellation stops all future charges for that subscription.
A charge already processed before the cancellation cutoff is fulfilled normally.

Pause, skip, reschedule, quantity, frequency, and payment-method controls, and the cutoff
that applies before each scheduled charge, are described in XR-COM-003, which is part of
this Authorization.

## 8. Changes to price or terms

If Xenios changes the recurring price, the discount, the shipping rate, or any material
term of an active subscription, it will send notice to the member's verified email at
least [CONFIG: notice period, e.g. 30 days] before the first affected charge, identifying
the old and new amounts and the effective date, and reminding the member how to cancel.
Continued enrollment after the effective date applies the new terms prospectively.
[COUNSEL: confirm whether affirmative re-consent, rather than notice plus continued
enrollment, is required for price increases in any state.]

## 9. What this Authorization is not

- It is not medical advice, a prescription, dosing instruction, or a treatment schedule.
  A recurring delivery cadence is a logistics choice, not a use instruction. Peptide
  catalog items are research products whose classification and permitted marketing lane
  are under formal review.
- It does not guarantee product availability in any cycle, and it does not guarantee any
  outcome.
- It does not waive rights that cannot be waived under applicable law, and it does not
  relieve Xenios of duties imposed by law. Cancellation and refund rights are always
  subject to applicable law.

## 10. Record of consent

Xenios records, server-side: the product, the disclosures displayed, the consent
checkbox, the timestamp, the document version, the member reference, and every subsequent
charge, change, pause, and cancellation. The member can view their subscription history
on the subscription page and can request their records under the privacy rights process.

## Open items for counsel

- [COUNSEL: confirm the enrollment disclosures and consent mechanics against the FTC
  Negative Option Rule and state automatic-renewal statutes, including any state-specific
  renewal reminder notices for longer frequencies.]
- [COUNSEL: confirm whether price increases require affirmative re-consent rather than
  notice plus continued enrollment in any state.]
- [CONFIG: discount percentages per product and frequency; not published until unit
  economics are complete.]
- [CONFIG: failed-charge retry count and spacing.]
- [CONFIG: advance-notice period for material changes, proposed 30 days.]
- [COUNSEL: confirm period for retention of authorization and charge records
  (XR-POL-005).]
- [COUNSEL: confirm treatment of active product subscriptions when the membership itself
  is cancelled, consistent with the membership cancellation documents ("handled according
  to their own state").]
- Cross-reference to the recurring membership authorization document key to be inserted
  at register consolidation.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
