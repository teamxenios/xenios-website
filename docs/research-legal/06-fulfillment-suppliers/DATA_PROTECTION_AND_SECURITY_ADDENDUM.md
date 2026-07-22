# Data Protection and Security Addendum

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-FUL-009 |
| Title | Data Protection and Security Addendum |
| Audience | fulfillment_partner |
| Required member state | n/a (partner agreement) |
| Trigger | Partner onboarding. Must be executed with the Master Fulfillment Agreement (XR-FUL-001) before Mitch receives any member data or any fulfillment order. |
| Route | offline agreement |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for executed partner data agreements and access logs] |
| Acceptance event | Wet or electronic signature by an authorized representative of each party; executed copy retained by both parties. |
| Withdrawal supported | No. Obligations end only through the termination and transition provisions of XR-FUL-001 and XR-FUL-014; data duties survive as stated in Section 12. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-FUL-001, XR-FUL-005, XR-FUL-010, XR-FUL-011, XR-FUL-014, XR-POL-005, XR-POL-009 |
| Sources | See 00-register/SOURCE_REGISTRY.md; NIST digital identity guidance (MFA); FTC data security guidance |
| Review date | 2026-07-19 |

## 1. Purpose and relationship to the Master Fulfillment Agreement

This Addendum is a schedule to the Master Fulfillment Agreement (XR-FUL-001) between [ENTITY] ("Xenios") and [ENTITY] ("Mitch"). It states exactly what member data Mitch may receive, what Mitch may never receive, and the security controls Mitch must maintain while holding and fulfilling peptide and Quantum inventory for the Xenios Research Founding Membership program.

Xenios runs a private, application-based, 21+ membership. Members trust Xenios with sensitive information (assessments, plans, tracker entries, private media). Mitch's role is fulfillment only. The rule of this Addendum is data minimization: Mitch receives the minimum data needed to pick, pack, and ship an order, and nothing else.

If this Addendum conflicts with the Confidentiality and Restricted Data Addendum (XR-FUL-010) on the handling of member personal data, this Addendum controls.

## 2. Definitions

- "Member Fulfillment Data" means the data listed in Section 3 that Xenios transmits to Mitch for a specific fulfillment order.
- "Prohibited Data" means the data classes listed in Section 4 that Mitch must never receive, request, or retain.
- "Authorized User" means a named individual employee or contractor of Mitch who has been approved for access under Section 6.
- "Security Incident" means any actual or reasonably suspected unauthorized access to, or unauthorized acquisition, use, disclosure, alteration, loss, or destruction of, Member Fulfillment Data, or any compromise of a system or account used to process it.

## 3. Data Mitch may receive

For each fulfillment order, Xenios may transmit only:

1. Member name (as needed for the shipping label).
2. Shipping address.
3. Phone number, only when the selected carrier or service requires it (for example, some expedited or temperature-controlled services).
4. Order items (SKU and quantity, plus any lot rule, signature rule, temperature service, or special handling instruction).
5. Order reference (the fulfillment order ID; Xenios's internal member identifiers are not shared).
6. Shipping service selected.

This list is exhaustive. Xenios will not send, and Mitch must not request, any field outside this list. If a carrier or regulator requires an additional field, the parties must approve the addition in writing before it is transmitted. [COUNSEL: confirm whether any carrier-mandated fields, such as delivery email for tracking notices, should be pre-approved here.]

## 4. Data Mitch may never receive

Mitch must never receive, request, access, or retain:

1. Member assessments or assessment answers.
2. The member's Blueprint or any plan content (Xenios 30, Xenios 90, Guides).
3. Tracker data of any kind (manual entries, wearable data, integrations).
4. Private media (photos, video, voice recordings).
5. Order history unrelated to the fulfillment orders assigned to Mitch.
6. Referral data (who referred whom, referral credits, applicant information).
7. Samuel's founder notes or any internal review notes about a member.
8. Member passwords, credentials, MFA secrets, recovery codes, identity documents, or payment data.

If Prohibited Data reaches Mitch in error, Mitch must not use it, must notify Xenios within [CONFIG: notification window, proposed 24 hours], and must delete it as Xenios directs, confirming deletion in writing.

## 5. Permitted use and minimization

5.1 Mitch may use Member Fulfillment Data only to fulfill the specific order it accompanies, to handle carrier exceptions for that order, and to meet record-keeping duties under this Agreement or applicable law.

5.2 Mitch must not use Member Fulfillment Data for marketing, profiling, analytics beyond operational fulfillment metrics, data enrichment, or any purpose of Mitch's own. Mitch must not sell, share, rent, or disclose it to anyone except the carrier for the specific shipment and Authorized Users who need it for that order.

5.3 Mitch must not contact members except as strictly required by a carrier process for a specific shipment, and never for marketing.

5.4 [COUNSEL: confirm whether state privacy laws applicable to this data require formal processor or service-provider contract clauses, and insert the required clause set (purpose limitation, no sale or sharing, deletion, subcontractor flow-down, compliance assistance) in the jurisdictions that apply.]

## 6. Authorized Users and access control

6.1 Mitch maintains a written list of Authorized Users, each a named individual with a business need. Shared, generic, or role accounts are prohibited. Shared passwords are prohibited.

6.2 Multi-factor authentication (MFA) is required for every Authorized User on every system or account used to receive, view, or process Member Fulfillment Data, including the order interface, inventory feed, email, and any file transfer account.

6.3 Access follows least privilege: an Authorized User sees only the orders and fields needed for their role.

6.4 Access removal: when an Authorized User leaves Mitch, changes role, or no longer needs access, Mitch removes their access within [CONFIG: removal window, proposed same business day, no later than 24 hours] and notifies Xenios. Mitch reviews the Authorized User list at least quarterly and on Xenios's request.

## 7. Secure transmission

7.1 Order and inventory data move over the integration defined under the Master Fulfillment Agreement section 7 and the Inventory and Lot Reporting Schedule (XR-FUL-005): API preferred, with encrypted transport (TLS). During the pilot, a secure CSV exchange over an approved encrypted channel is acceptable.

7.2 Prohibited transmission methods: personal email accounts, spreadsheets sent through personal email, consumer messaging apps, SMS, unencrypted FTP, and any channel not approved in writing. Telegram is never used for member data between the parties.

7.3 Printed pick lists and labels containing Member Fulfillment Data must be controlled in the facility and destroyed (cross-cut shred or equivalent) once the order ships and any required retention copy exists digitally.

## 8. Storage and security controls

8.1 Mitch must protect Member Fulfillment Data with controls reasonable for its sensitivity, designed to include: encryption at rest for systems storing it, screen-lock and device controls on workstations, malware protection, patching of systems used to process it, and physical access control to the fulfillment area.

8.2 Mitch must not create copies of Member Fulfillment Data outside the systems identified to Xenios, and must not store it on personal devices or personal cloud accounts.

8.3 Mitch maintains basic access logging on the order system (who accessed which order data and when) to the extent the system supports it, and preserves those logs for Xenios during any incident review. [CONFIG: log retention period, proposed 12 months.]

## 9. Incident reporting

9.1 Mitch must notify Xenios of any Security Incident without undue delay and no later than [CONFIG: incident notice window, proposed 48 hours; COUNSEL: confirm against applicable state breach statutes] after becoming aware of it, by email to samuel@xeniostechnology.com and by phone if member data is involved.

9.2 The notice must state, to the extent known: what happened, when, the data and orders affected, the members affected, containment steps taken, and a named contact at Mitch.

9.3 Mitch must cooperate fully with Xenios's incident response, preserve evidence, and not make any public statement or member notification about an incident involving Xenios data without Xenios's written approval, except where Mitch is independently required by law to notify. Legal notification duties are governed by law and cannot be waived by this section.

9.4 Costs of investigation, notification, and remediation for an incident caused by Mitch's breach of this Addendum are allocated in the Insurance and Indemnity Schedule (XR-FUL-011). [COUNSEL: confirm allocation.]

## 10. Subcontractors

Mitch must not disclose Member Fulfillment Data to any subcontractor or third party (other than the carrier for a specific shipment) without Xenios's prior written approval. Any approved subcontractor must be bound in writing to duties at least as protective as this Addendum, and Mitch remains responsible for the subcontractor's handling.

## 11. Retention and deletion

11.1 Mitch retains Member Fulfillment Data only as long as needed to fulfill the order, resolve carrier claims for it, and meet invoicing and legal record duties, and no longer than [CONFIG: partner retention period; COUNSEL: confirm against tax, transport, and product-record requirements].

11.2 On termination or expiry of the Master Fulfillment Agreement, Mitch returns or securely deletes all Member Fulfillment Data as directed by Xenios under the Transition and Termination Assistance Schedule (XR-FUL-014) and certifies deletion in writing, except for the minimum records Mitch must keep by law, which remain protected by this Addendum for as long as they are held.

11.3 Deletion of member data by Xenios (for example after a member cancellation or privacy request) flows down: on Xenios's instruction, Mitch deletes the corresponding data it still holds, subject to the legal-hold exception above.

## 12. Verification and survival

12.1 Xenios may verify compliance through a written questionnaire at least annually, and through a walkthrough or audit of the relevant systems and facility areas on reasonable notice, at a frequency of no more than [CONFIG: audit frequency, proposed once per year] absent an incident.

12.2 Sections 4, 5, 9, 10, 11, and this Section survive termination for as long as Mitch holds any Member Fulfillment Data, and the confidentiality duties of XR-FUL-010 survive as stated there.

12.3 This Addendum is designed to implement Xenios's data protection commitments; it is subject to counsel confirmation and does not itself create compliance with any statute. Xenios does not represent itself as a HIPAA covered entity for direct-to-consumer services; the HIPAA applicability analysis is pending (see XR-POL-009). This Addendum is not a HIPAA business associate agreement. [COUNSEL: confirm no BAA is required for this relationship.]

## Open items for counsel

- [COUNSEL: confirm retention period for executed partner data agreements and access logs (metadata table).]
- [COUNSEL: confirm whether any carrier-mandated fields, such as delivery email for tracking notices, should be pre-approved in Section 3.]
- [CONFIG: notification window for Prohibited Data received in error (Section 4, proposed 24 hours).]
- [COUNSEL: confirm whether state privacy laws require formal processor or service-provider clauses for this data set, and supply the clause set (Section 5.4).]
- [CONFIG: access removal window (Section 6.4, proposed same business day, no later than 24 hours).]
- [CONFIG: access log retention period (Section 8.3, proposed 12 months).]
- [CONFIG + COUNSEL: incident notice window (Section 9.1, proposed 48 hours) against applicable state breach statutes.]
- [COUNSEL: confirm incident cost allocation cross-reference to XR-FUL-011 (Section 9.4).]
- [CONFIG + COUNSEL: partner retention period for Member Fulfillment Data (Section 11.1).]
- [CONFIG: audit frequency (Section 12.1, proposed once per year).]
- [COUNSEL: confirm no HIPAA business associate agreement is required (Section 12.3; see XR-POL-009).]
- Earlier internal drafts overlap this Addendum: docs/risk/VENDOR_RISK_STANDARD.md, docs/privacy/DATA_CLASSIFICATION.md, docs/privacy/RETENTION_POLICY.md, and docs/security/INCIDENT_RESPONSE_PLAN.md. Counsel to reconcile and confirm this Addendum as the controlling partner-facing document, with those internal standards feeding its requirements.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
