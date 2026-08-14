# Supabase Auth email recovery: production proof runbook

Status: P0 blocked on founder-held configuration and credentials.

This runbook separates three email planes that must not be collapsed into one
architecture:

| Plane | Current transport | Durable application evidence | What it is for |
| --- | --- | --- | --- |
| Supabase Auth credential mail | Supabase Auth -> Custom SMTP -> Resend | Supabase Auth timestamps/logs plus provider events | Password recovery, verification, secure Auth invitations |
| Research lifecycle mail | `research_notification_outbox` -> application worker -> Resend API | Durable outbox rows, attempts, provider message ID | Application, membership, order, payment, and lifecycle notices |
| Pack02 account-action mail | Account Identity production mount -> direct Resend API | Provider response only | Organization invitation and prior-history claim; existing observability debt, not a pattern to copy |

A green Research outbox does not prove Auth SMTP. An outbox row in `sent` proves
provider acceptance, not delivery. Supabase Auth mail must never be reimplemented
inside the Research outbox merely to avoid configuring Auth correctly.

## Confirmed production baseline (2026-08-14)

- Supabase Custom SMTP fields are empty in project `yvzeduaxbwgcwllhywff`.
- Direct `POST /auth/v1/recover` returns HTTP 500 `unexpected_failure` / `Error sending recovery email`.
- `auth.users.recovery_sent_at` remains unchanged after the failed request.
- This is not an application rate-limit response.
- The default Supabase sender on the Free plan delivers only to project-team addresses,
  so a team-member test inbox is not a valid Custom SMTP proof.
- The application Resend outbox is separately working and drained; it does not repair
  recovery, verification, or invite delivery.

Do not repeat the broken recovery request merely to reproduce this baseline. Configure
the sender first, then issue one controlled request.

## Production proof pins

This runbook's production proof is pinned to one Supabase project and one public
origin. These are evidence boundaries, not operator-selectable examples:

- Supabase project ref: `yvzeduaxbwgcwllhywff`
- Supabase API origin: `https://yvzeduaxbwgcwllhywff.supabase.co`
- Xenios production origin: `https://xeniostechnology.com`
- Member recovery callback: `https://xeniostechnology.com/research/reset-password`
- Admin recovery callback: `https://xeniostechnology.com/admin`

The Render origin is not interchangeable evidence for this production proof. A change
to any project or origin pin requires a reviewed runbook revision before another live
request; do not substitute a value at the command line and carry forward a green
verdict from different infrastructure.

## Founder-only configuration

The founder must configure Supabase Auth Custom SMTP with the sanctioned Resend SMTP
credential and a verified Xenios sender. Never place the SMTP credential, a Supabase
Management PAT, a Resend API key, or a raw action link in Git, chat, the command center,
shell history, screenshots, proof JSON, or logs.

Before saving:

1. In Resend, verify the sending domain and its SPF/DKIM records. Confirm DMARC is in
   place. Disable provider click/open link rewriting for Auth mail; rewritten or
   prefetched single-use links can be consumed or malformed.
2. In Supabase Auth, keep external email enabled and automatic confirmation disabled.
3. Keep the minimum password length at 8 or stronger.
4. Use the pinned canonical public origin `https://xeniostechnology.com`. Release
   operations also use `https://xenios-website.onrender.com`, but it is not an accepted
   substitute for this proof and must not be silently authorized alongside production.
5. Set an exact Site URL and exact Additional Redirect URLs. Production recovery needs:
   - `https://xeniostechnology.com/research/reset-password`
   - `https://xeniostechnology.com/admin`
6. Do not add a broad production wildcard. Approved preview callbacks must be explicit
   and separately documented outside this production project. The production harness
   accepts no additional callback entries, even exact URLs on another host.
7. Review Auth email rate limits and Resend suppression/bounce state before the probe.

Official provider references:

- [Supabase Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Resend retrieve sent email](https://resend.com/docs/api-reference/emails/retrieve-email)
- [Resend email event meanings](https://resend.com/docs/dashboard/emails/introduction)

## Non-secret proof harness

`scripts/acceptance/verify-supabase-auth-email.ts` is fail-closed and read-only by
default. It never creates a user, generates an invite, changes configuration, consumes
an action link, updates a password, or writes a proof file.

All public pins are required so the operator cannot accidentally inspect or send through
the wrong project:

```powershell
$proofArgs = @(
  '--project-ref', 'yvzeduaxbwgcwllhywff',
  '--supabase-url', 'https://yvzeduaxbwgcwllhywff.supabase.co',
  '--site-origin', 'https://xeniostechnology.com',
  '--redirect-url', 'https://xeniostechnology.com/research/reset-password',
  '--expected-smtp-host', 'smtp.resend.com',
  '--expected-sender', 'research@xeniostechnology.com',
  '--expected-recovery-subject', 'Reset your Xenios password'
)

# Zero network calls; validates only the pinned plan.
& .\node_modules\.bin\tsx.cmd scripts/acceptance/verify-supabase-auth-email.ts @proofArgs
```

The following values must come from an approved ephemeral secret injector or a private,
non-recorded shell. Do not paste them into a shared terminal transcript:

- `SUPABASE_ACCESS_TOKEN`: Management API PAT for read-only Auth config inspection.
- `SUPABASE_ANON_KEY`: public project key used by the one recovery request.
- `AUTH_EMAIL_TEST_RECIPIENT` and `AUTH_EMAIL_CONFIRM_RECIPIENT`: the same dedicated,
  founder-controlled, existing Auth test account. It must not be a Supabase organization
  team member.
- `AUTH_EMAIL_CONFIRM_SENDER_AUTH=YES`: human attestation after Resend domain/SPF/DKIM
  verification.
- `AUTH_EMAIL_CONFIRM_SMTP_PASSWORD_PRESENT=YES`: only when the dashboard shows the
  password is configured but the Management API omits it **or returns a masked or
  placeholder value**. Masked text is not proof that usable password material exists.
- `AUTH_EMAIL_CONFIRM_MIN_PASSWORD_8=YES`: only when the dashboard shows 8+ but the
  Management API omits the numeric setting.
- `AUTH_EMAIL_CONFIRM_PROJECT_RATE_LIMIT=YES`: only when the Management API omits
  `rate_limit_email_sent` and the dashboard shows an integer within the reviewed
  1-30/hour launch ceiling.
- `AUTH_EMAIL_RESEND_MESSAGE_ID` and `RESEND_API_KEY`: used later to retrieve one
  provider record; the harness never sends through Resend directly.
- `AUTH_EMAIL_REQUESTED_AFTER_UTC`: the safe UTC `started at` timestamp printed by a
  successful controlled recovery run. The harness captures it before the HTTP request,
  even though it can only print it after the response. It is required by the later,
  separate provider lookup.

### Phase 1: read-only configuration proof

```powershell
& .\node_modules\.bin\tsx.cmd scripts/acceptance/verify-supabase-auth-email.ts @proofArgs --check-config
```

Required green checks:

- Management Auth config is reachable as JSON.
- SMTP host, port, user, sender address, and sender name are populated.
- Port, username, and sender name exactly match the reviewed Resend/Xenios values:
  documented string port `"587"`, `resend`, and `Xenios Research`. Wrong types or
  merely nonempty values fail.
- SMTP password is present, or omitted/masked password material is backed by the
  explicit dashboard attestation. Asterisks, `redacted`, or any other placeholder do
  not satisfy this check by themselves.
- Host and sender exactly match the pinned sanctioned values.
- Sender-domain authentication is explicitly attested.
- Email Auth is enabled; autoconfirm is disabled.
- The configured recovery subject exactly matches the pinned Auth template.
- Minimum password length is at least 8.
- `smtp_max_frequency` is present and at least 60 seconds. A positive value below 60
  seconds is a failure, not a warning.
- The project-wide Auth email rate limit is checked as a separate fact. It is not the
  same control as `smtp_max_frequency`; the accepted launch range is an integer from
  1-30/hour. If the Management API omits it, explicit dashboard attestation is required;
  otherwise record `UNVERIFIED` and do not infer it from SMTP frequency or defaults.
  A present malformed value fails and cannot be replaced by attestation. The same
  omitted-versus-malformed rule applies to minimum password length.
- Site URL and member/admin recovery callbacks match exactly.
- No broad production wildcard exists.

Exit codes are contractual: `0` all checks passed, `1` at least one check failed, `2`
one or more facts are unverified, and `64` unsafe/invalid invocation. An unverified fact
is never printed as green.

### Phase 2: exactly one controlled recovery request

Set the double-confirmed controlled recipient and the project anon key, then run once:

```powershell
& .\node_modules\.bin\tsx.cmd scripts/acceptance/verify-supabase-auth-email.ts @proofArgs --check-config --execute-recovery
```

The tool re-runs the configuration gate first. It sends nothing unless every gate is
green. It then calls the Supabase Auth recovery endpoint exactly once. It never retries
an ambiguous response. HTTP 429 is `UNVERIFIED`, not an SMTP failure; other non-2xx
responses are `FAIL`.

On success, copy the printed `started at` UTC value into
`AUTH_EMAIL_REQUESTED_AFTER_UTC` for Phase 3. That value was captured before the
network call; do not substitute the time at which the response or inbox message arrived.

`REQUEST_ACCEPTED` proves only that Supabase accepted the Auth request. It does not prove
provider acceptance, delivery, inbox placement, callback correctness, or token use.
Record a correlation deadline of five minutes after
`AUTH_EMAIL_REQUESTED_AFTER_UTC`. The provider message's `created_at` must fall within
that closed window. Do not retry merely because the message is not immediately visible;
an ambiguous or late result remains `UNVERIFIED`.

### Phase 3: provider delivery proof

Find the exact SMTP-generated message in Resend without opening or clicking the Auth
link. Set its message ID and a read-capable Resend API key, then run separately:

```powershell
& .\node_modules\.bin\tsx.cmd scripts/acceptance/verify-supabase-auth-email.ts @proofArgs --verify-delivery
```

The accepted provider record must satisfy **all** of these correlations:

- its returned `id` exactly equals `AUTH_EMAIL_RESEND_MESSAGE_ID`;
- `from` contains exactly `Xenios Research <research@xeniostechnology.com>`; a bare
  mailbox, wrong display name, or multiple mailboxes fails;
- `to` contains exactly one address, the double-confirmed controlled recipient;
- `cc` and `bcc` are absent or empty;
- its exact subject equals the pinned Supabase recovery subject;
- `created_at` is no more than 30 seconds earlier than
  `AUTH_EMAIL_REQUESTED_AFTER_UTC` (bounded clock skew) and no later than five minutes
  after it; the request timestamp itself must be no more than 30 minutes old and no more
  than 30 seconds in the future; and
- its latest event is `delivered`, `opened`, or `clicked`.

A mere `sent`, `queued`, `scheduled`, or `delivery_delayed` event remains `UNVERIFIED`;
bounce, failure, suppression, cancellation, or complaint is `FAIL`. No message body,
subject, sender, recipient, key, or action URL is logged.

`PROVIDER_METADATA_VERIFIED` means one operator-selected Resend record passed the exact
metadata and recipient-server delivery checks. Because the message ID and request
timestamp are supplied in a separate run, this verdict does not cryptographically bind
the record to the immediately preceding Phase 2 execution. Preserve the matching Auth
`recovery_sent_at` advance and controlled inbox evidence separately. It still does not
prove inbox placement or a valid callback.

## Controlled end-to-end acceptance sequence

Record only: UTC timestamps, flow name, redacted Auth user ID, public HTTP status/body
class, whether the relevant Auth timestamp advanced, provider message ID/state, arrival
latency, callback origin/path/type, and pass/fail. Never record a raw token, password,
action URL, Authorization header, email address, SMTP credential, or message body.

1. Run the configuration proof and preserve its redacted output.
2. After the configured cooldown, run one known-account recovery request. Copy the
   harness's pre-request `started at` value to `AUTH_EMAIL_REQUESTED_AFTER_UTC`, confirm
   `recovery_sent_at` advances, and do not retry an ambiguous response.
3. Select exactly one provider message ID, verify every exact metadata correlation and
   the five-minute creation window, then verify arrival in the controlled inbox.
4. Inspect the link without sharing it. It must use the intended Supabase project and
   exact allowlisted redirect. Provider tracking must not rewrite it.
5. In a fresh controlled browser, open the link once. The Research recovery page must
   enter set-password mode, never load member/catalog/account data, accept a strong new
   password, revoke the exact recovery session, and force a fresh password sign-in.
6. Prove the recovery-purpose credential is rejected by member, account, Care, and admin
   APIs before and after the reset.
7. Reopen the consumed link. It must fail closed and must not reopen a reset session.
8. Prove expiry in a sanctioned short-TTL staging project or by waiting the real TTL.
   Unit-test expiry is not production expiry evidence.
9. Submit one unknown address through the mounted application endpoint. Its public
   status/body and timing class must match the known-address response, while no Auth
   timestamp, provider event, or inbox message appears. Respect the IP/email cooldowns.
10. Repeat the controlled sequence for admin recovery at `/admin` after fixing/proving
    its event-subscription race.

## Callback and lifecycle matrix

| Flow | Current producer / callback | Current verdict | Required proof or fix |
| --- | --- | --- | --- |
| Known Research member recovery | `/api/research/member/forgot-password` -> Supabase -> `/research/reset-password` | Code path exists; live delivery broken | Full sequence above |
| Unknown email recovery | Same public endpoint | Generic and rate-limited in unit tests | Live parity with no Auth/provider/inbox event |
| Admin recovery | Browser Supabase call -> `/admin` | Delivery broken; callback listens only for an async event | Prove fresh-load race cannot strand the session |
| Existing buyer access | Supabase recovery -> `/research/reset-password` | Unmounted producer; same SMTP block | Controlled proof after mount |
| New/pending buyer invite | Supabase `type=invite` -> `/research/reset-password` | **Broken contract:** callback handles only recovery | Add an invite-aware initial-password callback before sending production invites |
| General account verification | No `signUp`, `verifyOtp`, code exchange, or verification callback | **Not implemented** | Build canonical base-account flow; do not claim proof from SMTP config alone |
| Membership application/status/claim | Research outbox + signed application tokens | Separate application mail plane | Keep separate; test delivery and token lifecycle independently |
| Application account claim | Custom signed claim token | Token is reusable until expiry; concurrent replay can race password repair | Add atomic one-time consumption and race proof |
| Prior-order-history claim | Direct Resend link with claim/token | Current UI consumes neither query value | Mount/consume/scrub before sending |
| Organization invitation | Direct Resend invitation token | Requires an existing confirmed account; URL token is not scrubbed | Add canonical base-account path and synchronous URL scrub |
| Affiliate-only / org-only / supplier / provider recovery | Member endpoint queries `research_members` only | **No recovery path** | Move recovery to canonical base-account identity without weakening enumeration safety |

## Existing regression evidence to run

These suites prove application contracts and recovery isolation with mocked providers;
none proves live SMTP or inbox delivery:

- `server/services/email-config.test.ts`
- `server/research/research-email-sender.test.ts`
- `server/research/outbox.test.ts`
- `server/research/outbox-enqueue-once.test.ts`
- `server/research/outbox-founding-renderers.test.ts`
- `server/research/members.test.ts`
- `server/research/account-access-wall.test.ts`
- `shared/research/recovery.test.ts`
- `client/src/research/recovery-isolation.test.tsx`
- `client/src/research/recovery-route-isolation.test.tsx`
- `server/research/account-identity/buyer-activation.test.ts`
- `server/research/account-identity/buyer-activation-supabase.test.ts`

## Facts this repository cannot prove

- Live SMTP values, sender-domain SPF/DKIM/DMARC status, or Resend suppression state.
- Live Supabase Site URL and Additional Redirect URL configuration.
- Provider acceptance, delivery, bounce, complaint, or inbox placement without provider
  evidence.
- Live link expiry, replay behavior, scanner/prefetch behavior, or password-reset success.
- A project-wide production Auth email rate limit omitted by the Management API, and
  Auth dashboard logs. `smtp_max_frequency` does not prove the project-wide limit.
- General verification or mounted secure-invite delivery; those journeys do not exist
  end to end today.
- Durable Auth-mail delivery telemetry. No Resend delivery/bounce webhook mirrors Auth
  events into the application, and application outbox failure alerts share the same
  provider failure domain.

## Verdict discipline and safe live proof

The safe live proof is intentionally narrow: a read-only configuration gate against
the pinned project, one known controlled existing account, a pre-request timestamp,
one request after the cooldown, no automatic retry, one read-only provider lookup by
exact message ID, and no body or action-link access until metadata correlation is
complete. The one recovery request intentionally advances Auth recovery metadata and
emits one email, but it neither creates an account nor changes configuration,
membership, or password state. Opening the link and changing a password belongs only
to the later, explicit end-to-end step in a fresh controlled browser.

Use the narrowest verdict supported by the evidence:

- `PLAN_VALID/PASS` proves only syntactic pins and zero network calls.
- `CONFIGURED/PASS` proves the reviewed pinned configuration checks, including
  masked-password attestation, 60-second frequency, and project-wide rate evidence.
- `REQUEST_ACCEPTED/PASS` proves one HTTP acceptance, not that mail was generated.
- `PROVIDER_METADATA_VERIFIED/PASS` proves exact ID, sender, single-recipient,
  empty-copy-list, subject, bounded-window, and provider delivery-state checks for one
  externally selected record. It is metadata evidence, not a one-use same-run binding.
- Provider `delivered` proves recipient-server acceptance only; inbox placement,
  callback integrity, one-time use, expiry, and post-reset authorization remain
  separate proofs.

Never promote an omitted, manually assumed, defaulted, masked, or not-yet-implemented
fact to green. Mark it `UNVERIFIED`, name the missing evidence, and stop before any
additional live request.

## Rollback and incident response

Only the founder/release lead changes live configuration. If sender authentication,
callback pins, or controlled delivery fails, disable Custom SMTP or restore the prior
values and record the return to the known-broken baseline. Never weaken confirmation,
broaden redirect wildcards, bypass recovery-purpose authorization, or redirect Auth mail
through a new application transport as a shortcut.
