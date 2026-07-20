# $25 Recurring Membership Authorization

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-MEM-003 |
| Title | $25 Recurring Membership Authorization |
| Audience | member |
| Required member state | approved, pre-payment (authorized during activation, after the $50 activation payment and before password and MFA setup) |
| Trigger | recurring authorization step of the activation flow, immediately after the activation payment |
| Route | activation flow under /research (recurring authorization step); managed afterward at the member account membership page |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | separate affirmative checkbox for the recurring charge, distinct from other agreements + timestamp + document version + member reference recorded server-side |
| Withdrawal supported | yes; the member may cancel the recurring authorization at any time through self-service cancellation that is at least as easy as signup (see section 6 and XR-MEM-004) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-MEM-001, XR-MEM-002, XR-MEM-004, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Negative Option Rule page |
| Review date | 2026-07-19 |

## 1. What you are authorizing

By giving this authorization, you authorize [ENTITY], the operator of Xenios Research ("Xenios"), to charge your saved payment method $25 each month for your Founding Membership, until you cancel.

This is a negative-option (automatic renewal) feature: the membership renews and the charge repeats automatically unless you cancel. This document is designed to give you the disclosures and controls that automatic-renewal rules require, including the FTC Negative Option Rule and state automatic-renewal laws, subject to counsel confirmation.

This authorization is captured by its own separate checkbox. It is deliberately not bundled into the acceptance of the other agreements, so your consent to the recurring charge is express and unambiguous.

## 2. The material terms, stated plainly

- Amount: $25 per month. This is the launch price and is admin-configurable; changes are prospective only with advance notice (section 7).
- Frequency: monthly.
- First charge: [CONFIG: whether the first $25 charge occurs at activation or one month after activation; the checkout screen must state the actual rule and the exact first charge date before you authorize].
- Ongoing charges: on your monthly billing date, which is anchored to [CONFIG: billing anchor rule, e.g. the calendar day of activation, with month-end handling defined].
- Duration: until you cancel or the membership is otherwise terminated under XR-MEM-001.
- What it buys: the active membership described in XR-MEM-001 section 9. It does not buy products; product purchases and any product subscriptions are separate transactions with their own authorizations.
- Cancellation: self-service, at least as easy as signup, and effective as described in XR-MEM-004 (access ends immediately on confirmed cancellation).

These material terms appear on the authorization screen itself, adjacent to the consent checkbox, before you authorize.

## 3. Confirmation

After you authorize, Xenios sends a confirmation to your account email that restates the amount, the frequency, the first and next charge dates, and how to cancel. Your account membership page carries the same information at all times.

## 4. Next-charge visibility

Your account membership page always shows:

- the next charge date,
- the next charge amount,
- the payment method on file (masked), and
- a working cancellation control on the same page.

You never need to contact support to learn when the next charge is or how to stop it.

## 5. Renewal reminders

Where a state law identified in the jurisdiction matrix requires renewal reminders or advance renewal notices for monthly subscriptions, Xenios sends them to your account email on the required schedule. [COUNSEL: build the state-by-state reminder matrix (which states, what content, what timing, and whether monthly terms are exempt), and decide whether Xenios adopts the strictest requirement nationally as a single standard.]

Independent of legal requirement, a price change always comes with advance notice under section 7.

## 6. Cancellation

- Cancellation is self-service from your account, online, without calling anyone and without a retention conversation you must sit through. The path to cancel is at least as easy as the path you used to sign up.
- The cancellation flow presents the disclosures in XR-MEM-004 before you confirm: access ends immediately, remaining paid time is forfeited unless applicable law requires otherwise, product subscriptions are handled according to their own state, and you should download your plans and data first.
- Confirmed cancellation stops all future membership charges. A charge that was already validly processed before cancellation is handled under XR-MEM-004, subject to applicable law.
- Canceling the membership does not by itself cancel separate product subscriptions; each is shown with its own state and controls, and the cancellation flow tells you this.

## 7. Price changes

If the monthly price changes:

- you receive advance notice by email at least [CONFIG: price-change notice period, counsel to confirm the floor required by the strictest applicable state law] before the new price takes effect,
- the new price applies prospectively only, from your next billing date after the notice period ends,
- the notice states the new amount, the date it takes effect, and how to cancel, and
- if you cancel before the new price takes effect, you are never charged the new price.

## 8. Failed payment and grace handling

If a monthly charge fails:

- Xenios retries the charge on a defined schedule of [CONFIG: retry schedule, e.g. number and spacing of retries],
- you are notified by email after the first failure, with a link to update your payment method,
- your membership enters a grace period of [CONFIG: grace period length] during which access continues while you fix the payment method,
- if the charge still fails at the end of the grace period, your membership is suspended, and continued failure leads to termination under XR-MEM-001 section 16, and
- a failed payment is never treated as a cancellation request by you, and it never triggers a charge larger than the amount you authorized.

[COUNSEL: confirm the grace and suspension design, including whether any state law constrains suspension timing or requires specific notices before terminating for nonpayment.]

## 9. Your authorization record

Xenios records the authorization separately from the other agreements: the checkbox event, timestamp, document version, member reference, and the masked payment method reference (tokenized, never raw card data). The record is retained under the Retention and Deletion Schedule (XR-POL-005) and survives cancellation as described in XR-MEM-004. You can view the version you authorized from your account.

This authorization does not waive rights that cannot be waived under applicable law, and it does not relieve Xenios of duties imposed by law.

## Open items for counsel

- Section 1 and section 2: confirm the disclosure set and consent mechanics satisfy the FTC Negative Option Rule and each applicable state automatic-renewal law; confirm the separate-checkbox design is sufficient as express informed consent.
- Section 2: [CONFIG: first charge timing and billing anchor rule]; counsel to confirm the first-charge disclosure wording once the rule is fixed.
- Section 5: build the state renewal-reminder matrix and decide whether to adopt the strictest standard nationally.
- Section 7: [CONFIG: price-change notice period]; counsel to confirm the minimum required notice under the strictest applicable law.
- Section 8: [CONFIG: retry schedule and grace period length]; counsel to confirm suspension and termination-for-nonpayment mechanics and any required notices.
- [ENTITY]: confirm the legal entity that is the merchant of record.
- Retention metadata: confirm the minimum retention period for authorization records under XR-POL-005.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
