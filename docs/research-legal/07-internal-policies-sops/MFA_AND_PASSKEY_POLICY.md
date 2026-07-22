# MFA and Passkey Policy

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-002 |
| Title | MFA and Passkey Policy |
| Audience | internal |
| Required member state | n/a (internal; the member-facing effect applies from account claim onward) |
| Trigger | Adoption at program launch; re-review before enabling any new authentication factor or recovery path |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (internal policy; member MFA enrollment itself is recorded server-side with timestamp and method) |
| Withdrawal supported | no (MFA is mandatory for membership; a member who will not enroll cannot reach active status) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-001, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; NIST SP 800-63 Digital Identity Guidelines; OWASP Authentication Cheat Sheet series |
| Review date | 2026-07-19 |

## 1. Purpose

This policy sets the authentication rules for Xenios Research: multi-factor authentication (MFA, a login that requires something beyond a password), recovery codes, passkeys (phishing-resistant credentials stored on the member's device), step-up authentication, privileged session limits, and login alerts.

## 2. Scope and the mandatory rule

1. MFA is mandatory for every member. Enrollment happens inside the activation sequence: approval, identity and age verification, agreements, activation payment, password creation, then MFA enrollment. A member account cannot reach active status without a completed MFA enrollment. There is no opt-out tier.
2. MFA is mandatory for all administrative access. The super administrator account (samuel@xeniostechnology.com) additionally requires a passkey, step-up re-authentication, short privileged sessions, login alerts, a separate admin route, and a documented emergency recovery path.
3. Any future staff, reviewer, or partner account with platform access enrolls in MFA before first use. No exceptions are granted casually; any exception requires a written decision-log entry by the super administrator and a scheduled end date.

## 3. Accepted factors

1. Primary second factors: an authenticator application generating time-based one-time codes, or a passkey.
2. Passkeys may be offered to members and are the preferred factor because they resist phishing. The platform is built passkeys-ready; offering them to members is a configuration decision, [CONFIG: passkey availability at launch].
3. SMS codes are not an approved factor unless separately approved after a written risk review, [COUNSEL: confirm whether SMS may serve as a fallback factor given SIM-swap risk].
4. Email is an identity and notification channel, not an MFA factor. A code sent to the same mailbox that receives password resets does not count as a second factor.

## 4. Recovery codes

1. A set of one-time recovery codes is issued at MFA enrollment. Each code works once. Codes are displayed once at generation and are stored only as hashes server-side.
2. The member is told plainly, at issuance: store these codes offline, treat them like a password, Xenios support will never ask for them.
3. Regenerating recovery codes invalidates the entire previous set and is itself a step-up action that is logged and triggers a security alert to the member's email.
4. Recovery codes are never sent, requested, or accepted over Telegram. Telegram is not the system of record and never carries passwords, reset tokens, or credentials.

## 5. Step-up authentication for privileged and sensitive actions

Step-up means re-proving a factor immediately before a consequential action, even inside a valid session. Step-up is required for at least:

1. Changing the account email, password, or phone details.
2. Viewing or regenerating recovery codes; adding or removing an MFA factor or passkey.
3. Changing the payment method or subscription controls.
4. Downloading the member's full data export (XR-POL-006).
5. Confirming cancellation.
6. Every super-administrator privileged action: application decisions, overrides, refunds, suspensions, forced resets, flag or configuration changes, retention deletions.

## 6. Sessions, privileged sessions, and revocation

1. Member sessions have a bounded lifetime, [CONFIG: member session lifetime].
2. Privileged (admin) sessions are short by design, [CONFIG: privileged session lifetime, proposed at a small number of hours or less], and expire to a full re-authentication, not a silent refresh.
3. Members can see their active devices and sessions, view login history, and sign out all sessions. Sign-out-all and forced reset are server-enforced and immediate.
4. On any credible compromise signal, the super administrator may force a reset and revoke all sessions for the affected account. The event is audited.

## 7. Login alerts

1. A login from a new device or unrecognized context generates a security alert to the member's email of record. The alert states what happened, when, and what to do if it was not the member.
2. Every super-administrator login generates an alert to the founder's email. Alerts are transactional messages, not marketing, and carry no credentials or links that request credentials.

## 8. Lost factors and account recovery

1. First path: a recovery code (section 4).
2. If the member has no recovery code, recovery uses the account-recovery flow with identity confirmation appropriate to the account's risk, [COUNSEL: confirm the minimum identity confirmation required to re-bind MFA after total factor loss].
3. Support channels never perform recovery by conversation. No one may disable MFA, reset a factor, or read out a code over Telegram, email, or phone. A forced reset by the super administrator is the only manual path, requires step-up, and is audited with a written reason.

## 9. Records

MFA enrollment events, factor changes, recovery-code issuance and use, step-up outcomes, session revocations, and security alerts are recorded server-side with timestamps and retained per the Retention and Deletion Schedule (XR-POL-005). Records never include the secret material itself: no codes, no private keys, no passwords, in storage or in logs.

## 10. Relationship to the earlier engineering draft

The earlier engineering draft at docs/security/ACCESS_CONTROL_POLICY.md records that no MFA exists in the currently built state and that RESEARCH_MFA_REQUIRED and RESEARCH_PASSKEYS_ENABLED are feature flags defaulting to false. This policy states the required end state: those flags must be enabled, and enforced in the activation sequence, before any member is activated. Counsel is asked to note the gap and confirm that no member activation occurs before mandatory MFA is live.

## Open items for counsel

- Reconcile with docs/security/ACCESS_CONTROL_POLICY.md (no MFA in the built state; flags default false) and confirm mandatory MFA is a launch precondition for member activation.
- [COUNSEL: confirm whether SMS may serve as a fallback second factor, or is excluded.]
- [COUNSEL: confirm the minimum identity confirmation required to re-bind MFA after total factor loss.]
- [COUNSEL: confirm the retention period for authentication and security-alert records, via XR-POL-005.]
- [CONFIG: passkey availability at launch; member session lifetime; privileged session lifetime.]

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
