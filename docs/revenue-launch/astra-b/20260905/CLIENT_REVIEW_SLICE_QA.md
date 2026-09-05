# Canonical client review: local slice verification

This is component/slice evidence, not an integrated release-candidate acceptance.
The tested changes are the canonical Product Control price display/form validation
and product-list review filters. Shared/server authority is unchanged by this slice.

## Automated checks

On 2026-09-05, using pinned Node 20.19.0 and the existing lockfile:

- Price review/form/actual product page tests: 59 passed.
- Product-list filters/actual adapter/admin boundary tests: 35 passed.
- Parent rerun of both files plus canonical quantity-tier tests: 120 passed in
  three files, exit 0 (23.61 seconds).
- Repository TypeScript check (`tsc --noEmit`): exit 0.
- Client/server build: exit 0. Existing mixed static/dynamic admin imports and
  large-chunk notices remain warnings, not silently waived release gates.
- Independent read-only peer review of the three price files found no blocking
  regression in exact cents, identity, malformed tiers, dates, auth or mutation boundaries.

The tests include exact authenticated GET filter parameters, clear/reset and
pagination behavior, 401/403/503 and other read-failure states, stale-row hiding,
preserved explicit draft-create payloads, visible approval refusal, malformed
canonical tiers without scalar fallback, and no writes triggered by rendering.
The scalar draft form still calls the existing server API; it does not import
Seth prices, create tier batches, schedule or activate anything.

## Local browser evidence: pure price review

The checked-in `price-review-fixture.html` / `.tsx` files are synthetic QA assets
outside the application entry graph. They import the actual component, stylesheet
and pinned same-origin fonts. No production source records, sign-in, remote API,
tracking, mutation controls or live account data are used. They are not a public
route and must not be mounted in the application.

Serve with the normal client-root Vite configuration, bound only to loopback:

```text
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4176 --strictPort
http://127.0.0.1:4176/@fs/<absolute-repo-path>/docs/revenue-launch/astra-b/20260905/price-review-fixture.html
```

The fixture imports the installed React plugin's preamble because Vite serves
`/@fs/` HTML without its usual HTML transform. Do not change Vite's root to this
docs folder: doing so excludes the actual client utility classes from scanning.
Both harness-loading issues were corrected before the accepted measurements.

| Requested viewport width | Content width (15px scrollbar) | Horizontal overflow | Canonical tier rows |
| --- | --- | --- | --- |
| 1440 | 1425 | None | 3 |
| 1366 | 1351 | None | 3 |
| 1024 | 1009 | None | 3 |
| 768 | 753 | None | 3 |
| 430 | 415 | None | 3 |
| 390 | 375 | None | 3 |
| 375 | 360 | None | 3 |
| 360 | 345 | None | 3 |
| 320 | 305 | None | 3 |

The DOM checks verified document width and main/card/heading/fact/tier/select
bounds, three exact thresholds (1/5/10), and actual block styling after utility
scanning. Settled 320px screenshots showed readable wrapped long SKU/IDs and
fact labels. Browser screenshot capture is limited by the physical app panel at
large virtual widths; desktop-wide measurements are DOM evidence, not a claim of
full-width screenshot coverage. Temporary viewport overrides were reset.

At 320px, selecting every synthetic scenario verified:

- Malformed ladder: unavailable, zero tier rows, no scalar fallback.
- Empty history: explicit empty message, no approved-price inference.
- Unbound variant: unavailable, zero tier rows.
- Legacy scalar: one explicitly identified scalar row.
- Canonical ladder: three recorded rows with exact integer-cent unit amounts.

All five states had no horizontal document overflow and no mutation buttons in
the pure presentation. These are not live supplier, payment or pricing facts.

## Still required at integration

Full authenticated browser journeys, product-list filter browser layout, real
backend reconciliation projection, batch review/scheduling, nine-width integrated
QA, quantity/version binding through checkout/orders, operational readiness and
the complete exact-SHA release gates remain separate unfinished work. No price,
product, supplier, inventory, payment or production approval is established by
this local review. No production state changed.
