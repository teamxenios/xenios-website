# Xenios client account portal — review packet

This packet is a local, synthetic-data visual review for the dedicated branch
`codex/xenios-client-portal-catalog-20260826`. It is not a production capture,
does not use a real account, and performs no account, support, billing, catalog,
or messaging action.

## Capture matrix

| Surface | Desktop | Mobile |
|---|---|---|
| Account overview | `account-overview-desktop.png` | `account-overview-mobile.png` |
| Membership / subscription | `subscription-desktop.png` | `subscription-mobile.png` |
| Research + Care orders | `orders-desktop.png` | — |
| Care timeline | `care-timeline-desktop.png` | — |
| Priority catalog collection | `catalog-priority-desktop.png` | — |
| Pending exact variant | `pending-product-desktop.png` | — |
| Documents | `documents-desktop.png` | — |
| Support | `support-desktop.png` | — |
| Admin import dry run | `admin-import-desktop.png` | — |

The review entry is an owned-path nested Vite document at
`client/src/research/account-portal/review/index.html`. It is not a production
build input. `fixturesAllowed()` fails closed in production, and the review
entry imports only synthetic shared fixtures or synthetic counts created for
this packet.

## Verified review behavior

- Overview reflow passed at 1440, 1024, 768, 430, 390, 375, 360, and 320 CSS
  pixels with no page-level horizontal overflow or clipped surfaces.
- All nine review surfaces passed at 320 CSS pixels and at the 640 CSS-pixel
  equivalent of 200% browser zoom on a 1280-pixel baseline.
- Interactive buttons and button-style links remained at least 44 pixels tall.
- The PNG packet was captured from the local synthetic harness in one
  document-height viewport per image, avoiding scroll-stitch artifacts.

## Review constraints

- Product status is illustrative UI review data, not a catalog activation.
- Exact-variant placeholders remain pending and cannot render as live.
- Customer pages never render staff partner attribution.
- Membership, Care enrollment, provider review, and pharmacy fulfillment are
  separate projections.
- Document actions require authenticated bearer fetches; no raw storage URL is
  exposed.
- No raw source row, real person identity, real contact detail, client interest
  record, demand count, secret, token, or health-related detail appears in this
  packet. Any identity or contact detail shown is an explicitly synthetic fixture.

## Integration follow-ups

- The backend integrator owns the deferred customer-account route registration
  in `server/index.ts`.
- The global Research review gate and post-sign-in return-path allowlist do not
  yet recognize `/research/account/*`. Those integration changes sit outside
  this lane's route-only ownership and must be adjudicated before release.
- The protected server composition must add the customer-account router and an
  authorized document-download route before the mounted client routes can load
  production data or download documents.
- The account route family needs an explicit layout decision before release;
  the isolated review harness intentionally omits the current global chrome.
- Organization account routes remain parked until the governed Pack 02 schema
  work lands; the personal portal does not depend on organization reads.
