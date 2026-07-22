# $50 Activation Terms

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-MEM-002 |
| Title | $50 Activation Terms |
| Audience | member |
| Required member state | approved, pre-payment (accepted before the $50 activation payment) |
| Trigger | agreements step of the activation flow, immediately before activation checkout |
| Route | activation flow under /research (agreements step, then activation checkout) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | checkbox + timestamp + document version + member reference recorded server-side |
| Withdrawal supported | no; once the activation fee is charged the acceptance is a transaction record, and any refund is governed by section 5, subject to applicable law |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-MEM-001, XR-MEM-003, XR-MEM-004, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Negative Option Rule page |
| Review date | 2026-07-19 |

## 1. What the activation fee is

The activation fee is a one-time charge of $50 that completes your Founding Membership activation. It is charged once. It is separate from the $25 recurring monthly membership fee, which is authorized separately under XR-MEM-003, and it is separate from any product purchase.

$50 is the launch price. It is admin-configurable, and any change applies prospectively only, with notice. A change never applies to a person who has already been charged.

## 2. When it is charged

The activation fee is charged only after all of the following have happened, in order:

1. Your application was approved.
2. Your identity and age (21+) were verified.
3. You accepted the Founding Membership Agreement (XR-MEM-001) and the incorporated documents, including these terms.

The charge occurs before member access begins. You never pay before you have accepted the agreements, and you never receive member access before the activation payment succeeds. After the charge, you authorize the recurring membership (XR-MEM-003), create your password, and enroll in mandatory MFA. Your membership is active when those steps complete.

## 3. What the activation fee covers

The activation fee covers only the one-time onboarding work of bringing you into the Program:

- creation and activation of your member account, including security setup (password, MFA, recovery codes),
- identity-linked provisioning of your member access, and
- initiation of your assessment and Blueprint process.

The mandatory assessment, the preliminary Whole-Life Blueprint, the Founder's plan review, and your Xenios 30 plans and Xenios 90 roadmap are not purchased by the activation fee. They are membership inclusions available while your membership is active, governed by the Founding Membership Agreement (XR-MEM-001) section 9.

## 4. What the activation fee is not

- It is not a product purchase, a deposit toward products, or store credit.
- It is not a prepayment of monthly membership. The first $25 monthly charge is separate and follows the schedule in XR-MEM-003.
- It does not buy any outcome. No results are promised.
- It does not purchase medical care. The assessment, Blueprint, and plans are educational and organizational tools, not diagnosis, treatment, prescribing, or dosing direction.

## 5. Refundability

[COUNSEL: decide the refund posture for the activation fee. Questions to resolve: whether the fee is refundable at all once onboarding work has begun; whether a cooling-off or cancellation window applies under any state law identified in the jurisdiction matrix; whether a failed or abandoned activation (payment taken but MFA never completed) must be refunded automatically; and how a refund interacts with the immediate-termination cancellation policy in XR-MEM-004.]

Until counsel resolves the above, this draft states only: any refund of the activation fee is subject to applicable law, and these terms do not waive rights that cannot be waived under applicable law.

If Xenios declines your application or your identity verification does not complete, you are never charged, because the charge only occurs after both steps succeed.

## 6. Failed payment

If the activation charge fails:

- your activation does not complete and member access does not begin,
- no partial access is granted and nothing else is charged,
- you may retry with the same or a different payment method from the activation flow, and
- your approval and verification remain valid for a reasonable window of [CONFIG: activation validity window] so you can retry without reapplying. After that window, Xenios may ask you to reconfirm your information.

A failed activation payment is not a breach and carries no penalty. If repeated attempts fail, contact research@xeniostechnology.com.

## 7. Records

The charge, the payment method reference (tokenized, never raw card data), your acceptance of these terms, the document version, and timestamps are recorded and retained under the Retention and Deletion Schedule (XR-POL-005). These records survive cancellation, as described in XR-MEM-004. A receipt is available from your account and by the limited non-member receipt workflow after cancellation.

## Open items for counsel

- Section 5: full refund posture for the activation fee, including any state cooling-off or cancellation windows, treatment of abandoned activations, and interaction with XR-MEM-004.
- [CONFIG: activation validity window] in section 6: confirm the window during which an approved, verified applicant may retry payment without reapplying.
- [ENTITY]: confirm the legal entity that is the merchant of record for the activation charge.
- Retention metadata: confirm the minimum retention period for payment and acceptance records under XR-POL-005.
- Confirm that presenting these terms inside the agreements step, before checkout, satisfies point-of-sale disclosure requirements in the states identified in the jurisdiction matrix.
- Section 3: confirm the consideration allocation between the $50 activation fee (one-time onboarding work only) and the $25 recurring fee (membership inclusions, per XR-MEM-001 section 9), because the allocation affects the refund analysis in section 5.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
