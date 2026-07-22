# Recall and Product Concern Schedule

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-FUL-008 |
| Title | Recall and Product Concern Schedule |
| Audience | fulfillment_partner |
| Required member state | n/a (fulfillment partner document, not member-facing) |
| Trigger | Execution of the Master Fulfillment Agreement (XR-FUL-001); notification and traceability duties apply from the first unit of Xenios inventory the Partner receives |
| Route | offline agreement (schedule attached to the Master Fulfillment Agreement, XR-FUL-001) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; complaint, CAPA, traceability, mock recall, and recall records retained at least long enough to support a recall of any lot ever held, plus [COUNSEL: confirm tail period] |
| Acceptance event | wet/electronic signature as a schedule to the Master Fulfillment Agreement (XR-FUL-001) |
| Withdrawal supported | No. This is a contractual schedule. It changes only by written amendment signed by both parties. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-FUL-001, XR-FUL-005, XR-FUL-006, XR-FUL-007, XR-POL-005, XR-COM-018, XR-COM-019 |
| Sources | See 00-register/SOURCE_REGISTRY.md; 04_MITCH_FULFILLMENT_PARTNER_PACK; 06_SHIPPING_STORAGE_SHELF_LIFE_AND_FULFILLMENT_MASTER; FDA recall guidance (voluntary recalls) |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This Schedule defines how the fulfillment partner (the "Partner") and Xenios handle product
concerns and recalls for the peptide and Quantum inventory the Partner holds during the
split-fulfillment period. It attaches to and is governed by the Master Fulfillment Agreement
(XR-FUL-001). It depends on the lot records and inventory states in XR-FUL-005, the segregation
rules in XR-FUL-006, and the excursion process in XR-FUL-007.

The design principle: when something may be wrong with a product, speed and traceability decide
whether the response protects members. Every duty here exists so that Xenios can identify every
affected order from any lot, and the lot behind any order, within hours and not days.

## 2. Definitions

- "Product concern" means any of the events listed in Section 3 that could indicate a defect,
  contamination, mislabeling, temperature failure, counterfeit, or possible harm connected to a
  product.
- "Recall" means an action to remove affected product from sale, shipment, and members'
  possession, whether initiated by Xenios, a supplier, or a regulator.
- "CAPA" means corrective and preventive action: the documented fix for a root cause, not only
  the immediate symptom.
- "Mock recall" means a timed rehearsal of the recall process using a real lot and real order
  data, without member notification.
- "Affected-order export" means the data extract identifying every order that shipped any unit of
  a specified lot or lots.

## 3. Prompt notification duties

### 3.1 Events the Partner must report

The Partner notifies Xenios promptly upon becoming aware of any of the following:

- a potential adverse event (any report that a person may have experienced harm in connection
  with a product)
- a quality complaint
- contamination or suspected contamination
- an incorrect or misprinted label
- a temperature failure (including any excursion affecting shipped orders, per XR-FUL-007)
- damaged stock
- a counterfeit concern
- a recall, market withdrawal, or regulator contact involving any product or lot the Partner
  holds or has shipped for Xenios

### 3.2 How and how fast

- Notification goes to the founder and administrator, Samuel Boadu (samuel@xeniostechnology.com),
  through the agreed operational channel. [CONFIG: primary and backup notification channels and
  the initial notification window, to be set at onboarding; the intent is hours, not days.]
- The first notice may be incomplete. Report what is known, mark what is unknown, and follow up.
  Waiting for a full picture before the first notice is a breach of this Schedule's intent.
- A potential adverse event is escalated regardless of product classification. The classification
  review (see XR-FUL-001) does not reduce the duty to report possible harm.
- The Partner never contacts members. All member-facing communication belongs to Xenios
  (XR-FUL-001 Section 3.3), including recall notices under the member-facing Recall Notification
  Terms (XR-COM-018). Members report concerns to Xenios under XR-COM-019; Xenios routes relevant
  reports to the Partner.

## 4. Complaint intake and quality process

The Partner maintains, and demonstrates at onboarding:

- a complaint intake path with a named responsible contact
- lot lookup from any complaint (which lot, where it went)
- root cause analysis for confirmed quality issues
- CAPA records showing what changed so the issue does not recur
- named recall contacts reachable outside business hours [CONFIG: contact roster recorded at
  onboarding and kept current]

Complaint, root cause, and CAPA records for Xenios products are available to Xenios on request
and retained per XR-POL-005.

## 5. Lot-to-order traceability, both directions

Traceability must work in both directions at all times:

- From any order: the fulfillment owner, lot shipped, quantity, packer, carrier, tracking number,
  ship date, and destination.
- From any lot: every affected order that shipped any unit of that lot.

The Partner's ship confirmations (XR-FUL-006 Section 9) must therefore always carry the lot
actually shipped, and the lot records in XR-FUL-005 are the backbone of this Section. An order
shipped without a recorded lot is a traceability failure and is reported under Section 3 as a
quality complaint against the process.

## 6. Affected-order export

On request, and during any recall, the Partner produces an affected-order export for specified
lots containing: fulfillment order ID, SKU, lot, quantity, ship date, carrier, tracking number,
and destination reference. Target turnaround is [CONFIG: affected-order export turnaround, to be
set at onboarding; the mock recall in Section 8 measures the real number].

The export moves only over the secure channels agreed under XR-FUL-005 Section 9. No spreadsheets
through personal email. The export identifies orders by reference; member identity resolution for
notification happens inside Xenios systems, not at the Partner.

## 7. Recall execution

When a recall is opened, the parties execute this flow:

```text
recall opened
-> stop sale
-> stop shipment
-> identify lots
-> identify members
-> notify
-> track response
-> reconcile
-> close
```

Role split:

- Xenios: opens the recall decision, stops sale on the storefront, identifies affected members
  from the affected-order export, notifies members per XR-COM-018, tracks responses, and owns
  regulator and insurer communication under Section 9. Xenios's internal alerting system
  (Infinity) alerts Samuel Boadu immediately when a recall is opened; he is the named accountable
  human for the recall.
- Partner: stops shipment of affected lots immediately upon notice, moves affected stock to the
  recalled state and segregates it (XR-FUL-005, XR-FUL-006), produces the affected-order export,
  receives or confirms destruction of returned units as directed, and supports unit-level
  reconciliation (units shipped, units returned, units destroyed, units unaccounted for).
- Close: the recall closes only when reconciliation is documented and open counts are explained.

## 8. Mock recall

Before the first live fulfillment order, the parties run at least one mock recall on a real lot:
pick a lot, start the clock, produce the affected-order export, and reconcile it against shipping
records. The exercise measures time to lot identification, export completeness, and export
accuracy, and its results are retained. [CONFIG: recurring mock recall frequency during the
split-fulfillment period, to be set at onboarding.] A failed mock recall (missing orders, wrong
lots, or turnaround beyond the configured target) must be corrected and re-run before launch or,
after launch, treated as a CAPA item with a documented fix.

## 9. Regulator and insurer escalation

- Insurance: the Partner maintains the coverage required by XR-FUL-001, including product
  liability, cargo and transit coverage, and recall coverage, and provides current certificates.
  Xenios and the Partner each notify their insurers of recall events as their policies require.
- Regulators: where a recall or adverse event triggers a reporting obligation under applicable
  law, the obligated party reports, and the parties coordinate first wherever law permits.
  [COUNSEL: determine which regulatory reporting obligations apply to these products given the
  pending classification review, which party holds each obligation, and the required timelines.]
- Public statements: neither party makes public statements about a recall or adverse event
  without coordinating with the other, except as required by law. [COUNSEL: confirm this
  coordination clause is enforceable as drafted in XR-FUL-001.]

## 10. Disposition

Recalled, returned, or compromised product is never restocked and never resold, even if the
package looks unopened. Every affected unit receives a documented disposition (destroyed,
returned to supplier, or retained as evidence), recorded against its lot per XR-FUL-005. During
an open recall, destruction happens only as directed by Xenios so that reconciliation and any
regulator or insurer evidence needs are met first.

## 11. Legal posture

This Schedule is an operational readiness and cooperation framework between Xenios and the
Partner. It is designed to make recalls fast and complete; it is not a representation that any
product is safe, compliant, or free of defects, and it is not a product classification. It does
not waive rights that cannot be waived under applicable law, does not relieve either party of
duties imposed by law, and does not limit any duty either party owes members or regulators.
Member remedies are governed by the member-facing policies and applicable law.

## Open items for counsel

- [COUNSEL: determine the regulatory reporting obligations (agency, trigger, timeline, owner) for
  recalls and adverse events involving these products given the pending classification review.]
- [COUNSEL: confirm the retention and tail period for complaint, CAPA, traceability, mock recall,
  and recall records under XR-POL-005.]
- [COUNSEL: confirm the public-statement coordination clause and the cost-allocation rules for
  recall execution (notification, shipping, destruction, replacement) in XR-FUL-001.]
- [COUNSEL: reconcile this Schedule with the member-facing XR-COM-018 (Recall Notification Terms)
  and XR-COM-019 (Product Concern and Adverse Event Instructions) so member-facing timelines
  match what this operational flow can deliver.]
- [COUNSEL: review whether adverse-event reports received by the Partner require any handling
  beyond prompt escalation, for example a written intake record standard.]
- [CONFIG: notification channels and window, recall contact roster, affected-order export
  turnaround, and mock recall frequency, all set at onboarding and recorded.]

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
