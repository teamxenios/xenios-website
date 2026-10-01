# Product imagery v3 integration handoff

> Historical pre-v3 integration plan. Keep its no-image commerce-safety principle, but use the 420/419 imagery-branch baseline, the observed 424/423 core HL-11 candidate, the v3 Batch 0 evidence, and the current gates in `PRODUCT_IMAGE_CONTRACT.md`. This file does not authorize rendering, publication, runtime wiring, or production mutation.

## Current state

This lane is source-only. It does not edit shared cards, detail pages, API contracts, Product Control, cart selection, persistent-cart SQL, actions, prices, payment, release, or deployment code. The ten pre-v3 candidates have been removed from the public tree and preserved as permanently nonapprovable evidence. Batch 0 now contains 25 receipt-bound non-public PNGs, but zero assets are independently approved, public, or runtime-wired.

The artifacts are reconciled to primary `7600943f9ec7573f0a5cbfe7a7687ba851276a30`, tree `2fd41b918c8d77c5593319a6d921477f789b737e`, and the independent acceptance bar at `f4f899a7`. The acceptance commit and primary are divergent; only the review document is used as evidence. No commit from the review branch should be cherry-picked wholesale.

A read-only production observation at `2026-09-30T20:02:55Z` found zero Product Control media rows, zero approved primary rows, zero products with approved primary media, and zero objects in the governed product-media bucket. A second read-only check at about `2026-09-30T20:34Z` matched all 22 legacy PEX/R360 aliases and all 22 canonical GEN-GRP bindings to the committed identity closure with zero drift. These are observations, not durable approval authority. No production mutation occurred.

The ten quarantined WebP files are pre-v3 candidates. They have no named approval and no customer-surface reference, and their non-durable source evidence makes these exact bytes permanently nonapprovable. The founder v3 prompt is now checked in and hash-bound; Batch 0 is complete, and further rendering remains blocked on exact-SHA per-asset review and the current integration gates.

## Required order of work

### 1. Remove image readiness from commerce

This is a prerequisite, not part of visual polish. Current TypeScript and persistent-cart SQL use approved primary media as a cart or readiness input. A separately leased slice must make media display-only and prove that media absent, pending, rejected, ambiguous, or approved produces the same action, price, workflow mode, row inclusion, and cart eligibility.

Expected seams include:

- `shared/research/product-admin.ts`
- `shared/research/cart-product-selection.ts`
- `server/research/commerce/cart-product-selection.ts` and tests
- `server/research/catalog/member-catalog-projection.ts` and tests
- `client/src/research/adapters/cartProductSelection.ts` and tests
- `client/src/research/adapters/memberCatalog.ts` and tests
- `server/research/master-offerings/direct-commerce-selections.test.ts`
- `server/research/commerce/persistence/persistent-cart.ts` and tests
- a timestamped persistent-cart SQL candidate, verification, migration registry, and DAG update

The SQL must remove the product-media join and lock from selection authority, require only the structured commerce facts, and tolerate but ignore a legacy primary-image reference. Applying the SQL is a production mutation and requires Samuel's current explicit approval.

### 2. Reconcile the founder v3 prompt and approve bytes

Attach and checksum the founder v3 prompt. Rerender the candidates under that contract while preserving durable source evidence. The current ten exact byte sets cannot be promoted. Each future published byte set needs a named approver, UTC time, full SHA-256, rights evidence, identity scope, and illustrative notice. Provisional assets must not enter a runtime manifest.

### 3. Add one presentation resolver and component

Use one client-only presentation layer. Do not add image fields to strict catalog API allowlists and do not make an image field required.

Recommended owned files:

- `client/src/research/product-imagery/productImageManifest.generated.ts`
- `client/src/research/product-imagery/resolveProductImage.ts`
- `client/src/research/product-imagery/resolveProductImage.test.ts`
- `client/src/research/product-imagery/CatalogProductImage.tsx`
- `client/src/research/product-imagery/CatalogProductImage.test.tsx`

The generated runtime manifest contains approved entries only. It is keyed by `mov_*` and includes only the minimum identity aliases needed by the browser. The component accepts a resolver descriptor, never an arbitrary href.

Resolution order:

1. approved exact `mov_*` asset
2. approved category or form fallback
3. intentional form-neutral non-image panel

On the first load error, swap to the approved fallback. On a second error, remove the `<img>` and show the non-image panel. Reset error state when the descriptor changes. Reserve intrinsic 1:1 dimensions, use `loading="lazy"` and `decoding="async"` for list views, and never filter a row because resolution failed.

## Identity contract

Canonical all-products surfaces resolve by `mov_*`. Featured resolves its exact legacy Product Control variant UUID or exact PEX/PEP plus R360 pair through the 22-row crosswalk. A Product Control product UUID alone is forbidden because PEX-001, PEX-003, and PEP-009 each have multiple variants.

Every mapped Featured row must resolve to byte-identical asset ID, href, alt text, width, height, and illustrative notice as its canonical row. Every supplied canonical, Product Control, legacy UUID, and PEX/R360 identifier must converge on one `mov_*`; an incomplete, unknown, or conflicting identity fails closed to the visual fallback. It never creates a new catalog row.

## URL and delivery contract

Only same-origin immutable paths are allowed:

`/research/products/fallbacks/<semantic>-<sha12>.webp`

`/research/products/exact/<semantic>-<sha12>.webp`

Reject a remote host, query, fragment, token, traversal, unhashed filename, `/storage/v1/object/sign/`, or a path outside this prefix. Stop member catalog reads from producing five-minute signed presentation URLs once the static resolver is adopted. Keep Product Admin media upload and review as an evidence system; it must no longer be a display or commerce authority.

Add static-server tests proving GET and HEAD return exact WebP bytes for a deep approved path and that a missing deep image returns a real 404 or non-image response, never the SPA HTML shell. Add core-site-protection tests proving `client/public/research/products/` is allowed while `client/public/products/` remains protected.

## Bounded surface plan

### Early Access Featured

Files:

- `client/src/research/early-access/EarlyAccessProductCard.tsx`
- `client/src/research/early-access/EarlyAccessProductCard.test.tsx`
- `client/src/research/early-access/EarlyAccessRoute.storefront.test.tsx`

The card currently has an explicit no-product-photography comment and a test that requires zero media. Reverse that policy deliberately. Cite the founder scope change dated 2026-09-30 in the code comment and replace only the product-card assertion with `reviewed illustrative image or truthful fallback` behavior. Do not delete the no-image assertions for customer forms, order summaries, or payment selectors; those components have no product-identity thumbnail requirement.

Do not make `imageState` carry the fallback. It remains exact-media authority. Fallback display is separate.

### All products assisted-order catalog

Files:

- `client/src/research/assisted-order/AssistedOrderPage.tsx`
- `client/src/research/assisted-order/AssistedOrderPage.test.tsx`

Resolve by the canonical offering variant first, then the exact canonical Product Control variant alias. Test that image failures do not change price, action label, workflow mode, selectable state, or row count.

### Canonical master-offerings card and detail

Files:

- `client/src/research/master-offerings/MasterOfferingCard.tsx`
- `client/src/research/master-offerings/MasterOfferingDetail.tsx`
- existing full-catalog, detail, exact-variant, accessibility, and mobile-reflow tests

Card and detail must resolve the same `mov_*` key. Selected detail identity remains explicit. The current card contract must not drop a row when imagery is missing.

### Routed member product card and detail

Files:

- `client/src/research/products-diagnostics/MemberCatalogExperience.tsx` and test
- `client/src/research/products-diagnostics/MemberProductDetailExperience.tsx` and test
- member catalog service, routes, and adapter tests needed to remove signed presentation URLs

Stop rendering signed `product.media.href` values. Use the static resolver. Feed valid legacy signed URLs in tests and prove that no rendered image or serialized catalog response contains `/storage/v1/object/sign/`, a token, a query, or `expiresAt`.

### Member supplements

Files:

- `client/src/research/catalog-display/CatalogGrid.tsx` and test
- `client/src/research/catalog-display/ProductDetail.tsx` and test
- `client/src/research/products-diagnostics/CareAndSupplementsExperience.tsx` and test

Use an exact canonical alias when present; otherwise use an approved form or form-neutral fallback. Do not fabricate supplement packaging.

### Deferred surfaces

Do not broaden the first integration to the unavailable `/products/:slug` route, Kris, account interests, goals, carts, orders, storage, admin tables, or optional wizard review thumbnails. Add them only after the canonical resolver is live and the current surface has browser evidence.

## Required tests

- 424 canonical keys, 423 customer rows, one excluded fee, zero missing ledger rows, six new identities intentionally unbound, and two superseded identities archived
- 22 Featured aliases, 19 legacy products, zero duplicate or orphan identity
- canonical UUID and legacy PEX/R360 lookup resolve to the same `mov_*` and same presentation
- swapped manifest key mutation fails
- missing or invalid identity produces a fallback and does not increment dropped rows
- source hash drift requires explicit regeneration
- every runtime URL is same-origin, content-hashed, query-free, token-free, and under the exact allowed prefix
- first load failure swaps to fallback; second failure removes the broken image
- image presence, absence, approval, and failure do not change price, action, workflow, cart, availability, fulfillment, or release
- Care, held, quote, Coming soon, unknown form, and shipping retain distinct truthful text treatments
- no forbidden claim appears in alt text or pixels
- card, detail, Featured, and all-products projections agree on identity

## Browser and release evidence

After named approval and a separately authorized deployment, inspect 320, 390, 768, and 1440 pixel widths plus keyboard behavior. For every rendered image, require `naturalWidth > 0`, reserved geometry, allowed same-origin hashed source, and truthful alt behavior. Walk all 423 customer rows and all 22 Featured aliases. Record zero blank images, zero broken images, and zero signed URLs.

Until all prerequisites are complete, the correct state is: complete source ledger, complete identity crosswalk, 25 non-public receipt-bound Batch 0 assets, ten quarantined pre-v3 candidates, zero approved exact assets, zero runtime references, and no deployment.
