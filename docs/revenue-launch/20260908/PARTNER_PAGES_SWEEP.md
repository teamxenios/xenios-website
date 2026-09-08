# Partner pages — rendered empty-state sweep, 2026-09-08

**PASS on the sweep's own assertions: 30 steps, 0 failures, exit 0**, observed
2026-09-08T02:36:24Z — and **two real findings** the sweep's first assertion
would have hidden, caught by a stricter re-measurement. Author: Claude, as
the available test owner during the Codex outage. **Claude's own run, not an
independent review.**

## What ran

`partner-pages-sweep.mts` (SHA-256 `8ebc0688…`) on the pinned Node 20.19.0
against the candidate's built client at branch head `8cfd273d…`, runtime
freeze `bf7b5fe`. Chromium 149.0.7827.55 headless, real CDP input. Server: the
**real** `registerPartnerPortalApi` over `createInMemoryPartnerPortalPort`
with the preview personas and **no rows**, mounted in front of the existing
preview composition (whose route boundary would otherwise 404 these APIs).
The preview's own fixtures answer `/partner/me` and `/partner/dashboard`.

Signed in as the active affiliate persona, every partner page was opened at
1440 px and 320 px: dashboard, links, campaigns, events, leads, conversions,
commissions, payouts, organizations, training, resources, compliance,
support, security. Per page and width: exactly one `<main>` landmark, an
`<h1>`, no page exceptions, no API 5xx, a full-page capture. Twenty-eight
captures hashed in `partner-pages-sweep-captures.sha256.txt`; the full record
with every API call and status per page is `partner-pages-sweep-8cfd273.json`.

## What the pages did

| Page | Real API answered | Rendered state |
| --- | --- | --- |
| dashboard | `/partner/dashboard` 200 (preview fixture) | Affiliate active, zero activity |
| links | `/partner/links` **404** (referral route is not mounted in this harness) | Honest alert "The recommendation service is not available right now" with a Refresh control — the QR walkthrough covers this page with the real route |
| campaigns, events, leads, conversions, commissions, organizations, compliance | each `/partner/<page>` 200, empty | Empty states with their explanatory copy; compliance shows "No content review rows were returned for this account. This does not confirm complete history or approval to use content." and the review-request form |
| payouts | `/capabilities` **404** (outside the preview boundary) | "Provider connection pending — Partner payouts are being configured", read-only |
| training | `/partner/training` 200, empty | Module list with nothing completed |
| resources | `/partner/resources` 200, empty | Empty library with usage-label legend |
| support | none beyond session probes | Static support page |
| security | `/partner/security/sessions` 200, empty | Account security, no sessions listed |

Console across all 28 loads: only Chromium's `apple-mobile-web-app-capable`
deprecation warning. Network boundary violations: zero.

## Two findings at 320 px

The sweep's overflow check compared `scrollWidth` to `innerWidth` under
mobile emulation. On two pages both grew together — Chrome widened the
layout viewport to fit content instead of overflowing — so the check passed
while the page did not fit. A strict re-measurement at 320/360/390 px with
no mobile emulation (`strict-viewport-overflow.json`,
`strict-viewport-culprits.json`) found:

| Page | 320 px | 360 px | 390 px | Cause |
| --- | --- | --- | --- | --- |
| **Training** | `scrollWidth` 370, **+50 px** | 370, **+10 px** | fits | every module card (`div.card.flex.flex-wrap.items-start`) lays out at 354 px; its flex row does not shrink below content |
| **Support** | `scrollWidth` 329, **+9 px** | fits | fits | the primary button "Email team@xeniostechnology.com" is `white-space: nowrap` at 288 px |

Both pages remain usable — a phone zooms out slightly — and every other
page fits 320 px exactly. These are small responsive defects in reviewed
code inside a frozen candidate; Claude has **not** changed source. They are
for the owner to disposition: fix after the freeze, or accept for this
release with the numbers above on record. (In the culprit file, the letter
"s" is missing from captured text snippets; that is an escaping artifact of
the probe's own text capture, not the page.)

## Visual inspection

Claude looked at `compliance-1440.png` and `payouts-320.png`: the compliance
rules, hard lines, empty review history and submission form render as
designed; the payouts pending card stacks cleanly at 320. The other 26
captures were measured, not individually inspected.

## What this does not prove

Populated states (rows, commissions, payouts, sessions), any write (campaign,
event or organization requests; compliance submissions were disabled), the
Links page's real referral route (see `QR_LINKS_WALKTHROUGH.md`), real
accounts, database or production, and independent review.
