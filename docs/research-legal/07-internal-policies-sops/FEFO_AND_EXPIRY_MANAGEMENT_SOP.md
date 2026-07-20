# FEFO and Expiry Management SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-019 |
| Title | FEFO and Expiry Management SOP |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | Adoption before the first sellable lot is received; applied at every receiving, picking, and monthly inventory review event |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for lot, disposition, and destruction records] |
| Acceptance event | n/a (internal SOP; adoption and fulfillment-partner acknowledgment recorded in the decision log and under the Quality Agreement) |
| Withdrawal supported | no (internal SOP, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-005, XR-POL-020, XR-POL-024, XR-COM-013, XR-FUL-004, XR-FUL-005, XR-FUL-006 |
| Sources | See 00-register/SOURCE_REGISTRY.md; Master pack 06 (Shipping, Storage, Shelf-Life, and Fulfillment Master); Master pack 07 section T (Quality) |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This SOP (standard operating procedure) states how Xenios Research manages product expiry and picking order so that no member ever receives expired, unverified, or blocked stock. It applies to every sellable physical product: the current peptide and research SKU records (P001 to P015) and any supplement SKU that later clears reseller authorization. It binds both fulfillment owners during the split-fulfillment period: Mitch (fulfillment partner) for peptide and Quantum inventory during approximately the first 60 days, and Xenios for supplement inventory. The Quality Agreement (XR-FUL-004) and the Inventory and Lot Reporting Schedule (XR-FUL-005) carry the partner-facing versions of these duties.

## 2. Definitions

1. Lot: a batch of product manufactured or received together and tracked under one lot identifier.
2. Expiry date: the date after which a lot may not be picked, shipped, or sold.
3. Approved retest date: a documented date by which a lot must be re-evaluated before further use, where the quality documentation supports retest instead of a fixed expiry.
4. FEFO: First Expire, First Out. The lot with the earliest expiry or retest date is picked first.
5. Blocked stock: inventory in any state that prohibits picking (listed in section 5).
6. Disposition: the documented decision about what happens to a lot or unit (release, hold, destroy).

## 3. Every lot has a documented shelf-life source

1. Every lot must carry exactly one of: an expiry date, or an approved retest date.
2. The date must come from a documented source: the manufacturer label, a stability study, a supplier quality document, or an approved quality determination recorded by the quality decision owner.
3. Xenios never invents a vial shelf life, and never infers one from the product name, from a similar product, or from a supplier's verbal statement.
4. A lot received without a documented expiry or retest date enters `quarantined` state on receipt and stays blocked until the documentation arrives and is filed. Documentation-missing stock is never sellable.
5. For each lot, the lot record captures: lot identifier, manufactured date (where provided), received date, opened date (where relevant), expiry or retest date and its source document, labeled storage conditions, transport conditions used, any temperature excursions (see XR-POL-020), and current disposition.

## 4. FEFO picking rule

1. Picking is FEFO: for any SKU with multiple available lots, the lot with the earliest expiry or retest date is picked first.
2. FIFO (first in, first out, by receipt date) alone is not acceptable when lots have different expiry dates. Receipt order does not control; expiry order controls.
3. The order and fulfillment system must assign the lot at pick time and record the lot identifier against the order line, so lot-to-order traceability exists in both directions (required by the Recall SOP, XR-POL-024).
4. A picker may not substitute a later-expiring lot for convenience. Any FEFO deviation requires a documented reason and the quality decision owner's approval before shipment.

## 5. Blocked states

Stock in any of the following states must be excluded from availability, picking, and sale. The inventory system enforces the block; a human cannot override it at pick time.

1. Expired: past its expiry date.
2. Retest overdue: past its retest date without a completed, documented retest decision.
3. Quarantined: held pending receiving checks, documentation, or a quality decision.
4. Excursion pending: a temperature excursion has been recorded and the evaluation under XR-POL-020 is not yet complete.
5. Damaged: physical damage to product, container, closure, label, or secondary containment.
6. Recalled: subject to an open recall under XR-POL-024.
7. Documentation missing: no documented expiry or retest source, no COA where required, or an incomplete lot record.

Blocked stock is also excluded from the storefront availability count, consistent with the Inventory and Availability Disclaimer (XR-COM-013). Blocked units move to `destroyed` only through a documented disposition; a returned or compromised unit is never restocked merely because the package looks unopened.

## 6. Expiry-risk monitoring

1. A monthly expiry-risk review runs for all inventory at both fulfillment owners. The fulfillment partner reports lot-level inventory under XR-FUL-005; Xenios consolidates.
2. The review lists every lot within [CONFIG: near-expiry window, initial value to be set by the quality decision owner] of its expiry or retest date, plus all blocked stock and its age in the blocked state.
3. Actions from the review: confirm FEFO is actually consuming the earliest-dated lots; slow-moving near-expiry lots may be flagged for the quality decision owner; retest-dated lots approaching their retest date are scheduled for a documented retest decision; lots that pass expiry move immediately to `expired` and are scheduled for documented destruction.
4. Near-expiry product is never discounted or pushed to members as a way to move risk onto them. If a lot cannot be consumed under FEFO before expiry, it is destroyed with documentation.
5. Infinity (the internal operations system) flags expiry-risk items to Samuel as they arise; the monthly review is the floor, not the ceiling.

## 7. Roles

1. Quality decision owner: Samuel Boadu, Founder, during the founding phase. Only the quality decision owner approves retest decisions, FEFO deviations, release from quarantine, and destruction dispositions.
2. Fulfillment partner: executes FEFO and the blocked states for the inventory it holds, and reports lot-level inventory and any state changes under XR-FUL-005.
3. Customer support: has no authority over lot states and never advises members about product quality or shelf life beyond the labeled date. Quality questions route to the quality decision owner.

## 8. Records

1. Lot records (section 3.5), pick-time lot assignments, monthly expiry-risk reviews, retest decisions, FEFO deviations, and destruction dispositions are retained per the Retention and Deletion Schedule (XR-POL-005).
2. Records must be sufficient to answer, for any order: which lot shipped, when, from which fulfillment owner; and for any lot: every order it touched. This is the traceability substrate the Recall SOP depends on.

## 9. Launch acceptance

Before production commerce, the launch acceptance tests must demonstrate: FEFO picking across two lots with different expiry dates, an out-of-stock block, a blocked-state exclusion (an expired lot cannot be picked), and lot assignment visible on the order record.

## Open items for counsel

- [COUNSEL: confirm the minimum retention period for lot, disposition, and destruction records in XR-POL-005.]
- [COUNSEL: confirm whether any state or federal rule imposes specific shelf-life, dating, or record duties for the peptide and research SKUs given their pending classification, and for supplements once reseller authorization exists.]
- [COUNSEL: review the retest-date concept and confirm the documentation standard required before a retest decision can extend use of a lot.]
- [CONFIG: near-expiry window for the monthly expiry-risk review.]
- Overlap: the worktree contains earlier drafts under docs/compliance/ and docs/risk/ (including RETENTION_POLICY.md and VENDOR_RISK_STANDARD.md). Counsel to reconcile or supersede any overlapping retention and vendor duties with this SOP and XR-POL-005.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
