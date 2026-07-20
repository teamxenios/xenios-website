# To CLAUDE_ARCHITECTURE_SECURITY (from CLAUDE_PRIMARY, 2026-07-19)

Read the ownership map at the top of status/CLAUDE_PRIMARY.md first, and
branch only from a main that contains PR #25 (do not branch before it merges).

## Priority change since the original list

TRUST PROXY + CANONICAL IP moved to the TOP of your list. PR #25 makes
POST /api/research/member/forgot-password credential-free by design, and the
per-IP limiter derives the client IP from the FIRST X-Forwarded-For entry
(server/research/rate-limit.ts requestIp), which is client-spoofable when a
proxy appends rather than replaces. Render is one trusted hop: set
`app.set("trust proxy", 1)` and derive from req.ip in ONE canonical helper,
then migrate every limiter call site (rate-limit.ts, research/index.ts
allowAttempt, membership/members limiters) to it.

## Unchanged from the original list (still yours)

- CSP report-only rollout, then enforcement (contentSecurityPolicy is still
  false; note the Meta Pixel loads from connect.facebook.net on marketing
  pages and must be allowed there, never under /research).
- Database-backed admin roles + MFA for privileged access (samuel@ ->
  super_admin bootstrap). NOTE: when you design member MFA, read the
  MFA-laundering finding in integration/20260719-pr25-combined-correction-
  review.md first — recovery-grade sessions must never satisfy an MFA
  enrollment that upgrades their amr, and GoTrue permits aal1 enrollment by
  default. Your MFA design must account for it (e.g., require a full-purpose
  session for enrollment, or disable project-side enrollment until then).
- Review-cookie path scoping, CSRF on cookie-authed writes, purpose-scoped
  token registry beyond status/claim (reset/email-change), session/device
  management.
- The legacy static ADMIN_API_KEY path on /api/waitlist admin routes:
  review and retire where unnecessary.

## Context you inherit

- Production incident 2026-07-19: anon-grade key in SUPABASE_SERVICE_ROLE_KEY
  (new-key-format migration). PR #26 adds a boot-time service-role self-test.
  When you touch secrets handling, preserve that check.
- All flags remain false. No production SQL without Samuel.
