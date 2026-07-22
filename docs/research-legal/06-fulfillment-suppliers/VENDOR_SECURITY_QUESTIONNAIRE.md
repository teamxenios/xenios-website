# Vendor Security Questionnaire

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-FUL-015 |
| Title | Vendor Security Questionnaire |
| Audience | fulfillment_partner |
| Required member state | n/a (partner onboarding, pre-engagement) |
| Trigger | Before a vendor receives member shipping data or Xenios systems access; again at contract renewal, after a material change (new subcontractor, new system, personnel change affecting access), or after a security incident |
| Route | Offline document exchange (sent from research@xeniostechnology.com; returned by an agreed secure channel, never personal email) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | Per Retention and Deletion Schedule (XR-POL-005); retained for the duration of the vendor relationship plus [COUNSEL: confirm period] |
| Acceptance event | Wet or electronic signature by the vendor's authorized representative, attesting that answers and attachments are accurate; the signed questionnaire and evidence are retained with the vendor file |
| Withdrawal supported | No (a completed questionnaire is a factual attestation; it is superseded by an updated submission, not withdrawn) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-FUL-001, XR-FUL-005, XR-FUL-009, XR-FUL-010, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; NIST Cybersecurity Framework; NIST SP 800-63B; FTC Start with Security guidance |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This questionnaire screens the security posture of any vendor that receives Xenios Research member data, connects to Xenios systems, or fulfills member orders. The immediate use is qualification of the initial fulfillment partner (Mitch), who under the Master Fulfillment Agreement (XR-FUL-001) holds and fulfills peptide and Quantum inventory for approximately the first 60 days while Xenios fulfills supplements. The same questionnaire applies to any later fulfillment, logistics, courier data, or software vendor in this lane.

A completed, signed questionnaire is required before the vendor receives any member shipping data or systems access. Xenios reviews the answers, records a rating under Section 10, and only then provisions access. This questionnaire operationalizes, for order-fulfillment vendors, the pre-engagement assessment in the existing platform standard at docs/risk/VENDOR_RISK_STANDARD.md. Where the two documents differ, counsel must reconcile them (see Open items for counsel).

## 2. Data boundaries the vendor must accept

Under XR-FUL-009 and XR-FUL-010, a fulfillment vendor may receive only: member name, shipping address, phone number when the carrier requires it, order items, order reference, and shipping service. A fulfillment vendor may never receive: assessment data, Blueprint content, tracker data, private media, unrelated order history, referral data, founder notes, passwords, reset tokens, identity documents, or payment data. Answers to this questionnaire are evaluated against these boundaries. A vendor that needs data outside the permitted list is out of scope for this engagement until counsel approves a change.

## 3. How to complete this questionnaire

1. Answer every question in writing. "Yes" or "No" alone is not sufficient where the question asks for detail.
2. Attach evidence where a question says "attach". Screenshots, policy excerpts, and certificates are acceptable.
3. If an answer is "planned but not implemented", state the implementation date.
4. Return the completed questionnaire through the agreed secure channel. Do not send it, or any attachment containing order data, through personal email accounts.
5. Sign the attestation in Section 11.

## 4. Section A: Access control

| # | Question | Answer |
| --- | --- | --- |
| A1 | List every person who will access Xenios order data or systems (name, role). Attach the authorized user list. | |
| A2 | Is access role-based and limited to what each person needs for fulfillment (least privilege)? Describe how. | |
| A3 | Are any accounts or passwords shared between people? (Shared accounts are disqualifying, see Section 10.) | |
| A4 | Describe your process and timeline for removing access when a person leaves or changes role. | |
| A5 | Who is your named security contact accountable for this engagement? | |

## 5. Section B: Multi-factor authentication (MFA)

| # | Question | Answer |
| --- | --- | --- |
| B1 | Is MFA (a second factor beyond a password) enforced on every system that stores or accesses Xenios order data, including email? (No MFA is disqualifying without a committed remediation date.) | |
| B2 | Which MFA methods are used (authenticator app, hardware key, SMS)? | |
| B3 | Is MFA enforced for administrator accounts on those systems? | |

## 6. Section C: Transmission security

| # | Question | Answer |
| --- | --- | --- |
| C1 | Confirm that order and inventory data will never be sent through personal email accounts or unmanaged spreadsheets. (Refusal is disqualifying.) | |
| C2 | Describe the secure transmission method you will use for the inventory feed under XR-FUL-005 (API preferred; secure CSV acceptable during the pilot) and for order data. Is data encrypted in transit? | |
| C3 | Where is Xenios data stored at rest, and is it encrypted at rest? | |

## 7. Section D: Incident history and reporting

| # | Question | Answer |
| --- | --- | --- |
| D1 | Describe any security incident, data breach, or unauthorized access affecting your systems in the past 36 months, including resolution. Write "none" only if true. | |
| D2 | Do you commit to notifying Xenios at research@xeniostechnology.com and samuel@xeniostechnology.com of any confirmed or reasonably suspected incident affecting Xenios data without undue delay, and in no event later than [COUNSEL: confirm notice window] after discovery? (Refusal is disqualifying.) | |
| D3 | Do you have a written incident response process? Attach or summarize it. | |

## 8. Section E: Personnel

| # | Question | Answer |
| --- | --- | --- |
| E1 | Are personnel with access to Xenios data bound by written confidentiality obligations consistent with XR-FUL-010? | |
| E2 | Do personnel receive security awareness training? How often? | |
| E3 | Describe any background screening performed for personnel handling member shipping data, subject to applicable law. | |

## 9. Section F: Retention, deletion, and subcontractors

| # | Question | Answer |
| --- | --- | --- |
| F1 | How long do you retain Xenios order data, and why? | |
| F2 | On termination of the engagement, or on request, will you delete Xenios data and provide written confirmation of deletion? (Refusal is disqualifying.) | |
| F3 | List every subcontractor or third-party service (including cloud and email providers) that would store or process Xenios data. (An undisclosed subcontractor discovered later is treated as a reportable incident.) | |
| F4 | Do you commit to flowing these security and confidentiality obligations down to those subcontractors, and to notifying Xenios before adding a new one? | |
| F5 | Will Xenios data be sold, used for your own purposes, or used to train models? (Anything other than "no" is disqualifying.) | |

## 10. Scoring guidance (Xenios internal use)

Rate each answer Meets, Partial, or Fails. Record the rating on the vendor file with reviewer name and date.

1. Disqualifying answers, each an automatic Fail for the whole questionnaire until remediated in writing: shared accounts (A3), no MFA and no committed remediation date (B1), refusal to keep data out of personal email (C1), refusal of the incident notice commitment (D2), refusal to delete data with written confirmation (F2), any independent use or sale of Xenios data (F5).
2. Overall rating Approved: every answer Meets, or Partial answers carry written remediation dates that Xenios accepts.
3. Overall rating Conditional: no disqualifying answers; open Partial items must close within [CONFIG: remediation window] days; access may be provisioned at reduced scope in the interim. Only the founder (the named super administrator) may accept a Conditional rating.
4. Overall rating Rejected: any unremediated disqualifying answer. No access is provisioned.
5. Re-run this questionnaire at renewal, on material change, and after any incident. A stale questionnaire (older than [CONFIG: revalidation period]) is treated as expired.

## 11. Attestation

The undersigned is authorized to answer for the vendor and attests that the answers and attachments are accurate and complete as of the date signed. The vendor will notify Xenios promptly if any answer becomes materially inaccurate. This attestation does not waive rights that cannot be waived under applicable law, and it does not relieve either party of duties imposed by law.

Vendor legal name: ______________ Signature: ______________ Name and title: ______________ Date: ______________

## Open items for counsel

- Reconcile this questionnaire with docs/risk/VENDOR_RISK_STANDARD.md in this repository. That standard lists platform vendors (Supabase, Resend, Render, GitHub), names a different owner, and states that no vendor receives health data because the platform collects none, which predates the current program design (assessment, tracker, media). Counsel should decide whether that standard is superseded, amended, or kept as the platform-side companion to this fulfillment-side questionnaire.
- [COUNSEL: confirm period] for retention of completed questionnaires under XR-POL-005.
- [COUNSEL: confirm notice window] for vendor incident notification in D2, and how vendor incidents map to Xenios's own notification obligations (including the FTC Health Breach Notification Rule analysis and state law).
- [CONFIG: remediation window] and [CONFIG: revalidation period] values for Section 10.
- Whether a signed questionnaire should be incorporated by reference into XR-FUL-001 so that a materially false answer is a contract breach.
- Whether background screening questions in E3 need state-by-state employment law review before being required of vendors.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
