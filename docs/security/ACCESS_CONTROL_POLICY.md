# xenios research access control policy

Status: Draft v0.1
Owner: CLAUDE_PRIMARY
Date: 2026-07-18
Review trigger: any new route class, any new role, any personnel change, or when the V3 role model ships.

## 1. Principle

Least privilege, enforced server-side. The client never holds a secret or decides an
authorization outcome. Every research table has Supabase RLS enabled with no public
policies, so the only database path is the server holding the service key. Any access
not explicitly granted below is denied.

## 2. Current access matrix

| Actor | How identified | Can do | Cannot do |
|---|---|---|---|
| Visitor | none | View public marketing pages; submit the public gate password; apply if the gate is open | Read any application, member, or admin data |
| Gated reviewer | HMAC-signed HttpOnly cookie (12h) from RESEARCH_ACCESS_PASSWORD | Browse the gated research education surface; submit an application | Anything admin or member scoped; the cookie carries no identity |
| Applicant with status token | 90-day HMAC-signed token, delivered only by email | View own application status; resubmit; claim a member account | See any other application; enumerate applicants (duplicates are indistinguishable) |
| Member | Supabase Auth JWT, verified by requireMember on every /api/research/member route | Member routes only; aggregates-only referral contract | Admin routes; other members' data |
| Admin | Supabase JWT AND email match to ADMIN_EMAIL (requireSupabaseAdmin) | Review queue, status transitions, system-status endpoint | Direct database access from the client; nothing bypasses the state machine |
| Supabase service role | Service key, server environment only | All research tables (RLS bypass by design) | Never shipped to or used from the client |

## 3. Least privilege rules

- One admin identity today. The allowlist is exactly one email (ADMIN_EMAIL). Adding
  a second admin means adding a second allowlisted email and recording who and why in
  the decision log; it is a deliberate act, not a default.
- Tokens travel only by email and only to the applicant's own address. They are never
  logged (research route bodies are excluded from server logs) and are scrubbed from
  URLs client-side.
- Secrets (RESEARCH_SESSION_SECRET, RESEARCH_ACCESS_PASSWORD, SUPABASE service key,
  RESEND_API_KEY) live only in Render environment variables and the Supabase
  dashboard. They never appear in the repository, logs, or client bundles.
- New endpoints must name their actor row from the matrix above in the PR description.
  An endpoint that fits no row needs a policy update first.

## 4. Granting and revoking access today

- Grant admin: set ADMIN_EMAIL in the Render environment and ensure a Supabase Auth
  user exists for that email. Both are manual dashboard actions.
- Revoke admin: change or remove ADMIN_EMAIL (takes effect on the next request, since
  the check runs per request) and disable the Supabase Auth user in the dashboard.
- Revoke every session and token at once: rotate RESEARCH_SESSION_SECRET. All gate
  cookies and status tokens are HMAC-signed with it, so rotation invalidates them all.
  This is the break-glass control; see the incident response plan.
- Revoke a member: disable the user in the Supabase Auth dashboard; requireMember
  verifies the JWT server-side on every request.
- Revoke database access: rotate the Supabase service key in the Supabase dashboard
  and update the Render environment.
- There is no self-service session management UI and no MFA today (planned; see
  section 5). Account lockout beyond rate limits does not exist.

## 5. Planned role model (V3 spec; NOT built)

The V3 spec defines three staff roles to replace the single allowlist:

- research_reviewer: read the queue, add notes, propose status transitions.
- research_admin: everything a reviewer can, plus executing transitions, outbox
  administration, and flag visibility.
- super_admin: role assignment, flag changes, secret rotation.

Nothing in the codebase enforces these roles yet. Until they ship, every admin action
is performed by the single allowlisted admin. Related planned account controls, each
default false: RESEARCH_MFA_REQUIRED, RESEARCH_PASSKEYS_ENABLED,
RESEARCH_IDENTITY_VERIFICATION_ENABLED. Shipping the role model requires: schema and
tests, an update to the matrix in section 2, and counsel review of any change to who
can see applicant personal data.

## 6. Audit

- Application status changes are captured in an append-only event audit with actor,
  notes, and timestamps.
- Outbox sends are audited per attempt.
- Environment and dashboard changes (the grant/revoke paths above) are not centrally
  logged today; record them manually in the decision log until SIEM tooling exists
  (planned, no flag yet).
