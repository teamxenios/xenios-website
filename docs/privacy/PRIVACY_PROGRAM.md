# xenios research privacy program

Status: Draft v0.1 (for counsel review)
Owner: CLAUDE_PRIMARY
Date: 2026-07-18
Review trigger: any new data field or table, any new third-party processor, any
SECURITY_FLAGS flip to true, or counsel feedback. Must stay consistent with
docs/security/CURRENT_STATE_FACTS.md.

## 1. Principles

1. Data minimization. We collect only what the application and membership flows
   need. No field is added without a declared data zone (shared/research/security-types.ts)
   and an entry in docs/privacy/DATA_CLASSIFICATION.md.
2. No dark patterns. Consent checkboxes default to unchecked, marketing consent
   is separate from application terms, and declining marketing never affects
   review outcomes.
3. No maximized collection. We do not buy, enrich, scrape, or infer additional
   personal data about applicants or members. No advertising trackers run on
   /research surfaces.
4. Honest posture. xenios research is not HIPAA compliant and collects no
   health data today. We never imply otherwise in product copy or documents.
5. Fail closed. Where a privacy control depends on configuration (for example
   RESEARCH_SESSION_SECRET), the surface goes down rather than degrading.

## 2. What is collected today

From the application form (research_applications table):

- Identity and contact: email, first name, last name, optional phone.
- Location: country, optional region and city.
- Context: applicant type, occupation, organization, goals text, fit text,
  referral source, optional referral code.
- Consent booleans: age_confirmed, marketing_consent.
- Operational: submission IP, source page, status and review timestamps.

Around the application: append-only application events (status changes, actor,
notes), the notification outbox (email jobs, no status tokens stored), and on
claiming, a Supabase Auth user plus a member row. Referral tables exist but the
feature is flag-gated off. Nothing else is collected. No health data, no
identity documents, no payment data.

## 3. Lawful-basis style reasoning (counsel must confirm)

We are a US company (Texas). We frame processing purposes in lawful-basis terms
so the program ports cleanly to any framework counsel identifies (Texas
consumer privacy law, other state privacy laws, GDPR if EU applicants matter).

- Application data: processed to evaluate and administer the membership the
  applicant requested. Closest frame: performance of a requested service or
  legitimate operational purpose. Counsel must confirm which statutes apply and
  whether thresholds exempt us.
- Marketing email: separate opt-in consent boolean; honored independently of
  membership status. Counsel must confirm CAN-SPAM handling is sufficient.
- Operational security data (IP, rate-limit counters, audit events): legitimate
  interest in fraud and abuse prevention. Counsel must confirm.
- Health data: none is collected, so no basis is claimed. Any future health
  collection is gated behind RESEARCH_HEALTH_DATA_ENABLED and a prior counsel
  review including HIPAA covered entity / business associate analysis and the
  FTC Health Breach Notification Rule. This is a hard gate, not a formality.

## 4. Data subject rights handling, today

There is no self-service tooling. Requests arrive by email to the team address
and are handled manually by the admin:

1. Verify the requester controls the email on file (reply-to verification or a
   signed status link already in their inbox). Never verify over the phone.
2. Access: export the applicant's application row and event history from the
   admin surface or Supabase and send it to the verified email.
3. Correction: edit via admin tooling or direct Supabase update, recorded as an
   application event.
4. Deletion: follow docs/privacy/RETENTION_POLICY.md section 4. Log the request
   and completion date in the admin record.
5. Marketing opt-out: set marketing_consent false immediately on request.

Target turnaround: 30 days from a verified request. Counsel must confirm the
legally required window per applicable statute; we treat 30 days as an internal
ceiling, not a legal citation.

## 5. Planned: Privacy Center

RESEARCH_PRIVACY_CENTER_ENABLED (default false) gates a planned member-facing
Privacy Center: view stored data, download an export, submit deletion requests,
and manage consents against the consent registry (research_consent_events,
schema shipped, currently inert). Until that flag is true, the manual process
in section 4 is the only path and public copy must not promise self-service.

## 6. Accountability

- Owner of this program: CLAUDE_PRIMARY, with Samuel Boadu as the accountable
  human. Admin access is a single-role allowlist (ADMIN_EMAIL); no granular
  RBAC exists yet.
- Every legal conclusion in this document is provisional until counsel reviews.
- Changes to this document are made by pull request so history is preserved.
