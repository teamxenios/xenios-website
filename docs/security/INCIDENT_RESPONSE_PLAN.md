# xenios research incident response plan

Status: Draft v0.1 (for counsel review)
Owner: CLAUDE_PRIMARY
Date: 2026-07-18
Review trigger: after every Sev1/Sev2 incident, any new detection source, or semiannually.

## 1. Severity levels

- Sev1: confirmed or suspected exposure of applicant/member personal data, admin
  account compromise, or compromise of a signing secret or the Supabase service key.
- Sev2: platform-wide outage of a core flow (applications, status links, member
  login, admin review) with no data exposure.
- Sev3: degraded single subsystem (email delivery, resend limiter misbehavior,
  outbox backlog) with workarounds available.
- Sev4: cosmetic or non-user-facing defects with a security or privacy angle.

Default up: if severity is uncertain, treat it as the higher level until ruled out.

## 2. Detection sources that exist today

- Boot diagnostics: server startup logs whether RESEARCH_SESSION_SECRET is set and
  which email provider resolved (booleans only, never secret values).
- Outbox failure states: the notification outbox records per-attempt audits and
  backs off to a visible permanent-failure status; a growing failed set is a signal.
- Admin system-status endpoint: /api/admin/research/system-status (behind
  requireSupabaseAdmin) reports subsystem health to the admin.
- Render service logs: request logs (research route bodies excluded by design) and
  deploy/restart events.
There is no SIEM, alerting pipeline, or pager today (planned; no flag yet).
Detection is human review of the sources above.

## 3. Containment steps per asset

- Status tokens and gate cookies: rotate RESEARCH_SESSION_SECRET in Render. All
  HMAC-signed artifacts (gate cookies and 90-day status tokens) become invalid at
  once. Side effect: every applicant needs a fresh emailed link; use the resend flow.
- Admin account: disable the Supabase Auth user in the dashboard and, if needed,
  change ADMIN_EMAIL. The check runs per request, so revocation is immediate.
- Supabase service key: rotate in the Supabase dashboard, update the Render
  environment, redeploy. RLS has no public policies, so a leaked anon path does not
  exist; the service key is the crown jewel.
- Email (Resend): revoke and reissue RESEND_API_KEY; the outbox queues durably and
  retries, so sends resume after rotation.
- Whole gated surface: unset RESEARCH_PUBLIC or unset RESEARCH_SESSION_SECRET; the
  surface fails closed with 503 by design.
- Feature blast radius: all optional capabilities sit behind flags that default
  false; confirm no flag was flipped unexpectedly.

## 4. Response procedure

1. Declare severity and open an incident note (time, detector, symptom).
2. Contain using section 3. Prefer over-containment; every control here is reversible.
3. Preserve evidence: export relevant Render logs and outbox attempt rows before any
   restart clears context.
4. Eradicate and recover: fix root cause on a branch, tests green, PR review, deploy.
5. Post-incident: write the timeline, root cause, and actions into the decision log
   within one week; update this plan and CURRENT_STATE_FACTS.md if controls changed.

## 5. Worked example: the 2026-07-18 email outage

- Symptom: applicant confirmation and status emails stopped sending after a platform
  migration; the app previously fetched Resend credentials only through the Replit
  connector, which was absent on Render.
- Detection: outbox attempts moving to failure states plus boot diagnostics showing
  the email provider unresolved. Severity: Sev3 (no data exposure, core review flow
  intact, sends queued rather than lost).
- Containment and fix: email credential resolution rewritten env-first
  (RESEND_API_KEY) with the connector as fallback; startup diagnostics log which
  provider resolved (booleans only).
- Recovery: the durable outbox meant queued notifications were retried and delivered
  after the fix; no messages were silently lost.
- Lessons applied: startup diagnostics for required configuration, tests for the
  resolver (email-config.test.ts), and this plan's rule that delivery paths must be
  durable-queue backed.

## 6. Notification duties (counsel must confirm all of this section)

- The platform collects identity and stated goals/interests: personal data in the
  Confidential zone. It is NOT HIPAA compliant and collects no health data today, so
  a HIPAA covered entity or business associate analysis likely does not attach, but
  counsel must confirm that conclusion and re-run it before any health-data flag
  is enabled.
- Whether the FTC Health Breach Notification Rule could apply now or after future
  features: counsel must confirm; do not assume it does not.
- State breach notification obligations, including Texas consumer privacy law and
  the laws of applicants' home states, define whose data triggers notice, timing,
  and content: counsel must confirm before any notice is sent or withheld.
- Operational rule until counsel advises otherwise: on any Sev1 involving personal
  data, contact counsel before external communication, keep the evidence preserved,
  and do not delete affected records.
- No fixed statutory deadlines are asserted in this document; timing comes from
  counsel per incident.
