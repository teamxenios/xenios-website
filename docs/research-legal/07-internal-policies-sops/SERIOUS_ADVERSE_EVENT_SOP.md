# Serious Adverse Event SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-023 |
| Title | Serious Adverse Event SOP |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | Adoption before any supplement commerce; invoked the moment any adverse event report meets or plausibly meets a seriousness criterion |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm the serious adverse event record retention period, understood to be a multi-year statutory minimum for supplements] |
| Acceptance event | n/a (internal SOP; adoption recorded in the decision log; supplier allocation acknowledged in writing under XR-FUL-004) |
| Withdrawal supported | no (internal SOP, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-005, XR-POL-022, XR-POL-024, XR-COM-015, XR-COM-019, XR-FUL-004, XR-FUL-008 |
| Sources | See 00-register/SOURCE_REGISTRY.md; Master pack 07 section U (dietary-supplement serious adverse event responsibilities allocated in writing) and section E (supplements); FDA MedWatch program |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This SOP states what happens when an adverse event report is serious. It sits on top of the Adverse Event SOP (XR-POL-022): everything there (six-way separation, verbatim recording, no medical advice, lot linkage) still applies, and this SOP adds the seriousness determination, the written allocation of reporting duties, the escalation clock, and the regulatory reporting analysis. It matters most for the supplement lane, where federal law imposes mandatory serious adverse event reporting on a defined responsible party, but the process applies to every product Xenios sells.

## 2. What counts as serious

1. A serious adverse event is an adverse event whose reported outcome includes any of: death; a life-threatening experience; inpatient hospitalization; a persistent or significant disability or incapacity; a congenital anomaly or birth defect; or an event requiring medical or surgical intervention to prevent one of those outcomes, based on reasonable medical judgment.
2. [COUNSEL: confirm this working definition against the governing federal definition for dietary supplements, and state which definition applies to each other product lane once classification concludes.]
3. Staff apply the criteria to the reporter's stated facts only. Staff do not diagnose and do not discount a report because it seems implausible. If the facts plausibly meet any criterion, the event is treated as serious until counsel or the decision owner concludes otherwise, and the downgrade is documented.

## 3. Responsibilities are allocated in writing before commerce

1. For dietary supplements, federal law places mandatory serious adverse event reporting on a defined responsible person connected to the product label. Xenios sells third-party supplement brands (Momentous, Pure Encapsulations candidates) as an authorized reseller, so who holds the duty, and what Xenios must forward to whom, cannot be left to assumption.
2. Before any supplement is sold, a written allocation must exist for that brand, normally inside the Quality Agreement (XR-FUL-004) or the supplier's adverse event agreement, stating: who the label's responsible party is; the reporting duties they hold; what Xenios must forward to them, in what form, and on what clock; and the contact channel for doing so. Master pack 07 section E lists an adverse-event agreement as a supplement gating item; no supplement launches without it.
3. [COUNSEL: draft or approve the written allocation for each supplement brand, confirm whether Xenios as reseller carries any direct reporting duty, and confirm the responsible party's identity as stated on each label.]
4. For the peptide and research SKUs, mandatory reporting frameworks depend on the pending classification memoranda. [COUNSEL: state the serious adverse event duties, if any, for each research SKU after classification, and the voluntary reporting posture in the meantime.]
5. This gating item appears in the production gate: no commerce for a product until its serious adverse event allocation row is approved with an owner and evidence attached.

## 4. Immediate escalation

1. Emergency first: if the reporter or anyone else is in current danger, they are directed to emergency services (911 in the US) before any workflow step.
2. Infinity (the internal operations system) alerts Samuel Boadu immediately when a report is flagged serious, at any hour. This escalation is never queued and never waits for the normal support response window.
3. Samuel engages counsel promptly. Target: counsel is contacted within [CONFIG: escalation window, initial target 24 hours] of a serious flag, and sooner where a reporting clock may be running.
4. In parallel, the related lot moves to `quarantined` under XR-POL-019, lot traceability identifies every other order that received the lot, and a recall evaluation under XR-POL-024 is opened if the facts suggest a product defect.

## 5. Records

1. The serious adverse event record extends the XR-POL-022 record with: the seriousness criteria met; the escalation timeline (who was alerted when); the supplier or responsible-party notification (what was sent, when, to whom, with delivery evidence); the regulatory analysis and its conclusion; any report actually filed, by whom, with the submission receipt; and the follow-up log.
2. Records are append-only in effect: corrections supersede earlier entries without erasing them. Nothing is deleted on membership cancellation; safety records survive.
3. Retention follows XR-POL-005 at the statutory minimum for the lane. [COUNSEL: confirm the supplement serious adverse event retention period and whether it also covers related follow-up correspondence.]

## 6. FDA reporting analysis

1. Whether a mandatory report must be filed, by whom, on which form, and by when is a legal determination made per event. The working understanding to be confirmed: supplement serious adverse events are reported by the responsible party through the FDA MedWatch reporting framework within a short statutory window measured in business days from receipt of the report. [COUNSEL: confirm the form, the deadline, and how the clock runs when Xenios receives the report and must forward it to the responsible party.]
2. Xenios's default posture during the founding phase: forward every supplement serious adverse event to the brand's responsible party on the written allocation's clock, keep delivery evidence, and file nothing directly without counsel direction, unless the written allocation assigns Xenios a direct duty.
3. Reporters are never discouraged from reporting directly to FDA MedWatch themselves. Nothing in any Xenios document conditions a remedy on not reporting.
4. New safety information arriving after an initial report (a follow-up from the reporter, a medical outcome) is forwarded through the same allocation channel. [COUNSEL: confirm follow-up reporting duties.]

## 7. Member follow-up boundaries

1. Follow-up is fact completion, not care: missing dates, lot confirmation, outcome as the reporter states it, and the reporter's consent where any further sharing needs it.
2. Staff never provide medical advice, never direct treatment or dosing, never characterize causation, and never make settlement-style statements. The standing guidance stands: contact your own licensed healthcare provider; emergencies go to 911.
3. Contact frequency is restrained and documented. If the reporter asks Xenios to stop contacting them about the event, follow-up stops except where a legally required step remains, and that exception is exercised on counsel's direction.
4. Remedies for any accompanying product issue run under the normal policies (XR-COM-008, XR-COM-009) and are never presented as conditioned on the member's silence or on withdrawing the report.

## 8. Label and instructions linkage

1. Supplement labels must carry the contact information through which serious adverse events can be reported, per the responsible party's compliance. Xenios verifies at supplement onboarding that the label carries it, as part of the label review gate in Master pack 07 section E. [COUNSEL: confirm the exact label requirement and whose address appears.]
2. The member-facing Product Concern and Adverse Event Instructions (XR-COM-019) and the Supplement Acknowledgment (XR-COM-015) must match this SOP: how to report to Xenios, that members may report directly to FDA MedWatch, and that emergencies go to 911. Counsel to reconcile all three so no document promises a different process.

## Open items for counsel

- [COUNSEL: confirm the working seriousness definition in section 2 against the governing federal definition, per lane.]
- [COUNSEL: draft or approve the written serious adverse event allocation for each supplement brand; confirm the responsible party per label; confirm whether Xenios as reseller carries any direct reporting duty.]
- [COUNSEL: confirm the reporting form, deadline, clock mechanics, and follow-up reporting duties for supplement serious adverse events, and the duties, if any, for the research SKUs after classification.]
- [COUNSEL: confirm the serious adverse event record retention period in XR-POL-005.]
- [COUNSEL: confirm the supplement label contact requirement in section 8.]
- [CONFIG: counsel escalation window in section 4 (initial target 24 hours).]
- Overlap: this SOP must stay consistent with XR-POL-022, XR-COM-015, XR-COM-019, and XR-FUL-004; counsel to reconcile all serious adverse event language across them.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
