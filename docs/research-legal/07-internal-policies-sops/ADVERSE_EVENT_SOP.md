# Adverse Event SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-022 |
| Title | Adverse Event SOP |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | Adoption before any product commerce; invoked whenever an inbound message describes a possible health effect connected to a product |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for adverse event records per product lane] |
| Acceptance event | n/a (internal SOP; adoption recorded in the decision log) |
| Withdrawal supported | no (internal SOP, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-005, XR-POL-021, XR-POL-023, XR-POL-024, XR-COM-019, XR-MEM-023, XR-FUL-004, XR-FUL-008 |
| Sources | See 00-register/SOURCE_REGISTRY.md; Master pack 07 section U (adverse events and product concerns); Master pack 07 sections C and E (peptides; supplements); FDA MedWatch program (consumer and industry reporting) |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This SOP states how Xenios Research recognizes, records, and escalates possible adverse events. An adverse event is any undesirable health experience a person connects with a product, whether or not the product caused it. Causation is never judged at intake; recording is not an admission. This SOP applies to every product Xenios sells or fulfills, across every inbound channel: Telegram, email to research@xeniostechnology.com, the product concern instructions (XR-COM-019), a Research Rep passing along a report, or a supplier notice.

## 2. The six-way separation

Every inbound product-related message is classified into exactly one of six lanes at first contact. The lanes have different owners, different clocks, and different records. Classification uses the reporter's words, not staff interpretation, and always takes the more serious lane when in doubt.

| Lane | What it is | Handled under |
| --- | --- | --- |
| Support question | Service, order, account, plan, shipping questions. No product defect, no health effect. | Normal support flow (XR-MEM-023) |
| Quality complaint | The product may be defective, compromised, incorrect, or mislabeled. No health effect described. | Complaint Handling SOP (XR-POL-021) |
| Product concern | A worry about a product that is neither a defect report nor a health effect (for example a labeling question or a storage doubt). | XR-COM-019 intake, routed to the quality decision owner |
| Possible adverse event | Any described health experience connected to a product: symptoms, a reaction, an unexpected effect, however minor. | This SOP |
| Serious adverse event | A possible adverse event meeting the seriousness criteria in XR-POL-023. | Serious Adverse Event SOP (XR-POL-023) |
| Emergency | Anyone in current danger or a medical emergency. | Route to emergency services (911 in the US) first, before anything else |

One message can span lanes (a member reports a symptom and a cracked vial). Then both records are opened and linked; the adverse event lane controls the clock.

## 3. Intake and recording

1. Whoever receives the message (support staff or Infinity, the internal operations system) opens an adverse event record the same day. The report is never left in a chat thread; Telegram is not the system of record.
2. The record captures: record identifier; date received and date of the event as reported; channel; reporter identity and role (member, other person, Research Rep, supplier); the product, and where knowable the lot, order, and shipment linkage (the same linkage discipline as XR-POL-021); the event description verbatim, in the reporter's own words; any stated outcome so far; and whether the reporter says they sought medical care.
3. Staff record, they do not interpret. No diagnosis is written into the record, no causation opinion, no minimizing language. Voice messages are transcribed and the transcription is attached.
4. Photos or documents the reporter volunteers are attached through the platform's normal private media path (private storage, signed URLs, malware scanning, access audit). Nobody requests medical records at intake; any later request is a counsel-directed step.
5. Seriousness screening happens at intake using the criteria in XR-POL-023. If any criterion is met or plausibly met, the record escalates to the Serious Adverse Event SOP immediately.

## 4. No medical advice

1. Staff never diagnose, never advise treatment, never give dosing or administration direction, never tell a reporter to stop or continue using any product as a medical judgment, and never reassure anyone that a product did not cause an event.
2. The only permitted health statements are: encourage the reporter to contact their own licensed healthcare provider, and direct emergencies to 911. Both statements appear in the standard acknowledgment.
3. The acknowledgment to the reporter is factual: the report is recorded, it will be reviewed, how Xenios will follow up, and the provider and 911 guidance above. It contains no product-safety opinion. Support never guesses.

## 5. Escalation to Samuel

1. Every possible adverse event escalates to Samuel Boadu, Founder, the named accountable human, on the day it is received. Infinity alerts Samuel immediately on intake; the escalation is not batched into a queue.
2. Samuel (or counsel at his direction) decides the next steps: seriousness confirmation, supplier notification, quarantine of related stock, complaint linkage, and whether the pattern warrants a recall evaluation under XR-POL-024.
3. If the event plausibly indicates a lot-level product problem, the related lot moves to `quarantined` under XR-POL-019 pending evaluation, and lot traceability identifies other exposed orders.

## 6. Supplier and partner notification

1. Suppliers are notified of adverse events connected to their products under the Quality Agreement (XR-FUL-004), within the timeline that agreement sets, with the record's factual content and without the reporter's identity unless disclosure is required and permitted.
2. During split fulfillment, the fulfillment partner (Mitch) is notified where fulfillment facts are relevant (lot, storage, packout), under the Recall and Product Concern Schedule (XR-FUL-008). The partner receives no health information beyond what the evaluation strictly requires.
3. [COUNSEL: define the exact reporter-privacy rules for supplier notifications, including when identity or contact details may be shared for a supplier's own regulatory reporting duties.]

## 7. Regulatory analysis

1. Whether a given adverse event triggers a mandatory report, by whom, to which agency, on what form and clock, depends on the product's legal lane. The classification memoranda are pending, so this SOP fixes the process and leaves the duties to counsel:
   - [COUNSEL: for each peptide and research SKU (P001 to P015), determine what adverse event reporting duties, if any, attach given the product's classification outcome, and what voluntary reporting posture Xenios should adopt (for example FDA MedWatch voluntary reports).]
   - [COUNSEL: for supplements, confirm the mandatory serious adverse event reporting framework and its allocation, which is handled in XR-POL-023.]
   - [COUNSEL: determine any state-level reporting or notification duties.]
2. Until counsel concludes otherwise, Xenios makes no regulatory filing without counsel direction, and no adverse event record is deleted or altered; corrections supersede without erasing history.
3. Reporters are never discouraged from reporting directly to FDA MedWatch themselves, and the member-facing instructions (XR-COM-019) may say so plainly.

## 8. Follow-up, records, and trends

1. Follow-up with the reporter is limited to fact completion (missing lot, dates, outcome) and remedy handling under XR-COM-008 and XR-COM-009 where a product issue is also present. Follow-up never becomes monitoring of the person's health and never includes medical advice.
2. Records are retained per XR-POL-005 and are never destroyed by a member's cancellation: safety records survive membership.
3. Adverse events are reviewed in the monthly trend review together with complaints (XR-POL-021): counts by SKU, lot, and event type. Any cluster triggers quarantine, supplier engagement, and a recall evaluation under XR-POL-024.
4. This SOP is exercised before launch: a tabletop drill runs one simulated adverse event end to end (intake, record, escalation, supplier notice draft) as part of the production gate.

## Open items for counsel

- [COUNSEL: confirm the minimum retention period for adverse event records per product lane in XR-POL-005.]
- [COUNSEL: per-SKU adverse event reporting duties for the peptide and research SKUs after classification, and the recommended voluntary reporting posture.]
- [COUNSEL: state-level adverse event or consumer notification duties.]
- [COUNSEL: reporter-privacy rules for supplier notifications (section 6).]
- [COUNSEL: review the six-way separation definitions and the intake acknowledgment language for consistency with the no-medical-advice posture and consumer protection law.]
- Overlap: XR-COM-019 (Product Concern and Adverse Event Instructions) is the member-facing counterpart of this SOP, and the worktree contains earlier drafts under docs/compliance/. Counsel to reconcile so the member instructions and this internal SOP match exactly.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
