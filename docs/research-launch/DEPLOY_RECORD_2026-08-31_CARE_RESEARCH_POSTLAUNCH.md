# Production deploy record: Care + Research post-launch

Date: 2026-08-31

Status: **LIVE AND VERIFIED**

This file records a completed exact-SHA production deployment. It is not a
standing authorization for another deploy or for any additional production
mutation.

## Exact identities

| Item | Value |
| --- | --- |
| Deployed SHA | `abe03ca3a836dffb10699c0c39883119e2a8f816` |
| Render workspace | `tea-d8nhh6a8qa3s73f4ocj0` |
| Render service | `srv-d8s9vej7uimc7384dfcg` (`xenios-website`) |
| Render deployment | `dep-daaqncid0e5s739067tg` |
| Deployment trigger | Render API, exact commit |
| Started at | 2026-08-31T16:28:34.660449Z |
| Live at | 2026-08-31T16:29:36.440651Z |
| Public origin | `https://xeniostechnology.com` |
| Render origin | `https://xenios-website.onrender.com` |
| Configured service branch | `release/early-access-code-session-checkout` |
| Auto-deploy | `false` |
| Predecessor SHA | `1fd84ad2b3320dada4da7f58012d4311e5cd1639` |
| Predecessor deployment | `dep-daabqagn74is73aejn80` |
| Migration | None |
| Environment change | None |

Samuel's current explicit request to deploy the just-delivered candidate was
the one-time production authority. The deployed identity was commit-pinned;
the branch configuration and auto-deploy setting were not changed.

## Pre-deploy controls

- The worktree and pushed origin branch both resolved to exact candidate
  `abe03ca3a836dffb10699c0c39883119e2a8f816`.
- The candidate contained no `supabase/**` change, migration, or environment
  configuration change.
- The approved diff was limited to the reviewed Care + Research presentation,
  customer-safe education/catalog reconciliation, tests, evidence, and
  coordination records.
- The 27-route production critical-endpoint baseline was captured before the
  deploy, including health and the known-live assisted-order configuration
  route that caused the 2026-08-29 rollback.
- The rollback target was frozen to the exact live predecessor
  `1fd84ad2b3320dada4da7f58012d4311e5cd1639`.

## Post-deploy verification

| Gate | Result |
| --- | --- |
| Render exact identity | `dep-daaqncid0e5s739067tg` = `abe03ca3a836dffb10699c0c39883119e2a8f816`, `live` |
| Critical endpoint comparison | 27 `SAME`, 0 intentional change, 0 regression, 0 human review |
| Public health | `/api/health` HTTP 200 |
| Assisted-order regression sentinel | `/api/research/early-access/assisted-orders/config` HTTP 200, `enabled:true` |
| Rendered route matrix | 22/22 passed: 11 changed public routes at desktop and mobile viewports |
| Page structure | One visible `main`, one `h1`, expected copy, and no horizontal overflow in every case |
| Browser/runtime errors | 0 page errors and 0 observed 5xx responses in the rendered matrix |
| Render error logs | 0 application error logs from deploy start through 2026-08-31T16:39:59Z |
| Render 5xx request logs | 0 from deploy start through 2026-08-31T16:39:59Z |

The first browser sweep accepted 19/22 cases. The other three reached the live
site but the harness timed out waiting for `networkidle` or a full-page
screenshot. Those exact cases were rerun with bounded DOM-ready and viewport
screenshot checks and passed 3/3. This was a test-harness timeout, not a site
failure; the combined release result is 22/22.

Machine-readable evidence summary:
`docs/review/xenios-care-research-postlaunch-20260831/production-deploy-summary.json`.

## Care activation boundary

The approved State A Care + Research presentation is live. The deployment did
not change or override the separate production capability controls. Read-only
post-deploy configuration reports:

- Care capability: `enabled:false`, state `disabled`;
- Care portal: `care_unavailable`;
- Care scheduling: mode `disabled`, status `care_unavailable`.

Therefore the public copy is deployed while Care/Tebra technical handoffs
remain fail-closed. This record does not assert a clinical launch, provider
network activation, Tebra activation, prescription availability, pharmacy
action, or nationwide operational readiness.

## Mutation and rollback posture

No environment variable, migration, database, catalog authority, pricing
authority, payment, refund, account, invitation, clinical, pharmacy, supplier,
or external-communication mutation accompanied this deployment.

If a later regression requires rollback, the immediate predecessor is the
exact commit `1fd84ad2b3320dada4da7f58012d4311e5cd1639`. Any rollback remains a
new production mutation and requires current authority; this record does not
pre-authorize it.
