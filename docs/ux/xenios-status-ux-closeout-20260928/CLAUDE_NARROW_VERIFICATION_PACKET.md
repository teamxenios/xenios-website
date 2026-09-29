# Claude final website verification packet

Date: 2026-09-28

## Exact source identity

- Branch: `codex/xenios-status-ux-closeout-20260928`
- Starting branch tip: `42c627b342095f8314d474d5424239152bd656a8`
- Independently reviewed parent: `fef7b313c23ac0e12046420041aa51a3a6e3c2d6`
- Reviewed parent tree: `55bdc57d3992393f4b767cd7f9c6a00c53e25c60`
- Claude review branch: `claude/xenios-p17-clarity-review-20260927`
- Claude review commit: `81aee48`
- Final runtime: `899395c4980cc554f9a2c6bdb3eb3d14e63ee65a`
- Final runtime tree: `a09ffdf6f52537e0c289875a05f825c8a40ad75a`
- Test-only tip: `cfba43d5115580b8603af0e52b52c2032f466472`
- Release-control tip: `9b1d51417b5b1764f5596d9b7f693f9202e6d33d`
- Generated-record tip: `8b0556f7b4261712240b44f01299d8b19bd0ab2b`
- Release-manifest evidence tip: `1b2565c2d7f46854b481e6f74d2b053c739e1857`
- Docs/handoff tip: the final pushed commit containing this packet and its corpus handoff

The final runtime commit changes 57 customer-visible or customer-delivered
files. Its changes are limited to removal of customer-facing em dashes and one
unavailable-state copy correction. It does not change P-17 authority, the
secure migration, token/session authority, notification/outbox authority,
server routes, database access, or deployment configuration.

## Commit and changed-path classification

| Commit | Classification |
| --- | --- |
| `263df23` | runtime |
| `3698fb9` | test-only |
| `be58884` | test-only |
| `269b5bb` | test-only |
| `b59bc5c` | release-control/session registration |
| `bf50fed` | release-control |
| `90da2db` | test/release pin |
| `b4f80fe` | documentation |
| `c190033` | documentation |
| `ec96534` | documentation |
| `91f834a` | runtime |
| `c6a6ca7` | runtime integration/merge |
| `9b63a3b` | test-only |
| `0bb04f3` | documentation |
| `f5a7b8a` | documentation |
| `a15abb8` | generated record |
| `910ce30` | documentation/evidence |
| `25fbbb5` | generated record/documentation |
| `42c627b` | documentation |
| `899395c` | runtime |
| `c4396f3` | release-control |
| `71eee2a` | test-only |
| `94dbfb9` | release-control |
| `696b7c2` | test-only |
| `a0a429c` | test-only |
| `858f971` | release-control |
| `cfba43d` | test-only |
| `9b1d514` | release-control |
| `8b0556f` | generated record |
| `1b2565c` | documentation/evidence and release manifest |

The exact changed paths are recoverable with:

```powershell
git diff --name-status fef7b313c23ac0e12046420041aa51a3a6e3c2d6..HEAD
git show --stat --oneline 899395c4980cc554f9a2c6bdb3eb3d14e63ee65a
```

## Findings closed

### R-01: Care reference guidance

PASS. Every input beginning with the public `CARE-` shape receives the same
neutral Care guidance. The UI does not create a research recovery event,
promise recovery email, confirm whether a Care reference exists, or disclose
Care or clinical status. It directs the person only to the approved Care and
support paths.

### R-02: authorized status shortcuts

PASS. `View account orders` is exposed only after a server-confirmed signed-in
account owner is established. Signed-out, expired, wrong-owner, and
browser-only email-match cases do not receive that link. The exact-subject
same-browser shortcut requires valid server-confirmed status authority;
expired, invalid, wrong-subject, and unrelated-order cases fall through to
neutral recovery.

### R-03: same-tab secure recovery links

PASS. Initial load, same-document navigation, address-bar paste, `hashchange`,
replacement by a second token, malformed token, active status session,
refresh, back/forward, explicit POST, expired/replayed failure, and error focus
are covered. The fragment is removed immediately with history replacement,
the token is held only in volatile state, and `View status` remains the
explicit exchange gate. The raw token is absent from the resulting URL and
rendered DOM.

## Customer-facing em dash closeout

The inventory uses the same source roots and exclusions as the permanent
release scanner.

| Measurement | Starting tip `42c627b` | Runtime `899395c` |
| --- | ---: | ---: |
| Scanned source files | 1,330 | 1,330 |
| Customer-facing literal U+2014 | 112 | 0 |
| Customer-facing `&mdash;` | 0 | 0 |
| Customer-facing `&#8212;` | 0 | 0 |
| Customer-facing `&#x2014;` | 0 | 0 |
| Customer-facing escaped `\\u2014` | 0 | 0 |
| Total customer-facing forms | 112 | 0 |
| Raw source-root forms | 701 | 589 |
| Excluded non-customer forms | 589 | 589 |

All 112 customer-facing findings were fixed. The 589 excluded forms are in
test fixtures, comments, historical material, or syntax that is not rendered
to customers. The production-build scanner found zero customer-facing forms.
`npm run test:no-em-dash` permanently exercises the gate, and the gate is part
of release verification.

## Pinned runtime

- Official archive: `node-v20.19.0-win-x64.zip` from nodejs.org
- Official and actual SHA-256:
  `BE72284C7BC62DE07D5A9FD0AE196879842C085F11F7F2B60BF8864C0C9D6A4F`
- Node: `v20.19.0`
- npm: `10.8.2`
- Private runtime: `C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64`

No system-wide install or permanent PATH change was made.

## Automated qualification

- Focused R-01/R-02/R-03: PASS, 15/15 tests.
- P-17 security regression: PASS, 97/97 tests across nine files.
- No-em-dash gate tests: PASS, 8/8 tests.
- Source no-em-dash scan: PASS, 1,330 files and zero findings.
- Production-build no-em-dash scan: PASS, 224 files and zero findings.
- Typecheck: PASS.
- Production build: PASS, 2,306 client modules plus server bundle.
- Full suite: PASS, 987 files passed and 6 skipped; 18,180 tests passed and
  85 skipped.
- Migration DAG/checksums: PASS, 38 nodes.
- Route uniqueness: PASS, 453 registrations across 444 call sites.
- Protected-change gate: PASS, 38 hashes plus the exact offline punctuation
  seam.
- Site records: PASS, 235 routes and 15 capabilities.
- Release manifest: PASS for expected base `fef7b313...` and exact runtime head
  `899395c4...`.
- `git diff --check`: PASS.

## Exact production-build browser evidence

The exact production build was served locally without backend credentials or
external service access.

At 390x844, 768x900, and 1440x1000, each of `/`, `/care`, `/research`,
`/practices`, `/partners`, `/status`, `/sign-in`, and `/support` loaded with its
expected heading, zero horizontal overflow, and zero clipped controls.

True 200% page zoom passed on `/status`:

- Browser outer width: 640 CSS pixels.
- Browser inner width: 319 CSS pixels, an effective ratio of 2.01.
- Inner height: 452; client width: 304; scroll width: 304.
- Horizontal overflow: 0; clipped controls: 0.
- Keyboard order: reference, email, submit.
- Visible focus: purple solid 2.66667px on the email field; browser focus
  outline on the button.
- Neutral Care guidance was confirmed with a synthetic non-existing Care
  reference and non-routable example address.
- A synthetic 43-character recovery fragment was removed immediately, never
  appeared in the DOM, and exposed `View status` before exchange.
- Explicit keyboard activation of the POST exchange produced the safe
  invalid/expired alert with focus moved to the alert.
- Back, forward, and refresh retained a clean `/status` URL with no token.

True 400% page zoom remains a single manual evidence step after three distinct
supported attempts:

1. The existing controlled Chrome tab was reset and zoomed in nine times. Its
   measured 638/652 inner/outer widths did not change.
2. Native Windows control was attempted, but the trusted UI RPC service was
   not configured.
3. A fresh named headed Chrome session was reset and zoomed in nine times. Its
   measured 638/652 inner/outer widths also did not change.

No viewport-width, CSS transform, or device-scale simulation is represented as
true browser zoom. To close the remaining evidence gap manually, open
`http://127.0.0.1:5001/status` in Chrome, use the three-dot menu to set Zoom to
400%, and record the displayed zoom value, `innerWidth`, `innerHeight`,
`document.documentElement.scrollWidth`, `clientWidth`, horizontal overflow,
clipped controls, keyboard/focus behavior, and a screenshot.

## Exact local reproduction commands

```powershell
$env:Path='C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64;'+$env:Path
node --version
npm --version
npm run test:no-em-dash
npm run verify:no-em-dash
npx vitest run client/src/clarity/StatusPage.test.tsx --pool=threads --maxWorkers=1
npx vitest run client/src/clarity/StatusPage.test.tsx client/src/clarity/pages.test.tsx server/research/frontdoor.test.ts server/research/status-recovery/crypto.test.ts server/research/status-recovery/http.test.ts server/research/status-recovery/migration-source.test.ts server/research/status-recovery/notification.test.ts server/research/status-recovery/service.test.ts server/static.test.ts --pool=threads --maxWorkers=1
npm run check
npm run build
npm run verify:no-em-dash:build
npm test -- --pool=threads --maxWorkers=4 --testTimeout=30000
npm run verify:migration-dag
npm run verify:route-uniqueness
node scripts/acceptance/verify-core-site-protection.mjs fef7b313c23ac0e12046420041aa51a3a6e3c2d6 HEAD
npm run site:record:check
$env:XENIOS_EXPECTED_PRODUCTION_SHA='fef7b313c23ac0e12046420041aa51a3a6e3c2d6'
$env:XENIOS_EXPECTED_HEAD_SHA='899395c4980cc554f9a2c6bdb3eb3d14e63ee65a'
npm run verify:release-manifest -- docs/ux/xenios-status-ux-closeout-20260928/RELEASE_MANIFEST.json
git diff --check
```

## Evidence limitations and disposition

- Managed Supabase parity: UNVERIFIED.
- External delivery: UNVERIFIED.
- Managed staging: NOT RUN and not mutated.
- Production: NOT DEPLOYED and not mutated.
- Migration: NOT APPLIED anywhere.
- Real email: NOT SENT.
- True 400% page zoom: MANUAL EVIDENCE REQUIRED.
- 400% horizontal overflow: NOT RUN.
- 400% clipped controls: NOT RUN.
- P0: 0. P1: 0. P2: 0. Claude's unrelated P3 backlog remains 12 and was not
  implemented.

READY FOR CLAUDE FINAL VERIFICATION: **NO**. The sole remaining step is the
manual true 400% Chrome evidence capture described above. There is no known
runtime, test, release-control, security, or source-closeout blocker.
