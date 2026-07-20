# Data Classification Policy

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-004 |
| Title | Data Classification Policy |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | Adoption at program launch; every new table, field, integration, or export path must declare a class before it ships |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending, including consumer health data and biometric laws (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (internal policy) |
| Withdrawal supported | no (internal policy, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-001, XR-POL-005, XR-POL-006, XR-POL-009 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Health Breach Notification Rule page; HHS HIPAA guidance; NIST SP 800-60 concepts for classification |
| Review date | 2026-07-19 |

## 1. Purpose

This policy assigns every piece of Xenios Research data to one of five classes and states the handling rules for each class. Classification exists so that the strictest data (health and identity) always gets the strictest handling, automatically, no matter which feature touches it.

## 2. The five classes

| Class | Definition | Program examples |
| --- | --- | --- |
| public | Published content intended for anyone | Marketing pages, published education content at the /research entrance layer |
| internal | Operational data with no direct identity | Aggregate counts, rate-limit counters, delivery attempt statuses, anonymized waitlist positions, synthetic test fixtures |
| confidential | Personal data that identifies an applicant, member, affiliate, or partner | Applications, member account records, agreement acceptance records, order history, subscription state, referral records, Research Rep records, Telegram account-linkage records |
| sensitive-health | Health-adjacent personal data | Assessment answers, tracker entries, wearable and integration data, Xenios 30 and Xenios 90 plan content tied to a member, progress photos, video and voice media, and optional sexual-wellness data |
| restricted-identity | Identity evidence and payment credentials | Identity and age verification results (provider reference, result, method, timestamp), any government ID artifact (not retained unless separately approved), payment method references and tokens |

Rules of assignment: every new field, table, upload, or export path declares its class before it ships. When in doubt, classify up (to the more restrictive class), never down. Free-text fields that can attract health disclosures are handled at the level of the content they contain, not the level of the field.

## 3. Handling rules per class

### 3.1 public

Freely loggable, exportable, and emailable. No personal data may ever be placed in this class. The /research entrance password gates presentation only; it does not change classification.

### 3.2 internal

Normal server logs and internal dashboards allowed. Aggregates must never be combined in a way that re-identifies a person. Waitlist status shown to members is anonymous position only, never another person's identity.

### 3.3 confidential

1. Storage: primary database only, with row-level security enabled and server-side access (XR-POL-001).
2. Logging: request bodies and personal fields are excluded from server logs.
3. Email: transactional email may carry a person's own data to that person's address of record, never one person's data to another person.
4. Telegram: never. Telegram is not the system of record and carries no detailed assessments, documents, or account data.
5. Sharing: fulfillment partners receive only the shipping fields needed to fulfill (name, address, order contents for their items). Affiliates and Research Reps receive no applicant or member personal data; referrers never see applicant information.
6. Export: per verified data-subject request or named admin action, audited.

### 3.4 sensitive-health

Everything in 3.3, plus:

1. Advertising: never sent to advertising platforms. No ad pixels on tracker, assessment, or member surfaces. This is an absolute rule.
2. Media: private storage only, short-lived signed URLs, file validation, malware scanning, and an access audit on every retrieval.
3. Biometrics: no biometric templates are created or stored for progress media. Face blur is image processing, not facial recognition.
4. Sexual-wellness data: optional, collected only under its own separate consent, private by default, and excluded from any export or view that the member has not explicitly authorized.
5. Telegram: members may voluntarily send questions with health content over Telegram; staff never solicit health detail there, never paste tracker or assessment content into Telegram, and move anything substantive into the system of record.
6. Legal gating: the HIPAA applicability analysis is pending (see XR-POL-009). Xenios does not represent itself as a HIPAA covered entity for direct-to-consumer services unless counsel concludes otherwise. FTC Health Breach Notification Rule applicability analysis and state consumer-health-privacy review are required before this class expands, [COUNSEL: confirm gating].

### 3.5 restricted-identity

Everything in 3.3, plus:

1. Never in application logs, never in email bodies, never in Telegram, never in any spreadsheet or document export.
2. Raw government ID images are not retained by Xenios unless counsel and the identity design separately approve retention; the identity provider holds the evidence (XR-POL-003).
3. Payment credentials are tokenized by the payment processor; Xenios stores references, never card numbers.
4. Access is limited to the super administrator and the specific server processes that need the reference, and every access is audited.

## 4. Cross-cutting rules

1. Secrets (API keys, signing secrets, session tokens, reset tokens, passwords) are not a data class; they are credentials. They live only in server environment configuration, are never logged, never in URLs, and never in any document, including this one.
2. Downgrading data (moving it to a less restrictive class) requires a written decision-log entry and, for sensitive-health or restricted-identity data, counsel review.
3. Unsolicited sensitive data (for example, an applicant pasting lab results into a free-text answer) is not propagated: exclude it from exports, redact it from the record on discovery, and note the redaction in the audit.
4. Retention and deletion per class follow the Retention and Deletion Schedule (XR-POL-005). Privacy rights requests touching any class follow XR-POL-006.

## 5. Relationship to the earlier engineering draft

The worktree contains docs/privacy/DATA_CLASSIFICATION.md, an engineering draft that uses five zones named public, internal, confidential, restricted, and prohibited, where health data sits in a "prohibited" zone (blocked until flags and legal gates are met) and identity and payment data sit in "restricted". This policy renames those top classes to sensitive-health and restricted-identity because the program's canonical design does collect health-adjacent data (assessment, tracker, plans, media) once its legal gates pass, so the class needs handling rules, not only a block. The mapping is: prohibited maps to sensitive-health (with its gates), restricted maps to restricted-identity. Counsel is asked to reconcile the two schemes and designate one controlling vocabulary for code and documents.

## Open items for counsel

- Reconcile this policy with docs/privacy/DATA_CLASSIFICATION.md (public, internal, confidential, restricted, prohibited zones) and designate one controlling classification vocabulary.
- [COUNSEL: confirm the legal gating for the sensitive-health class: HIPAA applicability (XR-POL-009), FTC Health Breach Notification Rule applicability, and state consumer-health-privacy review.]
- [COUNSEL: confirm state biometric-law exposure of face blur processing and of provider-side biometrics, even though Xenios stores no templates.]
- [COUNSEL: confirm whether Telegram-originated health content requires additional consent or notice language.]
- [COUNSEL: confirm the retention minimums per class, via XR-POL-005.]
- [ENTITY]: confirm the legal entity that acts as data controller for each class.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
