# Client-account final integration — integrated browser QA packet

Captured: 2026-08-27, branch `integration/xenios-client-account-final-rc-20260826`.

**What this is.** Real-browser evidence over the INTEGRATED production-shaped
application — not the isolated Codex review harness. The production SPA bundle
(`node script/build.mjs` output) is served behind the real research page gate,
the real `/api/research` allowlist wall (`registerResearchApi`), and the real
`registerCustomerAccountApi` route table. Authentication and account data are
synthetic on purpose (see `scripts/preview-account-portal.ts`: a GoTrue-shaped
local stub with three fixture personas, the shared synthetic memory seeds, and
the REAL audited catalog-priority projection read from
`config/research/*.json`). Early Access flows ran on the hotfix's own
`scripts/preview-step1-hotfix.ts` harness from the reconciled lineage. Browser:
headless Edge 151 driven over CDP; per-check facts in `qa-log.json`. No
production system, database, provider, or real customer was touched.

## Flows proven (see qa-log.json for the exact assertions)

1. Logged-out visit to `/research/account/orders` → `/research/sign-in?returnTo=%2Fresearch%2Faccount%2Forders` (no reviewer password page) — `01`
2. Password authentication through the runtime-config auth seam — `02`
3. Return to the EXACT requested account route after sign-in — `02`
4. Account overview: identity, membership, next administrative action, recent activity — `03`
5. Membership/subscription: honest **Manual / offline** billing, Care kept separate — `04`
6. Orders: rich persona (XRR/XEA fixtures with payment/fulfillment/tracking states) and empty persona ("No Research orders…") — `02`, `12`
7. Care status page (enrolled fixture timeline; production careFor stays honestly not-enrolled) — `05`
8. Documents: owner byte download **200 application/pdf**; foreign/unknown id **404**; unauthenticated **401** — `06`
9. Support: real form submit → case appears open in the member's own list — `07`, `15`
10. Priority catalog: "Current availability priorities" — statuses from the audited overlay (2 LIVE, 6 REQUEST ONLY, 1 DOCUMENTATION PENDING) — `03`, `08-*`
11. Pending products: 13-item activation queue (10 DOCUMENTATION PENDING, 3 UNAVAILABLE), "No demand counts shown", no partner identity anywhere — `03`
12. Early Access catalog unlock + all four pathway presentations (direct, request-only, Continue through Care, unavailable/held) — `20`, `21`
13. Request Order: add to order request, quantity 101 → authoritative 100 ceiling — `22`
14. Care routing link present from the EA catalog — `21`
15. Sign-out: portal → `/research`, account routes locked again; EA sign-out re-locks with fresh state — `11`, `24`
16. Re-authentication as a second persona with exact return — `12`, `13`

Persona states: active+rich, active+empty, and inactive membership
(`/research/access-state?code=membership_inactive`, never portal content) — `14`.

## Responsive

`document.scrollWidth <= clientWidth` verified at **1440 / 1024 / 768 / 430 /
390 / 375 / 360 / 320** CSS px on the overview (the heaviest page), 430/320 on
orders, 390/320 on the EA catalog, and at the **200% zoom equivalent**
(720×450 CSS at deviceScaleFactor 2). All pass; screenshots `08-*`, `09-*`,
`10`, `23-*`.

## Screenshot index

| File | State |
|---|---|
| 01 | Logged-out account deep link → sign-in with exact returnTo |
| 02 | Orders, rich persona, 1440 |
| 03 | Overview, rich persona, 1440 (availability priorities + activation queue) |
| 04 | Subscription/membership, manual billing |
| 05 | Care status |
| 06 | Documents (authorized download available) |
| 07 | Support |
| 08-{1440,768,390,320} | Overview responsive sweep |
| 09-{430,320} | Orders mobile |
| 10 | Overview at 200% zoom equivalent |
| 11 | After sign-out: account locked again |
| 12, 13 | Empty persona: honest empty orders + overview |
| 14 | Inactive membership → access-state screen |
| 15 | Support case submitted and listed open |
| 20–24 | Early Access: locked, catalog (1440/390/320), after add-to-request, after sign-out |
