# Inventory and Lot Reporting Schedule

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-FUL-005 |
| Title | Inventory and Lot Reporting Schedule |
| Audience | fulfillment_partner |
| Required member state | n/a (fulfillment partner document, not member-facing) |
| Trigger | Execution of the Master Fulfillment Agreement (XR-FUL-001); must be in force before the Partner ships any Xenios order |
| Route | offline agreement (schedule attached to the Master Fulfillment Agreement, XR-FUL-001) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; lot and traceability records retained long enough to support any recall of the affected lots |
| Acceptance event | wet/electronic signature as a schedule to the Master Fulfillment Agreement (XR-FUL-001) |
| Withdrawal supported | No. This is a contractual schedule. It changes only by written amendment signed by both parties. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-FUL-001, XR-FUL-002, XR-FUL-006, XR-FUL-007, XR-FUL-008, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; 04_MITCH_FULFILLMENT_PARTNER_PACK; 06_SHIPPING_STORAGE_SHELF_LIFE_AND_FULFILLMENT_MASTER |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This Schedule sets the inventory and lot reporting duties of the fulfillment partner (the
"Partner") that holds and fulfills peptide and Quantum inventory for Xenios Research during the
initial split-fulfillment period. During approximately the first 60 days, the Partner (Mitch)
holds and fulfills peptide and Quantum inventory while Xenios fulfills supplements. That period
continues until Xenios is operationally ready, not automatically on day 60.

Xenios cannot sell what it cannot see. Accurate, current inventory and lot data is the basis for
out-of-stock blocking, waitlists, First Expire First Out picking, excursion handling, and recall
traceability. This Schedule attaches to and is governed by the Master Fulfillment Agreement
(XR-FUL-001) between Xenios and the Partner. Capitalized terms not defined here have the meanings
in XR-FUL-001.

## 2. Definitions

- "SKU" means a Xenios stock keeping unit, one saleable product record.
- "Lot" means a batch of product manufactured or received together and identified by a single
  lot or batch number.
- "Expiry date" means the labeled date after which a lot must not be shipped.
- "Retest date" means an approved date by which a lot must be re-evaluated before further use.
- "Quarantined" means physically or systemically segregated stock that must not be picked,
  packed, or shipped pending a documented quality decision.
- "FEFO" means First Expire, First Out: the lot with the earliest expiry or retest date that is
  otherwise eligible ships first.

## 3. Daily inventory feed

### 3.1 Minimum content

The Partner delivers an inventory feed at minimum once per day. Each feed row carries, for every
Xenios SKU the Partner holds:

- SKU
- available quantity
- allocated quantity
- quarantined quantity
- damaged quantity
- expired quantity
- retest due quantity
- lot
- expiry (or retest date, identified as such)
- last updated timestamp

Quantities are reported per lot, not only per SKU, so that one SKU held across multiple lots
appears as multiple rows.

### 3.2 Delivery method

- API delivery is preferred and is the target state.
- A secure CSV transfer is acceptable during the pilot period only, delivered over an encrypted,
  access-controlled channel agreed in writing (for example a shared secure workspace or SFTP).
- Spreadsheets sent through personal email are prohibited. Inventory data must never move over
  personal email accounts, consumer chat apps, or any channel outside the agreed transfer method.
- [CONFIG: feed cutoff time and delivery channel are admin-configurable and recorded in the
  onboarding record.]

### 3.3 Frequency and staleness

Once per day is the floor, not the goal. The parties intend to move to intraday or event-driven
updates as the API integration matures. If a feed is missed or the last updated timestamp shows
data older than [CONFIG: staleness threshold, initial value to be set at onboarding], Xenios may
treat the affected SKUs as unavailable for sale until a current feed arrives.

## 4. Inventory states

The Partner's reporting must be able to distinguish, at minimum, the following states:

```text
available
allocated
picked
packed
shipped
quarantined
quality_hold
temperature_hold
damaged
expired
recalled
destroyed
```

Stock in any state other than "available" must never be reported as available. Stock that is
expired, retest overdue, quarantined, pending excursion evaluation, damaged, recalled, or missing
required documentation is blocked from fulfillment (see XR-FUL-006 and XR-FUL-007). Blocked
conditions map to the state list above: retest-overdue and documentation-missing stock is held
in quality_hold, and excursion-pending stock in temperature_hold, per the Quality Agreement
(XR-FUL-004) Section 6.1.

## 5. Product master data

Before launch, and before any new SKU is added, the Partner provides a product master record for
every SKU it will hold. At minimum: exact product name, Xenios SKU, supplier or manufacturer,
manufacturing location, composition, amount, format, container closure, case configuration, unit
cost, suggested price if any, stock on hand, allocated stock, minimum order, lot or batch,
manufacture date, expiry or retest date, shelf-life basis, storage range, light and moisture
protection, transport range, freeze and thaw limitations, excursion procedure, certificate of
analysis, sterility, endotoxin, identity, and purity documents where applicable, and the
regulatory and commercial classification as understood by the supplier. The full product master
data set, its due dates, and the consequences of missing or wrong data are defined in the Product
Supply Schedule (XR-FUL-002); this section summarizes the fields this Schedule's feed and lot
reporting depend on. Xenios treats product classification and the permitted marketing lane as
under formal review; Partner-supplied classification statements are inputs to that review, not
conclusions.

## 6. Lot records and shelf life

Every lot must carry either a labeled expiry date or an approved retest date, sourced from the
manufacturer label, a stability study, a supplier quality document, or an approved quality
determination. Verbal-only shelf-life claims are not accepted, and neither party invents a vial
shelf life. For each lot the Partner records and can produce on request:

- lot number
- date manufactured
- date received
- date opened, where relevant
- expiry or retest date and its data source
- storage conditions
- transport conditions
- excursions, if any (see XR-FUL-007)
- disposition

## 7. FEFO and blocked stock

The Partner picks by FEFO. FIFO alone is not acceptable when lots have different expiry dates.
The Partner's system or documented process must block picking of expired, retest overdue,
quarantined, excursion-pending, damaged, recalled, or documentation-missing stock.

## 8. Discrepancies and reconciliation

- The Partner reports any material discrepancy between physical stock and reported stock promptly
  upon discovery, with the affected SKUs and lots.
- The parties reconcile inventory monthly alongside financial settlement.
- Before any transition to Xenios self-fulfillment, the parties perform a joint physical
  inventory count and a full lot reconciliation, with transfer documentation for every lot moved.

## 9. Data handling and security

Inventory feeds may include only inventory and order-operations data. The Partner receives only
the member data needed to fulfill orders (name, shipping address, phone when the carrier requires
it, order items, order reference, shipping service) and never receives assessments, Blueprints,
tracker data, private media, unrelated order history, referral data, or the founder's notes.
Feed access is limited to named authorized users with multi-factor authentication, access is
removed promptly when a user leaves the work, passwords are never shared, transmission is secured,
and security incidents affecting the feed are reported to Xenios without undue delay. Records are
retained and deleted per the Master Fulfillment Agreement (XR-FUL-001) and XR-POL-005.

## 10. Legal posture

This Schedule states operational reporting duties. It is designed to support quality and
traceability obligations; it does not waive rights that cannot be waived under applicable law and
does not relieve either party of duties imposed by law. Nothing in this Schedule is a product
classification, a safety claim, or a promise of outcomes.

## Open items for counsel

- [COUNSEL: confirm that this Schedule is incorporated by reference into the Master Fulfillment
  Agreement (XR-FUL-001) and that the schedule set XR-FUL-005 through XR-FUL-008 is complete for
  the split-fulfillment period.]
- [COUNSEL: reconcile the product master summary in Section 5 with the Product Supply Schedule
  (XR-FUL-002) so one document is the single authoritative field list.]
- [COUNSEL: confirm the minimum retention period for inventory feeds, lot records, and
  reconciliation records under XR-POL-005, including recall-driven retention for lot records.]
- [CONFIG: feed cutoff time, delivery channel, and staleness threshold to be set at onboarding
  and recorded.]
- [COUNSEL: review whether the pilot secure-CSV channel meets the security standard in the
  existing VENDOR_RISK_STANDARD.md under docs/security/, and reconcile or supersede as needed.]
- [COUNSEL: confirm the contractual consequence of repeated missed feeds (suspension of sale,
  cure period, termination trigger).]

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
