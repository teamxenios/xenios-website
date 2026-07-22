# Logging and Redaction Standard

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-012 |
| Title | Logging and Redaction Standard |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | in force from adoption; applies to every log line, audit event, error report, and diagnostic emitted by Xenios Research systems |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | operational logs and audit events per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm periods per log class] |
| Acceptance event | n/a (internal standard; adoption recorded by owner sign-off with version and date) |
| Withdrawal supported | n/a (internal policy, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-005, XR-POL-007, XR-POL-011, XR-MEM-023 |
| Sources | See 00-register/SOURCE_REGISTRY.md; OWASP logging guidance |
| Review date | 2026-07-19 |

## 1. Purpose

Logs are where sensitive data leaks quietly. A platform can encrypt its database and still spill member health answers into a plaintext error report. This standard defines what Xenios Research systems may never log, what structured audit events must record, how redaction is enforced, who can read logs, and how long they live. It binds all environments and all vendors' log surfaces that Xenios controls, and it is a precondition for the incident plan (XR-POL-007): during a breach, logs must be safe to preserve and share with counsel without creating a second exposure.

## 2. The never-log list

The following never appear in any log, error report, crash dump, analytics event, diagnostic, or prompt to a development tool, in any environment:

1. Passwords, in any form, including failed attempts.
2. Tokens and credentials: session tokens, password-reset tokens, status-link tokens, MFA secrets, recovery codes, API keys, signing secrets, one-time Telegram linking codes, signed URL query strings.
3. Raw identity documents and identity-verification media: ID images, liveness captures, and vendor evidence payloads. Verification results are logged by reference and outcome only.
4. Health answers: assessment responses, tracker entries, sexual-wellness data, plan contents, and any free-text in which a member describes their health.
5. Private media and its contents: progress photos, exercise video, voice messages, and derived data. Media events are logged by object reference, never by content.
6. Payment data: card numbers, security codes, bank details, full payment-instrument records. Processor references and last-four-style display fields are the only permitted forms, and only where genuinely needed.
7. Sensitive Telegram content: message bodies of member support conversations, voice-note audio and transcripts. Telegram is not the system of record; its logs record routing metadata (chat linked, message received at time T, category assigned), not content. [COUNSEL: confirm whether any support-content retention duty overrides this content-minimal posture, and where such records should live instead.]
8. Secrets of any kind, per the Secure Development Policy (XR-POL-011). Boolean "is configured" diagnostics are the permitted alternative.

If a field is not certainly safe, it is not logged. Logging is allowlist-based: log what is named safe, not everything except what is named sensitive.

## 3. What logs may contain

1. Stable references: member reference IDs, order IDs, media object IDs, document keys and versions, incident IDs. References let an authorized investigation join records without the log itself carrying the sensitive content.
2. Event metadata: timestamps, event types, route names (without sensitive query strings), outcome codes, latency, flag states.
3. Truncated technical context: error classes and stack traces that have passed redaction (section 5).

## 4. Structured audit events

Consequential actions emit a structured audit event with a fixed schema: actor (member reference, admin identity, or system), action, resource type and reference, timestamp, outcome, and a reason code where applicable. No free-text payloads. Actions that must emit audit events include:

1. Authentication and account: login success and failure, MFA enrollment and reset, password change, session revocation, recovery-code regeneration.
2. Admin actions: every admin read or write of member data, every flag change, every configuration change. Admin access to member records is itself an audited event, always.
3. Agreements and consent: acceptance events (timestamp, document version, member reference), consent grants and revocations.
4. Commerce: order placement, large-order review decisions, capture, refund, replacement, subscription changes, cancellation confirmation.
5. Media: upload, malware-scan result, signed-URL issuance, access, deletion. Signed-URL issuance and access records support the media access audit the program promises.
6. Data lifecycle: exports, deletions, retention-schedule executions, privacy-rights request handling.
7. Telegram: account link, revocation, and message-routing metadata.

Audit events are append-only and cannot be edited or deleted by the identities they record, including the super administrator; corrections are new events. [CONFIG: audit store implementation.]

## 5. Redaction rules

1. Deny-by-default serialization: log calls pass through a serializer that emits only allowlisted fields. Adding a field to logs is a reviewed change (XR-POL-011).
2. Sensitive routes (application submission, assessment, tracker writes, media upload, identity verification, payment, Telegram webhooks) exclude request and response bodies from request logging entirely.
3. Error handlers scrub before emit: exception messages and stack traces pass a redaction filter for token-like strings, email addresses, and known sensitive field names before leaving the process.
4. URLs never carry secrets or personal data in query strings; where a signed URL must exist, logs record the object reference and expiry, never the signed string. Referrer leakage is suppressed on member surfaces.
5. Client-side logging and any error-reporting SDK obey this same standard; no session-replay tooling on member surfaces.
6. Redaction has tests (XR-POL-011 section 7): known-sensitive fixtures must never survive to log output, and the test suite fails if they do.

## 6. Log access control

1. Least privilege: log and audit access is limited to named humans with a need. During the founding phase that is Samuel Boadu, the server-enforced super administrator, plus counsel or an investigator he engages for a specific matter.
2. Access to logs is itself logged. Reading the audit trail leaves an audit trail.
3. Admin access to logs uses the same protections as other admin functions: MFA, step-up for sensitive views, short privileged sessions, login alerts, and the separate admin route.
4. Vendor log surfaces (hosting console, database console, email provider dashboard) are inventoried in the vendor register (XR-POL-010) and protected with MFA; their retention behavior is part of the vendor assessment.
5. Log exports for an incident follow XR-POL-007 evidence handling: copies, hashes, and counsel routing, never ad hoc pastes into chat tools.

## 7. Retention

1. Operational logs are kept short-lived; audit events are kept long-lived. Exact periods per class follow the Retention and Deletion Schedule (XR-POL-005). [COUNSEL: confirm periods for operational logs, security logs, and audit events, noting that agreement-acceptance and consent audit records may need to be kept as long as the underlying legal need exists.]
2. Cancellation does not erase audit records Xenios must keep (transaction, payment, agreement, safety, security, audit). Member deletion rights operate on member content, not on the append-only audit trail, subject to counsel's read of applicable law.
3. An open incident suspends deletion for in-scope logs under the XR-POL-007 hold procedure.

## 8. Verification

1. Automated: the redaction test suite (section 5) and audit-emission tests (section 4) run in CI.
2. Manual: a periodic sampling review of production logs checks for never-log-list violations. [CONFIG: sampling cadence.]
3. Any never-log-list violation found is an incident under XR-POL-007: scope it, purge it from log stores where feasible, rotate any exposed credential, and fix the emitting code before closure.

## Open items for counsel

- Confirm retention periods per log class, including long-lived audit events for agreement acceptance and consent (sections 2 and 7, metadata table).
- Confirm whether any support-content retention duty requires keeping Telegram conversation content anywhere, and if so where and under what protections (section 2).
- Confirm the interaction between member deletion rights and the append-only audit trail under applicable state privacy laws (section 7).
- Confirm that the media access-audit records satisfy the access-audit commitments made in the member-facing tracker and media documents (section 4).

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
