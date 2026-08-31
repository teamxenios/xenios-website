# Xenios Health entrypoint production record

Date: 2026-08-31

Status: **LIVE AND VERIFIED**

## Outcome

`https://xeniostechnology.com/health` is the canonical public Care + Research
gateway. The main-site desktop header, product menu, and footer label the
destination `Health` and target `/health`. Existing `/care`, `/research`, and
their deep links remain intact.

The live `/health` document is public and indexable with these exact signals:

- title: `Xenios | Care + Research`;
- description: `Begin provider-guided Care for personal health or explore the separate evidence-led Xenios Research pathway for legitimate nonclinical work.`;
- canonical and `og:url`: `https://xeniostechnology.com/health`;
- robots: `index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1`.

The exact `/health` route remains inside the no-third-party-tracking and
no-attribution privacy boundary. It does not create a `/health/*` family; an
unknown child remains an authoritative HTTP 404.

## Production identity

| Item | Value |
| --- | --- |
| Exact live application SHA | `72b6f1380e13f09dec67684035ed44a1d2740408` |
| Render service | `srv-d8s9vej7uimc7384dfcg` (`xenios-website`) |
| Render deployment | `dep-daarr3ajnfac73a93co0` |
| Deployment trigger | API, exact approved SHA |
| Deployment started | `2026-08-31T17:44:45.73208Z` |
| Deployment finished live | `2026-08-31T17:45:49.457621Z` |
| Predecessor SHA | `abe03ca3a836dffb10699c0c39883119e2a8f816` |
| Predecessor deployment | `dep-daaqncid0e5s739067tg` |
| Branch | `codex/xenios-care-research-postlaunch-20260831` |

The founder's exact `GO 72b6f1380e13f09dec67684035ed44a1d2740408`
was consumed by this deployment. It is not standing authority for a successor.

## Verification

The post-deployment critical-endpoint comparison passed with 26 unchanged
endpoints, the two exact intended `/health` and `/sitemap.xml` changes, zero
regressions, and zero human-review items.

Render independently reported the exact commit live. Post-deployment logs
contained zero application errors and metrics contained zero HTTP 5xx
responses; the service held one healthy instance with normal CPU and memory.

Real Chromium 149 then verified the actual public origin:

- the homepage exposes two `Health` anchors, both targeting `/health`;
- `/health` has the exact title, canonical, and index/follow policy above;
- desktop at 1440 px and mobile at 320 px have no horizontal overflow;
- each page has one main landmark, no broken images, no undersized targets,
  and no failed network requests.

The screenshots inspected during live verification are:

- `C:\Users\sboad\AppData\Local\Temp\xenios-live-health-72b6\home-1440.png`;
- `C:\Users\sboad\AppData\Local\Temp\xenios-live-health-72b6\health-1440.png`;
- `C:\Users\sboad\AppData\Local\Temp\xenios-live-health-72b6\health-320.png`.

The only browser message was a pre-existing deprecated Apple mobile meta-tag
warning; it did not affect functionality or release classification.

## Mutation and rollback boundary

The deployment changed application code only. It made no environment,
migration, database, pricing, payment, clinical, pharmacy, account, invitation,
or external-communication mutation. Render auto-deploy remains disabled.

If rollback is authorized, the exact application target is predecessor SHA
`abe03ca3a836dffb10699c0c39883119e2a8f816` / deployment
`dep-daaqncid0e5s739067tg`. Rollback is itself a production mutation and
requires current authorization.
