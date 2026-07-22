# Inventory and Availability Disclaimer

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-COM-013 |
| Title | Inventory and Availability Disclaimer |
| Audience | member |
| Required member state | active member |
| Trigger | displayed in the member catalog and linked from every product page |
| Route | /research/member/shop |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (notice only) |
| Withdrawal supported | no (notice, nothing to withdraw) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-COM-001, XR-COM-012, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. What this notice is

This notice explains how product availability works in the Xenios Research member
catalog: what the product states mean, why seeing a product does not mean it can be
purchased, and who decides purchasability. It is a notice, not an agreement. Purchases
themselves are governed by the Product Order Terms (XR-COM-001).

## 2. Product states

Every product in the catalog carries one availability state:

| State | Meaning |
| --- | --- |
| In Stock | Available for purchase by eligible members, subject to this notice. |
| Low Stock | Available, but supply is limited and may end without warning. |
| Out of Stock | Not currently purchasable. The page stays visible and a waitlist may be offered (XR-COM-012). |
| Waitlist | Not currently purchasable; the member can join the waitlist for an availability notification. |
| Documentation Review | Not purchasable while product documentation (including its Guide and labeling review) is completed. |
| Commerce Review | Not purchasable while classification, claims, quality, supplier, or transaction questions are resolved for its lane. |
| Temporarily Unavailable | Not purchasable for an operational reason; no return date is promised. |
| Coming Soon | Announced but never yet sold. No checkout exists. Quantum is in this state. |

A state describes the product right now. It is not a commitment about the future, and a
product can move between states, or leave the catalog, at any time.

## 3. Availability is not guaranteed

- No state, page, price, position, or notification guarantees that a product can be
  purchased at any given moment, in any quantity, or at any price.
- Low Stock and In Stock reflect the system's best current information. Inventory can
  sell through between a page view and checkout. The order confirmation flow, not the
  catalog page, determines what is actually accepted (XR-COM-001 Section 4).
- Quantities per order may be limited, and orders can be held for review when quantities
  are inconsistent with ordinary individual use (XR-COM-010).
- If an accepted item turns out to be unavailable, the item is cancelled and refunded
  under XR-COM-001. Xenios does not substitute a different product without the member's
  agreement.

## 4. Server-side controls decide purchasability

Whether a product can actually be bought is decided by server-side controls, not by what
a page appears to show. Those controls combine, for every attempted purchase:

- the product's availability state,
- the product's lane (supplement, research material, Quantum, future clinical) and
  whether commerce is enabled for that lane,
- the member's status and standing,
- destination-state eligibility rules,
- and platform-wide commerce flags.

If a page and the server disagree, the server decision controls. A cached page, a stale
tab, or a display error cannot create a right to purchase.

## 5. Catalog visibility is not commerce enablement

The catalog can show products, prices, states, and Guide status before any purchasing
exists, and it does so today: product ordering is currently disabled platform-wide.

- Visibility of a product is informational and educational. It is not an offer to sell,
  not a representation that the product is or will become purchasable, and not a
  representation about the product's regulatory status.
- Quantum is the standing example: it has a product page and an interest list, its state
  is Coming Soon, and it has no checkout and no commerce until its classification,
  claims, administration, facility, state, quality, and transaction structure are
  approved.
- Supplement products may appear before launch, and none is sold until reseller
  authorization and related commercial confirmations are complete for that brand and
  SKU.
- Peptide catalog items are research products whose classification and permitted
  marketing lane are under formal review. Their visibility in the catalog is not a
  classification claim.

## 6. Corrections

Availability states, prices, and product information can contain errors. Xenios corrects
errors when found. Obvious errors do not bind Xenios, and orders affected by an error are
handled under XR-COM-001 Section 14.

## 7. Limits of this notice

Nothing in the catalog or this notice is medical advice, a recommendation to use any
product, or an outcome promise. This notice does not waive rights that cannot be waived
under applicable law and does not relieve Xenios of duties imposed by law.

## Open items for counsel

- [COUNSEL: confirm the "visibility is not an offer" and "server decision controls"
  framing against state consumer protection and advertising law, including any state
  where displaying a price could be read as an offer.]
- [COUNSEL: confirm the eight product-state labels and their member-facing definitions,
  in particular that Documentation Review and Commerce Review do not imply a regulatory
  approval process beyond what is real.]
- [COUNSEL: confirm the no-substitution default and the error-correction language are
  consistent with the FTC Mail, Internet, or Telephone Order Merchandise Rule treatment
  in XR-COM-001.]
- [COUNSEL: confirm period for retention of this notice's publication versions
  (XR-POL-005).]

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
