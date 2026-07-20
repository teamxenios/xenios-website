# Transition and Termination Assistance Schedule

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-FUL-014 |
| Title | Transition and Termination Assistance Schedule |
| Audience | fulfillment_partner |
| Required member state | n/a (partner agreement) |
| Trigger | Partner onboarding. Executed with the Master Fulfillment Agreement (XR-FUL-001); activated when Xenios gives a transition notice or when the Agreement is terminated. |
| Route | offline agreement |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for transition records, counts, and certifications] |
| Acceptance event | Wet or electronic signature by an authorized representative of each party; executed copy retained by both parties. |
| Withdrawal supported | No. Assistance duties are triggered obligations that survive notice of termination as stated in Section 8. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-FUL-001, XR-FUL-002, XR-FUL-004, XR-FUL-005, XR-FUL-006, XR-FUL-009, XR-FUL-010, XR-FUL-012, XR-FUL-013, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. Purpose

This Schedule is part of the Master Fulfillment Agreement (XR-FUL-001) between [ENTITY] ("Xenios") and [ENTITY] ("Mitch"). The split-fulfillment arrangement (Mitch holds and fulfills peptide and Quantum inventory; Xenios fulfills supplements) is intended to cover approximately the first 60 days after launch. It does not end automatically on day 60: it continues until Xenios is operationally ready to self-fulfill. This Schedule defines how the parties prove that readiness, move the inventory, and cut over without breaking member orders, lot traceability, or the cold chain.

The same steps apply, compressed where necessary, if the Agreement terminates before Xenios planned to transition.

## 2. Triggers

1. Planned transition: Xenios gives written transition notice when it believes it is ready to self-fulfill. Target start is around day 60, but the notice, not the calendar, starts this Schedule.
2. Termination for convenience: either party terminates under XR-FUL-001. The transition steps run during the notice period.
3. Termination for cause: the steps run on an accelerated timeline set by Xenios, acting reasonably, prioritizing member orders, product integrity, and data return. [COUNSEL: confirm that for-cause acceleration and who bears the extra cost.]

## 3. Transition steps

The parties must complete every step below, in order, each with a named owner and written evidence. No step is skipped; a step is complete only when its acceptance criterion is met.

| # | Step | What it requires | Acceptance criterion |
| --- | --- | --- | --- |
| 1 | Joint inventory count | Physical count of all Xenios peptide and Quantum inventory at Mitch's facility, both parties present or verifiably represented, by SKU, lot, and condition class (available, allocated, quarantined, damaged, expired, retest due) | Signed count sheet matching the daily inventory feed (XR-FUL-005), or every variance documented and resolved |
| 2 | Lot reconciliation | Reconcile every lot against the product master: lot number, expiry or retest date, COA on file, storage history, excursion log | Written lot ledger with zero unexplained lots; quarantined, damaged, or expired stock separated for disposition under XR-FUL-004, never shipped and never restocked |
| 3 | Transfer documentation | Prepare the transfer records: packing manifests by SKU and lot, chain-of-custody forms, condition photos, transport plan honoring each SKU's transport range and freeze-thaw limits (XR-FUL-002, XR-FUL-006) | Complete document set signed by both parties before any product moves |
| 4 | Storage readiness | Xenios's receiving location verified against each SKU's storage range, light and moisture protection, monitoring, and quarantine area | Written readiness checklist with evidence (monitoring logs or mapping data) [CONFIG: verification evidence required, proposed temperature monitoring records covering at least 7 days] |
| 5 | Validated packout | Xenios can perform the validated packaging configurations, including seasonal and temperature-controlled packouts with coolant, insulation, and indicator or logger | Packout validation summary transferred and demonstrated at Xenios; no temperature-controlled shipping by Xenios without validation data (the same rule that binds Mitch) |
| 6 | Carrier accounts | Xenios carrier accounts active for every service level offered to members (standard, 2-Day, Next-Day, Same-Day where eligible, Temperature-Controlled on validated services only), with label generation and tracking upload tested | Test labels generated and tracking events flowing into Xenios systems |
| 7 | SOP training | Mitch delivers and walks through the operating SOPs: receiving, FEFO picking, packout, excursion assessment, quarantine, complaint intake, recall support | Training log signed; Xenios staff perform each SOP under observation |
| 8 | Test orders | End-to-end test orders through the real order pipeline to Xenios self-fulfillment: pick, pack, label, ship, track, deliver | [CONFIG: number of test orders, proposed at least 10, covering each service level in use] completed with zero critical errors |
| 9 | Parallel week | A defined period where Xenios fulfills a controlled share of live volume while Mitch remains ready as fallback | [CONFIG: parallel period, proposed 7 days] with error rate at or below [CONFIG: acceptance threshold]; any member-affecting failure handled under XR-FUL-013 |
| 10 | Final cutover | A dated cutover after which all new fulfillment orders route to Xenios; residual Mitch inventory transferred or dispositioned; final settlement prepared | Cutover confirmed in writing by both parties; no fulfillment orders remain open at Mitch except agreed wind-down shipments |

## 4. During the transition

4.1 Member experience is protected: members keep seeing one order history, and open orders are completed by whichever party holds them at cutover. No member-facing interruption is an acceptable transition cost.

4.2 Mitch continues to meet the SLA (XR-FUL-003) and quality duties (XR-FUL-004) at full standard until final cutover. Transition is not an excuse for degraded service.

4.3 Quantum remains commerce-disabled throughout. Quantum inventory transfers as storage stock only, under the same lot and condition documentation, with no fulfillment orders. The Quantum lane stays closed until separately approved.

## 5. Data return and deletion

Within [CONFIG: data return window, proposed 14 days] after final cutover (or termination effective date if earlier), Mitch must: complete any data return Xenios requests, then securely delete Member Fulfillment Data per XR-FUL-009 Section 11 and certify deletion in writing; and return or destroy Xenios Confidential Information per XR-FUL-010 Section 8. Records Mitch must keep by law remain protected by XR-FUL-009 and XR-FUL-010 for as long as they are held.

## 6. Final settlement

6.1 Mitch issues a final invoice under XR-FUL-012 covering the period through cutover, including agreed transition assistance fees (Section 7), minus credits owed under XR-FUL-013.

6.2 The joint inventory count (Step 1) is the settlement baseline for inventory: variances between the count and the feed are resolved before final payment. Damaged or missing inventory attributable to Mitch is credited per the Quality Agreement and XR-FUL-013. [COUNSEL: confirm inventory variance allocation, which depends on the ownership model chosen in XR-FUL-012 Section 2.1.]

6.3 Final undisputed amounts are paid on the normal XR-FUL-012 terms. No party withholds transition cooperation over a settlement dispute. [COUNSEL: confirm this no-withholding clause.]

## 7. Assistance fees and cost allocation

[COUNSEL: confirm the fee model for transition assistance.] Proposed framework: steps 1 through 3 and 7 (count, reconciliation, documentation, SOP training) are included in the relationship at no extra charge for a planned transition; physical transport cost of moving inventory is borne by [COUNSEL: propose Xenios for planned transition and termination for convenience by Xenios; Mitch where termination is for Mitch's uncured material breach]; extended assistance beyond [CONFIG: included assistance period, proposed 30 days from transition notice] is billable at [CONFIG: agreed hourly or per-task rates].

## 8. Survival

The duties in Sections 3 through 7 survive notice of termination and continue until completed. XR-FUL-009 (data), XR-FUL-010 (confidentiality), XR-FUL-011 (insurance tail and indemnity), and the record duties of XR-FUL-012 survive per their own terms. This Schedule does not waive rights that cannot be waived under applicable law and does not relieve either party of duties imposed by law.

## Open items for counsel

- [COUNSEL: confirm retention period for transition records, counts, and certifications (metadata table).]
- [COUNSEL: confirm for-cause acceleration mechanics and who bears the extra cost (Section 2).]
- [CONFIG: storage readiness evidence (Step 4, proposed at least 7 days of monitoring records).]
- [CONFIG: number and coverage of test orders (Step 8, proposed at least 10).]
- [CONFIG: parallel period length and acceptance error threshold (Step 9, proposed 7 days).]
- [CONFIG: data return window after cutover (Section 5, proposed 14 days).]
- [COUNSEL: confirm inventory variance allocation at final settlement, pending the ownership model decision in XR-FUL-012 Section 2.1 (Section 6.2).]
- [COUNSEL: confirm the no-withholding clause tying cooperation and settlement disputes apart (Section 6.3).]
- [COUNSEL: confirm the transition assistance fee model, transport cost allocation, included assistance period, and extended assistance rates (Section 7).]
- [CONFIG: included assistance period (Section 7, proposed 30 days) and extended assistance rates.]

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
