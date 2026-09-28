# Claude narrow verification packet — status UX closeout

Date: 2026-09-28

## Exact source identity

- Branch: `codex/xenios-status-ux-closeout-20260928`
- Reviewed parent runtime: `fef7b313c23ac0e12046420041aa51a3a6e3c2d6`
- Reviewed parent tree: `55bdc57d3992393f4b767cd7f9c6a00c53e25c60`
- Independent review: `claude/xenios-p17-clarity-review-20260927` at `81aee48`
- Runtime fix: `263df232be7d42a65d74ec8f060bd7b96ff2545f`
- Runtime tree: `6b58f3fca94938e14bcd89860e871def5056bd02`
- Test-only tip: `269b5bb2dc81c725c833f46cbd4562730c836039`
- Release-control tip: `90da2dbf692490f783e150f8791cd2a054651aef`
- Docs/handoff tip: the commit containing this packet

The runtime commit changes only `client/src/clarity/pages.tsx`. The secure
migration, token/session authority, recovery service, notification/outbox
authority, and server routes are byte-unchanged from the reviewed runtime.

## Findings closed

### R-01 — Care reference guidance

PASS in focused tests and local browser UAT. Every input beginning with the
public `CARE-` shape receives the same neutral Care guidance. The UI does not
call `/api/research/status-recovery/request`, does not promise email, does not
confirm existence or status, and links only to `/care` and `/care/support`.

### R-02 — authorized shortcuts

PASS in focused tests. `View account orders` appears only after a Supabase
session token is independently confirmed by `GET /api/research/member/me` as an
active member. Signed-out, 401, 403, and explicit sign-out cases do not retain
the link. An exact XRR subject with an existing same-browser assisted-order
status token continues only that subject's canonical route. Typed email is
never used as authority.

### R-03 — same-tab recovery links

PASS in focused tests and local browser UAT. Initial load, same-document
navigation, hashchange, replacement by a second token, malformed token,
active-status-session supersession, refresh, back/forward, explicit POST,
expired/replayed failure, and error focus are covered. The fragment is replaced
with `/status`, the token is absent from rendered DOM, and `View status` is the
explicit exchange gate.

## Pinned runtime

- Official archive: `node-v20.19.0-win-x64.zip` from nodejs.org
- Expected SHA-256 from official `SHASUMS256.txt`:
  `BE72284C7BC62DE07D5A9FD0AE196879842C085F11F7F2B60BF8864C0C9D6A4F`
- Actual SHA-256: same
- Node: `v20.19.0`
- npm: `10.8.2`
- Private runtime: `C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64`
- Dependencies rebuilt with this runtime using
  `npm ci --include=dev --no-audit --no-fund`.

No system-wide install or permanent PATH change was made.

## Test and build results

- Focused R-01/R-02/R-03: 1 file, 14/14 PASS.
- P-17 security regression: 9 files, 96/96 PASS.
- Authority/owner/outbox selection: 8 files, 144 passed and 6 failed. All six
  failures are confined to the pre-existing
  `server/research/outbox-enqueue-once.test.ts` initialization race; the exact
  runtime diff has no changes to that source or test.
- Typecheck: PASS.
- Production build: PASS (2,306 client modules plus server bundle).
- Full suite: FAIL qualification gate. The single-worker Node 20 process ran
  for approximately 2.5 hours, executed no test, accumulated only about 13 CPU
  seconds, and was terminated as a stalled local runner. Do not infer a product
  regression or a pass from this result.
- Migration DAG/checksums: PASS, 38 nodes.
- Route uniqueness: PASS, 453 registrations across 444 call sites.
- Protected-change gate for `fef7b313..263df232`: PASS; one allowed file and
  37 protected hashes verified.
- Site record: FAIL qualification gate because the check stalled for about 30
  minutes with no result and was terminated.
- Release manifest: no CODEX_12 release manifest was generated. The P-17
  release controls are preserved; the generic verifier requires an exact
  release manifest and trusted external base/head inputs.
- `git diff --check`: PASS.
- SQL postchecks/verifier: NOT CHANGED / NOT RERUN. No migration-relevant
  source changed and no database was contacted.

## Browser evidence

The local Vite client was opened in a visible controlled Chromium browser. No
backend credentials were supplied, no real email was sent, and no external
environment was contacted.

- 390 viewport: PASS; inner width 390, client width 375, scroll width 375,
  heading/form visible, no horizontal overflow.
- 768 viewport: PASS; inner width 768, client width 753, scroll width 753,
  heading/form visible, no horizontal overflow.
- 1440 viewport: PASS; inner width 1440, client width 1425, scroll width 1425,
  heading/form visible, no horizontal overflow.
- Real 200% browser zoom: PASS. Browser outer width 640 and CSS inner width
  319, client width 304, scroll width 304, no horizontal overflow. Screenshots
  were captured for the base form, Care guidance, explicit `View status` gate,
  and focused expired-link error.
- Real 400% browser zoom: NOT RUN. The controlled in-app Chromium capped
  keyboard zoom at effective 200%; three additional zoom-in commands left the
  measured CSS viewport unchanged. The full Chrome control extension opened
  the page but repeatedly timed out binding its CDP focus state. No viewport
  proxy is represented as 400% zoom.
- Same-tab fragment: URL after handling was exactly
  `http://127.0.0.1:5000/status`; raw token count in URL and DOM was zero;
  `View status` was visible before exchange.
- Back, forward, refresh: all returned clean `/status` with no token fragment.
- Expired/local-unavailable exchange: safe alert displayed and received focus;
  no horizontal overflow.

Screenshot images were captured in the Codex browser-control session but the
control surface did not expose a repository-file export. Treat the measurements
and accessibility trees as durable text evidence; independently recapture the
images during Claude verification.

## Exact reproduction commands

In PowerShell, set a process-local PATH so every child worker uses Node 20:

```powershell
$env:Path='C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64;'+$env:Path
node --version
npm --version
npx vitest run client/src/clarity/StatusPage.test.tsx --pool=threads --maxWorkers=1
npx vitest run client/src/clarity/StatusPage.test.tsx client/src/clarity/pages.test.tsx server/research/frontdoor.test.ts server/research/status-recovery/crypto.test.ts server/research/status-recovery/http.test.ts server/research/status-recovery/migration-source.test.ts server/research/status-recovery/notification.test.ts server/research/status-recovery/service.test.ts server/static.test.ts --pool=threads --maxWorkers=1
npm run check
npm run build
npm run verify:migration-dag
npm run verify:route-uniqueness
node scripts/acceptance/verify-core-site-protection.mjs fef7b313c23ac0e12046420041aa51a3a6e3c2d6 263df232be7d42a65d74ec8f060bd7b96ff2545f
git diff --check
```

The ignored local Vitest installation required its hard-coded worker startup
timeouts to be increased from 60/90 seconds to 300 seconds because Windows
security scanning delayed worker initialization. No repository dependency,
configuration, source, or test file was changed for that workaround.

## Evidence limitations and disposition

- Managed Supabase parity: unverified.
- External delivery: unverified.
- Managed staging: not run; not mutated.
- Production: not deployed or mutated.
- Migration: not applied anywhere.
- Real email: not sent.
- Remote branch verification: pending at packet creation.
- P0: 0. P1: 0. Narrow R-01/R-02/R-03 P2 remaining: 0 in local focused
  evidence. Claude's unrelated P3 backlog remains 12 and was not implemented.

READY FOR CLAUDE NARROW VERIFICATION: **NO**. Single blocker: authoritative
qualification is incomplete on this host because the full suite and site-record
checks stalled, and real 400% zoom could not be obtained from the available
controlled browsers.
