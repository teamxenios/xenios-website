# Xenios Health canonical email sender checkpoint

Date: 2026-09-04

Status: **LOCAL IMPLEMENTATION; NOT DEPLOYED**

Base SHA: `c140be058e01610f3b58d7261548a7ceaf3d2188`

Code SHA: `5773bf550cc11de194fb88aa59660b863b5c2bec`

## Outcome

Both outbound messages in the current Xenios Care manual-access workflow now
use the code-owned sender `Xenios Health <team@xeniostechnology.com>`:

- the internal access-request alert; and
- the confirmation sent to the requester.

The generic site `FROM_EMAIL` value and the legacy connector `from_email` value
cannot replace this Care sender. The existing envelope boundaries remain
unchanged: the internal alert replies to the requester, while the requester
confirmation replies to `team@xeniostechnology.com`. Xenios Research sender
identity and templates are outside this change and remain unchanged.

## Verification

`server/care/manual-access-email.test.ts` exercises the production dependency
boundary with a deliberately misleading generic sender and proves that both
Resend payloads still use the exact Xenios Health team sender.

Verification completed under the bundled Node `v20.19.0` runtime:

```text
vitest run server/care/manual-access-email.test.ts server/care/manual-access.test.ts server/care/access.test.ts server/care/integration-wiring.test.ts server/care/clinical-route-coverage.test.ts server/care/loi-boundary-wiring.test.ts --maxWorkers=2
6 files passed; 164 tests passed; 0 failed

npm run check
PASS

npm run build
PASS (existing Vite dynamic-import and chunk-size warnings only)

verify-core-site-protection c140be058e01610f3b58d7261548a7ceaf3d2188 5773bf550cc11de194fb88aa59660b863b5c2bec
PASS; 28 protected hashes verified
```

## External readiness still required

This local change does not send email and does not alter Render, Resend, DNS,
Supabase SMTP, or production. Before a live claim, an authorized operator must
confirm that `xeniostechnology.com` is verified in the active Resend account,
that the active API key may send for that domain, and that the team mailbox can
receive replies. A separately authorized test send and delivered-header check
are still required for live proof.
