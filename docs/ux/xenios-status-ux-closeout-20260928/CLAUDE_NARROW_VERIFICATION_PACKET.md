# Claude final website verification packet

Date: 2026-09-29

## Exact source identity

- Branch: `codex/xenios-status-ux-closeout-20260928`
- Starting branch tip: `42c627b02adf97ec441c4c3512f0dbf28e2d01b3`
- Independently reviewed parent: `fef7b313c23ac0e12046420041aa51a3a6e3c2d6`
- Reviewed parent tree: `55bdc57d3992393f4b767cd7f9c6a00c53e25c60`
- Prior website runtime: `899395c4980cc554f9a2c6bdb3eb3d14e63ee65a`
- F-01 presentation runtime: `04b44d162f17acb6adfa26ca7628ea80f3f19dad`
- Final runtime: `c213707a9d80ecc9f772b5790acb52f1fa503da7`
- Final runtime tree: `09cbd1d25b7ab7dd2e60ae40ee2003226a9855e0`
- Final test-only commit: `4cc31567e2e93b0708584c8cfb45fee17209bea4`
- Final release-control commit: `7396f53dcedb154991f8f9b23accaee137286fdd`
- Release-manifest commit: `b0ffa7ece1bcbcfb139eb814af35e59416b79540`
- Generated-record tip: recorded in the final handoff after record refresh
- Docs/handoff tip: the final pushed commit containing this packet and corpus handoff

The runtime change after the F-01 closeout is deliberately narrow. A public
shell marker and focus scroll clearance keep keyboard-focused controls below
the existing sticky header at high browser zoom. No P-17 authority, secure
migration, token/session authority, route, notification/outbox authority,
database access, business rule, deployment configuration, or production
configuration changed.

## Commit classification

| Commit | Classification |
| --- | --- |
| `04b44d1` | runtime: normalize runtime-fed reconciliation labels at the presentation boundary |
| `f3f7fc1` | test-only: lock immutable-source and rendered-label behavior |
| `8ff2d0e` | release-control: scan runtime-fed reconciliation copy |
| `14c9a74` | continuity/session record |
| `d60a80f` | release-control: protected package hash review |
| `d9f83de` | release manifest and ownership evidence |
| `b865019` | generated site record |
| `c213707` | runtime: keep public controls visible during keyboard focus at high zoom |
| `4cc3156` | test-only: lock public focus scroll clearance |
| `ba60069` | continuity/session record |
| `7396f53` | release-control: protected CSS hash review |
| `b0ffa7e` | release manifest and ownership evidence rebound to final runtime |

Exact changed paths are recorded in `RELEASE_MANIFEST.json`. Its 108 entries
exactly equal `git diff --name-only --no-renames fef7b313..c213707`, with no
omissions or extras.

## F-01: runtime-fed admin reconciliation copy

PASS. The immutable source file
`config/research/revenue-launch/seth-source-reconciliation-20260905.json`
remains unchanged:

- SHA-256: `7E338D041A1889B6C3DBF25E474D5B0440CC8F72E70DC8E5119A175137094D93`
- Git blob: `1c502e08fc10eb5328eccb02898cd1c537b5c388`
- Raw Phase B literal em-dash count: 23
- Rendered admin/operator em-dash count: 0

The presentation formatter converts only the semantic product/configuration
separator, for example `Capsule, 100 mg`. Evidence-only source fields and the
immutable JSON are not rewritten. The permanent gate now scans the exact
runtime-fed Phase A and Phase B presentation projection under
`config/research`.

## R-01: Care reference guidance

PASS. Every `CARE-` shaped input receives the same neutral Care guidance. The
UI does not create a Research recovery request, promise an email, confirm that
a Care request exists, or disclose Care or clinical status. It directs the
person to the approved Care paths.

At true 400% zoom the synthetic Care check produced no request to
`/api/research/status-recovery/request`, no email promise, no Care-status
disclosure, zero horizontal overflow, and a fully visible keyboard-focused
`/care/support` link.

## R-02: authorized status shortcuts

PASS. `View account orders` requires a server-confirmed active signed-in
member. The exact-subject same-browser shortcut requires server-confirmed
status authority for that exact reference. Signed-out, expired, wrong-owner,
browser-only email match, wrong-subject, and unrelated-order cases do not
receive those links.

The true-zoom browser ran signed out and confirmed that neither authorized
shortcut leaked. Authorized-state behavior remains covered by the focused
R-02 tests; the isolated preview intentionally contains no live owner account
or durable order data.

## R-03: same-tab secure recovery links

PASS. The true 400% browser run used a synthetic 43-character token and
confirmed:

- same-tab hash navigation fired capture logic;
- the fragment was synchronously removed from the URL and history;
- the raw token was absent from the rendered DOM;
- navigation issued no exchange request;
- `View status` was fully visible and keyboard reachable;
- the only consume attempt was the explicit POST to
  `/api/research/status-recovery/exchange` after activating `View status`;
- the synthetic invalid token converged on the safe invalid/expired alert;
- refresh, back, and forward restored neither the token nor `View status` and
  issued no replay POST.

Initial-link, malformed, expired, replay, active-session, second-token, and
owner-isolation cases are also locked by the focused P-17 regression suite.

## True Chrome zoom evidence

The page was the evidence-bound local production preview at
`http://127.0.0.1:5001/status`. Its provenance endpoint reported runtime
`c213707a9d80ecc9f772b5790acb52f1fa503da7`, tree
`09cbd1d25b7ab7dd2e60ae40ee2003226a9855e0`, Node `v20.19.0`, npm `10.8.2`,
345 distribution files, and distribution inventory
`5c04c5c85f94def54f0840237210d55bb3bec53c0c3b5aa3bdbc5a0f455422c7`.

These are real Chrome page-zoom results. No viewport emulation, CSS transform,
or device-scale simulation is represented as zoom evidence.

| Measurement | True 200% | True 400% |
| --- | ---: | ---: |
| Chrome devicePixelRatio | 3.0 | 6.0 |
| Browser outer width | 1280 | 1280 |
| Browser outer height | 752 | 752 |
| `window.innerWidth` | 640 | 320 |
| `window.innerHeight` | 304 | 152 |
| `documentElement.clientWidth` | 632 | 316 |
| `documentElement.scrollWidth` | 632 | 316 |
| Horizontal overflow | 0 | 0 |
| Horizontally clipped controls | 0 | 0 |
| Customer-facing em dashes in rendered `/status` | 0 | 0 |

At both zoom levels the heading, labels, fields, submit control, support links,
and navigation remained readable and usable by scrolling. Forward and reverse
keyboard traversal kept every content control below the sticky header. At
400%, the reverse-focused submit control occupied `top=83.98` through
`bottom=135.98` in the 152-pixel viewport, fully visible with no header
intersection. At 200%, it occupied `top=84.09` through `bottom=140.09` in the
304-pixel viewport, also fully visible.

Before the repair, the same true-400% reverse traversal placed the submit
control at `top=-0.02` through `bottom=51.98`, entirely beneath the 69-pixel
sticky header. The final runtime fixes only that independently reproduced
defect. Browser screenshots for the failing and passing 200%/400% states were
captured inline in the controlling Codex task; no simulated screenshot is
substituted.

## No-em-dash release gate

- Gate tests: PASS, 9/9.
- Runtime source scan: PASS, 1,332 files, zero forbidden customer-facing forms.
- Production-build scan: PASS, 224 files, zero forbidden customer-facing forms.
- Runtime-fed reconciliation projection: PASS, zero rendered forms.
- Immutable evidence JSON: intentionally retains its 23 source forms.

## Pinned runtime and automated qualification

- Official archive: `node-v20.19.0-win-x64.zip`
- Official and actual archive SHA-256:
  `BE72284C7BC62DE07D5A9FD0AE196879842C085F11F7F2B60BF8864C0C9D6A4F`
- Node: `v20.19.0`
- npm: `10.8.2`
- Private runtime: `C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64`
- Focused status/F-01/P-17 regression: PASS, 104/104.
- Typecheck: PASS.
- Production build: PASS, 2,307 client modules plus server bundle.
- Full suite: PASS, 987 files passed and 6 skipped; 18,182 tests passed and
  85 skipped.
- Migration DAG/checksums: PASS, 38 nodes.
- Route uniqueness: PASS, 453 registrations across 444 call sites.
- Protected-change review: PASS, 38 exact hashes.
- Site records: PASS, 235 routes and 15 capabilities.
- Release manifest: PASS for base `fef7b313...` and final runtime `c213707...`.
- `git diff --check`: PASS.

## Exact local reproduction commands

```powershell
$node='C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64\node.exe'
$npm='C:\Users\sboad\.codex\tmp\node-v20.19.0-win-x64\npm.cmd'
& $node --version
& $npm --version
& $npm run test:no-em-dash
& $npm run verify:no-em-dash
& $npm exec vitest run client/src/components/PageShell.test.tsx client/src/clarity/StatusPage.test.tsx client/src/clarity/pages.test.tsx server/research/frontdoor.test.ts server/research/status-recovery/crypto.test.ts server/research/status-recovery/http.test.ts server/research/status-recovery/migration-source.test.ts server/research/status-recovery/notification.test.ts server/research/status-recovery/service.test.ts server/static.test.ts
& $npm run check
& $npm run build
& $npm test
& $npm run verify:migration-dag
& $npm run verify:route-uniqueness
& $node scripts/acceptance/verify-core-site-protection.mjs fef7b313c23ac0e12046420041aa51a3a6e3c2d6 c213707a9d80ecc9f772b5790acb52f1fa503da7
& $npm run site:record:check
$env:XENIOS_EXPECTED_PRODUCTION_SHA='fef7b313c23ac0e12046420041aa51a3a6e3c2d6'
$env:XENIOS_EXPECTED_HEAD_SHA='c213707a9d80ecc9f772b5790acb52f1fa503da7'
& $npm run verify:release-manifest -- docs/ux/xenios-status-ux-closeout-20260928/RELEASE_MANIFEST.json
git diff --check fef7b313c23ac0e12046420041aa51a3a6e3c2d6..c213707a9d80ecc9f772b5790acb52f1fa503da7
```

## Evidence limitations and disposition

- Managed Supabase parity: UNVERIFIED.
- External delivery: UNVERIFIED.
- Managed staging: NOT RUN and not mutated.
- Production: NOT DEPLOYED and not mutated.
- Migration: NOT APPLIED anywhere.
- Real email: NOT SENT.
- Preview owner data: intentionally absent; R-02 authorized-state zoom layout is
  inferred from the same shared control styles and independently covered by
  focused authority tests.
- P0: 0. P1: 0. P2: 0. Claude's unrelated P3 backlog remains 12 and was not
  implemented.

READY FOR CLAUDE FINAL VERIFICATION: **YES**.
