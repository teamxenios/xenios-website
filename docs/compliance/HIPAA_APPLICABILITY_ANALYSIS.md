# HIPAA applicability analysis for xenios research

Status: Draft v0.1 (for counsel review)
Owner: CLAUDE_PRIMARY
Date: 2026-07-18
Review trigger: any change to RESEARCH_HEALTH_DATA_ENABLED, RESEARCH_LAB_UPLOADS_ENABLED, or RESEARCH_WEARABLES_ENABLED; any new vendor that would handle member health information; any clinical service proposal.

Ground truth: docs/security/CURRENT_STATE_FACTS.md. Counsel must confirm every legal conclusion in this document.

## 1. Conclusion up front

xenios research is currently NOT a HIPAA covered entity and NOT a business associate. This is our working analysis, not a legal opinion, and counsel must confirm it. Separately and more simply: the platform collects no health data today, so there is no protected health information (PHI) on the system regardless of entity status.

Hard rule: xenios never claims to be "HIPAA compliant" in any copy, sales material, application, or support answer. The platform is not HIPAA compliant, has not been assessed against HIPAA, and stating otherwise would be false. If health-data features ever ship, the claim still may not be made until counsel and a formal assessment say it can.

## 2. Why we are not a covered entity (counsel must confirm)

HIPAA's covered entities are health plans, healthcare clearinghouses, and healthcare providers that conduct certain electronic transactions. xenios research is none of these:

1. We are not a health plan. We sell a membership to an education platform, not insurance or benefits.
2. We are not a clearinghouse. We process no healthcare claims or billing transactions in any form.
3. We are not a healthcare provider. We provide no diagnosis, treatment, prescriptions, clinical advice, or care. The platform is research peptide education with commerce disabled. Members receive documentation, not medical services.

## 3. Why we are not a business associate (counsel must confirm)

A business associate handles PHI on behalf of a covered entity. xenios research:

1. Has no contracts or data flows with any covered entity.
2. Has signed no business associate agreements (BAAs), and none of our vendors (Render, Supabase, Resend) hold a BAA with us or need one for our current data.
3. Receives no PHI from any healthcare organization.

## 4. What data we actually hold

Application data is identity plus stated goals and interests: name, email, and free-text goals. This is personal data, treated as the Confidential zone under shared/research/security-types.ts, but it is not medical records and does not originate from a covered entity. The data-zone contract marks health data and biometrics as "prohibited": blocked in code until flags and legal gates open. There is no health-data intake, no lab uploads, no wearable integration, and no deep onboarding. All of these are NOT BUILT and their flags default false.

## 5. What would change this analysis

Any of the following would require re-running this analysis with counsel BEFORE launch:

1. RESEARCH_HEALTH_DATA_ENABLED: collecting member health information (conditions, medications, symptoms). This alone likely does not create HIPAA coverage (HIPAA follows entity status, not data type; counsel must confirm), but it changes our risk posture entirely and implicates other regimes (see the FTC HBNR analysis).
2. RESEARCH_LAB_UPLOADS_ENABLED: members uploading lab results. Labs originate from providers; the flow, retention, and any provider integration need counsel review.
3. RESEARCH_WEARABLES_ENABLED: continuous biometric streams.
4. Any clinical service: telehealth, provider referrals, coaching that shades into care, or partnerships with providers or plans. A provider partnership could make xenios a business associate; a clinical service could make xenios a provider. Either is a stop-and-review event.
5. Any vendor or partner that is itself a covered entity or business associate asking us to sign a BAA.

## 6. Readiness path if a gate opens

If leadership decides to open any health-data gate, the minimum sequence is:

1. Counsel engagement first: entity-status analysis, state-law overlay, and a written go/no-go before any build.
2. Data mapping: every new field declared into a data zone; health data leaves "prohibited" only by explicit policy change.
3. Vendor review: BAAs where required, or vendor replacement; Supabase, Render, and Resend each assessed for the new data class.
4. Consent capture: health_data_collection consent kind recorded in the consent registry (supabase/research-consent-covenant.sql) before any collection.
5. Security uplift: field-level encryption, access controls beyond the single ADMIN_EMAIL allowlist, audit and incident tooling. None of this exists today.
6. Only after all of the above, and only if counsel approves the language, any public statement about health-data handling. Never the phrase "HIPAA compliant" without a formal assessment.

## 7. Standing statements

- "xenios research is not a healthcare provider and is not HIPAA compliant. We do not collect health information." This is the honest, current answer to any member or applicant question.
- Legal conclusions in sections 2, 3, and 5 are working analysis. Counsel must confirm.
