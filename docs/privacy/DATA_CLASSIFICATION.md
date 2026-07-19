# xenios research data classification

Status: Draft v0.1
Owner: CLAUDE_PRIMARY
Date: 2026-07-18
Review trigger: any new table or field, any SECURITY_FLAGS flip, any change to
shared/research/security-types.ts DataZone. Must stay consistent with
docs/security/CURRENT_STATE_FACTS.md.

## 1. The five zones

The zones are defined in code at shared/research/security-types.ts (DataZone).
Every new field or table must declare a zone before it ships. When in doubt,
classify up (more restrictive), never down.

## 2. Zone: public

What: marketing copy, published education content, the research landing pages.
Examples: SPA static assets, /research educational pages once RESEARCH_PUBLIC
and RESEARCH_INDEXABLE are true.
Handling: freely loggable, exportable, emailable. No personal data may live
here. Note /research is noindex until RESEARCH_INDEXABLE=true.

## 3. Zone: internal

What: operational metadata and aggregates with no direct identity.
Examples: outbox attempt counts and statuses, rate-limit counters, aggregate
referral counts (the member referral contract is aggregates-only), status-code
distributions, test fixtures with synthetic data.
Handling: normal server logs allowed. May appear in internal dashboards and
team email. No Drive export path exists today; when Drive export ships it may
carry internal-zone aggregates only under RESEARCH_DRIVE_HEALTH_EXPORTS_ENABLED
review. Never combine internal aggregates in a way that re-identifies a person.

## 4. Zone: confidential

What: applicant and member identity, applications, consent records.
Examples: research_applications (email, first_name, last_name, phone, country,
region, city, occupation, organization, goals_text, fit_text, referral_source,
ip, source_page), research_application_events (notes, actor), members rows,
Supabase Auth users, the consent booleans (age_confirmed, marketing_consent),
the inert consent registry tables (research_consent_events,
research_covenant_acceptances), notification outbox payloads.
Handling rules:

- Logging: request bodies for /api/research and /api/admin/research are
  excluded from server logs (built). Never add confidential fields to logs.
- Export: manual, admin-only, per data-subject request. No bulk export tooling.
- Email: Resend carries applicant emails and signed status tokens by design.
  Never put confidential data of one person into another person's email.
- Drive: prohibited today (export tables exist, feature disabled). Any future
  flow requires the gating flag plus a review of this document.
- Storage: Supabase only, RLS enabled, no public policies, service-role access
  from the server only. Status tokens travel only by email and are scrubbed
  from URLs client-side.

## 5. Zone: restricted

What: identity documents and payment references. NOT collected today.
Examples (future only): ID verification artifacts (behind
RESEARCH_IDENTITY_VERIFICATION_ENABLED and RESEARCH_AGE_VERIFICATION_ENABLED),
Stripe customer or payment references (behind commerce enablement; Stripe is
not built).
Handling rules (pre-committed): never in application logs, never in email
bodies, never in Drive or Sheets, vendor-side storage preferred over storing
raw artifacts, field-level protection reviewed before the first field ships.
Today the correct handling is refusal: no code path may accept these inputs.

## 6. Zone: prohibited

What: health data and biometrics. Blocked until flags plus legal gates are met.
Examples (blocked): lab results, wearable streams, symptoms, medications,
health goals framed as medical conditions, photos used biometrically.
Handling rules:

- Nothing collects health data today, and no document may imply otherwise.
- The gates are RESEARCH_HEALTH_DATA_ENABLED, RESEARCH_LAB_UPLOADS_ENABLED,
  and RESEARCH_WEARABLES_ENABLED, all default false, plus a completed counsel
  review (HIPAA covered entity / business associate analysis, FTC Health
  Breach Notification Rule applicability, state health-privacy law). Counsel
  must confirm before any flag flips.
- If prohibited data arrives unsolicited (an applicant pastes labs into
  goals_text), do not propagate it: exclude it from any export, and delete or
  redact it from the application record on discovery, noting the redaction in
  the event audit.

## 7. Edge cases

- goals_text and fit_text are free text in the confidential zone but can attract
  prohibited-zone content. Treat any health disclosure inside them under
  section 6 unsolicited-data handling.
- ip and user_agent are confidential (identity-linkable), not internal.
- Signed status tokens and session cookies are secrets, not a data zone: never
  stored in outbox rows (tokens are minted at send time), never logged, never
  in URLs.
