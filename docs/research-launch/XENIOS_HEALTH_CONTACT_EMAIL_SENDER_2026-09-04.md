# Xenios Health contact sender context checkpoint

Date: 2026-09-04

Status: **LOCAL IMPLEMENTATION; NOT DEPLOYED**

Base SHA: `c54b603280a976404bcd27289d30c08d5f009802`

Code SHA: `dac41c0e19eac9753b53d7b3477edc00ac0c839e`

## Outcome

The Care Support page now contains a dedicated, nonclinical Xenios Health
support form. It submits only to the Care-owned `/api/care/contact` endpoint;
the generic `/contact` page, `/api/contact` endpoint, and generic sender
resolution are unchanged.

The Care registrar mounts the new endpoint inside the existing `/api/care`
no-store boundary. The endpoint uses a honeypot, the closed contact schema, and
a five-request-per-fifteen-minute server-side rate limit before dispatch. Its
two Resend envelopes always use:

```text
Xenios Health <team@xeniostechnology.com>
```

The internal contact forward continues to reply to the requester. The requester
confirmation continues to reply to `team@xeniostechnology.com`. The generic
contact endpoint and its configured sender behavior remain unchanged.

The sender constant is owned by `server/care/email-identity.ts` and is shared by
the support and manual-access messages. The four current Care/Health
application-originated emails are therefore code-locked to the same address.
Xenios Research sender identity, templates, routes, and environment overrides
are unchanged.

## Local verification

No real network or email provider was used. Provider-boundary tests supply a
deliberately incorrect generic sender and prove it cannot replace the Health
support or manual-access envelopes. Client tests prove the Care form submits
only to the Care-owned endpoint. Route census tests classify the endpoint as
nonclinical and drive a success response while proving that patient, intake,
appointment, clinician, location, decision, and intake-answer sentinels are
absent.

```text
vitest run server/care/contact.test.ts server/care/contact-email.test.ts server/care/manual-access-email.test.ts client/src/care/CareContactForm.test.tsx server/care/manual-access.test.ts server/care/access.test.ts server/care/integration-wiring.test.ts server/care/clinical-route-coverage.test.ts server/care/loi-boundary-wiring.test.ts client/src/care/tebra-truth-a11y.test.tsx --maxWorkers=2
10 files passed; 192 tests passed; 0 failed

npm run check
PASS

npm run build
PASS (existing Vite dynamic-import and chunk-size warnings only)

npm run verify:route-uniqueness
PASS; 422 static Express API registrations across 413 call sites

verify-core-site-protection c54b603280a976404bcd27289d30c08d5f009802 dac41c0e19eac9753b53d7b3477edc00ac0c839e
PASS; 28 protected hashes verified; generic contact/email files unchanged
```

## External readiness still required

This implementation does not send email and does not alter Render, Resend, DNS,
Supabase SMTP, or production. Before a live sender claim, an authorized operator
must confirm that `xeniostechnology.com` is verified in the active Resend account,
that the active API key may send for the domain, and that the team mailbox can
receive replies. A separately authorized test send and delivered-header check
are still required for live proof.
