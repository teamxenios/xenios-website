# Large and Unusual Order Review Terms

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-COM-010 |
| Title | Large and Unusual Order Review Terms |
| Audience | member |
| Required member state | active member |
| Trigger | displayed at checkout when an order meets a review trigger; linked from the Product Order Terms |
| Route | /research/member/checkout and /research/member/orders |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); review decisions, reviewer identity, and outcomes logged for audit; minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (notice only); incorporated into the XR-COM-001 acceptance record; the member additionally consents to delayed capture under XR-COM-011 when it applies |
| Withdrawal supported | Partial. The member may cancel a held order at any time before capture and fulfillment; completed review records are retained. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-COM-001, XR-COM-011, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. What this document is

These terms describe when and how Xenios manually reviews an order before accepting it,
what the member sees during review, how long review is designed to take, and the possible
outcomes. Review exists to keep orders consistent with a private, individual-use
membership, to catch fraud and payment risk, and to prevent quantities that suggest
resale or diversion. Product commerce is currently disabled; these terms take effect with
the Product Order Terms (XR-COM-001) when commerce is formally enabled.

## 2. When review triggers

An order is held for manual review before acceptance when any of the following is true:

1. The order total exceeds $1,000.
2. The quantity of any product, or the combination of quantities, is inconsistent with
   ordinary individual use. Membership is personal; the catalog is not a wholesale or
   resale channel.
3. Risk rules trigger, including payment risk signals, mismatched or unusual shipping
   details, rapid repeat ordering, or patterns associated with fraud or diversion.

Threshold values and risk rules are server-side controls. The $1,000 figure is the launch
value and is [CONFIG: admin-configurable review threshold]. Xenios does not publish the
full risk rule set, because publishing it would defeat its purpose.

## 3. What happens during review

- Checkout completes and the member sees a clear "held for review" status immediately.
  The order is an offer that Xenios has not yet accepted (XR-COM-001 Section 4).
- Payment is handled by authorization first, capture only after approval, where the
  processor supports it. That flow, and what happens to the hold if the order is
  declined, are governed by the Payment Authorization and Delayed Capture Consent
  (XR-COM-011). [COUNSEL: with the processor, confirm authorize-then-capture support and
  the fallback if it is unsupported.]
- Review is performed by a named human, the founder, Samuel Boadu, not by an automated
  rule alone. Automated signals may flag an order; a human decides it.
- The review target is approximately 2 hours from the hold. This is a service target,
  not a guarantee. Reviews started outside normal operating hours, or requiring more
  information, may take longer. The system monitors the deadline and escalates overdue
  reviews to the founder.
- No item in a held order enters fulfillment before the review is decided.

## 4. Possible outcomes

Review ends in exactly one of four outcomes, and the member is notified of the outcome by
email and order status in every case:

1. Approve. The order is accepted, payment is captured under XR-COM-011, and fulfillment
   proceeds normally.
2. Reduce. Xenios offers to accept the order at a reduced quantity or without specific
   items. The member chooses to accept the reduced order or cancel entirely; capture is
   limited to the reduced amount the member accepts. [COUNSEL: confirm the reduced-order
   flow requires fresh member confirmation rather than silent partial acceptance.]
3. Decline. The order is not accepted. The payment authorization is released and any
   captured amount is refunded, subject to applicable law and processor timelines. A
   decline of one order does not by itself suspend the membership.
4. Request information. Xenios asks the member, through the member's verified email or
   the member site, to confirm details such as intended personal use, shipping address,
   or payment ownership. The 2 hour target pauses while waiting. If no response arrives
   within [CONFIG: response window, e.g. 72 hours], the order is declined and the hold is
   released.

## 5. What review is not

- Review is not a medical, suitability, or safety evaluation of the member's use of any
  product, and no review outcome is medical advice or a use instruction.
- Review does not create a quota, an entitlement, or a guaranteed maximum. Approval of
  one large order does not commit Xenios to approve a similar order later.
- Review never asks for passwords, MFA codes, full card numbers, or government ID images
  through Telegram or email. Identity-related requests occur only through the member
  site's authenticated flows.

## 6. Member choices during a hold

The member may cancel a held order at any time before capture and fulfillment through
the order page. Cancellation during a hold releases the authorization under XR-COM-011.
The member may also contact support through the normal Telegram channel about a held
order; support cannot bypass review or approve an order.

## 7. Limits of this document

These terms do not waive rights that cannot be waived under applicable law and do not
relieve Xenios of duties imposed by law. Refusal, refund, and cancellation practices are
always subject to applicable law.

## Open items for counsel

- [CONFIG: review threshold value, launch $1,000, admin-configurable.]
- [CONFIG: response window for information requests, proposed 72 hours.]
- [COUNSEL: confirm authorize-then-capture support with the payment processor and define
  the fallback flow (for example, immediate capture with prompt refund on decline) if it
  is unsupported.]
- [COUNSEL: confirm the reduced-order flow requires fresh member confirmation and how
  that confirmation is recorded.]
- [COUNSEL: review the anti-resale and diversion framing for consistency with state
  consumer protection statutes and the membership documents.]
- [COUNSEL: confirm whether repeated declined reviews may feed membership review, and
  where that authority is documented.]
- [COUNSEL: confirm period for retention of review logs (XR-POL-005).]

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
