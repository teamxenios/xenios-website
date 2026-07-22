# Member Security and MFA Acknowledgment

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-MEM-022 |
| Title | Member Security and MFA Acknowledgment |
| Audience | member |
| Required member state | approved, pre-payment (accepted in the agreements step); key duties re-displayed at MFA enrollment, which occurs after payment and before activation completes |
| Trigger | agreements step of activation; MFA enrollment screen re-displays recovery-code custody duties |
| Route | /research/apply (agreements step); ongoing controls at /research/member/account/security |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | checkbox + timestamp + document version + member reference recorded server-side |
| Withdrawal supported | No. This is an acknowledgment of security duties that are conditions of membership; it is not a revocable consent. Security settings are managed in the account security area. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-MEM-021, XR-MEM-023, XR-MEM-027, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; NIST digital identity guidance; OWASP authentication guidance |
| Review date | 2026-07-19 |

## 1. Why this document exists

Xenios Research is a private, approved-member environment. Your account protects your plans, your assessment answers, your tracker data, your progress media, your orders, and your payment methods on file. This acknowledgment states the security duties that come with membership so that both sides know exactly who is responsible for what.

## 2. MFA is mandatory

Multi-factor authentication (MFA) is required for every member. MFA means that signing in takes your password plus a second factor that only you control. There is no opt-out. Activation completes only after MFA enrollment, in this sequence:

```text
Password created
-> MFA enrollment
-> recovery codes issued
-> activation complete
```

Passkeys (a phishing-resistant sign-in method built into modern devices) may be offered as an additional or alternative factor. Where offered, Xenios encourages their use.

## 3. Recovery-code custody

At MFA enrollment you receive recovery codes. Each code is a one-time bypass for your second factor. You acknowledge that:

1. Recovery codes are yours to protect. Store them offline or in a reputable password manager, separate from your password.
2. Anyone holding a recovery code can weaken your account's protection. Treat a code like a key to the account.
3. Xenios staff cannot see your password and will never ask for your password or your recovery codes, on any channel. A message asking for them is not from Xenios.
4. If you lose your recovery codes, regenerate them from the account security area while signed in. If you are locked out entirely, account recovery requires identity re-verification. [CONFIG: exact lockout-recovery procedure] Recovery is deliberately not casual; Samuel cannot override identity requirements informally.

## 4. No account sharing

Membership is personal to the approved, identity-verified individual. You agree that you will not:

- share your password, second factor, or recovery codes with anyone,
- let another person use your session or your member account, or
- use another member's account.

Account sharing defeats the identity and age verification the program is built on, and it exposes another person's data pathway to you and yours to them. Account sharing is grounds for suspension or termination under the membership terms. [COUNSEL: confirm cross-reference to the membership agreement's termination provisions]

## 5. Devices and sessions

The account security area at /research/member/account/security gives you:

- a view of your active sessions and recognized devices,
- the ability to end an individual session, and
- a sign-out-all control that revokes every active session at once.

Use sign-out-all immediately if you lose a device, sign in on a shared or public device, or suspect any misuse. Xenios may also revoke sessions server-side, require a fresh sign-in, or require step-up authentication when risk signals appear.

## 6. Your duty to report suspected compromise

You agree to report promptly to research@xeniostechnology.com if you suspect that:

- someone else knows your password or has your recovery codes,
- your email account (the address on file with Xenios) has been compromised,
- a device with an active Xenios session was lost or stolen, or
- you see sessions, orders, or account changes you do not recognize.

Prompt reporting protects you. On a credible report, Xenios may lock the account, revoke sessions, require re-verification, and review recent activity. Xenios handles incidents under its internal incident response process; where a security incident triggers legal notification duties, those duties are governed by law, not by this acknowledgment.

## 7. What Xenios does on its side

For balance, and without limiting its legal duties, Xenios' side of account security includes: server-enforced least privilege, MFA and step-up authentication on the founder admin account, encrypted transport, signed URLs for private media, session revocation, and audit logging. These controls are described in the security program documents and are designed to meet, not replace, Xenios' obligations under applicable law.

## 8. What this acknowledgment is not

This acknowledgment does not waive rights that cannot be waived under applicable law, and it does not relieve Xenios of duties imposed by law. It does not make you responsible for losses caused by Xenios' own failures. It records that you understand the member-side duties above and agree to follow them.

## Open items for counsel

- [COUNSEL: confirm the retention period for acceptance records under the Retention and Deletion Schedule (XR-POL-005)]
- [COUNSEL: confirm the cross-reference to the membership agreement's suspension and termination provisions for account sharing]
- [CONFIG: the exact locked-out account recovery procedure, including which identity re-verification steps apply]
- [COUNSEL: review the allocation of responsibility language in sections 6 and 8 against state consumer-protection standards; no liability-shifting beyond what law permits]
- Reconcile with the earlier draft docs/security/ACCESS_CONTROL_POLICY.md (internal access matrix and revocation controls) and docs/security/IDENTITY_PROOFING_STANDARD.md: this member-facing acknowledgment must stay consistent with those internal standards. Counsel and the security owner to reconcile any drift and confirm which document controls each mechanic.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
