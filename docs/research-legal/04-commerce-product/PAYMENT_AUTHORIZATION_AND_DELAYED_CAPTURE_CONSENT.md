# Payment Authorization and Delayed Capture Consent

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-COM-011 |
| Title | Payment Authorization and Delayed Capture Consent |
| Audience | member |
| Required member state | active member |
| Trigger | checkout when an order will be held for review and delayed capture applies |
| Route | /research/member/checkout |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); consent record and authorization/capture/void events retained with transaction records; minimum [COUNSEL: confirm period] |
| Acceptance event | checkbox at checkout + timestamp + document version + order reference + member reference recorded server-side, presented whenever delayed capture applies |
| Withdrawal supported | Partial. The member may cancel the order before capture, which voids the authorization. A completed capture is governed by the order and refund terms, and past consent records are retained. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-COM-001, XR-COM-010, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. What this document is

This consent covers a specific payment flow used for orders held for review under the
Large and Unusual Order Review Terms (XR-COM-010): Xenios places an authorization hold on
the member's payment method at checkout and captures (actually collects) the payment only
after the review is approved. This document explains what an authorization hold is, how
long it can last, what happens if the order is reduced or declined, and what the member
is consenting to. Product commerce is currently disabled; this consent is collected only
once commerce is formally enabled and only when the flow applies.

## 2. Definitions

- "Authorization hold" means a request to the member's card issuer or payment provider to
  reserve the order amount. A hold reduces the member's available balance or credit but
  is not a completed charge.
- "Capture" means the completion of the charge against an existing authorization, which
  transfers the funds.
- "Void" or "release" means cancelling an authorization without capturing it, so the
  reserved amount returns to the member's available balance on the issuer's timeline.

## 3. What the member consents to

When this flow applies, the member consents to the following, in this order:

1. At checkout, an authorization hold for the full order amount, including shipping and
   tax, is placed on the selected payment method.
2. The order is reviewed under XR-COM-010, with a target of approximately 2 hours.
3. If the order is approved, Xenios captures the authorized amount, and only then. No
   capture occurs before approval.
4. If the order is approved in reduced form and the member accepts the reduction, Xenios
   captures only the reduced amount, which is never more than the authorized amount.
5. If the order is declined, or the member cancels it before capture, Xenios voids the
   authorization promptly. No capture occurs for a declined or cancelled order.

## 4. Hold duration and expiry

- The authorization hold lasts until capture or void. Review targets approximately
  2 hours, so in the normal case the hold is short.
- Card issuers control how quickly a voided hold disappears from the member's account.
  Released holds commonly clear within a few business days, and the exact timing is set
  by the issuer, not by Xenios.
- Authorizations expire if not captured within a period set by the processor and card
  networks [COUNSEL/processor: confirm the authorization validity window and whether
  reauthorization is permitted or the order must be declined at expiry]. If review is
  still unresolved when the authorization nears expiry, Xenios will either decide the
  review, void the hold and decline the order, or ask the member to resubmit. Xenios
  will not silently reauthorize the member's payment method without disclosure at
  checkout that reauthorization can occur. [CONFIG: whether reauthorization is enabled,
  pending processor confirmation.]

## 5. Amount limits

- Xenios never captures more than the amount authorized for the order.
- If the final amount falls (for example, an accepted reduced order or an item that
  cannot be fulfilled), Xenios captures the lower amount or refunds the difference,
  subject to processor mechanics.
- Any increase to an order (member-requested change adding items) is a new checkout with
  its own authorization and its own consent, never an increase to the existing hold.

## 6. Processor dependency

This entire flow depends on the payment processor supporting authorize-then-capture for
this account and product category. [COUNSEL/processor: confirm processor support,
including partial capture, void timing, and any category restrictions, before this
document is finalized.] If the processor does not support the flow, this document does
not take effect, and counsel must approve the fallback (for example, immediate capture
with prompt refund on decline), which would be disclosed at checkout in place of this
consent.

## 7. What this consent is not

- It is not a recurring payment authorization. It covers a single order. Recurring
  product charges are governed by XR-COM-002.
- It is not order acceptance. An authorization hold does not mean Xenios accepted the
  order (XR-COM-001 Section 4).
- It does not waive rights the member holds against their card issuer, including dispute
  rights, and it does not waive rights that cannot be waived under applicable law or
  relieve Xenios of duties imposed by law.

## 8. Failed or disputed payments

If the authorization fails at checkout, the order is not placed. If a capture fails after
approval, Xenios notifies the member and the affected items do not ship until payment
completes. Chargebacks and disputes are handled through the processor's process, and
records of this consent may be used as evidence of the member's authorization.

## Open items for counsel

- [COUNSEL/processor: confirm authorize-then-capture support, partial capture support,
  void timing, authorization validity window, and any product-category restrictions.]
- [CONFIG: whether reauthorization near expiry is enabled, pending processor
  confirmation; if enabled, checkout disclosure text must say so.]
- [COUNSEL: approve the fallback flow and its checkout disclosure if the processor does
  not support delayed capture.]
- [COUNSEL: confirm this consent's placement and wording at checkout so it is clear,
  conspicuous, and separate from the general order terms acceptance.]
- [COUNSEL: confirm period for retention of consent and transaction event records
  (XR-POL-005).]

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
