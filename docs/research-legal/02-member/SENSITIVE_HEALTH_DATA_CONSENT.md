# Sensitive Health Data Consent

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-MEM-012 |
| Title | Sensitive Health Data Consent |
| Audience | member |
| Required member state | active member (presented before the mandatory assessment begins; re-presented before any new category of sensitive collection) |
| Trigger | first entry into the mandatory assessment; again before optional sexual-wellness questions and before first tracker media upload |
| Route | /research/member (assessment and tracker) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX); state consumer-health-data laws review pending |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; raw tracker media deleted after successful processing per the tracker design |
| Acceptance event | checkbox + timestamp + document version + member reference recorded server-side; separate consent event per category (assessment, tracker media, sexual wellness) |
| Withdrawal supported | yes (revocable at any time from the member privacy settings; revocation stops new collection and disables personalization that depends on the revoked category; records required by law are retained) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-MEM-011, XR-MEM-013, XR-POL-005, XR-POL-009 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Health Breach Notification Rule materials; HHS HIPAA applicability guidance |
| Review date | 2026-07-19 |

## 1. Purpose

Personalization is the point of the membership: the assessment feeds the Blueprint, the
Blueprint feeds Xenios 30 and Xenios 90, and the tracker measures what changes. That requires
health-related information about you. This consent explains what is collected, why, who can
access it, how you revoke it, and what revocation costs you in personalization.

## 2. What this consent covers

1. Assessment answers. The mandatory assessment (due within 3 days of activation, about 10
   minutes) covers goals, body and routine, fitness, nutrition, sleep, energy, stress,
   current products, allergies and restrictions, basic safety context, budget, routine
   complexity, preferences, and 30/90-day direction.
2. Tracker data. Manual logs, text and 60-second voice notes, progress photos (with optional
   face blur), 60-second exercise videos, and the launch metrics built from them. Raw media
   is deleted after successful processing.
3. Optional sexual-wellness data. Questions or logs related to the Intimacy and Vitality
   category are optional, separately consented under this same framework, and private by
   default. Declining them never affects the rest of your membership.
4. Health context in support. Health details you volunteer through Telegram questions.
   Telegram is never the system of record, and detailed assessments, plan PDFs, raw health
   media, and payment data are not handled over Telegram.

## 3. How this data is treated under law

1. Consumer health data framing. Xenios treats this information as consumer health data.
   Several states regulate consumer health data with specific consent, access, and deletion
   rights. `[COUNSEL: state consumer-health-data laws; confirm which statutes apply, whether
   this consent meets their consent requirements, and whether a separate consumer health data
   privacy notice is required]`
2. HIPAA is not claimed. Xenios does not represent itself as a HIPAA covered entity for
   direct-to-consumer services. The HIPAA applicability analysis is pending (see XR-POL-009
   and the earlier repository draft docs/compliance/HIPAA_APPLICABILITY_ANALYSIS.md).
3. Breach duties. The FTC Health Breach Notification Rule applicability analysis is
   maintained separately (see the earlier repository draft
   docs/compliance/FTC_HBNR_APPLICABILITY_ANALYSIS.md).

## 4. Purposes

Your health data is used to:

- build and update your Blueprint, Xenios 30 plans, and Xenios 90 roadmap,
- flag exclusions, duplications, allergies, and basic safety context in product guidance,
- compute your tracker metrics and comparisons,
- support Samuel's founding-phase review of your plans (see XR-MEM-013),
- answer your support questions with your context.

It is not used for advertising. Tracker and health data are never sent to advertising
platforms. It is not sold. It is not shared with affiliates or Research Reps, who are
prohibited from storing health information.

## 5. Who can access it

1. Samuel Boadu, as founder and reviewer, during plan review and support.
2. The systems that store and process it, under least-privilege access, row-level
   authorization, encryption, signed URLs for media, malware scanning, and access audit.
3. Service providers only as needed to run the platform, under contracts that restrict use.
4. No one else, unless you direct a sharing (for example future professional sharing, which
   will have its own consent) or the law requires disclosure.

## 6. Revocation and its effect

1. How to revoke. You can revoke this consent at any time in your member privacy settings,
   per category (assessment, tracker media, sexual wellness). Revocation takes effect
   prospectively.
2. What stops. New collection in the revoked category stops. Personalization that depends on
   it degrades or stops: without assessment data there is no personalized Blueprint or plan
   update, and without tracker consent tracker features lock. Your membership itself can
   continue, but the plans become generic or paused rather than personal.
3. What is deleted. On revocation you may also request deletion of the category's stored
   data, honored subject to applicable law.
4. What is kept. Records Xenios must keep by law (transaction, payment, agreement, safety,
   security, and audit records) are retained under the retention schedule even after
   revocation or cancellation. Privacy rights survive cancellation.

## 7. What this consent does not do

This consent does not waive rights that cannot be waived under applicable law, and it does
not relieve Xenios of duties imposed by law. It does not make any collection lawful that the
law does not permit, and it does not convert plans, tracker output, or support into medical
care (see XR-MEM-009).

## Open items for counsel

- State consumer-health-data laws: applicability, consent sufficiency, notice requirements,
  and authorized-agent rights: `[COUNSEL: state consumer-health-data laws]`.
- Confirm retention periods per category under XR-POL-005: `[COUNSEL: confirm period]`.
- Confirm the revocation and deletion flow satisfies state deletion rights, including
  timelines and verification requirements.
- Confirm the separate-consent treatment of sexual-wellness data meets any heightened
  state requirements for that category.
- Reconcile with the earlier repository drafts docs/security/CONSENT_REGISTRY.md (the
  health_data_collection consent kind is reserved and must not be written until legal gates
  clear), docs/compliance/HIPAA_APPLICABILITY_ANALYSIS.md, and
  docs/compliance/FTC_HBNR_APPLICABILITY_ANALYSIS.md; counsel to confirm alignment.
- Confirm the exact legal entity name to substitute for `[ENTITY]`.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |
