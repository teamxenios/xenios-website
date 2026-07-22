# Split Shipment Disclosure

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-COM-005 |
| Title | Split Shipment Disclosure |
| Audience | member |
| Required member state | active member |
| Trigger | checkout when an order will or may split into multiple shipments; order history whenever a split occurs |
| Route | /research/member/shop (checkout and order history) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (notice only); the disclosure version displayed at checkout is recorded server-side with each order |
| Withdrawal supported | no (this is a notice, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-COM-004, XR-COM-006, XR-COM-008, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; Master pack 06 (Shipping, Storage, Shelf-Life, and Fulfillment Master); Master pack 02 (Round 10 Final Founder Decisions V11) |
| Review date | 2026-07-19 |

## 1. What a split shipment is

One member order may be fulfilled as more than one shipment. This happens because different
product types in the same order can be held and shipped by different fulfillment owners. A
"fulfillment owner" is the party that physically holds the inventory, packs it, and hands it to
the carrier for a given part of an order.

During the launch phase (approximately the first 60 days), peptide research products and Quantum
inventory are held and fulfilled by Xenios's fulfillment partner, while supplements are
fulfilled by Xenios directly. An order containing both product types therefore becomes at least
two fulfillment orders behind the scenes, each with its own packing, ship date, carrier, and
tracking number. Fulfillment ownership may change over time; this disclosure describes the
behavior, not the identity of any specific partner.

## 2. One shipping charge

You pay the shipping charge once per order, as stated in the Shipping Policy (XR-COM-004). A
split does not multiply the charge. If your order becomes two or three shipments, you still pay
one shipping charge for the order.

Xenios initially absorbs the extra cost of split shipments. If that subsidy becomes
unsustainable, Xenios may change this policy prospectively. Any such change would be clearly
displayed at checkout before you place an order, would apply only to orders placed after the
change, and would never add a charge to an order you already placed.

## 3. One order history

You see one order in your account, no matter how many shipments it becomes. For a split order,
the order history shows:

- a split-shipment status for the order as a whole,
- each shipment's items,
- each shipment's estimated ship date and estimated delivery range, and
- each shipment's tracking number, when available.

Shipments in a split order may arrive on different days, from different origins, and by
different carriers. A partially delivered order is normal for a split shipment and is not, by
itself, a lost or incomplete order.

## 4. Timing of a split order

Delivery timing rules in the Shipping Policy (XR-COM-004) apply to each shipment separately.
Xenios shows estimated ranges per shipment and does not display a specific delivery date for a
shipment until inventory is reserved, the fulfillment owner has accepted, the service is
selected, the cutoff is known, and a carrier commitment is available for that shipment. One
shipment shipping first never delays the estimate shown for the other.

## 5. If part of a split order has a problem

If one shipment in a split order is damaged, lost, incorrect, incomplete, or shows a possible
temperature problem, report it under the Damage, Loss, Incorrect Item, and Temperature Concern
Policy (XR-COM-008). Report the specific shipment and items affected. The rest of the order is
not held up by a problem with one shipment unless Xenios tells you otherwise.

Before reporting an item as missing, check the order history first: the item may simply be in a
later shipment that has not arrived yet.

## 6. Legal posture

This disclosure is informational. It does not waive rights that cannot be waived under
applicable law, and it does not relieve Xenios of duties imposed by law. Consumer rights
relating to shipment timing and non-delivery remain subject to applicable law.

## Open items for counsel

- Confirm the retention period for order and shipment records referenced in the metadata table
  (XR-POL-005 minimum period).
- Confirm whether naming the launch fulfillment partner in member-facing shipping documents is
  required, permitted, or better avoided, and align this disclosure with the fulfillment partner
  agreement.
- Confirm the disclosure and notice mechanics required if Xenios later stops absorbing
  split-shipment cost and adds a charge at checkout.
- Confirm how partial delivery of a split order interacts with any legally required shipment or
  refund deadlines for the undelivered portion.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
