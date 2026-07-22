# Quantum Concern and Adverse Event Matrix

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-QTM-007 |
| Title | Quantum Concern and Adverse Event Matrix |
| Audience | counsel |
| Required member state | n/a (internal) |
| Trigger | Quantum safety and reporting design, before any Quantum commerce |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); safety and adverse-event records typically retained longer [COUNSEL: confirm period] |
| Acceptance event | n/a (internal working document) |
| Withdrawal supported | no (internal record) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-QTM-003, XR-QTM-004, XR-QTM-005, XR-QTM-008 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FDA adverse-event reporting frameworks |
| Review date | 2026-07-19 |

## 1. Purpose

This matrix maps each type of Quantum-related concern to how it is taken in, how it is
escalated, whether any legal reporting duty applies, and who is responsible. It exists so
that a safety and reporting process is designed before Quantum can be sold, not after.
Every reporting conclusion is reserved for counsel. No cell authorizes any sale or
activation. Quantum stays Coming Soon until XR-QTM-008 is complete.

## 2. Fixed safety rules (independent of Quantum classification)

These apply now, regardless of how Quantum is later classified:

- Emergency language from a member routes the person to emergency services (911 in the US)
  first, before any internal handling.
- Telegram is not the system of record. No raw health media, IDs, payment data, passwords,
  or detailed assessments flow over Telegram. A concern raised on Telegram is captured and
  moved to the system of record.
- Samuel (samuel@xeniostechnology.com) is the named accountable human for escalations.
- No diagnosis, prescribing, or dosing occurs anywhere in the concern-handling process.

## 3. Column definitions

- Concern type: the category of what the member reported.
- Intake: how it is received and recorded (channel and where it lands in the system of
  record).
- Escalation: who it goes to and how fast.
- Reporting analysis: [COUNSEL] whether an external legal reporting duty applies (for
  example to FDA or another authority) and to whom.
- Responsible party: the named role that owns the response.

## 4. Concern and adverse event matrix

| Concern type | Intake | Escalation | Reporting analysis | Responsible party |
| --- | --- | --- | --- | --- |
| Support question about Quantum (non-safety) | Member channel to system of record; standard support ticket | Standard support queue; approximately 12-hour target | [COUNSEL: confirm no reporting duty for ordinary questions] | Support (founder-operated) |
| Product/quality complaint (for example damaged, wrong, or compromised item) | Ticket flagged as quality; linked to order and lot/tracking | Fulfillment and founder review | [COUNSEL: confirm complaint-record duties and whether any external notice applies] | Founder plus fulfillment partner |
| Product concern (member worried about the product itself, no reported harm) | Ticket flagged as product concern; separated from ordinary support | Founder review; route to counsel if pattern emerges | [COUNSEL: confirm threshold at which a concern becomes reportable] | Founder |
| Possible adverse event (member reports a health effect they associate with Quantum) | Structured safety intake; captured to the safety record, not left in chat | Prompt escalation to the named accountable human and to any involved licensed professional | [COUNSEL: determine whether and how this must be reported, and the timeline] | Named accountable human (Samuel) plus involved professional |
| Serious adverse event (for example hospitalization, life-threatening, or other serious outcome) | Immediate structured safety intake; emergency guidance given first if active emergency | Immediate escalation to the named accountable human and counsel; involve the licensed professional | [COUNSEL: determine the mandatory serious adverse event reporting duty, recipient, and timeline; allocate responsibility in writing] | Named accountable human (Samuel) plus counsel plus involved professional |
| Active emergency | Direct the person to emergency services (911) first; then record | Emergency services first; internal notification after the person is safe | [COUNSEL: confirm post-emergency reporting duties, if any] | Emergency services first; then founder |

## 5. Responsibility allocation must be in writing

If Quantum involves any party beyond Xenios (a manufacturer, a fulfillment partner, or a
licensed professional), the adverse-event and reporting responsibilities among those
parties must be allocated in a written agreement before commerce. This mirrors the
requirement already set for dietary-supplement serious adverse events, where
responsibilities must be allocated in writing.

## 6. Records

Safety and adverse-event records are retained under the retention schedule and are not
erased by a member's cancellation. Cancellation does not override legally required safety
retention.

## Open items for counsel

- [COUNSEL: complete every reporting-analysis cell above with the applicable duty, recipient, and timeline.]
- [COUNSEL: confirm the classification-dependent reporting regime once XR-QTM-003 concludes, since duties differ by product lane.]
- [COUNSEL: draft the written responsibility allocation among Xenios, the manufacturer, the fulfillment partner, and any professional.]
- [COUNSEL: confirm the retention period for Quantum safety and adverse-event records under XR-POL-005.]
- [COUNSEL: reconcile this matrix with any existing incident-response material under docs/security/ and state which governs Quantum safety intake.]

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
