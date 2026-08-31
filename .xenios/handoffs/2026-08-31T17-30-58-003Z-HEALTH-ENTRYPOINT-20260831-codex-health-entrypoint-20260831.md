# Xenios Health entrypoint release candidate

Date: 2026-08-31

Status: **IMPLEMENTED, VERIFIED, NOT YET DEPLOYED**

## Outcome

`https://xeniostechnology.com/health` is the canonical public Care + Research
gateway in the release candidate. The main-site shared navigation now labels
that destination `Health` and targets `/health`; the shared configuration feeds
the desktop header, product menu, and footer. Existing `/care`, `/research`, and
all deep links remain intact and keep their current authorities.

The `/health` document is public and indexable. It owns this exact metadata:

- title: `Xenios | Care + Research`;
- description: `Begin provider-guided Care for personal health or explore the separate evidence-led Xenios Research pathway for legitimate nonclinical work.`;
- canonical and `og:url`: `https://xeniostechnology.com/health`;
- robots: `index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1`.

The exact `/health` route is inside the existing no-third-party-tracking and
no-attribution privacy boundary. It does not create a `/health/*` route family:
an unknown child such as `/health/not-real` remains an authoritative HTTP 404.

## Exact identities

| Item | Value |
| --- | --- |
| Current live application SHA | `abe03ca3a836dffb10699c0c39883119e2a8f816` |
| Current live Render deployment | `dep-daaqncid0e5s739067tg` |
| Health implementation SHA | `faf6d95891aea217894413394b2cd6ce4c283f27` |
| Preview source-tree identity | `86a19c18bfa470cad49ebc812da91dbd60c2e327` |
| Preview dist inventory SHA-256 | `2842f7c64e3d6da03c5cf18e5c2ead21650922eb7033a45a23ec225699cfd719` |
| Preview dist file count | 323 |
| Runtime | Node `v20.19.0`, npm `10.8.2` |
| Install | exact lockfile via `npm ci --no-audit --no-fund` |
| Branch | `codex/xenios-care-research-postlaunch-20260831` |

The eventual deploy SHA may be a documentation/coordination-only successor of
the implementation SHA. Production must be pinned to the exact successor named
in the fresh deploy approval; branch head is not standing authority.

## Verification

### Source and contract gates

- Focused implementation suite: 216 tests passed after the route, raw-document,
  privacy, public-evidence, sitemap, conservation, and core-seam changes.
- Final critical-endpoint and app-route replay: 2 files and 41 tests passed.
- Public evidence topology: 75 raw public routes, including exact `/health`,
  passed its standalone Node test suite.
- TypeScript no-emit check passed.
- Production build passed under the pinned runtime. The only build messages were
  the pre-existing mixed-import and large-chunk warnings.
- Core protection verifies all 27 exact protected hashes. Its branch-wide
  `origin/main..HEAD` classifier still reports the inherited, already-reviewed
  long-lived release-branch changes; this is not widened or silently waived by
  the Health change. The new `/health` census and exact shared-file seam hashes
  are pinned in the manifest and pass their focused contracts.

### Sealed local production preview

The exact implementation SHA was rebuilt from a clean lockfile and served by
the repository's mutation-refusing evidence preview. Raw HTTP checks passed:

| Route | Result |
| --- | --- |
| `/health` | HTTP 200; exact public robots, canonical Link, title, description, and canonical meta |
| `/` | HTTP 200; existing public root authority preserved |
| `/research` | HTTP 200; existing Research noindex policy preserved in the closed preview |
| `/care` | HTTP 200; existing private Care policy preserved |
| `/health/not-real` | HTTP 404 |
| `/sitemap.xml` | HTTP 200 and contains `https://xeniostechnology.com/health` |

Real Chromium captured `/health` at 1440 px and 390 px. Both runs were
`AUTOMATED_PASS`: zero pass-with-notes, zero failures, zero console errors,
zero network failures, no horizontal overflow, one main landmark, one H1, and
43/43 keyboard targets reached with visible focus. The desktop and mobile
screenshots were also visually inspected.

Browser matrix SHA-256:
`e866d183e15bb2acb726e48dfb0b7a9fd7d144c987db9d21ceed41bbd5948f34`.

### Current-live versus candidate `/health` diff

At 2026-08-31T17:24:24Z, live `/health` was the expected authoritative 404 and
the sealed candidate was the reviewed public 200. The exact eight emitted
differences are pinned by
`scripts/release/critical-endpoint-expectations-health-20260831.json`.
Classification: 1 `INTENTIONAL_CHANGE`, 0 regression, 0 human-review item;
verdict `PASS`.

## Production boundary and rollback

No production mutation has been made for this Health entrypoint. Render
auto-deploy remains disabled. This change includes no environment, migration,
database, pricing, payment, clinical, pharmacy, account, invitation, or
external-communication mutation.

The previous deployment authorization was consumed by deployment
`dep-daaqncid0e5s739067tg`; it is not authority for this successor. A fresh
approval naming the final exact commit is required before deployment.

If the Health release later needs rollback, the application rollback target is
the current live SHA `abe03ca3a836dffb10699c0c39883119e2a8f816`. Rollback is
also a production mutation and requires current authorization.
