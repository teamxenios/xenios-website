# Products and diagnostics check-in

SESSION: Website 3 — Products and Diagnostics

EXACT BASE: `fc07a9b123806765b383203baf4b534dc3574ed2`

EXACT HEAD: supplied in the SHA-pinned release manifest

BRANCH: `feature/website-3-pr109-livebase-sanitized`

WORKTREE: isolated clean reconstruction

OWNED FILES: the exact 18-path Website 3 catalog, supplement, SEO, UI, test, and check-in lease

FORBIDDEN FILES: shared routing and navigation, server registration, capabilities, commerce runtime, inventory, checkout, orders, migrations, and production configuration

CURRENT UNIT: supplier-independent Research discovery previews and member-only presentation

FILES CHANGED: exact lease only; final Git manifest is published out of band

MIGRATIONS: none

ROUTES: none

FOCUSED TESTS: PASS — 9 files / 134 tests

FULL TESTS: 219 files / 3,805 tests PASS, 1 skipped; one unchanged release-control test exceeded its 5-second limit in the parallel run and passed 30/30 with 1 skipped in isolation

TYPECHECK: PASS

BUILD: PASS with existing chunk and dynamic-import warnings only

BLOCKERS: every preview requires canonical Product Control identity, approved variant and SKU, current audience price, documentation, and operational readiness before transaction controls can exist. External pricing inputs remain inactive until canonical identity and readiness approval.

NEXT DELIVERABLE: frozen exact SHA, strict release manifest, leak evidence, and independent exact-SHA review

TERMINAL STATE: FROZEN_PUSHED_AWAITING_EXACT_SHA_QA

## Truthful catalog state

- Forty-nine discovery previews are present.
- Every preview remains `public_price_pending`.
- No numeric customer price is present.
- No preview supplies a variant or SKU.
- No preview is purchasable.
- The compatibility catalog exported to commerce is empty.
- Product Control remains the only authority for product, variant, SKU, current price, and release readiness.

## Wiring contract

The server preview, search, SEO, and supplement modules are pure projections. Shared route registration remains outside this unit. A later integration may expose these projections only behind the existing authenticated Research member boundary. It must continue to resolve transaction authority from Product Control and must not convert a preview identifier into a SKU.

## Pricing readiness

The existing canonical member catalog and detail surfaces already render an authoritative current audience price when Product Control supplies one. When no approved effective price exists, they display “Price not currently available” and expose no purchase control.

Loading approved customer prices requires a reviewed mapping for each exact product and variant, including:

- canonical product identifier
- canonical variant identifier
- approved SKU
- audience
- currency
- amount in minor units
- effective timestamp
- optional expiration timestamp
- price version
- approval state and approver
- readiness version

No external pricing input is stored or activated by this unit.
