# Temperature-Control and Excursion Schedule

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-FUL-007 |
| Title | Temperature-Control and Excursion Schedule |
| Audience | fulfillment_partner |
| Required member state | n/a (fulfillment partner document, not member-facing) |
| Trigger | Execution of the Master Fulfillment Agreement (XR-FUL-001); must be in force before the Partner ships any temperature-sensitive SKU and before any Temperature-Controlled shipping service is offered to members |
| Route | offline agreement (schedule attached to the Master Fulfillment Agreement, XR-FUL-001) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; validation protocols, results, temperature curves, deviation records, and approved packout configurations retained at least as long as any lot shipped under them remains within its expiry or retest window, plus [COUNSEL: confirm tail period] |
| Acceptance event | wet/electronic signature as a schedule to the Master Fulfillment Agreement (XR-FUL-001) |
| Withdrawal supported | No. This is a contractual schedule. It changes only by written amendment signed by both parties. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-FUL-001, XR-FUL-002, XR-FUL-005, XR-FUL-006, XR-FUL-008, XR-POL-005, XR-COM-006, XR-COM-008 |
| Sources | See 00-register/SOURCE_REGISTRY.md; 04_MITCH_FULFILLMENT_PARTNER_PACK; 06_SHIPPING_STORAGE_SHELF_LIFE_AND_FULFILLMENT_MASTER |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This Schedule governs temperature control, packout validation, and excursion handling for the
peptide and Quantum inventory that the fulfillment partner (the "Partner") holds and fulfills for
Xenios Research during the split-fulfillment period. It attaches to and is governed by the Master
Fulfillment Agreement (XR-FUL-001). Storage segregation and the per-SKU shipping profile are set
out in XR-FUL-006; lot records and blocked stock states are set out in XR-FUL-005; notification
of temperature failures is set out in XR-FUL-008.

Temperature integrity is a data problem before it is a shipping problem. Every claim in this
Schedule rests on recorded data for a specific SKU, lot, and packout configuration. Where the
data does not exist, the claim is not made and the service is not offered.

## 2. Definitions

- "Excursion" means any storage or transport condition outside the approved range for a SKU or
  lot, including temperature, freeze events, and, where the profile requires, light exposure.
- "Packout" means the complete packaging configuration for a shipment: box, insulation, coolant,
  payload arrangement, and any indicator or logger.
- "Validation data" means retained protocol, results, and temperature curves demonstrating that a
  specific packout configuration holds the required range for the tested lane and duration.
- "Temperature hold" means the inventory state in which stock is blocked from fulfillment pending
  a documented excursion evaluation (see the state list in XR-FUL-005).
- "Quality decision owner" means the named person recorded in the SKU master who is accountable
  for release-or-destroy decisions for that SKU.

## 3. The core rule: no claim without validation data

The Partner must not tell Xenios that a shipment, service, or packout is temperature-controlled
without validation data. A verbal assurance, a coolant in the box, or a carrier marketing label
is not validation.

The same rule flows downstream. Xenios does not offer, market, or charge members for the
Temperature-Controlled shipping service (described in the member-facing disclosure XR-COM-006)
for any SKU or lane until the corresponding packout validation exists and is on file. An
unvalidated configuration is treated as ambient for claim purposes, and a SKU whose profile
requires temperature control simply does not ship on that lane until a validated packout exists.

## 4. SKU temperature master data

Before a temperature-sensitive SKU is offered for sale, the SKU master (fed by the Product Supply
Schedule, XR-FUL-002) must define for that SKU:

- labeled storage range
- transport range
- maximum excursion (magnitude)
- maximum excursion duration
- freeze sensitivity
- heat sensitivity
- light sensitivity
- quality decision owner

No value is inferred from the product name or category. A SKU missing any of these fields is not
eligible for temperature-controlled service, and if its labeled storage range cannot be met by
ambient shipment, it is not eligible for sale at all until the data arrives.

## 5. Packout validation

### 5.1 What is validated

Each packout configuration is validated per lane class and season before first use, covering at
minimum:

- summer condition
- winter condition
- lane distance (transit zone or duration class)
- package size
- coolant type and quantity
- insulation
- payload
- expected transit time
- worst-case delay (a missed connection or weekend hold, not only the on-time case)

A configuration passes only if the recorded temperature curve stays within the transport range
for the full tested duration, including the worst-case delay.

### 5.2 Approved configurations and seasonal packout

The output of validation is a written approved configuration. The Partner maintains separate
approved summer and winter configurations where the data requires it and applies the correct
seasonal configuration to each shipment, per XR-FUL-006 Section 8. A shipment must not go out
under an unvalidated or out-of-season packout.

### 5.3 Re-validation triggers

Re-validation is required before use when any of the following changes: the packaging bill of
materials for a temperature-relevant configuration (XR-FUL-006 Section 3.1), coolant type or
quantity, insulation, carrier or service in a way that changes transit time, or the payload
envelope. [CONFIG: periodic re-validation interval, to be set at onboarding.]

## 6. Validation records

For every validation the Partner retains and produces to Xenios on request:

- the protocol
- the results
- the temperature curves
- deviations, if any, and their resolution
- the approved configuration document

These records are retained per the metadata table above and XR-POL-005. Xenios relies on them
for the member-facing Temperature-Controlled service and for excursion evaluations, so missing
records are treated the same as missing validation: the claim is withdrawn and the service is
suspended for the affected configuration.

## 7. Monitoring

Storage areas holding temperature-sensitive SKUs are monitored, and the labeled storage range is
honored per XR-FUL-006 Section 2.1. Where a SKU profile requires a temperature monitor, indicator,
or logger in the parcel (XR-FUL-006 Section 4), the Partner includes it and records the device
type per shipment. Monitor and logger outputs are part of the lot and shipment record under
XR-FUL-005.

## 8. Excursion handling

When an excursion occurs or is suspected, in storage or in transit, the affected stock follows
one flow, with no shortcuts:

```text
quarantine
-> record
-> evaluate against approved data
-> release or destroy
```

- Quarantine: the affected lot or units move to quarantined or temperature_hold state immediately
  and are blocked from picking (XR-FUL-005 Section 7).
- Record: the Partner records what happened, the range and duration observed or estimated, the
  affected SKUs, lots, and quantities, and the data source (logger, indicator, monitoring alarm,
  carrier event).
- Evaluate: the quality decision owner evaluates the excursion against the approved stability and
  excursion data for that SKU. If no approved data covers the observed excursion, the evaluation
  cannot conclude "release".
- Release or destroy: the outcome is a documented decision. Released stock returns to available.
  Destroyed stock follows the documented disposition rule; it is never restocked, and the lot
  record in XR-FUL-005 carries the disposition.

An excursion affecting shipped orders is also a product concern: the Partner notifies Xenios
promptly under XR-FUL-008 so member-facing handling can begin.

## 9. Customer support never guesses

Members raise temperature concerns through the member-facing process (XR-COM-008). Neither
Xenios support nor the Partner ever improvises an answer about whether a product "is probably
fine". The only permitted answers come from the approved data through the quality decision owner.
Pending that evaluation, the member's report is handled as a temperature concern with the
remedies in the member-facing policy (replacement or refund; the product is never restocked), and
the affected inventory follows Section 8.

## 10. Legal posture

This Schedule states operational duties between Xenios and the Partner. It is designed to protect
product integrity; it is not a safety claim, a stability guarantee, or a product classification.
Products are research products whose classification and permitted marketing lane are under formal
review. Nothing here waives rights that cannot be waived under applicable law or relieves either
party of duties imposed by law, and nothing here is a member-facing promise of outcomes.

## Open items for counsel

- [COUNSEL: confirm the retention period and tail period for validation records under XR-POL-005,
  sized against the longest lot expiry or retest window.]
- [COUNSEL: confirm whether any federal or state storage, handling, or transport requirement
  applies to these SKUs given the pending classification review, and whether the excursion
  evaluation process needs a qualified-person standard for the quality decision owner.]
- [COUNSEL: reconcile this Schedule with the member-facing XR-COM-006 (Temperature-Controlled
  shipping disclosure) and XR-COM-008 (temperature concern remedies) so the member documents
  never promise more than the validated configurations support.]
- [COUNSEL: confirm the contractual consequence when the Partner ships under an unvalidated or
  out-of-season packout (replacement cost allocation, cure, termination trigger).]
- [CONFIG: periodic re-validation interval and monitoring alarm thresholds, to be set at
  onboarding and recorded.]

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
