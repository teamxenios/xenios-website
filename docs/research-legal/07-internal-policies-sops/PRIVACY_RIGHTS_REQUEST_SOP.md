# Privacy Rights Request SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-006 |
| Title | Privacy Rights Request SOP |
| Audience | internal |
| Required member state | n/a (internal; serves applicants, members, former members, affiliates, and non-members) |
| Trigger | Runs on receipt of any privacy rights request through any channel |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending, including state comprehensive privacy and consumer health data laws (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | Request logs per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (internal SOP; each request's verification and outcome are recorded server-side) |
| Withdrawal supported | yes (a requester may withdraw a pending request at any time; the withdrawal itself is logged) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-002, XR-POL-003, XR-POL-004, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; state attorney general consumer privacy guidance; FTC consumer privacy guidance |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This SOP states how Xenios Research receives, verifies, fulfills, denies, and records privacy rights requests. It covers every person whose data Xenios holds: applicants (including rejected applicants), active members, former members, affiliates and Research Reps, and non-members using the limited receipt and privacy workflow that survives cancellation. Which specific rights a given person holds depends on applicable state law, [COUNSEL: confirm the rights matrix per state in the jurisdiction review].

## 2. Rights handled

1. Access / to know: what personal data Xenios holds about the requester.
2. Portability: a copy of the requester's data in a usable format.
3. Correction: fixing inaccurate personal data.
4. Deletion: removing personal data, subject to the legal retention duties in XR-POL-005.
5. Consent withdrawal: revoking a revocable consent (marketing, optional sexual-wellness data, media use). Acknowledgments of past disclosure are records of fact and are not revoked, though the requester may annotate them.
6. Opt out of sale, sharing, or targeted advertising: recorded and honored. Program posture: Xenios does not sell personal data, and tracker and health data are never sent to advertising platforms. The opt-out is still logged so the posture is provable per person.
7. Appeal: a requester may appeal a denial (section 7).

## 3. Intake

1. Channels: research@xeniostechnology.com (member-facing email) and the member account privacy section. Requests arriving by any other route (Telegram, postal mail, a support thread, an affiliate) are redirected into one of these channels and logged as received on the date they first arrived. Telegram is never used to fulfill a request or transmit the data itself.
2. Every request gets a log entry at receipt: date received, channel, requester identifier, right(s) invoked, and the clock start date.
3. Acknowledge receipt to the requester within [COUNSEL: confirm acknowledgment window; proposed 10 days], stating the expected completion window.

## 4. Verifying the requester

Verification is scaled to the sensitivity of what is requested. No data is released or deleted on an unverified request.

1. Active members: request must originate from the authenticated account, with step-up authentication (XR-POL-002) before a data export or deletion is confirmed.
2. Former members: the receipt and privacy workflow verifies control of the email of record. For deletion or export of sensitive-health data, apply additional confirmation, [COUNSEL: confirm the required strength].
3. Applicants and non-members: verify control of the email on the application or record.
4. Authorized agents (a person acting for the requester): permitted where law requires; demand proof of authority and verify the underlying person, [COUNSEL: confirm agent-handling requirements per state].
5. A request that cannot be verified after reasonable attempts is declined for that reason, with an explanation of how to re-submit. The failed verification is logged; the requested data is never disclosed as part of explaining the failure.

## 5. Clocks

1. Many state comprehensive privacy laws set a 45 day completion window with one 45 day extension for complex requests. Treat 45 days as the working internal ceiling. [COUNSEL: confirm the controlling deadline per applicable state, including any shorter clocks under consumer health data laws.]
2. If an extension is taken, tell the requester before the original window ends, with the reason.
3. The clock starts at receipt, not at verification. Verification delays consume the window; they do not pause it, [COUNSEL: confirm].

## 6. Fulfillment steps per right

1. Access and portability: compile the requester's records across the classes in XR-POL-004 (application, account, agreements, orders, subscriptions, tracker and assessment, media, affiliate records). Deliver through the authenticated account or to the verified email as a protected export. Never include another person's data, staff notes that reveal another person, or security-sensitive material (fraud signals, credentials). Sexual-wellness data is included only when the requester explicitly confirms its inclusion, because it is separately consented and private by default.
2. Correction: correct the record, note the prior value in the audit trail, and confirm to the requester. Facts of history (an order that occurred, a signed agreement) are not rewritten; a dispute about them is recorded as an annotation.
3. Deletion: execute per the deletion procedure in XR-POL-005 section 4, including media, tracker, and export copies. Where a legal retention duty blocks part of the deletion (transactions, payments, agreements, safety, security, audit), delete what can be deleted, retain the rest under its schedule, and tell the requester which categories were retained and why. State honestly that vendor backups age out on the vendor's cycle.
4. Consent withdrawal: flip the consent server-side effective immediately, stop the dependent processing (sending, sharing, or use), keep the withdrawal record itself, and confirm.
5. Opt out of sale, sharing, targeted advertising: record the opt-out and confirm, restating the program posture in section 2.6.
6. Completion: every fulfillment ends with a written confirmation to the requester and a closing log entry.

## 7. Denials and appeals

1. Permitted denial reasons: identity could not be verified; the request is manifestly unfounded or excessive (repetitive within a short period); a legal retention duty or legal hold applies; an exemption applies (for example, records needed for security, fraud prevention, or legal claims); or the requester holds no applicable right for that data under governing law, [COUNSEL: confirm the permissible denial grounds per state].
2. Every denial is written, states the reason and the appeal path, and is logged.
3. Appeals go to the founder (samuel@xeniostechnology.com), who was not the automated decision path, and are answered within [COUNSEL: confirm appeal window per state]. If the appeal is denied, provide any contact method for the state attorney general that governing law requires, [COUNSEL: confirm].

## 8. Records of requests

Keep a request register with: request id, date received, channel, right(s) invoked, verification method and outcome, actions taken, categories retained under legal duty (for partial deletions), completion or denial date, denial reason, appeal and its outcome. The register itself contains the minimum personal data needed to identify the request and is retained per XR-POL-005, [COUNSEL: confirm the register retention period and any state reporting or metrics obligations].

## Open items for counsel

- [COUNSEL: confirm the rights matrix per applicable state, including consumer health data laws, and which rights extend to applicants and non-residents.]
- [COUNSEL: confirm acknowledgment, completion, extension, and appeal windows per state; 45 days with one extension is the proposed working ceiling.]
- [COUNSEL: confirm whether the clock may pause pending verification, and permissible denial grounds per state.]
- [COUNSEL: confirm authorized-agent handling requirements.]
- [COUNSEL: confirm the required verification strength for former-member deletion and sensitive-health exports.]
- [COUNSEL: confirm attorney general contact obligations after a denied appeal.]
- [COUNSEL: confirm the request register retention period and any reporting or metrics obligations.]
- Reconcile with the deletion procedure and retention duties in XR-POL-005 and the earlier engineering drafts it reconciles (docs/privacy/RETENTION_POLICY.md).
- [ENTITY]: confirm the responding legal entity named in confirmations and denials.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
