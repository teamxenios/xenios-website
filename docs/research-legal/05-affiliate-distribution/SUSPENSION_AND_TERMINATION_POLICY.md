# Suspension and Termination Policy

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-AFF-014 |
| Title | Suspension and Termination Policy |
| Audience | affiliate, research_rep, organization_partner |
| Required member state | n/a (partner program document; in force for every approved partner for the life of the partner relationship) |
| Trigger | partner onboarding and certification; surfaced again with any suspension or investigation notice |
| Route | offline agreement / partner materials; partner dashboard later |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; investigation records retained at least as long as the related commission and audit records |
| Acceptance event | checkbox + timestamp + document version + partner reference recorded server-side as part of certification |
| Withdrawal supported | no (this is an enforcement policy, not a consent; it applies while the partner agreement is in force) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-AFF-007, XR-AFF-008, XR-AFF-009, XR-AFF-010, XR-AFF-013, XR-AFF-015, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Endorsement Guides; FTC Health Products Compliance Guidance; FTC Business Guidance Concerning Multi-Level Marketing |
| Review date | 2026-07-19 |

## 1. Purpose

The partner program only works if a violation is stopped quickly, investigated fairly, and resolved on the record. This policy defines when a partner is suspended, how an investigation runs, what happens to commissions during it, and how the relationship ends or resumes. It applies to affiliates, Research Reps, organization partners and their approved reps, and any future partner lane, alongside the partner's signed agreement.

One rule sits above everything here: no violation can be offset by sales volume. A high-performing partner receives the same enforcement as any other.

## 2. Partner status lifecycle

Every partner holds exactly one status at a time, recorded in the program system:

```text
Applicant
Approved
Certified
Active
Quality Review
Suspended
Terminated
```

- Quality Review: the partner may continue normal activity, but flagged content or conduct is under heightened review, and specific activities may be restricted in writing.
- Suspended: all promotion stops (Section 4).
- Terminated: the relationship has ended (Section 7).

Samuel Boadu is the decision authority for every status change. Each change is recorded with a timestamp, reason, and actor in the admin audit log.

## 3. Immediate suspension triggers

Any of the following places the partner into Suspended immediately, before investigation, because the conduct creates safety, privacy, or fraud risk that cannot wait:

1. Safety claim: stating or implying a product or program cures, treats, or is safe for everyone (XR-AFF-009 Section 3).
2. Dosing: recommending dosing, timing, cycles, or administration methods, or any diagnosis or prescribing conduct (XR-AFF-009 Section 4).
3. Privacy breach: collecting, storing, or exposing health information, applicant information, or member information, at an event or anywhere (XR-AFF-013 Section 6, XR-AFF-010 Section 8).
4. Account sharing: sharing partner portal credentials, or letting others post from a registered channel for Xenios promotion (XR-AFF-010 Section 3).
5. Fraudulent orders: self-referrals, duplicate identities, circular orders, refunded conversion farming, fake leads, rep-created accounts, or personal payment collection (XR-AFF-013 Section 5).
6. Identity misuse: impersonating Xenios, claiming to speak for Xenios, or misusing another person's identity (XR-AFF-010 Section 9).
7. Unauthorized resale: buying inventory for resale under an affiliate or rep agreement, or selling outside an approved wholesale lane (XR-AFF-007 Template E prerequisites).
8. Unapproved product representation: promoting peptide SKUs while that lane is closed, presenting Quantum beyond Coming Soon, running unapproved ads, or making claims outside the approved set.

Suspension on a trigger is protective, not a final finding of fault. The investigation in Section 5 decides the outcome.

## 4. What suspension means

From the moment of suspension notice:

1. All promotion stops: posts, events, outreach, links, and codes. Xenios deactivates the partner's attribution links and codes.
2. Partner portal access is restricted to viewing notices, the commission ledger, and the dispute process.
3. Xenios may require specified content to be corrected or removed within [CONFIG: correction window, hours].
4. No new commissions accrue on activity occurring during suspension, and no payouts are made while suspended (Section 6).
5. The partner must preserve records relevant to the investigation and must not delete flagged content before Xenios has captured it.

Continuing to promote while suspended is independent grounds for termination.

## 5. Investigation process

1. Notice. The partner receives a written notice stating the conduct at issue, the policy provisions involved, the suspension status, and the response deadline.
2. Evidence gathering. Xenios captures the relevant content, ledger entries, attribution records, lead records, and audit log entries. Monitoring records under XR-AFF-008 and XR-AFF-009 feed in.
3. Partner response. The partner has [CONFIG: response window, days] to respond in writing with their account and any evidence. Silence does not stall the process; the investigation proceeds on the available record.
4. Review. Samuel Boadu reviews the record. He may ask follow-up questions, require an interview, or extend the investigation in writing.
5. Target timeline. Xenios aims to complete an investigation within [CONFIG: investigation target, days] of the suspension notice, and gives written status updates if it runs longer.
6. Decision. The outcome is one of: no violation found, corrective action with reinstatement, or termination (Sections 7 and 8). The decision is written, states its reasons, and is recorded.

## 6. Commissions during investigation

1. On suspension, all of the partner's unpaid commissions move to the held state under XR-AFF-007 Section 7. Held is a pause, not a forfeiture.
2. No payouts occur while an investigation is open.
3. If the investigation finds no violation, held commissions return to their prior state and proceed normally, including any payout that came due during the hold.
4. If a violation is confirmed, commissions attributable to the violating conduct may be reversed under XR-AFF-007 Section 7, including already-paid amounts, subject to applicable law. Commissions unrelated to the violation are released unless the agreement provides otherwise.
5. The partner may dispute any resulting commission decision through the Commission Dispute Policy (XR-AFF-015). Filing a dispute never worsens the partner's treatment (XR-AFF-015, no retaliation).

## 7. Termination

1. Termination ends the partner relationship. It is the outcome for confirmed serious violations, repeated violations after corrective action, promotion while suspended, or fraud.
2. On termination: links and codes are permanently deactivated, portal access ends except for final ledger and dispute access, and the partner must stop all use of Xenios brand assets, approved materials, and any claim of affiliation, immediately.
3. Final accounting: eligible commissions in approved status that survive the investigation are paid on the normal cycle; reversed amounts are settled per XR-AFF-007. [COUNSEL: confirm state rules on final commission payment timing for terminated independent representatives.]
4. Obligations that survive termination include confidentiality, privacy and data obligations, record preservation for open matters, and cooperation with any regulatory inquiry arising from the partner's conduct, as set in the partner agreement.
5. Xenios may report suspected fraud or unlawful conduct to processors, platforms, or authorities where appropriate.
6. A terminated partner may not reapply for [CONFIG: reapplication bar, months], and never after termination for fraud, safety claims, or privacy breach unless Samuel Boadu approves an exception in writing.

## 8. Reinstatement

1. Reinstatement is available when the investigation ends in corrective action rather than termination.
2. Conditions may include: completed retraining and reassessment on the relevant modules, correction or removal of all non-compliant content, a written compliance commitment, and a defined Quality Review period with heightened monitoring.
3. Reinstatement restores the partner to Certified or Active status and reactivates links and codes. Held commissions are handled per Section 6.
4. A second confirmed violation of the same kind after reinstatement leads to termination absent exceptional circumstances found in writing.

## 9. Relationship to law

This policy operates alongside the partner's signed agreement and applicable law. It does not waive rights that cannot be waived under applicable law, and it does not relieve Xenios of duties imposed by law. Enforcement decisions here are program decisions; they are not legal findings, and they do not limit any party's legal remedies except as the signed agreement lawfully provides.

## Open items for counsel

- [COUNSEL: confirm retention period for investigation and enforcement records under XR-POL-005.]
- [CONFIG: correction window in hours; partner response window in days; investigation target in days; reapplication bar in months.]
- [COUNSEL: confirm state rules on timing and payment of final commissions to terminated independent representatives.]
- [COUNSEL: confirm the enforceability of reversing already-paid commissions after a confirmed violation, aligned with XR-AFF-007 Section 7.]
- [COUNSEL: review the immediate-suspension trigger list against the partner agreement's termination-for-cause clause so the two match.]
- [COUNSEL: advise on notice and cure-period requirements, if any, that state independent-contractor or sales-representative statutes impose before suspension or termination.]
- [COUNSEL: confirm what survives termination (confidentiality, data obligations, cooperation) is stated identically in the partner agreements.]

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
