# General Privacy Notice

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-PUB-004 |
| Title | General Privacy Notice |
| Audience | public |
| Required member state | all stages: pre-application through active membership and after cancellation |
| Trigger | Privacy link on first visit to /research; linked again at application, at the activation agreements step, and in the member account |
| Route | /research (Privacy link), /research/apply, activation agreements flow, /research/member/account |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (notice only); presentation is logged at the agreement checkpoints where this notice is linked |
| Withdrawal supported | partial; a notice is not a consent, but every optional consent this notice references (marketing, SMS, Telegram, sexual wellness data, integrations) is individually revocable |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-PUB-003, XR-PUB-005, XR-PUB-007, XR-PUB-011, XR-PUB-012, XR-POL-005, XR-POL-009 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Health Breach Notification Rule page; HHS HIPAA guidance; state attorney general privacy resources; NIST security guidance |
| Review date | 2026-07-19 |

## 1. Scope and who we are

Xenios Research is a private, approved-member health, performance, and research
membership operated by Xenios ([ENTITY]). It is application-based and limited to
people 21 or older.

This notice covers all personal data handled across the program: the public entrance,
the application, identity and age verification, membership, the assessment, plans, the
tracker, orders and subscriptions, support (including Telegram), referrals, and the
affiliate program. The Applicant Privacy Notice (XR-PUB-003) gives an application-stage
summary; where they overlap, both must stay accurate.

Terms used here: the "assessment" is the required intake questionnaire after
activation; the "Blueprint" is your personalized starting plan; the "tracker" is the
progress-logging feature that unlocks after the assessment; "Guides" are member-only
educational documents.

## 2. Data we collect, by category

### 2.1 Applicant data

The application collects identity and contact details, a 21+ declaration or date of
birth, location, occupation, goals, referral information, and required
acknowledgments, plus limited technical data (submission IP, source page, timestamps,
status events). Details are in the Applicant Privacy Notice (XR-PUB-003). No raw
government ID, payment data, or medical records are collected at application.

### 2.2 Identity and age verification data

After approval and before payment, every applicant completes identity and age
verification through a verification provider. Xenios retains the provider reference,
the verification result, the verified age result, the timestamp, the method used, and
a minimal failure code where verification fails. Xenios does not retain raw government
ID images unless counsel and the identity design require it, and any such retention
would be disclosed before it happens. Where liveness checks are used, the provider's
biometric handling is governed by its own notice and our contract with it; the state
biometric-law analysis is pending.

### 2.3 Member account and security data

Active members have an account with name, contact details, a password (stored only as
a cryptographic hash; no one at Xenios, including the founder, can see your password),
mandatory multi-factor authentication enrollment, recovery codes (stored hashed),
passkeys where offered, session records, login and security events, and audit logs.

### 2.4 Assessment data

The mandatory assessment (about 10 minutes, due within 3 days of activation) collects
goals, body and routine information, fitness, nutrition, sleep, energy, stress,
current products, allergies and restrictions, basic safety context, budget, routine
complexity, preferences, and 30/90-day direction. It exists to personalize your plans.
It is not a diagnosis and produces no medical record.

### 2.5 Tracker and progress media

After the assessment, the tracker records what you choose to log: manual entries, text
notes, voice notes up to 60 seconds, progress photos (with an optional face blur),
exercise videos up to 60 seconds, and side-by-side comparisons. You choose what happens
to raw uploaded media: if you elect raw-media deletion, the raw file is deleted after
verified successful processing and only derived data is kept; otherwise the raw file is
retained in private storage (see the Raw Media Retention and Deletion Election,
XR-TRK-009). Face blur is image processing only; it is not facial
recognition, and Xenios does not create or store biometric templates from progress
media. Future integrations (pose estimation, HealthKit, Health Connect, Oura, WHOOP,
professional sharing) will each require separate, specific consent before any data
flows.

### 2.6 Optional sexual wellness data

The Intimacy and Vitality category may involve data you consider especially private.
Any sexual-wellness-related tracking or preference data is collected only with a
separate, specific consent, is private by default, and is excluded from any sharing
except as strictly needed to provide the feature you asked for.

### 2.7 Orders, subscriptions, and payment data

We keep order history, subscription state (next charge, next shipment, pause, skip,
frequency, quantity, cancellation), shipping details, and transaction records. Payment
cards are handled by a payment processor using tokenization; Xenios does not store
full card numbers. Large orders may be manually reviewed for fraud and risk before
capture.

### 2.8 Support and Telegram data

Support runs through Telegram for members who link it. Linking uses a one-time code
and can be revoked at any time. We keep your questions (text and voice up to 60
seconds), our answers, status history, and your ratings. Telegram is never the system
of record: no passwords, reset tokens, ID documents, plan PDFs, raw health media,
payment data, or detailed assessment content moves over it, in either direction.

### 2.9 Referral and affiliate data

Referrals record the code used, the resulting store credit, and the 14-day hold state.
A referring member never sees the applicant's identity or application content.
Affiliates and Research Reps have separate agreements covering their identity, tax,
and payout data; they may not collect or store member health information.

### 2.10 Website and technical data

Standard technical data (IP address, device and browser information, pages visited on
/research surfaces, security and rate-limit events) supports operation and security.
Cookies are covered by the Cookie and Tracking Notice (XR-PUB-005).

## 3. Standing commitments

- We do not sell personal data.
- We do not send tracker, assessment, or any health-related data to advertising
  platforms, and no advertising pixels run on member or health surfaces.
- We do not retain raw government ID images by default (section 2.2), and we do not
  create biometric templates from progress media (face blur is not facial
  recognition).
- Optional sexual wellness data is separately consented and private by default.
- Telegram carries only what section 2.8 allows.
- Media (photos, voice, video) uses private storage, signed URLs, malware scanning,
  and access auditing.
- Declining any optional consent never affects application review, membership standing,
  or access to any feature or product; the only effect is that personalization cannot
  use data you have not shared.

## 4. Why we use your data

1. To run the membership you asked for: application review, verification, activation,
   plans (Blueprint, Xenios 30, Xenios 90), Review Week, and support.
2. To personalize: the assessment and tracker exist so plans fit you, including
   avoiding products that duplicate what you already take.
3. To fulfill orders and manage subscriptions and payments.
4. To secure the program: authentication, fraud prevention, audit, incident response.
5. To meet legal obligations: tax, transaction, safety, and audit records.
6. To communicate: transactional messages always; marketing only under XR-PUB-011;
   SMS and Telegram only under the separate optional consent XR-PUB-012.

## 5. Who we share data with

- Fulfillment partner: for approximately the first 60 days, a fulfillment partner
  (Mitch) holds and ships peptide and Quantum inventory. The fulfillment partner
  receives only the minimal shipping fields needed to fulfill: recipient name,
  shipping address, the items and quantities in the fulfillment order, and a contact
  field for delivery issues. The fulfillment partner never receives your assessment,
  tracker, health, payment, or account data.
- Payment processor: transaction data needed to charge, refund, and defend disputes.
- Identity verification provider: the data needed to verify identity and age
  (section 2.2).
- Infrastructure and communications providers: hosting, storage, email, and SMS
  providers process data on our instructions under contracts.
- Telegram: message content you send over Telegram passes through Telegram's platform
  under Telegram's own terms; that is why the section 2.8 limits exist.
- Legal and safety: disclosures required by law, or necessary to protect the rights
  and safety of members, applicants, staff, or the public.
- Business transfer: if the program's ownership changes, data may transfer with it,
  under this notice's commitments, with notice to members.

We require processors to use data only for the contracted service. Nothing above
permits advertising use of member data.

## 6. How long we keep data

Retention follows the Retention and Deletion Schedule (XR-POL-005). In general:
account, agreement, transaction, payment, safety, security, and audit records are kept
as long as law and legitimate program needs require; assessment and tracker data are
kept while your membership is active and then handled per the schedule; raw uploaded
media is deleted after verified successful processing when the member elects deletion
under XR-TRK-009, otherwise retained per the member's election; denied-application
retention is a counsel item in XR-PUB-003. Cancellation does not erase records we must keep
(section 10). The earlier draft docs/privacy/RETENTION_POLICY.md covers the smaller
built system and must be reconciled with XR-POL-005.

## 7. Your rights and choices

Subject to verification and applicable law, you can:

- Access a copy of your personal data.
- Correct inaccurate data.
- Delete data, subject to the retention obligations in section 6.
- Export your plans and data. Before cancellation you should download the plans and
  data you want to keep.
- Withdraw any optional consent (marketing, SMS, Telegram, sexual wellness data,
  future integrations) at any time, prospectively.
- Appeal a refused privacy request where state law provides an appeal right.

State-law hooks: depending on your state, consumer privacy laws, consumer health data
laws, and biometric privacy laws may give you additional rights and may impose consent
requirements on some data described here. The national state-by-state review is
pending; this notice will be updated with the state-specific disclosures counsel
requires. We do not discriminate against anyone for exercising a privacy right.

To exercise a right, email research@xeniostechnology.com. We verify requests against
the email on file. Our internal target is to respond within [CONFIG: response window,
working target 30 days], subject to the deadlines applicable law actually imposes.

## 8. Health information posture

- HIPAA: Xenios does not claim HIPAA compliance. The applicability analysis of whether
  any part of the program makes Xenios a covered entity or business associate is
  pending (XR-POL-009; see also the earlier draft
  docs/compliance/HIPAA_APPLICABILITY_ANALYSIS.md). Xenios does not represent itself
  as a HIPAA covered entity for direct-to-consumer services unless counsel concludes
  otherwise.
- FTC Health Breach Notification Rule: the tracker is designed to draw from manual
  entries, plans, and later wearables and integrations. The applicability analysis and
  breach-notification readiness work are pending (see the earlier draft
  docs/compliance/FTC_HBNR_APPLICABILITY_ANALYSIS.md).
- Nothing in the program is medical care. The assessment, Blueprint, plans, Guides,
  tracker, and support do not diagnose, prescribe, or direct medication or dosing, and
  they are not an emergency service. Emergencies go to 911 in the US.

## 9. Security

Controls include mandatory MFA for every member, hashed passwords, passkeys where
offered, encryption in transit and at rest, least-privilege access with row-level
authorization, signed URLs for media, malware scanning of uploads, audit logging,
session revocation, tested backups, and an incident response plan. The founder admin
account is server-enforced, MFA-protected, and step-up authenticated. These controls
are designed to protect data; no system is perfectly secure. If an incident affects
your data, we will notify you as applicable law requires.

## 10. Cancellation and your data

Cancellation is self-service and ends member access immediately; remaining paid time
is forfeited with no prorated refund unless applicable law requires one, and this
policy is subject to applicable law and counsel review. Before you confirm, the flow
tells you: access ends immediately, remaining paid time is forfeited, product
subscriptions are handled according to their own state, and you should download
desired plans and data first. Cancellation does not erase records Xenios must keep
(transaction, payment, agreement, safety, security, and audit records, per the
retention schedule). Your privacy rights survive cancellation, and a limited
non-member workflow remains available for receipts and privacy requests without
restoring member access.

## 11. Age

The program is 21+ only. We do not knowingly collect data from anyone under 21, and we
verify age after approval and before activation. If we learn an account belongs to
someone under 21, we will close it and delete data subject to legal retention needs.

## 12. Changes to this notice

We may update this notice. Changes apply prospectively, with a new version number and
advance notice to members of material changes. Prior versions remain available on
request.

## 13. Contact

- Program contact: research@xeniostechnology.com
- Accountable person: Samuel Boadu, Founder (samuel@xeniostechnology.com)

This notice does not waive rights that cannot be waived under applicable law, and it
does not relieve Xenios of duties imposed by law.

## Open items for counsel

- [ENTITY]: exact legal entity name and state of formation. [COUNSEL: confirm period]
  for the minimum retention baseline in the metadata table and section 6.
- [CONFIG: response window, working target 30 days] for privacy requests; counsel to
  confirm statutory deadlines by state (section 7).
- Complete the state-by-state review (consumer privacy, consumer health data,
  biometric, minors, telemarketing) and add any required state-specific disclosures
  and consent mechanics (section 7).
- Confirm the HIPAA (XR-POL-009) and FTC Health Breach Notification Rule
  applicability conclusions and reconcile with the earlier drafts
  docs/compliance/HIPAA_APPLICABILITY_ANALYSIS.md and
  docs/compliance/FTC_HBNR_APPLICABILITY_ANALYSIS.md (section 8).
- Reconcile this notice with the earlier drafts docs/privacy/PRIVACY_PROGRAM.md,
  docs/privacy/DATA_CLASSIFICATION.md, docs/privacy/RETENTION_POLICY.md, and
  docs/security/CONSENT_REGISTRY.md, which describe the currently built (smaller)
  system; counsel to decide which supersedes which at publication.
- Confirm whether identity-verification liveness data triggers state biometric
  statutes and what the vendor contract must say (section 2.2).
- Confirm the fulfillment-partner data-sharing scope and contract terms, including
  confidentiality and deletion on offboarding (section 5).
- Confirm the no-proration cancellation posture against state auto-renewal and
  consumer-protection laws (section 10), and whether a separate consumer health data
  privacy policy is required in specific states once the tracker launches.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
