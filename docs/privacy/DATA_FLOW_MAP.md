# xenios research data flow map

Status: Draft v0.1
Owner: CLAUDE_PRIMARY
Date: 2026-07-18
Review trigger: any new flow, endpoint, third party, or flag flip. Must stay
consistent with docs/security/CURRENT_STATE_FACTS.md.

## 1. Third parties in scope

- Supabase: Postgres and Auth. All research tables, RLS on, no public
  policies, service-role key server-side only. Storage and backups follow
  Supabase defaults.
- Resend: transactional email delivery (application receipts, status links,
  decision emails). Receives recipient email and message content.
- Render: hosts the Express + SPA service. Sees traffic metadata (IPs,
  routes); request bodies for research routes are excluded from our logs.
- Google (future only): Drive/Sheets export contract tables exist but the
  feature is disabled (RESEARCH_DRIVE_HEALTH_EXPORTS_ENABLED=false). Google
  receives nothing today.

No analytics or advertising third parties run on /research surfaces.

## 2. Flow: application submit

Path: applicant browser -> POST /api/research (Render) -> Supabase
(research_applications + research_application_events) -> notification outbox ->
Resend -> applicant inbox.

- Data elements: email, name, optional phone, country/region/city, applicant
  type, occupation, organization, goals_text, fit_text, referral fields,
  age_confirmed, marketing_consent, IP, source page.
- Storage: Supabase (confidential zone). Outbox rows store the email job with
  an idempotent event key; status tokens are NOT stored (minted at send time).
- Privacy properties (built): duplicate submissions are indistinguishable to
  the submitter; request bodies excluded from server logs.
- Retention owner: admin (Samuel), per docs/privacy/RETENTION_POLICY.md.
- Third parties touched: Render (transit), Supabase (storage), Resend (email).

## 3. Flow: status link

Path: outbox -> Resend -> applicant inbox -> GET status page with signed token.

- Data elements: applicant email, a 90-day HMAC-signed status token, current
  status text. The token travels ONLY by email, is required for resubmission,
  and is scrubbed from URLs client-side after load.
- Resend-link requests are rate-limited per IP with a silent per-email
  cooldown, so the endpoint does not confirm whether an email is on file.
- Storage: nothing new stored; the token is verified statelessly.
- Retention owner: admin. Third parties: Resend, Render, Supabase (read).

## 4. Flow: admin review

Path: admin browser -> /admin (Supabase JWT + ADMIN_EMAIL check,
requireSupabaseAdmin) -> status transition via the server-side 12-status state
machine -> Supabase (application row + append-only event with actor, notes,
timestamps) -> outbox -> Resend -> applicant inbox.

- Data elements: full application content read by the admin; reviewer identity,
  reason codes, internal notes, member-visible notes written to events;
  decision email content to the applicant.
- Optimistic concurrency prevents conflicting transitions; events are
  append-only audit records.
- Retention owner: admin. Third parties: Supabase, Resend, Render.

## 5. Flow: member claiming and member routes

Path: applicant clicks signed status link -> claim -> Supabase Auth user
(email pre-confirmed) + member row -> subsequent requests to
/api/research/member/* verified server-side by requireMember (JWT).

- Data elements: email, password (held by Supabase Auth, never by our tables),
  member profile row. Password only; no MFA yet (RESEARCH_MFA_REQUIRED and
  RESEARCH_PASSKEYS_ENABLED are false).
- Retention owner: admin. Third parties: Supabase, Render.

## 6. Flow: referrals (inert)

Schema and flag-gated backend only; all referral flags default false, so no
referral data flows today. Design when enabled: opaque codes, and the member
contract exposes aggregates only (never who used a code). This section is a
plan, not a live flow.

## 7. Flow: Drive/Sheets export (planned, disabled)

Contract tables (external_exports) exist; the feature is off behind
RESEARCH_DRIVE_HEALTH_EXPORTS_ENABLED. Before enabling: update this map, run
the DATA_CLASSIFICATION.md zone review (Drive may not receive confidential or
restricted data without explicit re-review), execute any needed Google terms
review, and confirm retention handling for exported copies. Until then, no
data leaves for Google.

## 8. Flows that do not exist

No payment flow (Stripe not built, commerce disabled). No health data flow.
No identity-document flow. No analytics pipeline. Any document or copy
describing these must say planned, and name the gating flag.
