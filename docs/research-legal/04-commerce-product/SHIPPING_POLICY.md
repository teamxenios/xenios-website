# Shipping Policy

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-COM-004 |
| Title | Shipping Policy |
| Audience | member |
| Required member state | active member |
| Trigger | product checkout; also linked from every product page, the cart, order confirmation, and order history |
| Route | /research/member/checkout and /research/member/orders |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (notice only); the policy version displayed at checkout is recorded server-side with each order |
| Withdrawal supported | no (this is a policy notice, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-COM-005, XR-COM-006, XR-COM-007, XR-COM-008, XR-COM-009, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; Master pack 06 (Shipping, Storage, Shelf-Life, and Fulfillment Master); Master pack 02 (Round 10 Final Founder Decisions V11); FTC Mail, Internet, or Telephone Order Merchandise Rule |
| Review date | 2026-07-19 |

## 1. Purpose and provisional status

This policy explains how Xenios Research ships product orders to active members. It covers the
shipping charge, the available shipping services, and how Xenios communicates shipping and
delivery timing.

This policy is operationally and legally provisional. The shipping fee is a launch working rate.
It is admin-configurable, it is reviewed against actual carrier cost, and it may change
prospectively with notice. The whole policy remains subject to counsel review, carrier terms,
and applicable law, including federal rules on shipment timing for mail, internet, and telephone
orders. Nothing in this policy becomes effective until it is approved and formally published.

## 2. The shipping charge

- Standard shipping costs $12.95 per order. It is charged once per order, no matter how many
  items the order contains and no matter how many shipments the order becomes (see the Split
  Shipment Disclosure, XR-COM-005).
- There is no free shipping and no free shipping threshold.
- The $12.95 rate is a launch working rate. Xenios sets it above a bare parcel rate on purpose:
  national carrier pricing varies by origin, destination, zone, weight, dimensions, residential
  delivery, fuel, delivery area, signature, declared value, weekend service, and service level,
  and split fulfillment adds handling. The rate is reconciled against actual carrier cost on a
  monthly cycle and may be adjusted prospectively.
- Any rate change applies only to orders placed after the change is published. It never applies
  retroactively to an order already placed.

## 3. Shipping services

| Service | Price shown at checkout | Availability |
| --- | --- | --- |
| Standard | $12.95 per order | Default service for products whose validated shipping profile permits standard parcel service |
| Expedited 2-Day | Live or configured carrier rate | When offered for the items in the order |
| Next-Day | Live or configured carrier rate | When offered for the items in the order |
| Same-Day | Live courier quote | Eligible ZIP codes only, subject to inventory location, courier availability, and cutoff time |
| Temperature-Controlled | Separate live or configured rate | Only for services validated by packout testing |

Expedited, Same-Day, and Temperature-Controlled services carry their own conditions. Read the
Expedited, Same-Day, and Temperature-Controlled Shipping Disclosure (XR-COM-006) before
selecting one of those services. Not every service is available for every product, destination,
or day. Checkout shows only the services actually available for the specific order.

## 4. What each product may require

Every product carries a shipping profile that governs how it may be shipped: the permitted
service levels, permitted carriers, maximum transit time, whether weekend delivery is allowed,
whether a signature (including an adult signature) is required, and whether temperature control
or a temperature monitor is required. Checkout applies the profile automatically. Members cannot
select a service that a product's profile does not permit, even if that service is cheaper or
faster, because the profile exists to protect product integrity.

## 5. Delivery timing: estimates, not promises

Xenios does not display a specific delivery date for an order until all of the following are
true:

1. inventory for the order is reserved,
2. the fulfillment owner has accepted the fulfillment order,
3. the shipping service is selected,
4. the applicable cutoff time is known, and
5. a carrier delivery commitment is available for that shipment.

Until then, checkout and order pages show estimates only:

- an estimated ship date,
- an estimated delivery range,
- whether the order will or may become a split shipment,
- the temperature-control state of the shipment, where applicable, and
- weekend limitations, where applicable.

Estimated dates and ranges are good-faith operational estimates, not guarantees. Carrier
performance, weather, and handling conditions are outside Xenios's control. Where a law or rule
requires shipment within a stated or default period, Xenios intends to comply with it, including
any required notice and consent process if a shipment will be delayed. [COUNSEL: confirm the
program's obligations and workflow under the FTC Mail, Internet, or Telephone Order Merchandise
Rule, including the delay-notice and refund mechanics.]

## 6. Address accuracy and delivery conditions

- Members are responsible for providing a complete and accurate shipping address. Xenios ships
  to the address on the order.
- Some shipments require a signature, including an adult signature where the product's shipping
  profile requires it. If no eligible recipient is available, the carrier's redelivery or hold
  process applies.
- Orders that trigger manual review (for example, an order total over $1,000 or quantities
  inconsistent with ordinary individual use) do not ship until review is complete. Review
  targets approximately 2 hours but is not guaranteed.

## 7. Problems with a shipment

Xenios does not accept ordinary returns. See the No Ordinary Returns Policy (XR-COM-007). If a
shipment arrives damaged, is lost, contains an incorrect or missing item, or shows a possible
temperature problem, use the process in the Damage, Loss, Incorrect Item, and Temperature
Concern Policy (XR-COM-008). Verified issues are resolved under the Refund and Replacement
Policy (XR-COM-009).

## 8. Changes to this policy

Xenios may change this policy, including the standard rate and the service menu, prospectively
with notice. The version of this policy displayed at checkout is recorded with each order, and
that version governs that order. This policy does not waive rights that cannot be waived under
applicable law, and it does not relieve Xenios of duties imposed by law.

## Open items for counsel

- Confirm the retention period for order and shipping records referenced in the metadata table
  (XR-POL-005 minimum period).
- Confirm the program's obligations and workflow under the FTC Mail, Internet, or Telephone
  Order Merchandise Rule, including delay notices, consent to delay, and required refunds.
- Confirm whether the $12.95 launch rate and the no-free-shipping position require any
  state-specific disclosure at checkout.
- Confirm whether carrier terms (USPS, UPS, FedEx, courier) require any pass-through language in
  this member-facing policy.
- Confirm adult-signature and age-verification-on-delivery requirements by product category and
  state.
- Reconcile this policy with any earlier shipping language in the repo's existing draft folders
  so one document is canonical.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
