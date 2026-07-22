# HIPAA and BAA Applicability Analysis

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-009 |
| Title | HIPAA and BAA Applicability Analysis |
| Audience | internal, counsel |
| Required member state | n/a (internal) |
| Trigger | in force from adoption; re-run before any professional-sharing integration, provider or plan partnership, Quantum administration arrangement, clinical service proposal, or vendor BAA request |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | applicability analyses and BAA decision records per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (internal analysis; adoption recorded by owner sign-off with version and date) |
| Withdrawal supported | n/a (internal policy, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-005, XR-POL-008, XR-POL-010, XR-TRK-011, XR-MEM-012 |
| Sources | See 00-register/SOURCE_REGISTRY.md; HHS covered entity guidance; HHS business associate guidance |
| Review date | 2026-07-19 |

## 1. Purpose and the hard rule

This document records the framework and working analysis for whether HIPAA applies to Xenios Research, and when business associate agreements (BAAs) would be required. Every conclusion is a working position for counsel to confirm; none is a legal opinion.

The hard rule comes first and does not depend on the analysis: Xenios never claims to be "HIPAA compliant" in any copy, product page, application answer, support reply, Telegram message, affiliate material, or partner conversation. Xenios has not been assessed against HIPAA and does not represent itself as a HIPAA covered entity for direct-to-consumer services unless counsel concludes otherwise. If a member or partner asks, the honest answer is: "Xenios Research is a private membership program, not a healthcare provider. Our HIPAA applicability analysis is with counsel; we do not claim HIPAA compliance. Our privacy commitments are in our privacy notices."

Not claiming HIPAA status is not a privacy escape hatch. The same data is governed by the FTC Health Breach Notification Rule analysis (XR-POL-008), FTC consumer protection law, and state consumer health privacy statutes, which counsel reviews separately.

## 2. The framework

HIPAA attaches by entity status, not by data type. Holding health information does not by itself make an organization HIPAA-regulated. Counsel works three questions:

1. Covered entity: is Xenios a health plan, a healthcare clearinghouse, or a healthcare provider that transmits health information electronically in connection with a HIPAA standard transaction (claims, eligibility, and similar billing transactions)?
2. Business associate: does Xenios create, receive, maintain, or transmit protected health information (PHI) on behalf of a covered entity, or provide services to one involving PHI?
3. Neither: if both answers are no, HIPAA does not govern Xenios's direct-to-consumer data handling, and the consumer-protection regimes in XR-POL-008 take the lead instead.

## 3. Working analysis for the program as designed

Working conclusion, for counsel to confirm: Xenios Research is currently neither a covered entity nor a business associate.

1. Not a health plan. Xenios sells a private membership ($50 activation, $25 monthly) to an education, planning, and tracking program. It provides no insurance and administers no benefits.
2. Not a clearinghouse. Xenios processes no healthcare claims and translates no billing transactions.
3. Not a covered healthcare provider. Xenios provides plans, Guides, a tracker, and support. It does not diagnose, prescribe, treat, or bill any payer, and it conducts no HIPAA standard transactions. The program documents state repeatedly that membership is not medical care. [COUNSEL: confirm that no program feature, including the assessment, plan reviews, and Guide answers, crosses into "healthcare provider" territory in any state, and note that state professional-licensure analysis is a separate question from HIPAA.]
4. Not a business associate. Xenios acts for its members, not for any covered entity. It has no covered-entity clients, receives no PHI from providers or plans on their behalf, and has signed no BAAs.

Member data (assessment answers, tracker entries, media, orders) is sensitive and is handled under the program's own consent and security documents. On this working analysis it is not PHI, because it is not held by or for a covered entity.

## 4. Lanes that would change the analysis

Each of the following is a stop-and-review event. The analysis is re-run with counsel before the lane opens, not after:

1. Professional sharing (XR-TRK-011): a member directs Xenios to share their data with their own clinician. Working view: acting at the member's direction, for the member, does not make Xenios a business associate of the clinician. [COUNSEL: confirm, including whether any receiving provider will demand a BAA anyway and how Xenios responds.]
2. Inbound provider data: if members import records or lab results that originate from covered entities, the working view is that member-directed imports into a consumer record do not create BA status. [COUNSEL: confirm.]
3. Quantum: the Quantum lane contemplates administration responsibility, a facility, and a licensed professional before commerce ever opens. If Xenios contracts with a provider or facility and handles patient information for that provider, BA status becomes a live question. No Quantum transaction structure is approved; this analysis is a listed precondition.
4. Partnerships: any arrangement where a covered entity (clinic, health plan, employer plan) offers Xenios to its patients or members, and Xenios handles information on that entity's behalf.
5. A future physician-led product lane (contemplated as a possible classification lane in the master readiness checklist).
6. Any vendor or partner asking Xenios to sign a BAA, in either direction. No one signs a BAA on Xenios's behalf except Samuel, after counsel review.

## 5. When BAAs would be required, and what signing one means

If counsel concludes any lane makes Xenios a business associate, then before that lane activates:

1. A BAA with the covered entity, on terms counsel approves.
2. Flow-down BAAs (subcontractor BAAs) with every vendor that would touch that PHI: hosting, database, media storage, email, and any support tooling. The vendor register (XR-POL-010) records which vendors offer BAAs; a vendor that cannot sign one is not used in that lane.
3. Segregation: the PHI lane is separated from the consumer lane in storage, access, and audit so HIPAA obligations do not silently spread to the whole platform. [COUNSEL: confirm the segregation design is sufficient.]
4. A HIPAA control assessment for that lane (safeguards, training, breach procedures) before any PHI flows. Only after that assessment, and only if counsel approves specific language, would any HIPAA-related statement be made, and it would describe the lane, never the whole program.

Conversely, Xenios does not sign BAAs it does not need. Signing a BAA as a courtesy imports obligations without cause. Requests are logged and declined with the standing answer in section 1 unless counsel says otherwise.

## 6. Interaction with the FTC HBNR and state law

The HIPAA and HBNR analyses are run together because they are designed to be complementary: the HBNR covers non-HIPAA personal health records. On the current working analysis Xenios sits in the HBNR lane for its consumer tracker (XR-POL-008). If a future lane creates PHI under a BAA, breaches in that lane follow HIPAA's breach rules and the covered entity's procedures instead. State consumer health privacy statutes apply on their own terms regardless of either federal regime. Counsel's incident-time analysis under XR-POL-007 walks all three lanes.

## 7. Standing statements

1. "Xenios Research is not a healthcare provider and does not claim HIPAA compliance." This is the approved shape of any answer on the subject, pending counsel's review of exact wording.
2. No marketing, affiliate, or Research Rep material may mention HIPAA at all. Reps are already barred from handling health information; they have no reason to invoke it.
3. Any document in this repository that claims or implies HIPAA status is a defect to be corrected against this analysis.

## 8. Reconciliation with the earlier analysis

An earlier analysis exists at docs/compliance/HIPAA_APPLICABILITY_ANALYSIS.md (Draft v0.1, 2026-07-18). It reached the same top-line working conclusion (neither covered entity nor business associate) for the pre-membership application platform, resting in part on the fact that the platform then collected no health data at all. That supporting fact is not true of the full program, which by design collects assessment, tracker, and media data. The entity-status reasoning survives; the "no health data" premise does not. This document supersedes the earlier file for the program. Its readiness sequence for opening health-data gates (counsel first, data mapping, vendor review, consent capture, security uplift) is preserved in substance across XR-POL-008, XR-POL-010, and XR-POL-011. Counsel should reconcile the two files and retire or re-scope the earlier one.

## Open items for counsel

- Confirm the working conclusion that Xenios is neither a covered entity nor a business associate for the program as designed (section 3).
- Confirm that no program feature crosses into healthcare-provider territory in any state, and scope the separate professional-licensure analysis (section 3).
- Confirm the professional-sharing analysis under XR-TRK-011, including how to respond if a receiving provider demands a BAA (section 4).
- Confirm the member-directed inbound records analysis (section 4).
- Rule on BA status for any proposed Quantum administration structure before commerce opens (section 4).
- Approve the BAA and subcontractor-BAA requirements and the lane-segregation design if any BA lane opens (section 5).
- Confirm the minimum retention period for analyses and BAA decision records (metadata table).
- Reconcile this document with docs/compliance/HIPAA_APPLICABILITY_ANALYSIS.md and retire or re-scope the earlier file (section 8).

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
