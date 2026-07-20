# Subscription Pause, Skip, Reschedule, and Cancel Terms

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-COM-003 |
| Title | Subscription Pause, Skip, Reschedule, and Cancel Terms |
| Audience | member |
| Required member state | active member |
| Trigger | linked from every subscription enrollment screen and from the subscription management page |
| Route | /research/member/subscriptions |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); each control action (pause, skip, reschedule, cancel, change) logged with timestamp; minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (notice only); incorporated by reference into the XR-COM-002 enrollment record, which is the accepted consent |
| Withdrawal supported | Yes. Every control described here is reversible by the member except a completed cancellation, which the member can follow with a fresh enrollment. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-COM-001, XR-COM-002, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Negative Option Rule page |
| Review date | 2026-07-19 |

## 1. What this document is

These terms describe the self-service controls a member has over an active product
subscription created under the Product Subscription Authorization (XR-COM-002): pause,
skip, reschedule, quantity, frequency, payment method, and cancel. They also define the
cutoff before each scheduled charge, after which the upcoming cycle proceeds as
scheduled.

These controls apply to product subscriptions only. The $25 recurring monthly membership
fee and membership cancellation are governed by the membership documents, not by this
document. Product commerce is currently disabled; these terms take effect only when
subscriptions exist under XR-COM-002.

## 2. Self-service, always visible

Every control in this document is available to the member directly on the subscription
management page, without contacting support and without a retention step that is harder
than enrollment was. The page always shows, per subscription: the product, the recurring
amount, the frequency, the next charge date, and the next shipment date, so the member
can act before a charge rather than react after one.

## 3. The cutoff

Each subscription cycle has a cutoff of [CONFIG: cutoff period, e.g. 24 hours] before the
scheduled charge time. The applicable cutoff is displayed on the subscription page next
to the next charge date.

- A pause, skip, reschedule, frequency change, quantity change, or cancellation submitted
  before the cutoff takes effect for the upcoming cycle.
- An action submitted after the cutoff takes effect for the following cycle. The
  already-scheduled charge and shipment proceed, because fulfillment for that cycle may
  already be in motion.
- Cancellation submitted after the cutoff still ends all cycles after the one in
  progress. It is never delayed beyond that single in-progress cycle.

## 4. Pause

- Pausing stops upcoming charges and shipments while keeping the subscription, its
  settings, and its enrollment record intact.
- A pause runs until the member resumes it or until a maximum pause length of
  [CONFIG: maximum pause duration, e.g. 90 days], after which the member is notified and
  the subscription either resumes or is cancelled per the member's stored preference
  [CONFIG: default behavior at pause expiry].
- Effect on pricing: [CONFIG: whether the subscription discount and enrolled price are
  preserved through a pause, or whether resuming applies then-current pricing]. The rule
  in force is disclosed on the pause screen before the member confirms.
  [COUNSEL: confirm that any repricing at resume is treated as a material change
  requiring notice under XR-COM-002 Section 8.]
- No charge of any kind is made during a pause.

## 5. Skip

- Skipping cancels one upcoming cycle only: no charge and no shipment for that cycle.
- The subscription, its price, its discount, and its schedule otherwise continue
  unchanged, and the next charge date advances by one frequency interval.
- The member may skip repeatedly, subject to [CONFIG: any limit on consecutive skips,
  proposed none].

## 6. Reschedule

- Rescheduling moves the next charge and shipment date to a member-selected date.
- Rescheduling does not change the price, discount, or frequency. Later cycles follow
  from the new date at the existing frequency.

## 7. Quantity, frequency, and payment method

- The member may change quantity per cycle and frequency (among the offered 30, 60, or
  90 day options) before the cutoff. A change that alters the recurring amount is shown
  with the new amount and the next charge date before the member confirms, and the
  updated disclosures are recorded as an amendment to the XR-COM-002 record.
- The member may change the payment method for future charges at any time.

## 8. Cancel

- Cancellation is self-service and immediate for all future cycles, subject only to the
  single in-progress cycle rule in Section 3.
- Cancelling a product subscription does not cancel the membership, does not affect other
  subscriptions, and does not affect orders already accepted under XR-COM-001.
- Cancellation stops future charges. Amounts already charged for a fulfilled or
  in-progress cycle are not refunded through cancellation; the Returns, Replacement, and
  Refund Terms and applicable law govern any refund.
- A confirmation of the cancellation, including the date of the last cycle if one is in
  progress, is sent to the member's verified email.

## 9. Suspension and end of subscription by Xenios

- Repeated failed charges pause the subscription (XR-COM-002 Section 6).
- If a product becomes unavailable, ineligible for the member's destination state, or is
  removed from commerce, affected subscriptions are paused or cancelled and the member is
  notified. No charge is made for a cycle Xenios cannot fulfill.
- If the membership is cancelled or terminated, product subscriptions are handled
  according to their own state, as disclosed in the membership cancellation flow.
  [COUNSEL: confirm the default (cancel all product subscriptions at membership
  cancellation versus pause pending member instruction).]

## 10. Limits of this document

These terms do not waive rights that cannot be waived under applicable law and do not
relieve Xenios of duties imposed by law. Cancellation and refund rights are always
subject to applicable law. Nothing here is medical advice or a use instruction; a
delivery schedule is logistics, not guidance.

## Open items for counsel

- [CONFIG: cutoff period before a scheduled charge, proposed 24 hours.]
- [CONFIG: maximum pause duration and default behavior at pause expiry.]
- [CONFIG: whether enrolled pricing and discount are preserved through a pause or
  repriced at resume.]
- [COUNSEL: confirm that repricing at resume, if configured, is a material change
  requiring advance notice under XR-COM-002.]
- [CONFIG: any limit on consecutive skips, proposed none.]
- [COUNSEL: confirm the default handling of product subscriptions at membership
  cancellation and align the membership cancellation flow language.]
- [COUNSEL: confirm the single in-progress cycle rule after the cutoff against state
  automatic-renewal and cancellation statutes.]
- [COUNSEL: confirm period for retention of control-action logs (XR-POL-005).]

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
