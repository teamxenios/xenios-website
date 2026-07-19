# xenios research threat model

Status: Draft v0.1
Owner: CLAUDE_PRIMARY
Date: 2026-07-18
Review trigger: any new endpoint, any flag flipped to true, any new asset class, or quarterly.

## 1. Assets, in priority order

1. Applicant and member PII (Confidential zone: identity, stated goals/interests).
   No health data exists on the platform today; the prohibited zone is empty.
2. Signing secret (RESEARCH_SESSION_SECRET): forgery of any gate cookie or status
   token if leaked.
3. Supabase service key: full database access (RLS is service-role only, so this key
   is the only database path).
4. Status tokens (90-day HMAC): each one is read/resubmit/claim access to one
   application.
5. Admin session (Supabase JWT + ADMIN_EMAIL): the whole review queue.
6. RESEND_API_KEY: ability to send email as xenios.
7. Availability of the application funnel (one Render service, one Supabase project).

## 2. Threat actors

- Opportunistic scraper or spammer hitting public endpoints.
- Curious or malicious applicant probing for other applicants' data.
- Phisher targeting the single admin's email or Supabase login.
- Token thief with access to an applicant's mailbox or forwarded email.
- Automated credential stuffing against member login (password only, no MFA yet).

## 3. Attack surfaces and existing mitigations

- Public apply endpoint: accepts PII from anyone once past the gate.
  Mitigations: gate password + signed 12h cookie; server-side 12-status state machine
  with optimistic concurrency; duplicate submissions indistinguishable (no account
  enumeration); request bodies excluded from server logs.
- Status tokens: bearer-style access to one application.
  Mitigations: HMAC-signed, 90-day expiry, delivered only by email, required for
  resubmission, scrubbed from URLs client-side, never stored in the outbox (minted at
  send time), Referrer-Policy no-referrer, single rotation point
  (RESEARCH_SESSION_SECRET) invalidates all outstanding tokens.
- Admin surface (/admin + /api/admin/research): highest-value session.
  Mitigations: Supabase JWT verified server-side plus exact ADMIN_EMAIL allowlist on
  every request; revocation is immediate; admin route bodies excluded from logs.
- Member routes (/api/research/member): password-only accounts.
  Mitigations: JWT verified server-side per request (requireMember); accounts only
  created by claiming a signed status link, so email control is proven at creation;
  aggregates-only referral contract limits what a member response can leak.
- Resend-link limiter: an abuse and enumeration target.
  Mitigations: per-IP rate limit plus silent per-email cooldown (the response does
  not reveal whether the email exists).
- SPA chunk exposure: the client bundle is public.
  Mitigations: no secrets or security decisions in the client; flags and contracts
  come from shared types with everything defaulting false; gated education content
  served behind the cookie, /research noindex until RESEARCH_INDEXABLE=true.
- Database: Supabase Postgres.
  Mitigations: RLS enabled on every research table with no public policies; only the
  server-held service key can read or write; append-only application event audit.
- Email pipeline: durable outbox with idempotent event keys and status-guarded
  claims, so a retry storm cannot double-send and failures are visible rather than
  silent.

## 4. Accepted residual risks (deliberate, revisit each review)

- Marketing and gated-page copy ships in the public SPA chunk; the gate protects
  interaction and application flow, not the confidentiality of educational copy.
  Accepted: the copy is public-zone by classification.
- Single admin role and single admin identity; no RBAC, no MFA on the admin's
  Supabase login enforced by our code. Accepted short-term because it is one known
  person; mitigated by immediate revocation paths. First planned mitigation below.
- Password-only member accounts (no MFA, no lockout beyond rate limits).
- A stolen status token is valid up to 90 days unless the global secret is rotated;
  there is no per-token revocation.
- No SIEM or alerting; detection is human review of logs, boot diagnostics, outbox
  states, and the admin system-status endpoint.
- Single-region, single-service deployment; availability rests on Render and
  Supabase defaults, including backup/retention defaults.

## 5. Top planned mitigations (each gated by its flag, default false)

1. MFA for members and admin (RESEARCH_MFA_REQUIRED) and passkeys
   (RESEARCH_PASSKEYS_ENABLED): directly addresses credential stuffing and admin
   phishing, the two most credible Sev1 paths.
2. Granular roles (research_reviewer, research_admin, super_admin per the V3 spec):
   shrinks the blast radius of any one staff session. Not built.
3. Session-management UI and per-token revocation: removes the need for global
   secret rotation on a single stolen token. Not built, no flag yet; needs a design
   doc first.
4. SIEM/alerting on the existing signals (outbox failures, boot diagnostics, auth
   errors): converts detection from human-paced to alert-paced. Not built, no flag
   yet.
5. Identity/age verification (RESEARCH_IDENTITY_VERIFICATION_ENABLED,
   RESEARCH_AGE_VERIFICATION_ENABLED): raises the cost of fraudulent applications;
   also creates a new Restricted-zone asset, so it enters this model as both
   mitigation and new risk when a vendor is selected.

## 6. Rules for keeping this model honest

- Every new field or table declares a data zone (shared/research/security-types.ts);
  a new Restricted or Prohibited entry forces a threat model update in the same PR.
- A flag flipping to true moves its item from section 5 into sections 1 and 3.
- No mitigation may be described as existing unless it appears in
  docs/security/CURRENT_STATE_FACTS.md.
