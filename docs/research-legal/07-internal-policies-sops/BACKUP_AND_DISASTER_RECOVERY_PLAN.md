# Backup and Disaster Recovery Plan

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-013 |
| Title | Backup and Disaster Recovery Plan |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | Adopted before production commerce launch. Invoked on any data loss, corruption, provider outage, or compromise, and on every scheduled restore test. |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for backup catalogs, restore test evidence, and disaster event records] |
| Acceptance event | n/a (internal plan; adoption recorded by founder approval with version and date) |
| Withdrawal supported | No. Internal versioned plan; a later approved version supersedes this one. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-004, XR-POL-005, XR-POL-007, XR-POL-008 |
| Sources | See 00-register/SOURCE_REGISTRY.md; NIST contingency planning guidance |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This plan defines how Xenios Research backs up member data, how it tests that those backups actually restore, and how it recovers from a disaster. A disaster here means any event that makes member data or the member platform unavailable, incorrect, or untrustworthy: provider outage, data corruption, a bad deployment, credential compromise, or loss of a vendor.

This plan covers the Xenios Research platform and its data. It does not cover fulfillment partner systems (Mitch's obligations are set in XR-FUL-001 and its schedules) or supplier systems.

## 2. Definitions

- Backup: a copy of data taken so the data can be restored after loss or corruption.
- Restore test: a real exercise that restores a backup into an isolated environment and verifies the result. A backup that has never been restored is an assumption, not a capability.
- RPO (recovery point objective): the maximum acceptable amount of data loss, measured in time. An RPO of one hour means losing at most the last hour of changes.
- RTO (recovery time objective): the maximum acceptable time to restore service.

## 3. Provider dependencies

Xenios does not run its own hardware. Recovery capability is therefore bounded by what its providers offer and what Xenios has actually configured.

| Provider | Role | Recovery-relevant dependency |
| --- | --- | --- |
| Supabase | Postgres database, authentication, file storage | Database backups and point-in-time recovery, storage durability, project export. [CONFIG: confirm the subscribed Supabase plan tier and which backup features (cadence, point-in-time recovery window) it actually includes.] |
| Render | Application hosting and deployment | Redeploy from source control; environment configuration must be reproducible. Application code is recoverable from the Git repository; environment variables and service settings must be inventoried so a service can be rebuilt. |
| Email provider | Transactional and notice email | Outbound notices during an event; the durable email outbox in the application database is the record of what was sent. |
| Payment processor | Payment and subscription processing | Card data is tokenized at the processor and is never stored by Xenios, so it is out of backup scope by design. Subscription state held by the processor must be reconcilable against Xenios records. |
| Identity verification vendor | Identity and age verification | Xenios stores verification results, not raw ID images (per the sensitive data handling rules); vendor-side records follow the vendor contract. |
| Telegram | Support channel | Telegram is never the system of record. Nothing is recovered "from Telegram", and no recovery step may depend on Telegram content. |

Current state, stated honestly: as of this draft, backups follow Supabase defaults and no custom backup schedule exists (see docs/security/CURRENT_STATE_FACTS.md). This plan defines the target; the gap between default and target is an open configuration task that must close before production commerce launch.

## 4. Backup scope and cadence

Data is tiered using the Data Classification Policy (XR-POL-004). Every tier below is included in backup scope; the tiers differ in priority, not in whether they are protected.

| Tier | Data | Backup approach |
| --- | --- | --- |
| 1. Safety and control | Accounts, MFA enrollment state, roles, audit logs, security events | Database backup; [CONFIG: cadence, target continuous point-in-time recovery where the plan tier supports it] |
| 2. Legal record | Agreement acceptances, consent registry, identity verification results, transactions, subscription state, the email outbox | Database backup, same cadence as Tier 1 |
| 3. Program data | Assessments, Xenios 30 and Xenios 90 plans and PDFs, tracker entries, Guide content and versions, claims registry | Database backup plus storage backup for generated PDFs; [CONFIG: cadence] |
| 4. Member media | Progress photos, exercise video, voice recordings (private storage, signed URLs) | Storage durability plus [CONFIG: versioning or replication setting for media buckets] |

Rules:

1. Secret material (API keys, tokens, passwords, signing keys) is managed in provider secret storage under the Security Program. Secrets are never written into this plan, into documentation backups, or into exported reports. Recovery of secrets is a rotation exercise, not a restore exercise.
2. Backups inherit the access rules of the data they contain. Backup access is privileged, audited, and limited to the super administrator role (XR-POL-001).
3. Raw government ID images and biometric templates are not retained in the primary system (per the sensitive data handling rules), so they must not appear in backups. A backup found to contain them is a data-handling incident under XR-POL-007.

## 5. RPO and RTO targets

Targets are configuration, set by the founder and reviewed by counsel where notification duties depend on them. Launch working targets, all [CONFIG]:

| Tier | RPO target | RTO target |
| --- | --- | --- |
| 1. Safety and control | [CONFIG: e.g. 1 hour] | [CONFIG: e.g. 4 hours] |
| 2. Legal record | [CONFIG: e.g. 1 hour] | [CONFIG: e.g. 8 hours] |
| 3. Program data | [CONFIG: e.g. 24 hours] | [CONFIG: e.g. 24 hours] |
| 4. Member media | [CONFIG: e.g. 24 hours] | [CONFIG: e.g. 72 hours] |

Design intent: the legal record and account safety recover first. A member must never be locked out, wrongly let in, or shown someone else's data because recovery order was improvised.

## 6. Restore testing

1. A restore test runs on a fixed cadence, [CONFIG: restore test cadence, e.g. quarterly], and after any material change to the database schema, storage layout, or provider plan.
2. A restore test restores into an isolated environment, never into production, and verifies at minimum: row counts by table against the backup catalog, referential integrity, one sampled member's full record set (account, agreements, orders, plans, tracker entries, media references), and that restored media objects are retrievable.
3. Each test records: date, backup restored, scope, result, time taken (measured against the RTO target), gaps found, and follow-up items. Evidence is retained per XR-POL-005.
4. A failed or skipped restore test is a finding under the Security Program and blocks any statement, internal or external, that backups are "tested".

## 7. Member-data recovery priorities

When recovery capacity is constrained, restoration follows this order:

1. Authentication and authorization integrity: accounts, MFA state, roles, session revocation. No member locked out, no one wrongly let in.
2. Agreement, consent, and audit records: the legal record of what each member accepted and what the system did.
3. Orders, payment references, and subscription state, reconciled against the payment processor.
4. Plans, assessments, and tracker data: the member's program.
5. Member media.
6. Convenience data: saved views, waitlist positions, notification preferences.

Deletion survives restore: a restore must not resurrect data that was deleted under a member's verified deletion request or under the retention schedule. Deletion events are logged durably, and the log is re-applied after any restore. [COUNSEL: confirm this re-application approach satisfies state deletion rights when vendor backups cannot be purged on demand; docs/privacy/RETENTION_POLICY.md already flags that Supabase default backups may hold data until they age out.]

## 8. Disaster scenarios

| Scenario | First moves |
| --- | --- |
| Provider outage (Supabase or Render) | Confirm scope from provider status; post honest member-facing status; hold all commerce actions that cannot record state; restore per priorities when the provider recovers. |
| Data corruption or bad deployment | Freeze writes where possible; identify last known good point; restore to isolated environment first; reconcile the gap between restore point and freeze. |
| Credential or account compromise | Run XR-POL-007 (incident response) first: revoke sessions, rotate credentials, then assess data integrity before any restore decision. Founder-account compromise follows the emergency recovery path in XR-POL-002 and is always Sev1. |
| Vendor loss (provider discontinuity) | Export data under the provider's export tooling; stand up replacement infrastructure from source control and the environment inventory. [CONFIG: maintain a current export runbook per provider.] |
| Loss of founder access | The documented super administrator emergency recovery path (XR-POL-002). During the founding phase there is no second operator; this single-operator risk is flagged to counsel in XR-POL-007. |

Declaration authority: Samuel Boadu declares a disaster, owns recovery decisions, and is the named accountable human throughout. Model output, automation, and support tooling never authorize a recovery action on their own.

## 9. Communication during recovery

1. Members are informed through email from research@xeniostechnology.com in plain language: what is affected, what is not, and when the next update comes. No security-sensitive detail (no infrastructure names, no vulnerability specifics).
2. Telegram may carry a short pointer to the status message but never the record itself and never any credential, reset link, or sensitive detail.
3. Whether an event also triggers breach notification is decided under XR-POL-007 and the FTC Health Breach Notification analysis (XR-POL-008), not under this plan. Recovery never delays that assessment.
4. No outcome promises: communications state targets and current status, not guarantees.

## 10. Records

Every backup run, restore test, disaster declaration, recovery decision, and member communication is recorded with time and actor, retained per XR-POL-005. Corrections supersede prior records without erasing them. Cancellation of a membership does not remove that member's records from backups where law or the retention schedule requires their retention.

## Open items for counsel

- Retention period for backup catalogs, restore test evidence, and disaster event records (metadata table).
- [CONFIG: Supabase plan tier and included backup features] (Section 3): the current state is provider defaults with no custom schedule; this must be closed before launch.
- [CONFIG: backup cadence per tier, media bucket versioning or replication, restore test cadence, per-provider export runbook] (Sections 4, 6, 8).
- [CONFIG: RPO and RTO targets per tier] (Section 5), including whether any notification regime constrains them.
- Whether re-applying logged deletions after a restore satisfies state deletion rights given that vendor-held backups cannot be purged on demand (Section 7); reconcile with docs/privacy/RETENTION_POLICY.md, which raises the same issue.
- Reconcile this plan with the earlier drafts docs/security/INCIDENT_RESPONSE_PLAN.md, docs/security/SECURITY_PROGRAM.md, and docs/security/CURRENT_STATE_FACTS.md; counsel to confirm which document governs backup duties and to supersede the overlap.
- Confirm the single-operator recovery risk disclosure (Section 8) is acceptable for the founding phase or requires a designated backup contact (also raised in XR-POL-007).

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
