# Immediate Cancellation and Access-Termination Acknowledgment

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-MEM-004 |
| Title | Immediate Cancellation and Access-Termination Acknowledgment |
| Audience | member |
| Required member state | approved, pre-payment (acknowledged during activation); re-presented in full to an active member in the cancellation flow before confirmation |
| Trigger | agreements step of the activation flow; presented again as the pre-confirmation disclosure whenever a member starts self-service cancellation |
| Route | activation flow under /research (agreements step); member account membership page (cancellation flow) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | checkbox + timestamp + document version + member reference recorded server-side, at activation and again at each cancellation confirmation |
| Withdrawal supported | no; this is an acknowledgment that a disclosure was made, and the record of that disclosure is not revocable (the membership itself is always cancelable) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-MEM-001, XR-MEM-003, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Negative Option Rule page |
| Review date | 2026-07-19 |

## 1. Purpose

This document is the canonical cancellation policy for the Xenios Research Founding Membership. Every other document that mentions cancellation points here. You acknowledge it once at activation, so the policy is never a surprise, and you see it again in full before you confirm a cancellation.

## 2. Cancellation is self-service

You can cancel at any time from your account, online, without calling anyone. Cancellation is at least as easy as signing up. Confirmed cancellation stops all future membership charges under your recurring authorization (XR-MEM-003).

## 3. Access ends immediately

When you confirm cancellation, your member access ends immediately. There is no run-out period to the end of the billing month. Immediately means:

- the member website, catalog, prices, and purchasing close to you,
- the tracker, Guides, plans, Blueprint, and Document Center close to you, and
- Telegram support ends for your account.

## 4. Remaining paid access is forfeited

Any remaining paid time in your current billing period is forfeited when you confirm cancellation. There is no prorated refund for the unused part of the month unless applicable law requires one. This no-proration policy is subject to applicable law and to counsel review, and nothing in this acknowledgment takes away a refund that the law of your state requires.

## 5. What you are told before you confirm

The cancellation flow shows you all of the following, clearly, before you can confirm:

1. Your access ends immediately when you confirm.
2. Remaining paid time in the current period is forfeited, with no prorated refund unless applicable law requires one.
3. Any product subscriptions you have are separate: they are handled according to their own state and controls, and canceling the membership does not silently continue or silently cancel them. The flow shows you their current state.
4. You should download the plans, PDFs, and data you want to keep before confirming, because the Document Center closes immediately.

You then confirm with an explicit action. An abandoned cancellation flow changes nothing and is never treated as a confirmation.

## 6. What cancellation does not erase

Cancellation does not erase records that Xenios is required or permitted by law to keep. These are retained under the Retention and Deletion Schedule (XR-POL-005):

- transaction and order records,
- payment records (tokenized references, never raw card data),
- agreement and acknowledgment records, including this one,
- safety records, including any product concern or adverse event reports,
- security and audit records.

## 7. Your privacy rights survive

Cancellation ends membership, not your privacy rights. After cancellation you can still exercise the rights described in the Xenios Research member privacy notice, including access, correction, and deletion requests, subject to the legal retention duties in section 6.

A limited non-member workflow remains available after cancellation, without restoring any member access, through which you can:

- obtain receipts for your past transactions, and
- submit privacy requests.

Reach it through research@xeniostechnology.com.

## 8. What this acknowledgment is not

This acknowledgment records that the policy above was disclosed to you. It does not waive rights that cannot be waived under applicable law, and it does not relieve Xenios of duties imposed by law. It is not a fee, a penalty, or a barrier to canceling.

## Open items for counsel

- Section 4: review the no-proration forfeiture policy state by state; identify states that require prorated refunds or restrict immediate access termination on cancellation, and define the override behavior for members in those states.
- Section 3: confirm that ending access immediately, rather than at period end, is compatible with each applicable automatic-renewal and consumer-protection statute given the disclosures in section 5.
- Section 5: confirm the pre-confirmation disclosure set and ordering satisfy the FTC Negative Option Rule's cancellation requirements.
- Section 7: confirm the scope of the limited non-member receipt and privacy workflow, including identity verification for a person who no longer has an account.
- Retention metadata: confirm the minimum retention period for acknowledgment and cancellation records under XR-POL-005.
- [ENTITY]: confirm the legal entity named in the acknowledgment.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
