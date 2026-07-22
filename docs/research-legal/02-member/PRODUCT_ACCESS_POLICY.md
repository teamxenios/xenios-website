# Product Access Policy

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-MEM-010 |
| Title | Product Access Policy |
| Audience | member |
| Required member state | active member (presented as policy; summarized at the agreements step before payment) |
| Trigger | first entry into the member catalog; linked from every product page and the member account area |
| Route | /research/member (catalog and account); summarized in /research/apply agreements step |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (notice only; the agreements-step summary is accepted as part of the agreements bundle) |
| Withdrawal supported | no (a policy notice, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-MEM-009, XR-MEM-011, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FDA guidance on drug and supplement classification |
| Review date | 2026-07-19 |

## 1. Purpose

This policy explains who can see and buy products through Xenios Research, how product
availability is decided, and why a product you can see may not yet be purchasable. It is a
member-facing description of controls that are enforced server-side.

## 2. Member-only access

1. The catalog, prices, and purchasing are available only to active, approved members who
   have completed identity and age verification (21+), accepted the required agreements,
   paid the activation fee, authorized the monthly membership, and enrolled in mandatory MFA.
2. The shared entrance password at /research unlocks only the entrance and application layer.
   It does not unlock the catalog, prices, orders, subscriptions, Guides, the Blueprint, the
   tracker, referrals, store credit, private media, or admin.
3. Access is personal. Members may not share credentials, purchase on behalf of non-members,
   or resell products. Violations may lead to account action under the membership terms.

## 3. Server-side product lanes

One simple member interface sits over separate server-side lanes. Each lane has its own legal
and operational gate, and lane rules are enforced by the server, not by page visibility:

1. Supplement lane. Premium supplements (initial target brands Momentous and Pure
   Encapsulations, up to 50 candidates). No supplement is sold until reseller authorization,
   content rights, MAP and pricing rules, margin, fulfillment model, returns, and claims are
   confirmed in writing.
2. Research material lane. The current 15 peptide/research SKU records (P001 through P015).
   These are research products whose classification and permitted marketing lane are under
   formal review. Each SKU requires a written classification memorandum before its commerce
   lane is enabled.
3. Quantum lane. Member-facing state is Coming Soon. A product page and interest list are
   allowed. There is no commerce, no checkout, and no sales agreement for Quantum until
   classification, claims, administration, facility, state, quality, and transaction
   structure are approved.
4. Future clinical lane. Reserved for possible future physician-led services. Nothing in
   this lane exists today, and no current product or service is clinical care.

Disclaimers do not replace lawful product classification, truthful claims, quality, or
professional oversight in any lane.

## 4. Product states

Every product carries one of these states, visible to members:

```text
In Stock
Low Stock
Out of Stock
Waitlist
Documentation Review
Commerce Review
Temporarily Unavailable
Coming Soon
```

1. Catalog state is separate from commerce state. A product can be visible (catalog state)
   while purchasing is disabled (commerce state). Seeing a product page never implies the
   product is cleared for sale.
2. Only an enabled, in-stock, eligible product can be purchased, and eligibility is checked
   server-side at checkout, not just on the page.
3. Out-of-stock products stay visible with a waitlist and a notification preference. Waitlist
   position and status are anonymous, and Xenios never promises a restock date.
4. Documentation Review and Commerce Review mean the product is completing its written
   classification, claims, supplier, testing, labeling, or processor checks. No purchase is
   possible in these states.

## 5. State-by-state eligibility

1. Product availability can differ by the member's state. Some products may be restricted,
   conditioned, or unavailable in some states based on the state-by-state legal review
   (see JURISDICTION_AND_APPLICABILITY_MATRIX).
2. Eligibility is evaluated server-side against the member's verified information and the
   shipping destination. A product that is visible nationally may still be blocked at
   checkout for a restricted destination.
3. Members may not use forwarding addresses or misstate a destination to defeat a state
   restriction. Doing so is a violation of this policy.
4. The state matrix is maintained as products and laws change; changes apply prospectively.

## 6. Ordering controls

1. Large-order review. Orders over $1,000, quantities inconsistent with ordinary individual
   use, or orders flagged by risk rules receive manual review, with a target of approximately
   2 hours. The recommended flow is authorize, review by Samuel, then capture after approval
   (processor support to be confirmed).
2. Split fulfillment. For approximately the first 60 days, the fulfillment partner (Mitch)
   holds and fulfills peptide and Quantum inventory, and Xenios fulfills supplements. One
   member order may become multiple fulfillment orders and tracking numbers; the member sees
   one order history.
3. Subscriptions, shipping, returns, and cancellation are governed by their own documents;
   this policy controls only access and eligibility.

## 7. No entitlement to any product

Membership provides access to the member environment and the included plans and content. It
does not entitle a member to any specific product, price, or availability. Products may be
added, gated, restricted, or removed as classification, supply, quality, and legal review
require, subject to applicable law.

## Open items for counsel

- Confirm the retention period for policy-version and acceptance records under XR-POL-005:
  `[COUNSEL: confirm period]`.
- Approve the state-by-state eligibility matrix and the blocking behavior at checkout,
  including any states requiring a full product block rather than a checkout block:
  `[COUNSEL: state matrix sign-off]`.
- Confirm the anti-resale and no-forwarding-address terms are enforceable as written and
  correctly cross-referenced to the membership terms.
- Confirm the authorize-then-capture large-order flow with the payment processor and confirm
  the disclosure needed when capture is delayed.
- Confirm the exact legal entity name to substitute for `[ENTITY]`.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
