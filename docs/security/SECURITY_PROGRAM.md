# xenios research security program

Status: Draft v0.1
Owner: CLAUDE_PRIMARY
Date: 2026-07-18
Review trigger: any new data zone, any auth change, any flag flipped to true, or quarterly, whichever comes first.

## 1. Scope and posture

This program covers the xenios research platform: an Express + Vite/React SPA on one
Render service, Supabase (Postgres + Auth) accessed server-side only via the service
key, and Resend for email. The platform runs a private membership funnel
(application, human review, activation, membership) for research peptide education.
Commerce is disabled. The platform is NOT HIPAA compliant and collects NO health
data today. Application data is identity plus stated goals and interests: personal
data in the Confidential zone, not medical records. Every claim in this document is
constrained by docs/security/CURRENT_STATE_FACTS.md. Anything not listed there as
built is planned, and its gating flag is named here.

## 2. Roles and accountability

- Admin: a single-role allowlist. ADMIN_EMAIL plus a Supabase JWT, enforced
  server-side by requireSupabaseAdmin on every /admin API route. No granular RBAC
  exists yet.
- Members: Supabase Auth users created by claiming a signed status link; requireMember
  verifies the JWT server-side on every /api/research/member route.
- Supabase service role: server-only. The service key never reaches the client.
- Planned role model (research_reviewer, research_admin, super_admin) is specified in
  the V3 spec and is not built. See ACCESS_CONTROL_POLICY.md section 5.

## 3. Built technical controls

- Research gate: RESEARCH_ACCESS_PASSWORD exchanges for an HMAC-signed HttpOnly
  SameSite=Lax cookie (12 hours). RESEARCH_SESSION_SECRET is required in production
  and is never derived from the password; without it the surface fails closed (503).
  RESEARCH_PUBLIC=true is the explicit public-launch switch.
- Application state machine: 12 statuses enforced server-side with optimistic
  concurrency and an append-only event audit (actor, notes, timestamps).
- Status tokens: 90-day HMAC-signed tokens delivered only by email. Resubmission
  requires the token. Duplicate submissions are indistinguishable to the caller.
- Rate limiting: resend-link is limited per IP with a silent per-email cooldown.
- Log hygiene: /api/research and /api/admin/research request bodies are excluded from
  server logs. Referrer-Policy is no-referrer (helmet). Tokens are scrubbed from URLs
  client-side.
- Row Level Security: enabled on every research table with no public policies
  (service-role only): applications, application_events, members, notification outbox
  and attempts, external_exports, admin prefs, referral tables.
- Notification outbox: durable Supabase-backed queue with idempotent event keys,
  status-guarded claims, backoff to permanent failure, and a per-attempt audit trail.
  No status tokens are stored; they are minted at send time.
- Search posture: /research is noindex (header and meta) until RESEARCH_INDEXABLE=true.
- Data zones: every new field or table must declare a zone (public, internal,
  confidential, restricted, prohibited) per shared/research/security-types.ts.
  Restricted and prohibited zones collect nothing today.

## 4. Secure development practices in use

- TypeScript typecheck on every change.
- 42 vitest/supertest tests covering privacy, tokens, the state machine, member auth,
  the outbox, and the email resolver. Tests must pass before merge.
- Pull-request review; no direct merges to the deploy branch.
- Shared contracts (shared/research/*.ts) so the UI cannot invent backend security
  states; all security flags default false in code.
- Secrets live in Render environment variables, never in the repository.

## 5. Planned controls (not built; each gated by its flag, default false)

- MFA for member accounts: RESEARCH_MFA_REQUIRED.
- Passkeys: RESEARCH_PASSKEYS_ENABLED.
- Identity verification: RESEARCH_IDENTITY_VERIFICATION_ENABLED (no vendor selected).
- Age verification: RESEARCH_AGE_VERIFICATION_ENABLED.
- Membership covenant capture: RESEARCH_MEMBER_COVENANT_ENABLED (schema shipped,
  no UX or flow).
- Privacy Center and data-subject request tooling: RESEARCH_PRIVACY_CENTER_ENABLED.
- Health-data surfaces: RESEARCH_HEALTH_DATA_ENABLED, RESEARCH_LAB_UPLOADS_ENABLED,
  RESEARCH_WEARABLES_ENABLED. Blocked until legal gates clear; the prohibited zone
  stays empty until then.
- Drive/Sheets exports: RESEARCH_DRIVE_HEALTH_EXPORTS_ENABLED (contract tables only).
- SIEM, KMS, field-level encryption beyond Supabase at-rest, session-management UI,
  and account lockout beyond rate limits: no flags yet; require a design doc before
  a flag is added.

## 6. Program maintenance

- CURRENT_STATE_FACTS.md is the single source of truth. Update it in the same PR as
  any control change, then update this document.
- A flag flipping to true requires: tests for the new surface, an update to this
  document and the access policy, and an entry in the decision log.
- Incident handling follows docs/security/INCIDENT_RESPONSE_PLAN.md. Risk tracking
  follows docs/risk/THREAT_MODEL.md.
