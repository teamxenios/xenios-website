# Xenios Ordering Readiness Candidate — 2026-09-23

## Exact candidate

- Branch: `codex/xenios-ordering-readiness-20260923`
- Candidate SHA: `79414143d4355d5d3d14cd5fe6e5a536dc68d99d`
- Candidate tree: `ca9d77ce95bede22b40315fa4cbcdee91de2312c`
- Base SHA: `7a2ca4a3a0ced8280ed60e2d06aa22254f0acba9`
- Remote verification: `origin/codex/xenios-ordering-readiness-20260923` resolves to the candidate SHA.
- Production mutation: none.

## Customer outcome

The customer payment surface now presents the complete accepted manual-payment list in canonical order: Zelle, Venmo, Cash App, PayPal, Apple Pay, ACH / Bank Transfer / Wire Transfer, and Other payment method.

Configured destinations, copy controls, URLs, amounts, and payment references remain intact. Any method without configured direct instructions displays an explicit contact fallback to Samuel at `737-418-6381` using `tel:7374186381`. The legacy internal identifier `apple_cash` remains unchanged for compatibility, while all customer-facing text says Apple Pay. No browser action settles an order; payment remains awaiting operator verification.

## Verification

- Payment and checkout UI: 63 tests passed across 6 files.
- Server payment configuration, mounted routes, manual-payment authority, assisted-order payment, account continuation, catalog access, and Care boundary: 259 tests passed across 11 files.
- TypeScript: `npm run check` passed on Node `20.19.0`.
- Production build: `npm run build` passed on Node `20.19.0`.
- Source scan: no customer source contains `Apple Cash` or `Other manual method`.
- Real-browser smoke against the built bundle:
  - 390 px and 1440 px catalog views rendered without horizontal overflow.
  - 22 catalog entries exposed explicit availability states rather than dead controls.
  - Care retained request, account, clinical-review, and support routes at desktop and mobile widths.
  - The isolated preview's agreement dependency intentionally failed closed, so it could not create an order; the payment panel itself is covered by the focused component and checkout-journey tests above.

## Release boundary

This is a pushed review candidate only. Do not deploy or mutate production until Samuel gives a new explicit production GO naming the exact candidate SHA.
