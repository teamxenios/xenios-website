# Privacy Rights Request Terms

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-MEM-027 |
| Title | Privacy Rights Request Terms |
| Audience | member (and former members through the limited non-member workflow) |
| Required member state | active member; rights survive cancellation through the limited non-member workflow |
| Trigger | first visit to the privacy area; also linked from the Privacy Notice and shown in the cancellation flow |
| Route | /research/member/account/privacy; former members by email to research@xeniostechnology.com |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | request and response records per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (notice only) |
| Withdrawal supported | n/a. This document describes rights and procedure; the consents it references (for example marketing, sexual-wellness data, Telegram linking) are each revocable under their own terms. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-MEM-021, XR-MEM-023, XR-POL-005, XR-POL-009 |
| Sources | See 00-register/SOURCE_REGISTRY.md; state consumer privacy laws (state-by-state review pending); FTC consumer-health privacy guidance |
| Review date | 2026-07-19 |

## 1. What this document is

This document explains how to exercise privacy rights over the personal data Xenios Research holds about you, what happens after you ask, and what limits apply. It is a procedure document, not the Privacy Notice itself. Which rights are legally required varies by state; Xenios' approach is to offer the core rights below to every member regardless of state, with statutory specifics confirmed by counsel. [COUNSEL: confirm the offer-to-all approach and the state-by-state statutory mapping]

## 2. The rights you can exercise

1. Access. Ask what personal data Xenios holds about you and receive a copy of it.
2. Correction. Ask Xenios to correct inaccurate personal data. Corrections supersede the old value; audit history preserves that a correction happened without erasing the record trail.
3. Deletion. Ask Xenios to delete your personal data, subject to the legal retention limits in section 6.
4. Export. Receive your data in a portable, commonly used format so you can take it elsewhere. [CONFIG: the export format and the exact data sets included, for example account data, assessment answers, tracker entries, progress media, orders, and documents]

Exercising any right is free, and Xenios will not retaliate against you for using them: no reduced service, no changed pricing, no slower support. Note that deletion of data that a feature needs will end that feature's operation for you (for example, deleting tracker history ends tracker comparisons that used it).

## 3. How to submit a request

- Active members: from the privacy area at /research/member/account/privacy. Because you are signed in with MFA, in-account requests are already strongly verified.
- Former members and the limited non-member workflow: by email to research@xeniostechnology.com from the email address associated with your former membership, subject to the verification in section 4.
- An authorized agent may submit a request on your behalf where applicable law provides for it. [COUNSEL: authorized-agent verification requirements by state]

State clearly what you are asking for (access, correction, deletion, or export) and, for corrections, what is wrong and what is right.

## 4. Identity verification for requests

Privacy requests are an attack surface: a request from an impostor is itself a data breach. Verification is therefore mandatory and proportionate:

1. In-account requests by an MFA-authenticated member are treated as verified.
2. Email requests from former members are verified against existing records (the email on file, and confirmation of details only the account holder should know). Xenios will not demand new sensitive documents just to verify a routine request, and does not collect new data for verification beyond what verification genuinely requires.
3. Higher-risk requests (deletion, or export of the full record) may require step-up verification. [CONFIG: the step-up method for non-member requests]
4. If verification fails, Xenios declines the request and says so; it does not partially fulfill an unverified request.

## 5. Timing

- Xenios acknowledges a request promptly. [CONFIG: acknowledgment target]
- Substantive responses follow the statutory clocks of the applicable state law, which counsel must confirm. [COUNSEL: statutory response clocks by state, including permitted extensions, and the operational default target Xenios should adopt nationally]
- If more time is lawfully needed, Xenios tells you before the initial period ends and explains why.
- If Xenios declines all or part of a request, it explains the reason and, where state law provides an appeal right, how to appeal. [COUNSEL: appeal-process requirements by state]

## 6. What deletion can and cannot remove

Deletion is real but not unlimited. Xenios must keep certain records even after a deletion request, retained under the Retention and Deletion Schedule (XR-POL-005):

- transaction and order records,
- payment records,
- the agreements and consents you accepted, and the evidence of acceptance,
- safety records, including product-concern and adverse-event records,
- security and audit logs, and
- records Xenios is legally required to retain (for example tax records).

When part of your data must be kept, Xenios deletes what it lawfully can, isolates what it must keep from everyday use, and tells you which categories were retained and why, in plain language.

## 7. Rights survive cancellation: the limited non-member workflow

Cancellation ends member access immediately, but it does not end your privacy rights. After cancellation, a limited non-member workflow remains available by email through which you can:

- obtain copies of your receipts and order records,
- exercise access, correction, deletion, and export rights over data Xenios still holds, and
- withdraw any consent that survives termination (for example marketing email).

This workflow does not restore membership access, the Document Center, plans, or the Guide Library. That is why the cancellation flow tells you to download desired plans and data before confirming (see XR-MEM-021, section 4).

## 8. Notes on sensitive categories

- Optional sexual-wellness data is separately consented and private by default; that consent is revocable at any time, and revocation stops further collection.
- Progress media (photos, video, voice) uses private storage, signed URLs, malware scanning, and access audit. Face blur is image processing, not facial recognition, and no biometric templates are stored for progress media.
- Raw government ID images are not retained unless counsel and the identity design require it; identity verification keeps the provider reference, result, and minimal metadata instead.
- Tracker and health-related data is never sent to advertising platforms.
- Xenios does not claim HIPAA compliant status. The HIPAA applicability analysis is pending (see XR-POL-009), and Xenios does not represent itself as a HIPAA covered entity for direct-to-consumer services unless counsel concludes otherwise. Consumer-health privacy rules enforced by the FTC and the states are the working frame for the tracker.

## 9. What this document is not

This document does not waive rights that cannot be waived under applicable law, and it does not relieve Xenios of duties imposed by law. It does not promise legal certainty; the procedures above are designed to satisfy applicable privacy laws and are subject to counsel confirmation.

## Open items for counsel

- [COUNSEL: confirm the offer-core-rights-to-all-states approach and complete the state-by-state statutory mapping, including consumer-health-data statutes]
- [COUNSEL: statutory response clocks by state, permitted extensions, and the single national operational target]
- [COUNSEL: appeal-process requirements by state and the wording of decline notices]
- [COUNSEL: authorized-agent verification requirements]
- [COUNSEL: confirm the deletion carve-outs in section 6 against each retention obligation in XR-POL-005]
- [COUNSEL: confirm the retention period for privacy-request and response records]
- [CONFIG: export format and included data sets; acknowledgment target; step-up verification method for non-member requests]
- Reconcile with the earlier drafts docs/privacy/PRIVACY_PROGRAM.md, docs/privacy/RETENTION_POLICY.md, and docs/security/CONSENT_REGISTRY.md in this worktree. Those documents describe the current application-layer reality (no member data model live yet, proposed retention targets, an inert consent-event registry). This document describes the target membership program per the master pack. Counsel to reconcile the two layers and confirm which controls each mechanic at launch.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
