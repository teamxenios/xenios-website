# Receiving, Quarantine, and Release SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-018 |
| Title | Receiving, Quarantine, and Release SOP |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | Runs on every inbound inventory receipt at a Xenios-controlled location, and on any event that returns stock to quarantine. |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for receiving logs, quarantine records, release decisions, and dispositions] |
| Acceptance event | n/a (internal SOP; adoption recorded by founder approval with version and date) |
| Withdrawal supported | No. Internal versioned SOP; a later approved version supersedes this one. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-005, XR-POL-017, XR-FUL-002, XR-FUL-004 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FDA dietary supplement CGMP regulations |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This SOP governs what happens between a box arriving and a unit becoming sellable: receipt inspection, quarantine by default, document verification, the release decision, discrepancy handling, and records.

Scope: every inbound inventory receipt at a location Xenios controls. Under the split fulfillment model, that initially means the supplement inventory Xenios fulfills itself; Mitch holds and fulfills peptide and Quantum inventory for approximately the first 60 days, and Mitch's receiving, quarantine, and release duties are set by the Quality Agreement (XR-FUL-004), which applies the same principles. If Xenios later takes physical custody of any peptide or Quantum inventory, this SOP applies to that receiving in full.

The governing principle, shared with XR-FUL-004: stock is guilty until documented. Nothing is sellable because it arrived; it is sellable because its documents were verified and a named person released it.

## 2. Receipt inspection

On arrival, before anything is shelved, the receiver:

1. Verifies the shipment against the purchase order: supplier, SKUs, quantities.
2. Confirms the supplier is on the approved supplier list (XR-POL-017) and in scope for these SKUs. Product from an unapproved or out-of-scope supplier is refused or held as a discrepancy (Section 5); it never enters normal stock.
3. Inspects external condition: packaging damage, leaks, crushed or opened cartons, tamper evidence.
4. Checks temperature indicators where the SKU requires them per the Product Master Data (XR-FUL-002); a triggered indicator is a temperature concern under Section 5.
5. Captures, per SKU per lot: lot identifier, expiry or retest date, quantity, and condition. A unit without a readable lot or date is a discrepancy.
6. Photographs any anomaly at the time it is found.
7. Records the receipt in the receiving log (Section 7) with date, time, and receiver identity.

## 3. Quarantine by default

1. Every received unit enters the quarantined state immediately, without exception, including perfect-looking shipments from long-standing suppliers.
2. Quarantined stock is: not available, not reservable, not pickable, not visible as sellable inventory, and physically or systemically segregated so it cannot be picked by mistake. [CONFIG: physical segregation method at the Xenios location, e.g. designated quarantine shelf or bin.]
3. Quarantine is a one-way default: only a recorded release decision (Section 4) moves stock out of quarantine into available. No time-based auto-release exists.
4. Any later event that casts doubt on a lot (excursion, damage found, complaint, label question, authenticity concern, recall in the supplier's chain) returns the affected stock to quarantine immediately, before evaluation, not after. This mirrors XR-FUL-004 Section 7.

## 4. Release criteria and decision

Stock is released from quarantine only when all of the following are verified:

1. Supplier approved: the XR-POL-017 entry is current and in scope.
2. Documents complete: the lot's COA is on file, and any additional documents required for the product type per the Product Master Data (identity, purity, and for relevant products sterility and endotoxin) are present. Documentation-missing is a blocked state exactly like expired or quarantined.
3. Dates present: the lot carries an expiry date or an approved retest date. A lot with neither stays blocked.
4. Condition acceptable: inspection found no unresolved damage, temperature concern, or label mismatch against the specification.
5. Authenticity (supplements): the product arrived through the brand's authorized channel consistent with the reseller authorization on file.

The release decision:

1. Is made by a named quality decision owner, [CONFIG: named quality decision owner and backup for Xenios receiving; Samuel Boadu until appointed], never by whoever happens to be shelving stock, and never automatically by software.
2. Is recorded with: lot, quantity released, the checks performed, decision, date, and decider.
3. Places released stock into available under FEFO (First Expire, First Out): the lot with the earliest expiry or retest date sells and ships first. A lot within [CONFIG: minimum remaining shelf life at release, aligned with the XR-FUL-004 shipment rule] of its expiry or retest date requires founder approval before release.

## 5. Discrepancy handling

A discrepancy is any gap between what was expected and what arrived, or any doubt about what arrived.

| Discrepancy | Immediate action |
| --- | --- |
| Quantity mismatch (over or short) | Hold the affected SKUs in quarantine; record counts; notify the supplier in writing; reconcile before release. Overage is not a bonus, it is unverified stock. |
| Wrong item | Quarantine; photograph; notify supplier; return or destroy per supplier instruction and record the disposition. Never absorb a wrong item into stock. |
| Damage or leak | Quarantine; photograph; assess whether other units in the shipment are affected; supplier claim; disposition recorded. |
| Documentation missing or mismatched (no COA, lot on paper not on product, date discrepancy) | Stock stays quarantined; written request to supplier; release only after the correct document arrives and is verified. Repeated documentation failures are a for-cause requalification trigger under XR-POL-017. |
| Temperature concern (triggered indicator, suspect transit conditions) | Quarantine as temperature hold; record; evaluate against the SKU's approved excursion data in the Product Master Data; release or destroy per a documented evaluation. No step skipped, mirroring XR-FUL-004 Section 8. |
| Authenticity or tamper concern | Quarantine; do not open further units; escalate to Samuel immediately; supplier and, where warranted, brand notified. A confirmed authenticity failure disqualifies the channel under XR-POL-017. |

Escalation: every discrepancy is recorded the day it is found and reported to Samuel Boadu. He decides disposition where the table does not, and he is the named accountable human for any discrepancy that could affect a member.

Disposition rules: returned, compromised, or refused product is never restocked (consistent with the program's no-restock rule); destruction is recorded with lot, quantity, reason, method, date, and the person performing and verifying.

## 6. Storage after release

Released stock is stored under the conditions the Product Master Data requires for the SKU (temperature, light, orientation), positioned for FEFO picking. Expired, retest-overdue, quarantined, temperature-hold, damaged, and recalled stock is never reported as available, never reservable, and never picked; these blocked states match the inventory quality states in XR-FUL-004 Section 6 so the two locations speak the same language.

## 7. Records

The receiving log records, per receipt: purchase order reference, supplier, date and time, receiver, SKUs, lots, quantities, expiry or retest dates, condition findings, temperature indicator results where applicable, photographs of anomalies, discrepancy records and their resolution, the release decision (or continuing hold) with decider and date, and dispositions.

Records are retained per XR-POL-005. Corrections supersede prior entries without erasing them. The log must support both directions of traceability: from any lot to where its units went, and from any discrepancy to how it was resolved. These records are the receiving-side input to any recall exercise.

## Open items for counsel

- Retention period for receiving, quarantine, release, and disposition records (metadata table).
- [CONFIG: physical segregation method for quarantine at the Xenios location] (Section 3).
- [CONFIG: named quality decision owner and backup for Xenios receiving] (Section 4): currently a single-operator dependency on the founder; confirm whether a backup decision owner is required before launch.
- [CONFIG: minimum remaining shelf life at release] (Section 4), to be set consistently with the shipment-side rule in XR-FUL-004 Section 5.3.
- Whether any received product category carries regulatory receiving or storage duties beyond this SOP (for example supplement CGMP receiving expectations for a reseller holding finished goods). 
- Reconcile this SOP with XR-FUL-004 Sections 6 through 9 so state names, quarantine triggers, and disposition rules remain identical across Mitch's location and the Xenios location.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
