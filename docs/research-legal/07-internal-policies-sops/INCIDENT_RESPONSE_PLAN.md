# Incident Response Plan

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-007 |
| Title | Incident Response Plan |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | in force from adoption; invoked whenever a suspected security or privacy incident is detected or reported |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | incident records, evidence exports, and post-incident reviews per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (internal policy; adoption recorded by owner sign-off with version and date) |
| Withdrawal supported | n/a (internal policy, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-005, XR-POL-008, XR-POL-009, XR-POL-010, XR-POL-012 |
| Sources | See 00-register/SOURCE_REGISTRY.md; NIST incident handling guidance; FTC Health Breach Notification Rule page |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This plan governs how Xenios Research detects, contains, investigates, and closes security and privacy incidents. It covers every system that holds applicant, member, partner, or affiliate data: the member platform behind /research, the admin surface, the tracker and media stores, order and subscription records, the Telegram support channel, email, and every vendor listed in the vendor register under XR-POL-010. It also covers physical and fulfillment incidents that expose member data (for example a mislabeled shipment revealing another member's information).

An incident is any event that does, or reasonably might, compromise the confidentiality, integrity, or availability of Xenios systems or data. When in doubt, treat the event as an incident and classify it under this plan.

## 2. Roles and named accountability

Xenios does not assign incident duties to "the system" or to an unnamed team. Named humans hold each role:

1. Incident commander and accountable owner: Samuel Boadu, Founder (samuel@xeniostechnology.com). Samuel is the server-enforced super administrator and the named accountable human for every escalation. He declares severity, authorizes containment that affects members, and owns every external communication decision.
2. Legal counsel: [COUNSEL: identify engaged counsel and after-hours contact]. Counsel is contacted before any external notification is sent or withheld for an incident involving personal data.
3. Vendor contacts: each Tier 1 vendor's security contact is recorded in the vendor register (XR-POL-010). The fulfillment partner's incident duties are set in the fulfillment data protection addendum (XR-FUL-009).
4. During the founding phase there is no rotation or on-call bench. This is a known single-operator risk. [COUNSEL: advise whether a designated backup contact is required for any notification regime.]

## 3. Severity classification

Classify at declaration and re-classify as facts develop. Default up: if severity is uncertain, use the higher class until ruled out.

1. Sev1: confirmed or suspected exposure of member or applicant personal data (identity, assessment or tracker content, media, orders, payment references), compromise of the founder or any admin account, or compromise of a signing secret, service key, or payment integration credential.
2. Sev2: platform-wide outage of a core member flow (application, activation, login, plan delivery, ordering, cancellation) with no evidence of data exposure, or a fulfillment event with possible cross-member data exposure pending confirmation.
3. Sev3: degraded single subsystem with a workaround (email delivery, Telegram intake, waitlist notifications, media upload), no data exposure.
4. Sev4: cosmetic or non-user-facing defect that still has a security or privacy angle worth recording.

Any incident touching tracker health entries, progress media, sexual-wellness data, or identity-verification results is Sev1 by default, because those classes carry the strictest notification analysis (XR-POL-008, XR-POL-009).

## 4. Detection

Current and planned detection sources, reviewed by the incident commander:

1. Structured audit events and login alerts under the Logging and Redaction Standard (XR-POL-012), including admin login alerts and media access audit trails.
2. Member reports to research@xeniostechnology.com and through Telegram. Emergency language in any channel routes the person to emergency services (911 in the US) first; the security review follows.
3. Vendor breach notices required by contract under XR-POL-010.
4. Failed-delivery and queue backlog signals from the notification outbox.
5. Payment processor fraud and dispute alerts once commerce is live.
6. There is no SIEM or paging pipeline during the founding phase; detection is human review of the sources above. Building alerting is a tracked gap, not an assumed control.

## 5. Response procedure

1. Declare: open an incident record with time, detector, symptom, and initial severity. Use a unique incident ID.
2. Contain: apply section 6. Prefer over-containment; every listed control is reversible.
3. Preserve: capture evidence per section 8 before any restart, rotation, or deletion that would destroy context.
4. Analyze: establish what data, which members, which systems, and what time window. This scoping feeds the notification analysis in section 7.
5. Eradicate and recover: fix root cause on a branch under the Secure Development Policy (XR-POL-011), with tests, review, and a rollback point before deploy.
6. Close: complete the post-incident review in section 10.

## 6. Containment playbook

Containment actions by asset class. Exact runbook commands live in the internal operations notes, not in this counsel-facing document.

1. Member sessions: revoke sessions platform-wide or per member. Members re-authenticate with password plus MFA.
2. Admin access: suspend the affected admin identity immediately. Founder-account compromise triggers the emergency recovery procedure (step-up verification, credential rotation, session revocation) and is always Sev1.
3. Secrets and keys: rotate the affected signing secret, service key, or API key, then redeploy. Rotation invalidates dependent artifacts (signed links, sessions); plan the member-facing side effect before rotating.
4. Signed media URLs: shorten or invalidate signed URL validity for the affected store; confirm the access audit trail is preserved first.
5. Feature flags: every optional capability defaults false. Confirm no flag flipped unexpectedly; turn off the smallest flag that contains the blast radius (for example a wearable integration or an export path).
6. Telegram: revoke the account link for affected members (linking uses one-time codes and supports revocation) and pause the intake bot if the channel itself is implicated.
7. Fulfillment: instruct the fulfillment partner to hold affected shipments; the hold and evidence duties are contractual (XR-FUL-009).
8. Payments: on suspected payment-credential exposure, engage the processor's compromise process. Card data is designed never to touch Xenios servers; if evidence suggests otherwise, treat as Sev1 and notify counsel and the processor before anything else.

## 7. Notification analysis

No notification is sent, and no notification is skipped, without counsel. For every Sev1 and any Sev2 with possible exposure, counsel and the incident commander work through each lane:

1. State breach notification statutes: which states' laws attach depends on where affected individuals reside. The member base is national, so the analysis is state-by-state. [COUNSEL: confirm the trigger elements, timing, content, and regulator-notice duties per affected state.]
2. FTC Health Breach Notification Rule: the tracker is designed to draw health information from multiple sources, so HBNR applicability must be analyzed for any incident touching tracker, assessment, or media data. Follow the framework and SOP in XR-POL-008. Do not assume the rule does not apply.
3. HIPAA: the working analysis is that Xenios is neither a covered entity nor a business associate (XR-POL-009). If any lane has changed that status (for example a professional-sharing integration), counsel re-runs the analysis for the incident.
4. Contractual duties: vendor agreements, the fulfillment agreement, reseller authorizations, and the payment processor agreement may each require notice on defined timelines. The vendor register (XR-POL-010) records who must be told what, and when.
5. Individual notice: even where no statute compels notice, Samuel may decide, with counsel, that honesty with members requires it. That decision and its reasoning are documented either way.

Operational rule until counsel advises otherwise: on any Sev1 involving personal data, contact counsel before any external communication, preserve all evidence, and do not delete affected records.

## 8. Evidence preservation

1. Export relevant logs, audit events, and queue records before restarts or rotations clear them.
2. Snapshot affected database tables and storage buckets where feasible; record hashes and export times.
3. Keep a contemporaneous timeline in the incident record: who did what, when, and why.
4. Preserve originals; work from copies. Nothing in an open incident's scope is deleted, including under routine retention jobs, until counsel confirms the litigation-hold question. [COUNSEL: define the hold procedure that suspends the XR-POL-005 deletion schedule during an incident.]
5. Logs themselves must already be free of secrets and sensitive content (XR-POL-012), so preserving them does not create a second exposure.

## 9. Member and external communication

1. Only Samuel, with counsel, communicates externally about an incident. Research Reps, affiliates, and partners never do.
2. No public or member-facing characterization of an incident before the facts and counsel review support it. No minimizing language, no premature "no data was affected" statements.
3. Member notices are plain English, state what happened, what data was involved, what Xenios did, and what the member can do. They never include secrets, tokens, or another member's information.
4. Telegram is never used to deliver breach notices or collect incident details involving sensitive data. Telegram is not the system of record.

## 10. Post-incident review

Within one week of closure: write the timeline, root cause, blast radius, what worked, what failed, and corrective actions into the incident record. Corrective actions get owners and dates. Update this plan, the Logging and Redaction Standard, the vendor register, or the flag defaults in the same change if controls moved. Review this plan after every Sev1 or Sev2 and at least semiannually.

## 11. Reconciliation with the earlier draft plan

An earlier plan exists at docs/security/INCIDENT_RESPONSE_PLAN.md (Draft v0.1, 2026-07-18). It describes the pre-membership application platform: its severity ladder, its specific stack containment steps (session-secret rotation, service-key rotation, email-provider rotation, gate fail-closed behavior), and a worked email-outage example. Its stack-level containment detail remains operationally valuable and is not repeated here. This document supersedes it in scope: the earlier plan predates the tracker, media, commerce, fulfillment, Telegram support, and the full membership data model, and it names a non-human owner. Counsel should treat XR-POL-007 as the governing plan and either retire the earlier file or re-scope it as a stack-specific containment appendix under this plan.

## Open items for counsel

- Identify engaged counsel and an after-hours contact for incident escalation (section 2).
- Advise whether any notification regime requires a designated backup human contact beyond the single founder (section 2).
- Confirm state-by-state breach notification triggers, timing, content, and regulator-notice duties for a national member base (section 7).
- Confirm the HBNR analysis pathway for tracker, assessment, and media incidents, per XR-POL-008 (section 7).
- Define the litigation-hold procedure that suspends the XR-POL-005 deletion schedule during an incident (section 8).
- Confirm the minimum retention period for incident records and evidence exports (metadata table).
- Reconcile or retire docs/security/INCIDENT_RESPONSE_PLAN.md so only one plan governs (section 11).

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
