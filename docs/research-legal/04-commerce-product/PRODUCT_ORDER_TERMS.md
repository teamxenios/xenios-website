# Product Order Terms

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-COM-001 |
| Title | Product Order Terms |
| Audience | member |
| Required member state | active member |
| Trigger | first product checkout after commerce is enabled; re-acceptance on material change |
| Route | /research/member/checkout |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); transaction, payment, and acceptance records retained to meet legal, tax, and audit duties; minimum [COUNSEL: confirm period] |
| Acceptance event | checkbox + timestamp + document version + member reference recorded server-side at first checkout |
| Withdrawal supported | Partial. A member can stop ordering at any time, and can cancel an order before fulfillment as described below. Acceptance records of past orders are retained. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-COM-002, XR-COM-003, XR-COM-010, XR-COM-011, XR-COM-012, XR-COM-013, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Mail, Internet, or Telephone Order Merchandise Rule page |
| Review date | 2026-07-19 |

## 1. What this document is

These Product Order Terms (the "Order Terms") govern every product order a member places
through the Xenios Research member catalog. They explain who can order, how an order is
formed and accepted, how pricing and tax work, how orders are reviewed, and what happens
when a product cannot be supplied.

"Xenios" means [ENTITY], the operator of the Xenios Research Founding Membership.
"Member" means a person with an active, paid Xenios Research membership in good standing.
"Order" means a request by a member to purchase one or more products through the member
catalog.

## 2. Commerce is currently disabled

Product ordering is not yet enabled. The member catalog may display products, prices,
availability states, and Guide status before checkout exists. Catalog visibility is not an
offer to sell and is not commerce enablement (see XR-COM-013, Inventory and Availability
Disclaimer).

These Order Terms take effect for a given member only when all of the following are true:

1. Counsel has approved this document and it has been formally published.
2. Commerce has been formally enabled on the platform by the founder through server-side
   controls.
3. The member has accepted these Order Terms as recorded server-side.

Nothing in this draft creates a present right to purchase any product.

## 3. Member-only ordering

Ordering is restricted to active members. Specifically:

- Only a logged-in member with an active membership, completed identity and age
  verification (21+), and mandatory MFA may place an order.
- Applicants, pending applicants, cancelled members, suspended members, and visitors who
  hold only the shared entrance password cannot order, see member pricing, or reach
  checkout.
- A membership that is cancelled or terminated ends ordering access immediately. Orders
  already accepted before cancellation are handled under Section 13.
- Members may not order on behalf of, or for resale to, any other person or business.
  Purchasing for redistribution is grounds for order refusal and membership review.

## 4. How an order forms: offer and acceptance

An order placed at checkout is an offer by the member to purchase. It is not a contract of
sale until Xenios accepts it.

- Submitting checkout, receiving an on-screen confirmation, or receiving an order
  acknowledgment email confirms only that Xenios received the offer.
- Xenios accepts an order when it sends a shipment confirmation for the relevant items, or
  when it expressly confirms acceptance in writing, whichever occurs first.
- For orders held for review under XR-COM-010, acceptance occurs no earlier than review
  approval.
- Until acceptance, Xenios may decline the order in whole or in part, reduce quantities,
  or request more information. If an order is declined before acceptance, any payment
  authorization is released and any captured amount for the declined items is refunded to
  the original payment method, subject to applicable law.
- Where one member order is fulfilled in parts (see Section 11), acceptance can occur item
  by item. Declining one item does not by itself cancel the rest of the order.

[COUNSEL: confirm the acceptance-on-shipment model, including item-by-item acceptance for
split fulfillment, and the exact contract-formation language for the checkout screen.]

## 5. Lane-aware eligibility

Every product belongs to a server-side product lane: supplement, research material,
Quantum, or future clinical. One member interface may sit over these lanes, but the server
decides purchasability for each item, each member, and each destination.

- A product can be ordered only when its lane is enabled for commerce, the product is in
  an orderable state, and the member and shipping destination are eligible for it.
- State-by-state eligibility rules apply. A product available to one member may be
  unavailable to another because of the destination state. Checkout will block ineligible
  items rather than accept and later cancel them where the system can determine
  eligibility at checkout.
- Quantum has no commerce. Its member-facing state is Coming Soon, and no Quantum order
  can be placed or accepted until its classification, claims, administration, facility,
  state, quality, and transaction structure are approved.
- Supplement products are sold only after reseller authorization and related commercial
  confirmations for the specific brand and SKU.
- Server-side lane controls prevail over anything displayed in the catalog. If a page
  displays an item that the server will not sell, the server decision controls.

## 6. Product information and research posture

Peptide catalog items are research products whose classification and permitted marketing
lane are under formal review. Product pages and Guides are educational. Nothing in the
catalog, a Guide, a Blueprint, a plan, or support is medical advice, a diagnosis, a
prescription, dosing instruction, or a claim that any product is FDA approved, clinically
proven, or safe for everyone. Classification, claims, quality, and professional oversight
are governed by law, not by disclaimers, and a research-use label is not paired with any
human-outcome promise. No order guarantees any outcome.

## 7. Pricing, tax, and charges

- Prices are shown in US dollars in the member catalog and at checkout. Member pricing is
  visible only to active members.
- The price charged is the price displayed at checkout when the order is submitted,
  subject to Section 14 (errors).
- Sales or use tax is calculated at checkout based on the shipping destination and
  applicable law, and is itemized before the member confirms the order.
  [COUNSEL: confirm sales tax registration, nexus analysis, and product taxability by
  category and state before commerce is enabled.]
- Shipping is charged once per order at the rate displayed at checkout. The standard
  launch rate is $12.95 per order, an admin-configurable working rate reviewed against
  actual cost. Expedited, next-day, same-day (eligible ZIP codes), and
  temperature-controlled services, where offered, are priced separately at live or
  configured carrier rates and shown before confirmation. There is no free-shipping
  threshold. Full shipping terms appear in the separate Shipping Terms document.
- Store credit, referral credit, and any discount applied at checkout are itemized before
  confirmation. Subscription pricing is governed by XR-COM-002.
- Prices, shipping rates, and discounts can change prospectively. Changes do not affect
  an order already accepted.

## 8. Payment

- Payment is collected through a third-party payment processor. Xenios does not see or
  store full card numbers. Payment is due at checkout.
- For most orders, the payment method is charged when the order is placed or when it is
  accepted, per processor configuration. [COUNSEL: confirm the default charge timing
  (authorize-and-capture at checkout versus capture at acceptance) with the processor.]
- For orders held for review, Xenios uses an authorize-then-capture flow where the
  processor supports it. That flow requires the separate consent in XR-COM-011.
- If payment fails or is reversed before fulfillment, the order or the affected items may
  be cancelled.

## 9. Large and unusual order review

Orders can be held for manual review before acceptance when the order total exceeds
$1,000, when quantities are inconsistent with ordinary individual use, or when risk rules
trigger. The review process, target timing (approximately 2 hours), and possible outcomes
(approve, reduce, decline, request information) are described in XR-COM-010, which is part
of these Order Terms.

## 10. Availability

Product availability is not guaranteed. Product states, waitlists, and the rule that
server-side controls decide purchasability are described in XR-COM-013 and XR-COM-012.
If an accepted item becomes unavailable before shipment, Xenios will cancel that item,
notify the member, and refund or release payment for it, subject to applicable law.

## 11. Fulfillment, shipping, title, and risk of loss

- One member order may be split into multiple fulfillment orders and tracking numbers.
  During approximately the first 60 days, a fulfillment partner holds and fulfills peptide
  inventory and Xenios fulfills supplements. The member sees one order history with
  split-shipment status.
- One shipping charge per order applies even when the order ships in parts, unless
  checkout clearly displays another charge.
- Title to products and risk of loss pass to the member at [COUNSEL: decide the transfer
  point, for example on delivery to the carrier versus on delivery to the member's
  address, and reconcile with the replacement policy for verified loss and damage].
  Regardless of where title passes, verified damage, loss, incorrect item, missing item,
  or temperature compromise is handled under the Returns, Replacement, and Refund Terms,
  which provide full replacement or full refund for verified cases.
- Delivery dates and transit times are estimates, not promises. Where a shipment is
  materially delayed, Xenios follows applicable order-fulfillment rules, including
  notice and the option to cancel with refund where required.

## 12. Returns

There are no ordinary returns. Opened products, and routine unopened products, cannot be
returned, because product integrity and chain of custody cannot be verified after a
product leaves controlled fulfillment. Verified damage, loss, incorrect item, missing
item, or temperature compromise may receive a full replacement or full refund. Returned
or compromised product is never restocked. The full policy appears in the separate
Returns, Replacement, and Refund Terms and is subject to counsel, processor, insurer, and
fulfillment review, and to applicable law.

## 13. Cancelling an order

- A member may cancel an order, or unfulfilled items in it, at no charge at any time
  before the items enter fulfillment. After items enter fulfillment, cancellation is no
  longer available for those items and the returns posture in Section 12 applies.
- If the member's membership is cancelled after an order is accepted but before shipment,
  Xenios will either complete fulfillment of the accepted order or cancel and refund it.
  [COUNSEL: choose the default handling for accepted-but-unshipped orders at membership
  cancellation.]
- Subscription cancellation is separate and is governed by XR-COM-002 and XR-COM-003.

## 14. Errors and refusal rights

- Obvious errors in price, description, or availability do not bind Xenios. If an error
  is discovered before acceptance, Xenios may decline the order. If it is discovered
  after acceptance but before shipment, Xenios may cancel the affected items and refund
  them, and will offer the member the option to reorder at the correct price, subject to
  applicable law.
- Xenios may refuse or cancel any order where it reasonably believes the order violates
  these Order Terms, the Founding Membership Agreement, eligibility rules, or applicable
  law, or presents fraud, safety, or diversion risk. Refusals are decided by a named
  human, the founder, not by an unreviewed automated rule alone.

## 15. Consumer rights and limits of this document

These Order Terms do not waive rights that cannot be waived under applicable law, and
they do not relieve Xenios of duties imposed by law. Cancellation, refund, and consumer
protection rights are always subject to applicable law. Nothing here limits the privacy
rights described in the privacy notices.

## 16. Relationship to other documents

These Order Terms incorporate: XR-COM-002 (Product Subscription Authorization),
XR-COM-003 (Subscription Pause, Skip, Reschedule, and Cancel Terms), XR-COM-010 (Large
and Unusual Order Review Terms), XR-COM-011 (Payment Authorization and Delayed Capture
Consent), XR-COM-012 (Waitlist Terms), XR-COM-013 (Inventory and Availability
Disclaimer), the Shipping Terms, and the Returns, Replacement, and Refund Terms. The
Founding Membership Agreement governs membership itself. If these Order Terms conflict
with a document listed above on a commerce-specific point, the more specific document
controls for that point.

## 17. Changes

Xenios may update these Order Terms prospectively. Material changes are presented for
re-acceptance before the member's next order. Changes never apply retroactively to an
already-accepted order.

## Open items for counsel

- [COUNSEL: confirm the offer-and-acceptance model, including acceptance on shipment and
  item-by-item acceptance for split fulfillment, and approve the checkout screen
  contract-formation language.]
- [COUNSEL: decide the title and risk-of-loss transfer point and reconcile it with the
  full-replacement-or-refund policy for verified damage, loss, and temperature
  compromise.]
- [COUNSEL: confirm sales tax registration, nexus, and product taxability by category and
  state before commerce is enabled.]
- [COUNSEL: confirm default payment charge timing with the processor (capture at checkout
  versus capture at acceptance).]
- [COUNSEL: choose the default handling for accepted-but-unshipped orders when a
  membership is cancelled.]
- [COUNSEL: confirm the anti-resale and diversion-risk refusal language against state
  consumer statutes.]
- [COUNSEL: confirm compliance with the FTC Mail, Internet, or Telephone Order
  Merchandise Rule for shipment timing, delay notices, and cancellation offers.]
- [COUNSEL: insert the exact legal entity name and state of formation for [ENTITY].]
- Cross-references to the Shipping Terms and the Returns, Replacement, and Refund Terms
  need their final document keys inserted at register consolidation.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
