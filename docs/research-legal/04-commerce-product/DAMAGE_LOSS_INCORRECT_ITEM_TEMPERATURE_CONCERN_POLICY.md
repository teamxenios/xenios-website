# Damage, Loss, Incorrect Item, and Temperature Concern Policy

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-COM-008 |
| Title | Damage, Loss, Incorrect Item, and Temperature Concern Policy |
| Audience | member |
| Required member state | active member |
| Trigger | member opens a delivery issue report from order history; linked from XR-COM-007 and from order confirmation |
| Route | /research/member/orders (issue report flow) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (notice only); each issue report, its evidence, and the policy version shown are recorded server-side |
| Withdrawal supported | partial (a member may withdraw an open issue report; records of the report and its handling are retained) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-COM-004, XR-COM-005, XR-COM-006, XR-COM-007, XR-COM-009, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; Master pack 06 (Shipping, Storage, Shelf-Life, and Fulfillment Master); Master pack 02 (Round 10 Final Founder Decisions V11) |
| Review date | 2026-07-19 |

## 1. What this policy covers

This is the exception path referenced by the No Ordinary Returns Policy (XR-COM-007). It covers
four delivery problems:

- Damage: the product or its container arrived physically damaged, or tamper evidence is broken.
- Loss: the shipment never arrived, or tracking shows delivery that did not occur.
- Incorrect or missing item: the shipment contains the wrong product, the wrong quantity, or is
  missing an item that was in that shipment (check the Split Shipment Disclosure, XR-COM-005,
  first: an item in a later shipment is not missing).
- Temperature concern: a shipment that required temperature control shows a possible problem,
  for example a tripped indicator, fully melted coolant, or arrival conditions inconsistent
  with the service (see XR-COM-006).

It does not cover changed minds, over-ordering, or preference: those are ordinary returns, which
Xenios does not accept.

## 2. Reporting window

Report an issue within [CONFIG: reporting window, working default 7 days] of the delivery date
shown in tracking, or, for a lost shipment, within [CONFIG: loss reporting window, working
default 14 days] of the last estimated delivery date. Prompt reporting matters: carrier claims
have their own deadlines, and temperature evaluation depends on how soon the product's condition
is captured. A late report is not automatically rejected, but late reporting can make
verification impossible, and carrier claim deadlines may be lost. [COUNSEL: confirm both window
values and how a late report must be treated under applicable law.]

## 3. What the member submits

Submit the report from your order history. One report per affected shipment. Provide:

1. the order number (selected from order history),
2. the affected item or items and quantities,
3. the issue type and a plain description of what is wrong,
4. the delivery date (or the fact of non-delivery),
5. photos of the affected product, including the label,
6. photos of the packaging, inside and out, and
7. the temperature indicator reading or state, when the shipment included one.

For loss reports, photos are not required. For everything else, keep the product and all
packaging exactly as received until Xenios tells you the outcome. Do not use, transfer, or
discard the product while the report is open. Do not ship anything back unless Xenios
explicitly instructs and arranges it.

Reports go through the member account flow, not Telegram. Telegram support can point you to the
flow but is never the system of record, and raw media should not be sent over it.

## 4. How Xenios verifies a report

Xenios verifies each report against records it already holds, which is why chain of custody
exists. Depending on the issue, verification uses:

- the order and its fulfillment orders (which fulfillment owner shipped what),
- lot records, including expiry or retest date and lot disposition,
- carrier tracking and scan history, and carrier claim processes,
- the shipping profile and, for temperature concerns, the validated packout data and approved
  excursion limits for the product, and
- the member's photos and indicator evidence.

Temperature concerns are never guessed at. A reported temperature concern is evaluated against
approved product data; support staff cannot declare a product fine or ruined by intuition, and
this policy does not ask the member to judge it either. Product affected by an open report is
treated as quarantined on Xenios's side: it is never restocked, and the same lot is checked for
other affected orders.

Verification targets [CONFIG: verification target, working default 2 business days] from a
complete report. Carrier claims (for loss and transit damage) can take longer; Xenios does not
make the member wait for a carrier payout before resolving a verified issue.

## 5. Resolution

Verified issues are resolved under the Refund and Replacement Policy (XR-COM-009):

- full replacement of the affected item or items, or
- a full refund for the affected item or items, or
- a partial replacement or partial refund where only part of an order is affected.

Replacements ship at no additional shipping charge. If a report cannot be verified, Xenios
explains why and what additional evidence would change the outcome. Members are never asked to
accept restocked or previously shipped product as a replacement: replacements come from
verified inventory, and returned or compromised product is destroyed under documented
disposition, never restocked.

## 6. Fraud and abuse

Xenios investigates patterns of repeated claims. Manual review may apply before resolution on
flagged accounts. This protects the member base that a private program depends on. This section
is designed to affect only accounts showing verified abuse patterns; a fraud review may add
time to resolution, but it does not change the remedies available for a verified issue.

## 7. Legal posture

This policy is subject to applicable law and does not waive rights that cannot be waived under
applicable law, and it does not relieve Xenios of duties imposed by law. Nothing in this policy
limits carrier liability rules, processor chargeback rights, or statutory consumer remedies.
The final form of this policy requires counsel, payment processor, insurer, and fulfillment
review.

## Open items for counsel

- Confirm the reporting window values marked [CONFIG] (working defaults 7 days for delivered
  issues, 14 days after last estimated delivery for loss) and how late reports must be treated.
- Confirm the verification target value marked [CONFIG] and whether it should be published.
- Confirm the retention period for issue reports, evidence media, and dispositions (XR-POL-005
  minimum period), including how member-submitted photos are classified and protected.
- Confirm alignment with carrier claim procedures (USPS, UPS, FedEx, couriers) so member
  instructions never conflict with claim requirements.
- Confirm insurer notice requirements for damage, loss, and temperature events.
- Confirm the fraud-review language in Section 6 is enforceable and appropriately bounded.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
