# Quality Agreement

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-FUL-004 |
| Title | Quality Agreement |
| Audience | fulfillment_partner |
| Required member state | n/a (partner agreement) |
| Trigger | Executed with the Master Fulfillment Agreement (XR-FUL-001). Must be in force before Mitch receives or holds any Xenios inventory. |
| Route | offline agreement |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for lot, disposition, complaint, and recall records] |
| Acceptance event | Wet or electronic signature by an authorized representative of each party, as a schedule to XR-FUL-001. |
| Withdrawal supported | No. This agreement ends with the Master Fulfillment Agreement's termination and transition provisions; traceability and recall duties for shipped lots survive. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-FUL-001, XR-FUL-002, XR-FUL-003, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This Quality Agreement defines the quality duties for all peptide and Quantum inventory Mitch receives, holds, picks, packs, and ships for Xenios. Capitalized terms have the meanings given in the Master Fulfillment Agreement (XR-FUL-001). Under the intended order of precedence in XR-FUL-001 Section 5.2, this agreement governs quality and safety subjects, subject to counsel confirmation.

The products are research products whose classification and permitted marketing lane are under formal review. That review makes quality documentation more important, not less: Xenios cannot assess, sell, ship, or recall what it cannot trace. Nothing in this agreement authorizes any human-use, therapeutic, or outcome claim about any product.

## 2. Quality decision ownership

2.1 Every quality decision (release from quarantine, excursion outcome, disposition) must be made by a named person with the authority and data to make it. Mitch must name its quality decision owner and a backup in writing before the first receipt of inventory. [CONFIG: Mitch quality decision owner, pending Mitch's written answers.]

2.2 On the Xenios side, Samuel Boadu (samuel@xeniostechnology.com) is the named accountable human. Escalations under this agreement go to him.

2.3 Customer support, on either side, never makes or guesses a quality decision. A support inquiry that raises a quality question converts into a quality event under Section 10.

## 3. Lot documentation

3.1 Every lot Mitch holds must have a certificate of analysis (COA) on file before any unit of that lot is picked.

3.2 Where applicable to the product type, the lot file must also contain sterility, endotoxin, identity, and purity documents. Applicability per SKU is recorded in the Product Master Data under the Product Supply Schedule (XR-FUL-002).

3.3 Stock with missing documentation is blocked: not reported as available, not reservable, not picked, not shipped. Documentation-missing is a blocked condition handled exactly like expired or quarantined stock; the unit is held in the quality_hold state (Section 6.1) until the documentation is complete.

3.4 Quality documents describe the tested lot only. Neither party may present a COA or related document as a promise of member outcomes or product performance.

## 4. Shelf life

4.1 Every lot must carry an expiry date or an approved retest date. A lot with neither is blocked.

4.2 Acceptable bases for a shelf-life date are: the manufacturer's label, a stability study, a supplier quality document, or an approved quality determination. A verbal statement is not a basis. No verbal-only shelf-life claims, in either direction, ever.

4.3 Neither party invents or extends a shelf-life date. An extension or correction requires a documented quality basis and flows through the update duties in XR-FUL-002 Section 5.

4.4 For every lot, the record must show: lot identifier, manufacture date, receipt date, opened date if relevant, expiry or retest date, storage conditions, transport conditions, excursions, and disposition.

## 5. FEFO picking

5.1 Picking follows First Expire, First Out (FEFO): the lot with the earliest expiry or retest date ships first. FIFO alone is not acceptable when lots have different expiry dates.

5.2 The following stock must never be picked or reported as available: expired, retest overdue, quarantined, excursion pending, damaged, recalled, and documentation-missing. These are blocked conditions; each maps to a Section 6.1 state (retest overdue and documentation-missing to quality_hold, excursion pending to temperature_hold, the others to their named states).

5.3 A lot within [CONFIG: minimum remaining shelf life at shipment, pending Mitch's written answers and Xenios policy] of its expiry or retest date requires Xenios's approval before shipment.

## 6. Inventory quality states

6.1 Every unit is in exactly one state at any time: available, allocated, picked, packed, shipped, quarantined, quality_hold, temperature_hold, damaged, expired, recalled, or destroyed. Blocked conditions map to states as follows: retest-overdue and documentation-missing stock is held in quality_hold, and excursion-pending stock is held in temperature_hold, until resolved.

6.2 State transitions are recorded with time and actor. The daily inventory feed under XR-FUL-001 Section 8 must reflect these states truthfully; reporting blocked stock as available is a material breach.

## 7. Quarantine and release

7.1 All incoming stock enters quarantine on receipt. Release to available requires: lot documentation complete under Section 3, shelf-life data complete under Section 4, storage conditions confirmed against the Product Master Data, and a recorded release decision by the quality decision owner.

7.2 Any event that casts doubt on a lot (excursion, damage, complaint, label question, counterfeit concern) returns the affected stock to quarantine or the applicable hold state immediately, before evaluation, not after.

## 8. Temperature control and excursions

8.1 The Product Master Data defines, per SKU: labeled storage range, transport range, maximum excursion, permitted excursion duration, freeze sensitivity, heat sensitivity, light sensitivity, and the quality decision owner for the SKU.

8.2 An excursion is any storage or transport condition outside the approved range. The mandatory flow is: quarantine, record, evaluate against approved data, then release or destroy. No step may be skipped and no release may occur without a documented evaluation.

8.3 Mitch must not represent any shipment as temperature-controlled without packout validation data. Validation must cover summer and winter conditions, lane distance, package size, coolant, insulation, payload, transit time, and worst-case delay. Mitch retains the protocol, results, temperature curves, deviations, and the approved configuration, and provides them to Xenios on request.

8.4 An unvalidated temperature-control representation is a material breach of XR-FUL-001.

## 9. Destruction and disposition

9.1 Returned, compromised, expired, or recalled product requires a documented disposition. Product is never restocked merely because the package looks unopened; there are no routine returns to sellable inventory in this program.

9.2 Destruction is recorded with: lot, quantity, reason, method, date, and the person performing and the person verifying. [COUNSEL: confirm whether third-party destruction certificates are required for any product category.]

9.3 Disposition records reconcile against the inventory feed so destroyed stock can never reappear as available.

## 10. Complaints and product concerns

10.1 Mitch must notify Xenios promptly, within [CONFIG: quality event notification window, pending Mitch's written answers], of any: potential adverse event, quality complaint, contamination, incorrect label, temperature failure, damaged stock, counterfeit concern, or recall.

10.2 Every inbound issue is classified into exactly one tier: support question, quality complaint, product concern, possible adverse event, serious adverse event, or emergency. Emergencies route to emergency services (911 in the US). Tier assignment on the Xenios side belongs to Xenios; Mitch reports facts and never communicates with members.

10.3 Complaint intake records must capture: order reference, SKU, lot, issue description, date received, evidence (photos, packaging, indicator where present), and current status. Mitch supports lot lookup for any complaint within [CONFIG: lot lookup response time, pending Mitch's written answers].

10.4 Adverse-event reporting obligations depend on each SKU's final classification, which is under formal review. Until counsel completes that review, every possible adverse event is escalated to Xenios without filtering. [COUNSEL: allocate adverse-event reporting responsibilities in writing per product lane once classification memoranda exist.]

## 11. CAPA

11.1 Every confirmed quality failure (wrong item, wrong lot, blocked stock shipped, excursion caused by handling, documentation failure, repeated feed error) requires a root-cause analysis and a corrective and preventive action (CAPA) record.

11.2 A CAPA record contains: event, root cause, correction, preventive action, owner, due date, and verification of effectiveness. Mitch delivers CAPA records to Xenios within [CONFIG: CAPA delivery window, pending Mitch's written answers].

11.3 Closing a CAPA without verification of effectiveness is not closure.

## 12. Recall

12.1 Both parties maintain named recall contacts, available on an emergency basis. [CONFIG: recall contacts and availability, pending Mitch's written answers.]

12.2 On recall initiation, the flow is: recall opened, stop sale, stop shipment, identify lots, identify affected orders, notify, track responses, reconcile stock, close. Mitch executes the stop-shipment, lot identification, physical segregation, affected-order export, and reconciliation steps. Xenios owns all member notification and all regulator and insurer communication, and Samuel Boadu is alerted immediately.

12.3 From any Fulfillment Order, Mitch must identify: lot, quantity, packer, carrier, tracking, ship date, and destination. From any lot, Mitch must identify every affected Fulfillment Order. This traceability is tested, not assumed.

12.4 A mock recall exercise must complete successfully before launch, and [CONFIG: mock recall frequency thereafter, pending agreement]. The exercise starts from a single lot number and must produce the full affected-order export within [CONFIG: mock recall target time].

12.5 Recall duties for lots Mitch shipped survive termination of XR-FUL-001.

## 13. Records and audit

13.1 Both parties retain quality records (lot files, state transitions, excursions, dispositions, complaints, CAPAs, recall exercises) per the Retention and Deletion Schedule (XR-POL-005). Corrections supersede prior records without erasing them, so the state of knowledge at any past date can be reconstructed.

13.2 Xenios may audit Mitch's quality records and facility practices relevant to Xenios inventory on reasonable notice. [COUNSEL: define audit scope, notice period, frequency, and confidentiality terms.]

13.3 Records requested during a recall, a member dispute, or an insurer or regulator inquiry are produced on an expedited basis. [CONFIG: expedited production window.]

## 14. Change control

14.1 Any change to shelf-life, storage, transport, or protection data is both a Product Master Data update under XR-FUL-002 Section 5 and a quality event under this agreement. Both tracks run in parallel.

14.2 Until Xenios accepts a change, the prior accepted record governs, and Xenios may block sale or shipment of the affected SKU.

## 15. Relationship to law

This agreement allocates operational quality duties between the parties. It is designed to support, and does not replace, the parties' duties under applicable law. It does not promise legal certainty, and it does not relieve either party of duties imposed by law.

## Open items for counsel

- Retention period for lot, disposition, complaint, and recall records (metadata table, Section 13.1).
- [CONFIG: Mitch quality decision owner and backup] (Section 2.1).
- [CONFIG: minimum remaining shelf life at shipment] (Section 5.3).
- Whether third-party destruction certificates are required for any product category (Section 9.2).
- [CONFIG: quality event notification window] (Section 10.1) and [CONFIG: lot lookup response time] (Section 10.3).
- Allocation of adverse-event reporting responsibilities per product lane once classification memoranda exist (Section 10.4).
- [CONFIG: CAPA delivery window] (Section 11.2).
- [CONFIG: recall contacts, mock recall frequency, and mock recall target time] (Section 12).
- Audit scope, notice period, frequency, and confidentiality terms (Section 13.2), and [CONFIG: expedited production window] (Section 13.3).
- Confirm this agreement's rank in the order of precedence for quality subjects (Section 1, per XR-FUL-001 Section 5.2).
- Reconcile Section 10 tiers with the member-facing product concern and adverse event instructions in docs/research-legal/04-commerce-product/ so partner routing and member instructions cannot diverge.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
