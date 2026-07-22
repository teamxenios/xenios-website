# Identity Verification Operations SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-003 |
| Title | Identity Verification Operations SOP |
| Audience | internal |
| Required member state | n/a (internal; the operational flow applies between approval and agreements) |
| Trigger | Runs for every approved applicant, after approval and before agreements and payment; re-review on vendor selection or any change to the verification flow |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending, including state biometric and age-verification laws (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | Identity verification results per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]. Raw ID media is not retained by Xenios at all unless separately approved. |
| Acceptance event | n/a (internal SOP; the member's consent to verification is captured separately, server-side, before vendor handoff) |
| Withdrawal supported | partial (a person may abandon verification, which halts activation; the recorded result of a completed verification is an audit fact and is not withdrawn) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-001, XR-POL-002, XR-POL-004, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; NIST SP 800-63A Identity Proofing guidance; FTC guidance on biometric information |
| Review date | 2026-07-19 |

## 1. Purpose and position in the flow

This SOP (standard operating procedure) governs how identity and age verification is run for Xenios Research. The program is 21+ only and application-based. Verification sits at a fixed point in the activation sequence: approval, then identity and age verification, then agreements, then the $50 activation payment and $25 recurring authorization, then password, then MFA, then active. No agreement is presented and no payment is taken before verification passes.

## 2. Architecture rule: the provider holds the evidence

1. Verification is performed by a specialist identity provider through the provider's own hosted flow. The applicant is handed off to the provider; Xenios does not build its own document-capture screens.
2. Raw government ID images, selfies, liveness video, and any biometric data are captured by and remain with the provider. Xenios does not receive, proxy, cache, store, or log them. This is an architectural rule, not a preference.
3. Xenios retains no raw government ID images unless counsel and the identity design separately approve retention in writing. No biometric templates are stored by Xenios for any purpose. Face blur applied to member progress media elsewhere in the program is image processing, not facial recognition, and is unrelated to this flow.
4. Provider selection must complete vendor due diligence, including a review under docs/risk/VENDOR_RISK_STANDARD.md, and a signed data protection agreement, [COUNSEL: confirm required contract terms, including provider-side retention and deletion of ID media].

## 3. Operational steps

### 3.1 Before handoff

1. Confirm the application status is approved. Verification is never offered to a non-approved person.
2. Record the person's consent to identity and age verification server-side (timestamp, document version) before the handoff. The consent screen states who the provider is, what the provider collects, and that Xenios receives only the result.
3. Generate the provider session and hand the person to the provider's hosted flow.

### 3.2 Result recording

When the provider returns a signed result, record exactly this minimal set, server-side:

| Field | Content |
| --- | --- |
| Provider reference | The provider's reference id for the verification session |
| Result | pass, fail, or needs review |
| Age result | Whether the person is verified 21 or older (boolean; no date of birth stored unless counsel confirms a specific need) |
| Timestamp | When the result was issued |
| Method | The verification method used (for example, document plus liveness), by name only |
| Failure code | On failure, the provider's minimal machine failure code only; never the underlying evidence or images |

Nothing else is stored. The member-facing state exposes booleans only (identity verified, age verified). Verification records are restricted-identity class data under the Data Classification Policy (XR-POL-004): never in logs, never in email bodies, never over Telegram.

### 3.3 On pass

Advance the person to the agreements step. The pass result, with the fields above, is the durable record.

### 3.4 On fail or needs review

1. A fail or needs-review result never auto-rejects a person. The case routes to human review, and a named human (the super administrator during the founding phase) makes the decision.
2. Tell the person plainly that automated verification did not complete and that a human will review, with the support contact (research@xeniostechnology.com). Never echo back the provider's evidence, images, or detailed reasons.
3. Record the human decision and its reason in the append-only audit.

## 4. Retry handling

1. A person may retry a failed verification. Retries are limited and rate-limited, [CONFIG: retry count and cooldown], to prevent probing.
2. There is no formal appeal process for verification outcomes during the founding phase. The human-review step in 3.4 is the safeguard. [COUNSEL: confirm this posture is acceptable, including under any state age-verification rules that require an appeal or alternative method.]
3. Repeated failures pause further attempts rather than silently locking the account, and the person is told how to reach support.

## 5. No casual overrides

1. No one may mark a person verified by conversation, favor, or assumption. An override (activating someone whose verification did not pass) is an exceptional act that requires: the super administrator, step-up authentication, a written reason, and an append-only audit entry.
2. Overrides of the age result are prohibited absolutely. No override may activate a person who has not been verified as 21 or older. [COUNSEL: confirm whether any override of a failed identity check is permissible at all, or whether the override path should be removed.]
3. Requests to skip verification received over Telegram, email, or in person are declined and logged. Telegram is never used to send or receive ID documents.

## 6. Data handling, deletion, and audit

1. Verification result records are retained per the Retention and Deletion Schedule (XR-POL-005), [COUNSEL: confirm the retention period for identity results and for the fact-of-verification after membership ends].
2. If any raw ID media ever reaches a Xenios system in error, treat it as an incident: delete it, record the deletion, and review the path that allowed it.
3. Provider-side deletion of evidence follows the provider contract, [COUNSEL: confirm the provider retention window and Xenios's deletion instruction rights].
4. All verification events (handoff, result, retry, human review, override) are written to the append-only audit log with actor and timestamp.

## 7. Relationship to the earlier engineering draft

The worktree contains docs/security/IDENTITY_PROOFING_STANDARD.md, an engineering draft stating that verification is not yet built, no vendor is selected, and the enabling flags default to false. That document also proposes re-verification triggers (name or email change, provider revocation, result age, suspected account transfer). This SOP adopts the same vendor-holds-evidence architecture and adds the operational steps, the minimal result record, and the override rules. Counsel is asked to reconcile the two documents, confirm the re-verification triggers, and designate the controlling version. Until the flags are enabled and counsel approves, no page or message may describe verification as live.

## Open items for counsel

- Reconcile this SOP with docs/security/IDENTITY_PROOFING_STANDARD.md (not-built status, flag gating, proposed re-verification triggers) and designate the controlling document.
- [COUNSEL: confirm required identity-provider contract terms, including provider-side retention and deletion of ID media and Xenios's deletion instruction rights.]
- [COUNSEL: confirm the no-formal-appeal posture for verification outcomes, including any state age-verification rules requiring an appeal or alternative method.]
- [COUNSEL: confirm whether any override of a failed identity check is permissible, or whether the override path should be removed entirely.]
- [COUNSEL: confirm retention periods for identity results, and whether the fact-of-verification must be kept after membership ends, via XR-POL-005.]
- [COUNSEL: confirm state biometric-law obligations that apply even though Xenios stores no biometrics, given the provider processes them on Xenios's behalf.]
- [CONFIG: retry count and cooldown values.]
- [ENTITY]: confirm the contracting entity for the identity-provider agreement.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
