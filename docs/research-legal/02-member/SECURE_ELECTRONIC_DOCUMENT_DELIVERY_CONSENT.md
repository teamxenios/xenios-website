# Secure Electronic Document Delivery Consent

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-MEM-021 |
| Title | Secure Electronic Document Delivery Consent |
| Audience | member |
| Required member state | approved, pre-payment (accepted in the agreements step, before the $50 activation payment); governs delivery throughout membership |
| Trigger | agreements step of activation, before payment |
| Route | /research/apply (agreements step); referenced from the Document Center at /research/member/documents |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | checkbox + timestamp + document version + member reference recorded server-side |
| Withdrawal supported | Partial. Consent to electronic delivery may be withdrawn by written request to research@xeniostechnology.com, but membership documents are produced and delivered electronically, so withdrawal triggers an account review. [COUNSEL: consequences of withdrawal under the federal E-SIGN Act and any paper-copy duty] |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-MEM-022, XR-MEM-023, XR-MEM-027, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; federal E-SIGN Act (applicability to be confirmed by counsel) |
| Review date | 2026-07-19 |

## 1. What you are consenting to

Xenios Research delivers membership documents electronically. By accepting this consent, you agree that Xenios may deliver the following to you in electronic form instead of paper:

- your Whole-Life Blueprint,
- your monthly Xenios 30 fitness and nutrition plan PDFs,
- your Xenios 90 roadmap documents,
- receipts and order records,
- the agreements, acknowledgments, and consents you accept,
- policy updates and required notices, and
- privacy and account communications.

"Electronic form" means delivery through the secure Document Center in your member account, with an email notification containing a secure signed link, and, if you connect Telegram, an optional Telegram notification that a document is ready. A signed link is a time-limited private URL that works only for you; documents are never posted publicly.

## 2. How delivery works

1. The Document Center at /research/member/documents is the system of record for your documents. Every published document lives there for as long as your membership is active.
2. When a document is published, Xenios sends an email notification to your verified email address from research@xeniostechnology.com. The email contains a secure link, not the document itself, unless a specific document type is approved for direct attachment. [CONFIG: which document types, if any, attach directly to email]
3. If you have linked Telegram, you may also receive a Telegram notification that a document is ready. The document itself is never sent over Telegram. Plan PDFs, identity documents, and payment data never travel over Telegram (see XR-MEM-023).

## 3. Document versioning, integrity, and acknowledgment

Every document published to your Document Center carries:

- a version number and a template version,
- the reviewer who approved it,
- the published date and time,
- a checksum (a digital fingerprint that lets Xenios verify the file has not been altered), and
- a current or archived status.

When a new version of a plan or notice is published, the prior version is archived, not erased. Some documents ask you to acknowledge receipt. When you acknowledge a document, Xenios records the acknowledgment event with a timestamp, the document version, and your member reference. Acknowledging receipt confirms that you received and opened the document; it does not, by itself, signify agreement with its contents unless the document says so.

## 4. Your responsibilities

1. Keep your email address current. Delivery to your verified email address on file counts as delivery to you. Update your email in your account settings if it changes.
2. Maintain the ability to receive and read documents. You need a device with a current web browser, an active email account, and software able to open PDF files. If these requirements change materially, Xenios will notify you.
3. Download what you want to keep, before you cancel. Confirmed cancellation ends member access immediately, and remaining paid access is forfeited, with no prorated refund unless applicable law requires one. This policy is subject to applicable law and counsel review. The cancellation flow will remind you, but the responsibility to download your plans and data before confirming cancellation is yours. After cancellation, a limited non-member workflow remains available for receipts and privacy rights (see XR-MEM-027), but it does not restore access to the Document Center or your plan library.

## 5. Paper copies and withdrawal of consent

- You may request a paper copy of a specific document by writing to research@xeniostechnology.com. [COUNSEL: whether paper copies must be free, and any required response time]
- You may withdraw this consent by written request to the same address. Because the membership is delivered electronically, withdrawal of electronic delivery consent triggers an account review and may not be compatible with continued membership. [COUNSEL: confirm the lawful handling of withdrawal, including any required notice of consequences before withdrawal takes effect]
- Withdrawal is prospective. It does not undo documents already delivered, and it does not erase acceptance and delivery records Xenios must keep.

## 6. What this consent is not

- This consent does not waive rights that cannot be waived under applicable law, and it does not relieve Xenios of duties imposed by law.
- Plans, Guides, the tracker, and support are educational and organizational tools. They are not medical care, not a medical device, and not an emergency service. Emergencies go to emergency services (911 in the US).
- Electronic delivery does not change the substance of any document. A notice delivered electronically has the same content it would have on paper.

## Open items for counsel

- [COUNSEL: confirm the retention period for delivery, acceptance, and acknowledgment records under the Retention and Deletion Schedule (XR-POL-005)]
- [COUNSEL: confirm applicability of the federal E-SIGN Act and any state electronic-transactions law to this consent, including required pre-consent disclosures, hardware/software disclosure content, and demonstration-of-access requirements]
- [COUNSEL: consequences and lawful handling of a member's withdrawal of electronic delivery consent, given the electronic-only nature of the program]
- [COUNSEL: whether paper copies must be provided free of charge and within a defined time]
- [CONFIG: which document types, if any, may be attached directly to email rather than delivered by secure link only]
- Reconcile with the earlier draft docs/security/CONSENT_REGISTRY.md (append-only consent event model): this consent should be recorded as a versioned consent event with the presented text hash, consistent with that registry design. Counsel to confirm which document supersedes on consent-record mechanics.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
