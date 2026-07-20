# Vendor Risk Management Policy

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-010 |
| Title | Vendor Risk Management Policy |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | in force from adoption; invoked before adding or replacing any vendor, on any vendor breach notice, on material changes to vendor terms, and at each periodic review |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | vendor assessments, questionnaires, contracts, and offboarding records per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (internal policy; adoption recorded by owner sign-off with version and date) |
| Withdrawal supported | n/a (internal policy, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-005, XR-POL-007, XR-POL-008, XR-POL-009, XR-POL-011, XR-POL-012, XR-FUL-009, XR-FUL-015 |
| Sources | See 00-register/SOURCE_REGISTRY.md; NIST supply chain risk management guidance |
| Review date | 2026-07-19 |

## 1. Purpose and scope

Every vendor that touches Xenios Research data or operations widens the attack surface and adds a party whose failure becomes Xenios's failure in the member's eyes. This policy defines vendor tiers, the assessment run before any vendor is added, the contract terms required, the periodic review cycle, and offboarding. It covers technology vendors, the fulfillment partner, carriers, payment and identity providers, and supplement supply relationships to the extent they involve data or member-facing service. Samuel Boadu owns every vendor relationship during the founding phase; each vendor's register entry names its human owner.

## 2. Vendor tiers

Tier is set by the most sensitive data the vendor can touch and by how badly its failure hurts members.

1. Tier 1 (critical): vendors that hold or can access restricted data (identity documents, liveness results, payment credentials, health and tracker data, private media) or whose compromise breaks the platform's core security. Examples for this program: the identity and age verification vendor, the payment processor, hosting and database and authentication infrastructure, media storage, the email provider (it transports account and status links), and the fulfillment partner during the split-fulfillment period (Mitch holds member names, addresses, and order contents for peptide and Quantum inventory under XR-FUL-001 and the data protection addendum XR-FUL-009).
2. Tier 2 (important): vendors holding confidential but narrower data, or whose outage degrades but does not break the program. Examples: shipping carriers (name, address, package metadata), wearable data integrators when that lane opens (health data flowing under consent, likely Tier 1 on assessment [COUNSEL: confirm tiering for wearable integrators]), and communications tooling.
3. Tier 3 (limited): vendors with no member personal data (development tooling, source hosting with no production data, office software used without member records).

Two standing notes. Telegram is a member-chosen communications platform, not a contracted processor; the program's own rules (no passwords, no IDs, no PDFs, no raw health media, no payment data over Telegram) bound its exposure, and it is tracked in the register as a channel risk rather than a vendor under contract. Supplement brands (Momentous, Pure Encapsulations) are supply relationships governed by reseller authorization; they receive no member data and are tracked for product risk, not data risk.

## 3. Onboarding assessment

Before any vendor is engaged, the owner completes a written assessment, stored in the vendor register:

1. Minimum necessary data, field by field, with each field's data classification. Prohibited-class data disqualifies the integration outright.
2. Design for evidence-stays-with-vendor: can Xenios store only results and references? This is the identity-verification pattern: the vendor holds ID documents and liveness data; Xenios stores signed results only, and no raw government ID images are retained unless counsel and the identity design require it. Likewise the payment pattern: card data never touches Xenios servers (hosted checkout or field-level tokenization only).
3. Storage and processing locations, model-training use (none permitted on member data), and a complete subprocessor list.
4. Security posture: audits or certifications (for example SOC 2), breach history, retention defaults, deletion guarantees.
5. Security questionnaire: Tier 1 and Tier 2 vendors complete the security questionnaire (XR-FUL-015) or supply an equivalent current audit report.
6. Offboarding path: data export and written deletion confirmation available?
7. Blast radius and rollback: what breaks if this vendor is fully compromised, and can a feature flag turn the integration off without a deploy?
8. HIPAA and HBNR screen: if the vendor would touch health-adjacent data, run the XR-POL-009 BAA screen and the XR-POL-008 service-provider analysis before signing.

## 4. Contract requirements

For any vendor processing applicant or member personal data, counsel-reviewed terms must include:

1. A data processing agreement restricting processing to Xenios's instructions, naming subprocessors, and requiring notice of subprocessor changes.
2. Confidentiality, and no sale or independent use of Xenios data, including no use for advertising or model training.
3. Breach notification to Xenios without undue delay, with scope detail sufficient to run XR-POL-007 and XR-POL-008. [COUNSEL: confirm the notice window and required content.]
4. Deletion on termination and on request, with written confirmation.
5. Security commitments proportionate to tier (encryption, access control, audit).
6. For the fulfillment partner: the master fulfillment agreement (XR-FUL-001) with its data protection and security addendum (XR-FUL-009), insurance schedule (XR-FUL-011), and recall cooperation (XR-FUL-008).
7. For any BA lane counsel identifies: a BAA per XR-POL-009 before any PHI flows.
8. Audit or assurance rights proportionate to tier. [COUNSEL: confirm what audit rights are realistic to demand from each vendor class.]

## 5. Periodic review

1. Tier 1: reviewed at least annually and on every triggering event.
2. Tier 2: reviewed at least every two years and on triggering events. [COUNSEL: confirm cadence.]
3. Tier 3: reviewed on triggering events.
4. Triggering events: a vendor breach notice or public incident, a material change to terms or subprocessors, a new data class flowing to the vendor, contract renewal, or a program change (for example a health-data flag opening) that changes what the vendor touches.
5. Each review re-checks: data actually flowing versus data assessed, questionnaire currency, certification currency, and whether the integration can still be disabled cleanly.

## 6. Vendor incidents

A vendor breach notice opens an incident under XR-POL-007 with the vendor named in the record. Containment includes credential rotation for that vendor, disabling the integration flag where possible, and demanding the contractual scope detail. Notification analysis runs through counsel exactly as for an internal incident; a vendor's own notice to individuals never substitutes for Xenios's analysis of its own duties.

## 7. Offboarding

When a vendor is replaced or dropped:

1. Export Xenios data needed for continuity and retention obligations (XR-POL-005).
2. Revoke credentials, API keys, and network access; rotate any shared secrets.
3. Obtain written deletion confirmation covering primary storage, backups on the vendor's stated schedule, and subprocessors.
4. Turn off and remove the integration flag and code path under XR-POL-011.
5. Record the offboarding in the vendor register with dates and evidence.

## 8. The vendor register

The register is the single record: vendor, tier, owner, data classes, assessment date, questionnaire status, contract and addenda references, subprocessors, review dates, incidents, and offboarding evidence. The register itself contains no secrets (XR-POL-012). [CONFIG: register location and format.]

## 9. Reconciliation with the earlier standard

An earlier standard exists at docs/risk/VENDOR_RISK_STANDARD.md (Draft v0.1, 2026-07-18). It inventories the pre-membership application platform's actual stack (hosting, database and auth, email, source hosting) with a precise account of what each vendor receives, and lists planned vendors (workspace tooling, identity verification, payments). That inventory remains accurate for the platform it describes and its assessment questions align with section 3. This policy supersedes it in scope: it adds tiering, the questionnaire requirement (XR-FUL-015), the fulfillment partner, carriers, wearable integrators, periodic review, incident handling, and offboarding, which the earlier file does not cover. Counsel should treat XR-POL-010 as governing and either retire the earlier file or keep it solely as the stack-specific inventory feeding the vendor register.

## Open items for counsel

- Confirm the contractual breach-notice window and required content for each vendor tier (section 4).
- Confirm tiering for wearable data integrators when that lane opens (section 2).
- Confirm realistic audit and assurance rights per vendor class (section 4).
- Confirm periodic review cadences (section 5).
- Confirm the minimum retention period for vendor assessments, contracts, and offboarding records (metadata table).
- Confirm the treatment of Telegram as a bounded channel risk rather than a contracted processor (section 2).
- Reconcile this policy with docs/risk/VENDOR_RISK_STANDARD.md and retire or re-scope the earlier file (section 9).

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
