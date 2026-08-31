# Xenios Care manual-access release candidate

Date: 2026-08-31

Status: **RELEASE GATES PASSED; READY FOR FRESH EXACT-SHA APPROVAL; NOT DEPLOYED**

## Outcome

The candidate opens a Xenios-owned Care access workflow without depending on
Tebra. `/care/schedule` presents a public contact-and-routing survey. A
successful request is durably saved before email is attempted, receives a short
`CARE-XXXXXXXX` reference, alerts the Xenios human team, and sends the requester
a confirmation when delivery succeeds. The normal follow-up expectation shown
to the requester is one business day.

The workflow is intentionally nonclinical. It collects only:

- full name and email;
- optional phone, required only when call or text is chosen;
- current U.S. state;
- one bounded operational routing category;
- preferred contact method and contact window;
- confirmation that the requester is 18 or older and currently in the U.S.;
- acknowledgement that the form is neither emergency care nor clinical intake.

There is no message box or clinical free-text field. The strict server schema
rejects undeclared keys, including attempted `symptoms`, diagnosis, medication,
or history fields. Copy on the form, confirmation view, and emails tells the
requester not to send medical information and routes emergencies to 911 or
local emergency services.

## Runtime contract

| Surface | Contract |
| --- | --- |
| `GET /api/care/access-request/status` | No-store readiness result; opens only when durable persistence and notifications are configured |
| `POST /api/care/access-request` | Strict bounded payload, honeypot, server-side IP rate limit, optional configured Turnstile verification, durable-first save, human alert, confirmation |
| `GET /api/care/status` | Existing clinical capability plus a separate `accessRequests` status; opening manual access never claims clinical rails are enabled |
| `/care/schedule` | Xenios-owned request form; no public Tebra scheduling dependency |
| `/care/portal` | Truthful human-handoff instructions; no guessed or fabricated portal URL |
| `/health` | Care CTA now begins the manual request at `/care/schedule` |

The durability adapter reuses the existing private, service-role-only
`loi_submissions` operations table with a fixed `xenios_care_manual_access_v1`
record shape. It creates no database migration and no public database policy.
The internal email contains only the bounded contact/routing fields. Application
logs contain the short request reference, never the requester's contact values.

## Production readiness observed before deployment

Read-only production evidence confirms:

- `SUPABASE_URL` plus the service-role persistence path are configured
  (`/api/health` reports `supabaseConfigured: true`);
- the current production startup diagnostic reports `provider=resend-env`,
  `apiKey=set`, a configured sender and reply-to, and one admin recipient;
- Turnstile is currently unconfigured, so the initial live workflow relies on
  the hidden honeypot and shared durable IP rate limiter; the Care-only CSP is
  already narrowed to Cloudflare's exact Turnstile script/frame origin for a
  future matched site-key/secret activation.

No environment value was read into the repository, printed, changed, or
deployed. No production form submission was created during readiness checks.

## Verification and evidence

Candidate gates completed under pinned Node `v20.19.0` / npm `10.8.2`:

- focused Care, route, CSP, `/health`, and critical-endpoint suite:
  12 files / 292 tests passed;
- evidence-tooling suite: 13 files / 213 tests passed;
- complete repository suite: 807 files / 12,098 tests passed, with 43
  intentional skips and zero failures;
- TypeScript no-emit check passed;
- Xenios coordination corpus validation passed;
- production build passed; its only messages were the existing mixed-import and
  large-chunk warnings;
- core seam baseline is explicitly re-pinned and passed for the additive Care
  API composition;
- bounded current-live versus candidate endpoint classification passed with 26
  unchanged endpoints, 4 exact intentional changes, zero regressions, and zero
  human-review items.

Real Chromium 149 exercised the production-shaped candidate at 1440, 390, and
320 CSS pixels. `/care/schedule` rendered exactly one enabled form and submit
control, no textarea or clinical free-text control, one main landmark, one H1,
and the exact bounded fields. All three widths had zero horizontal overflow,
clipped text, undersized targets, duplicate IDs, unlabeled controls, missing alt
text, invalid ARIA, failed requests, or network-boundary violations. The only
message was the repository's pre-existing Apple mobile meta-tag warning.

The remaining release work is source sealing, a fresh exact-SHA authorization,
the exact-commit Render deployment, and post-deployment verification against
the real production origin. No production request will be submitted without a
separately authorized test persona because that would create a real record and
send real email.

## Deployment authority and rollback

The earlier exact GO for live SHA
`72b6f1380e13f09dec67684035ed44a1d2740408` was consumed by the Health
deployment and does not authorize this successor. This candidate must not be
deployed until the founder gives a fresh exact command of the form:

`GO <full 40-character Care successor SHA>`

The deployment is application-only: no migration or environment mutation is
part of this candidate. If later authorized and deployed, rollback should target
the currently live Health SHA `72b6f1380e13f09dec67684035ed44a1d2740408`;
rollback itself also requires current authorization.
