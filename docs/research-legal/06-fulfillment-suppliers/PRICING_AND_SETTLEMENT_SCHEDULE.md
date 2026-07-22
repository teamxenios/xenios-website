# Pricing and Settlement Schedule

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-FUL-012 |
| Title | Pricing and Settlement Schedule |
| Audience | fulfillment_partner |
| Required member state | n/a (partner agreement) |
| Trigger | Partner onboarding. Must be executed with the Master Fulfillment Agreement (XR-FUL-001) before the first fulfillment order, since it defines how Mitch is paid. |
| Route | offline agreement |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for invoices and settlement records, noting tax record requirements] |
| Acceptance event | Wet or electronic signature by an authorized representative of each party; executed copy retained by both parties. |
| Withdrawal supported | No. Price changes follow the notice process in Section 8; the relationship ends through XR-FUL-001 and XR-FUL-014. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-FUL-001, XR-FUL-002, XR-FUL-005, XR-FUL-006, XR-FUL-013, XR-FUL-014, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. Purpose

This Schedule is part of the Master Fulfillment Agreement (XR-FUL-001) between [ENTITY] ("Xenios") and [ENTITY] ("Mitch"). It defines what Xenios pays Mitch for holding and fulfilling peptide and Quantum inventory during the split-fulfillment period, how invoices are issued and reconciled, and how prices may change.

A boundary first: Mitch's settlement prices are between Xenios and Mitch only. Xenios alone sets member-facing prices (including the $12.95 standard member shipping rate, which is a launch working rate, admin-configurable, and reviewed against actual cost). Nothing in this Schedule gives Mitch any authority over member pricing, and member charges do not determine what Mitch is owed.

## 2. Price components

Settlement for each fulfillment order is built from three components, each defined per SKU or per shipment:

### 2.1 Wholesale cost

The per-unit wholesale cost for each SKU is recorded in the product master under the Product Supply Schedule (XR-FUL-002), which requires unit cost per SKU as a launch-blocking data field. The wholesale cost schedule at execution is attached as Attachment A. [CONFIG: Attachment A, per-SKU wholesale cost table for P001 through P015; populated from Mitch's readiness response, not invented here.]

[COUNSEL: confirm whether the arrangement is (a) Xenios buying inventory at wholesale from Mitch, (b) Mitch fulfilling Xenios-owned inventory for a fee, or (c) consignment. Ownership of the inventory drives risk of loss, insurance (XR-FUL-011), and how "wholesale cost" is charged. The pack requires unit cost data but does not fix the ownership model.]

### 2.2 Shipping cost

The actual carrier cost for each shipment, at the service level Xenios selected in the fulfillment order (standard, 2-Day, Next-Day, Same-Day where eligible, or Temperature-Controlled on validated services only). Settlement uses [CONFIG: choose actual carrier-invoiced cost pass-through, or an agreed rate card per service level; proposed pass-through during pilot]. Mitch must use the carrier and service specified in the order and may not upgrade or downgrade at Xenios's cost without written approval.

Split shipments: one member shipping charge may fund multiple fulfillment shipments, and Xenios initially absorbs extra split-shipment cost. Mitch invoices actual shipments; the member-facing charge is irrelevant to settlement.

### 2.3 Packaging cost

The per-shipment packaging cost according to the packaging bill of materials in the Storage and Shipping Schedule (XR-FUL-006), including box, vial protection, tamper evidence, and, for temperature-controlled shipments, coolant, insulation, and indicator or logger. [CONFIG: packaging rate table by packout type and season, attached as Attachment B once validated packout data exists.] Xenios pays only for packouts that match the validated configuration; unvalidated temperature packouts are not billable as temperature-controlled.

## 3. What is not billable

Unless separately agreed in writing, Mitch may not bill: storage fees during the split-fulfillment period [COUNSEL: confirm; if storage is billable, add a rate and basis], account management fees, minimum monthly fees, charges for re-doing work caused by Mitch's own error, or charges for orders rejected before acceptance in the order API. Replacement shipments are billable or not according to the responsibility matrix (XR-FUL-013).

## 4. Monthly invoice

4.1 Mitch issues one invoice per calendar month, delivered within [CONFIG: invoice deadline, proposed 10 days] after month end, to samuel@xeniostechnology.com.

4.2 Each invoice line must reference: fulfillment order ID, ship date, SKU and quantity, lot shipped, wholesale component, shipping service and shipping cost component, packaging component, and any approved adjustment. Data must match the order API records (accepted, shipped, tracking) and the inventory and lot feed (XR-FUL-005).

4.3 Credits appear on the same invoice: responsibility-matrix outcomes (XR-FUL-013), billing errors from prior months, and agreed adjustments for damaged inventory attributable to Mitch under the Quality Agreement (XR-FUL-004).

## 5. Reconciliation

5.1 Xenios reconciles each invoice against its own records: fulfillment orders sent and accepted, tracking uploads, delivery outcomes, the daily inventory feed, and lot data.

5.2 Xenios may dispute any line within [CONFIG: dispute window, proposed 15 days] of receiving the invoice, in writing, stating the line and reason. The parties work the dispute in good faith; undisputed amounts are paid on time; disputed amounts are paid or credited within [CONFIG: proposed 10 days] after resolution.

5.3 Recurring reconciliation gaps (invoiced orders with no tracking, lot mismatches, quantity mismatches) are quality events under the Master Fulfillment Agreement and may trigger review, not just line disputes.

## 6. Payment terms

Undisputed invoice amounts are due net [CONFIG: payment terms, proposed 30 days] from receipt of a conforming invoice, by [CONFIG: payment method, proposed ACH]. Late amounts bear interest at [COUNSEL: confirm a lawful late-interest rate and any state limits], or the maximum lawful rate if lower. No set-off except for amounts resolved under Section 5 or the responsibility matrix (XR-FUL-013). [COUNSEL: confirm the set-off clause.]

## 7. Taxes

Each party bears the taxes the law imposes on it. [COUNSEL: confirm sales and use tax treatment of the wholesale, fulfillment service, shipping, and packaging components in the relevant states, and whether resale certificates are needed. Xenios separately owns member-facing tax collection.] Mitch must provide a W-9 before first payment (required in the Master Fulfillment Agreement onboarding documents).

## 8. Price changes

8.1 Wholesale cost, rate-card shipping (if elected), and packaging rates may change only with at least [CONFIG: price-change notice period, proposed 30 days] prior written notice, and changes apply prospectively only, to fulfillment orders submitted after the effective date of the change. No retroactive changes.

8.2 Carrier general rate increases pass through on the carrier's effective date when pass-through pricing applies, with notice as soon as Mitch knows of the increase.

8.3 If a price change materially worsens Xenios's economics, Xenios may accelerate the transition under XR-FUL-014 without penalty. [COUNSEL: confirm this right and its trigger threshold.]

## 9. Records and audit

Mitch keeps complete settlement records (orders, carrier invoices, packaging usage, lot data) for at least [CONFIG: record period, proposed 3 years; COUNSEL: confirm against tax and product record requirements] and permits Xenios, on reasonable notice, to audit records supporting any invoice from the prior [CONFIG: audit lookback, proposed 12 months]. Overbilling found by audit is credited promptly; a pattern of overbilling is a material breach.

## Open items for counsel

- [COUNSEL: confirm retention period for invoices and settlement records against tax requirements (metadata table, Section 9).]
- [CONFIG: Attachment A per-SKU wholesale cost table, from Mitch's readiness response (Section 2.1).]
- [COUNSEL: confirm the ownership model (purchase at wholesale, fulfillment fee on Xenios-owned inventory, or consignment) and conform this Schedule, XR-FUL-011, and risk-of-loss terms (Section 2.1).]
- [CONFIG: shipping settlement basis, pass-through versus rate card (Section 2.2, proposed pass-through during pilot).]
- [CONFIG: Attachment B packaging rate table by packout type and season (Section 2.3).]
- [COUNSEL: confirm whether storage is billable during the split-fulfillment period, and if so on what basis (Section 3).]
- [CONFIG: invoice deadline (Section 4.1, proposed 10 days), dispute window and post-resolution payment window (Section 5.2, proposed 15 and 10 days), payment terms and method (Section 6, proposed net 30, ACH).]
- [COUNSEL: confirm lawful late-interest rate and the set-off clause (Section 6).]
- [COUNSEL: confirm sales and use tax treatment and resale certificate needs by state (Section 7).]
- [CONFIG: price-change notice period (Section 8.1, proposed 30 days).]
- [COUNSEL: confirm the accelerated-transition right on material price worsening and its threshold (Section 8.3).]
- [CONFIG + COUNSEL: settlement record period and audit lookback (Section 9, proposed 3 years and 12 months).]

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
