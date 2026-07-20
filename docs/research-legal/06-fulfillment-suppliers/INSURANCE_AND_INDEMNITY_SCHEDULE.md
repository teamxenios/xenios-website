# Insurance and Indemnity Schedule

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-FUL-011 |
| Title | Insurance and Indemnity Schedule |
| Audience | fulfillment_partner |
| Required member state | n/a (partner agreement) |
| Trigger | Partner onboarding. Certificates of insurance must be delivered and verified before launch, before Mitch holds any Xenios inventory, and before the first fulfillment order. |
| Route | offline agreement |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for insurance certificates and indemnity records] |
| Acceptance event | Wet or electronic signature by an authorized representative of each party; executed copy retained by both parties. |
| Withdrawal supported | No. Coverage and indemnity duties run for the term and survive as stated in Sections 6 and 9. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-FUL-001, XR-FUL-006, XR-FUL-013, XR-FUL-014, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. Purpose

This Schedule is part of the Master Fulfillment Agreement (XR-FUL-001) between [ENTITY] ("Xenios") and [ENTITY] ("Mitch"). It states the insurance Mitch must carry while holding and fulfilling peptide and Quantum inventory for the Xenios Research program, the proof Xenios requires before launch, and the framework for indemnity between the parties.

The products are research products whose classification and permitted marketing lane are under formal review, some requiring temperature-controlled storage and transport. That risk profile drives the coverage list below. All limits, terms, and allocations are placeholders until Xenios's counsel and insurance broker confirm them.

## 2. Required coverages

Mitch must obtain and maintain, at its own cost, with insurers reasonably acceptable to Xenios [COUNSEL: confirm a minimum insurer financial strength rating requirement]:

| Coverage | What it must cover here | Minimum limit |
| --- | --- | --- |
| Product liability (or CGL with products-completed operations) | Bodily injury and property damage arising from products Mitch stores, handles, or ships for Xenios | [COUNSEL/insurer: confirm limit, per occurrence and aggregate] |
| Commercial general liability | Premises and operations at the fulfillment facility | [COUNSEL/insurer: confirm limit] |
| Cargo / transit coverage | Loss of or damage to Xenios inventory in transit, including temperature-controlled shipments | [COUNSEL/insurer: confirm limit per shipment and aggregate] |
| Warehouse legal liability or equivalent | Loss of or damage to Xenios inventory while in Mitch's custody at the facility | [COUNSEL/insurer: confirm limit and valuation basis (replacement cost versus wholesale)] |
| Recall coverage | Costs of a recall affecting lots Mitch stored or shipped, including notification, retrieval, and destruction | [COUNSEL/insurer: confirm limit and whether a joint or separate recall policy is appropriate] |
| Workers compensation and employer liability | Mitch's own personnel, as required by law | statutory / [COUNSEL/insurer] |
| Cyber liability | Incidents affecting Member Fulfillment Data or the order integration | [COUNSEL/insurer: confirm whether required given XR-FUL-009 duties, and the limit] |

[COUNSEL: confirm the final coverage list, limits, deductibles, and whether any coverage may be satisfied by Xenios's own policies instead.]

## 3. Certificates and proof before launch

3.1 Before launch, and in any case before Mitch receives any Xenios inventory, Mitch must deliver certificates of insurance evidencing every required coverage, together with the company documentation required by the Master Fulfillment Agreement (legal entity, address, responsible contacts, W-9).

3.2 Certificates must be renewed and redelivered at each policy renewal and on Xenios's reasonable request. Xenios may verify coverage directly with the broker or insurer.

3.3 Mitch must give Xenios at least [CONFIG: notice period, proposed 30 days] written notice before any cancellation, non-renewal, or material reduction of a required coverage. Lapse of a required coverage is grounds for suspension of fulfillment orders and, if uncured, termination under XR-FUL-001.

## 4. Additional insured and related status

4.1 [COUNSEL: confirm that Xenios ([ENTITY]) should be named as an additional insured on Mitch's product liability, general liability, and cargo policies, and whether a waiver of subrogation and primary and non-contributory wording should be required.]

4.2 [COUNSEL: confirm whether Xenios inventory in Mitch's custody should instead or additionally be scheduled on a Xenios property or stock throughput policy, and which party bears the premium.]

## 5. Xenios's own coverage

Xenios separately maintains its own insurance program (product liability, general liability, cyber, and related lines) per the compliance readiness master. This Schedule does not shift Xenios's own coverage duties to Mitch. [COUNSEL/insurer: confirm Xenios's own required lines and limits before launch; this is tracked in the production gate.]

## 6. Indemnity framework

All allocations in this Section are proposals pending negotiation and counsel review. None is agreed until the Master Fulfillment Agreement is executed with counsel-approved indemnity language. [COUNSEL: draft the operative indemnity clauses; the framework below states intent only.]

6.1 Proposed Mitch indemnity. Mitch would defend and indemnify Xenios against third-party claims to the extent arising from: (a) Mitch's negligence or willful misconduct in receiving, storing, handling, picking, packing, or shipping; (b) Mitch's breach of the Quality Agreement (XR-FUL-004), the storage and shipping requirements (XR-FUL-006), or the data duties (XR-FUL-009); (c) unvalidated temperature-control representations, given the rule that Mitch must never claim a shipment is temperature-controlled without validation data; and (d) Mitch's violation of law in performing the services.

6.2 Proposed Xenios indemnity. Xenios would defend and indemnify Mitch against third-party claims to the extent arising from: (a) Xenios's member-facing statements, marketing, and claims; (b) Xenios's product selection and labeling decisions, except where the defect arises from Mitch's handling; and (c) Xenios's breach of its own obligations under the Agreement.

6.3 Product-origin defects. Claims arising from an inherent product defect (manufacturing, composition, contamination at origin) raise supplier responsibility questions. [COUNSEL: allocate between the parties and the upstream supplier, coordinated with the supplier terms in XR-FUL-002 and the responsibility matrix in XR-FUL-013.]

6.4 Procedure. The indemnified party must give prompt notice, allow the indemnifying party to control the defense with counsel reasonably acceptable to the indemnified party, and cooperate. No settlement that admits fault for, or imposes obligations on, the indemnified party without its consent.

## 7. Relationship to the responsibility matrix

Day-to-day cost allocation for individual failed orders (replacements, refunds, chargebacks) is governed by the Chargeback, Refund, and Replacement Responsibility Matrix (XR-FUL-013). This Schedule governs insurance and third-party claims. Where both could apply, [COUNSEL: confirm order of precedence].

## 8. No limitation of legal duties

Nothing in this Schedule waives rights that cannot be waived under applicable law, and nothing relieves either party of duties imposed by law. Insurance limits are not caps on legal liability unless counsel-approved limitation language in the Master Fulfillment Agreement says so. [COUNSEL: draft any limitation of liability and confirm its interaction with the indemnities and insurance limits.]

## 9. Survival

Indemnity obligations, and the duty to maintain products-completed operations and recall coverage for claims arising from the term, survive termination for [CONFIG: tail period, proposed 3 years; COUNSEL: confirm tail coverage length given product shelf life and limitation periods].

## Open items for counsel

- [COUNSEL: confirm retention period for insurance certificates and indemnity records (metadata table).]
- [COUNSEL: confirm minimum insurer financial strength rating (Section 2).]
- [COUNSEL/insurer: confirm every coverage limit, deductible, and valuation basis in the Section 2 table, including whether cyber liability is required and whether recall coverage is joint or separate.]
- [CONFIG: pre-cancellation notice period (Section 3.3, proposed 30 days).]
- [COUNSEL: confirm additional insured status, waiver of subrogation, and primary and non-contributory wording (Section 4.1).]
- [COUNSEL: confirm whether Xenios inventory should be covered under a Xenios stock throughput policy and who pays (Section 4.2).]
- [COUNSEL/insurer: confirm Xenios's own required insurance lines and limits before launch (Section 5).]
- [COUNSEL: draft the operative indemnity clauses; the Section 6 framework is intent only, and all allocations are pending negotiation.]
- [COUNSEL: allocate product-origin defect responsibility across Mitch, Xenios, and upstream suppliers (Section 6.3).]
- [COUNSEL: confirm precedence between this Schedule and XR-FUL-013 where both could apply (Section 7).]
- [COUNSEL: draft any limitation of liability and confirm interaction with indemnities and insurance (Section 8).]
- [CONFIG + COUNSEL: survival tail period (Section 9, proposed 3 years).]

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
