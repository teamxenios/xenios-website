# Current-state facts (ground truth for all security/privacy documents)

Updated 2026-07-18 by CLAUDE_PRIMARY. Every program document in docs/security,
docs/privacy, docs/compliance, and docs/risk must be consistent with this file.
Anything not listed here as BUILT must be described as planned, not existing.

## BUILT and verified

- Stack: Express + Vite/React SPA on one Render service; Supabase (Postgres +
  Auth) via service key server-side only; Resend email; static SPA assets.
- Research gate: RESEARCH_ACCESS_PASSWORD exchange for an HMAC-signed HttpOnly
  SameSite=Lax cookie (12h). RESEARCH_SESSION_SECRET REQUIRED in production,
  never derived from the password; without it the surface fails closed (503).
  Research is PRIVATE by canonical decision: RESEARCH_PUBLIC=false and
  RESEARCH_INDEXABLE=false stay set, the shared password opens the private
  research introduction, and the xenios homepage stays at the root domain
  (the root never redirects to /research).
- Membership economics (canonical): $50 one-time activation PLUS $25 recurring
  monthly membership. There is NO annual membership. No member becomes active
  until BOTH the activation payment and the monthly membership are verified;
  the activation path sits behind RESEARCH_MEMBERSHIP_BILLING_ENABLED
  (default false), and while it is false no member can be activated and no
  referral can qualify.
- Application system: 12-status state machine enforced server-side with
  optimistic concurrency; append-only event audit (actor, notes, timestamps);
  admin review queue in /admin behind Supabase-JWT + ADMIN_EMAIL check
  (requireSupabaseAdmin).
- Applicant privacy: duplicate submissions indistinguishable; signed status
  tokens (90d HMAC) travel ONLY by email; resubmission requires the token;
  resend-link rate-limited per-IP with silent per-email cooldown; tokens
  scrubbed from URLs client-side; /api/research and /api/admin/research bodies
  excluded from server logs; Referrer-Policy: no-referrer (helmet).
- Member accounts: claiming via signed status link -> Supabase Auth user
  (email pre-confirmed) + member row; requireMember verifies the JWT
  server-side on every /api/research/member route. Password only; no MFA yet.
- Notification outbox: durable Supabase-backed queue, idempotent event keys,
  status-guarded claims, backoff to permanent failure, per-attempt audit; no
  status tokens stored (minted at send time). Email credentials resolved
  env-first (RESEND_API_KEY) with Replit-connector fallback.
- Referrals: schema + flag-gated backend only; opaque codes; aggregates-only
  member contract; all referral flags default false.
- Supabase RLS: enabled on every research table with NO public policies
  (service-role only). Tables: applications, application_events, members,
  notification outbox/attempts, external_exports, admin prefs, referral set.
- Robots: /research noindex (header + meta) until RESEARCH_INDEXABLE=true.
- Tests: 42 vitest/supertest tests covering privacy, tokens, state machine,
  member auth, outbox, email resolver.

## NOT BUILT (planned; flags exist and default false)

- Identity or age verification (no vendor selected; no ID capture anywhere).
- Membership covenant capture (schema shipped in this branch; no UX, no flow).
- Consent registry beyond application acknowledgements (schema shipped in this
  branch; acknowledgements currently stored as booleans on the application).
- MFA, passkeys, session-management UI, account lockout beyond rate limits.
- Privacy Center / Trust Center pages, data-subject request tooling.
- Stripe payment/activation; any commerce (all products non-live; flags off).
- Google Drive/Sheets exports (contract tables only; disabled).
- Health data, lab uploads, wearables, Quantum commerce (nothing collects
  health data today; the deep onboarding is NOT built).
- Field-level encryption beyond Supabase's at-rest encryption; KMS; SIEM;
  formal incident tooling.

## Honest posture statements every document must respect

- xenios research is NOT HIPAA compliant and must not be described as such;
  no PHI is collected today.
- Application data is identity + stated goals/interests: personal data, not
  medical records; treat as Confidential zone.
- Admin access is a single-role allowlist (ADMIN_EMAIL); no granular RBAC yet.
- Backups/retention currently follow Supabase defaults; no custom retention
  automation exists yet.
