# Products and diagnostics - sanitized current-main reconstruction

SESSION: WEBSITE 3 - Products / Diagnostics

EXACT BASE: `2891dcb9ded41e6007f636bf053cd090dcd16111`

EXACT HEAD: Published in the SHA-pinned release manifest after commit.

BRANCH: `feature/website-3-pr105-current-main-sanitized`

WORKTREE: Isolated clean reconstruction worktree.

OWNED FILES: Exact 18-path Website 2 lease covering the member catalog and
detail UI, supplement UI, V3 preview/search/SEO/supplement modules and tests,
two commerce fail-closed tests, and this check-in.

FORBIDDEN FILES: Shared routes, server registration, capabilities, migrations,
Product Control runtime, inventory, cart/checkout/order runtime, Care, and
production configuration.

CURRENT UNIT: Reconstruct the member discovery catalog from current-main,
customer-safe identities only. No prior feature commit, patch, or data blob is
part of this branch.

FUNCTIONAL RESULT:

- Exactly 49 unique discovery profiles.
- All 49 are `public_price_pending`.
- Zero approved numeric customer prices.
- Zero approved variants or compatibility SKUs.
- Purchase, cart, checkout, and order authority remain disabled.
- Member-only routes are `noindex,nofollow` and absent from the sitemap.
- Product and supplement surfaces use neutral Xenios Research language.
- Pending states use Request sourcing, Coming soon, or catalog-only behavior.

PRICE AUTHORITY:

An approved customer price can be loaded only after the canonical Product
Control mapping supplies:

- canonical `productId`
- exact profile key
- approved active `variantId`
- approved real `sku`
- confirmed presentation and unit
- purchase audience (`retail`, `member`, `professional`, or `wholesale`)
- `amountCents` and `currency`
- `effectiveAt` and optional `expiresAt`
- immutable price version
- approval state, approver, and approval evidence

All external pricing inputs remain inactive until canonical Product Control
identity and readiness are approved. This unit stores, displays, and enables no
candidate price.

MIGRATIONS: None.

ROUTES: None registered. Website 2 owns route and composition integration.

TESTS:

- Focused nine-file catalog/SEO/UI/commerce suite: PASS, 9 files / 83 tests.
- Adjacent authoritative-price projection audit: PASS, 6 files / 141 tests.
- Full suite: 219 files / 3,753 tests PASS; one production-state validator
  exceeded its five-second timeout under full parallel load.
- Isolated production-state validator: PASS, 30 tests / 1 skipped. The same
  unchanged historical-migration diagnostic is printed on success, proving no
  failed assertion or hidden skip was introduced by this unit.
- Typecheck: PASS.
- Production build: PASS with existing chunk warnings only.
- Diff, exact allowlist, secret, candidate-source, browser-bundle,
  rendered-output, robots and sitemap gates: PASS.

ROLLBACK: Source-only unit. Revert the single reconstruction commit on the
future integration branch; no database or production state is changed.

PRODUCTION MUTATION: None.

CURRENT BLOCKER: Independent exact-SHA Website 6 review and Website 2
integration authorization.

NEXT DELIVERABLE: Byte-preserving integration from the accepted exact SHA,
followed by Website 2 deployment and read-only live verification.

TERMINAL STATE: FROZEN_PUSHED_AWAITING_EXACT_SHA_QA
