# Products and diagnostics session check-in

SESSION: WEBSITE 3 — Products / Diagnostics

EXACT BASE: `51a67326ed69f6795433026b2933e7d22acd2d9e`

EXACT HEAD: Reported in the SHA-pinned PR manifest after the bounded commit;
this file does not self-reference its containing commit.

BRANCH: `feature/website-3-v3-products-catalog`

WORKTREE: `C:\Users\sboad\projects\wt-website-3-v3-products`

OWNED FILES:

- `content/research-products/**`
- `server/research/catalog/v3-*`
- `server/research/catalog/search-*`
- `server/research/catalog/*seo*`
- `client/src/research/products-diagnostics/**`
- `client/src/research/pages/Supplements.tsx` and focused tests
- this Website 3 session check-in
- assertions/fixtures only in `server/research/commerce/production-deps.test.ts`
  and `server/research/commerce/production-wiring.test.ts`

FORBIDDEN FILES:

- `server/index.ts`
- `client/src/App.tsx`
- `client/src/research/section.tsx`
- `client/src/research/adminx-section.tsx`
- `server/research/catalog/member-catalog-service.ts`
- `server/research/commerce/**`, except the two assertions/fixtures-only test
  files explicitly leased above
- central routes, capabilities, commerce composition, migration ledger
- inventory mutation, cart persistence, checkout, orders, fulfillment
- Care and clinical files

CURRENT UNIT: Complete and freeze the bounded V3 supplier-independent
products/catalog/diagnostics unit: all 49 preview identities; server-safe
search/filter/sort/compare/detail projections; product SEO; truthful
quality/COA/storage/evidence states; all 62 committed supplement candidates;
responsive member catalog/detail/supplement UI; no invented operational facts.

FILES CHANGED:

- `client/src/research/pages/Supplements.tsx`
- `client/src/research/products-diagnostics/MemberCatalogExperience.test.tsx`
- `client/src/research/products-diagnostics/MemberCatalogExperience.tsx`
- `client/src/research/products-diagnostics/MemberProductDetailExperience.test.tsx`
- `client/src/research/products-diagnostics/MemberProductDetailExperience.tsx`
- `client/src/research/products-diagnostics/V3SupplementCatalogExperience.test.tsx`
- `client/src/research/products-diagnostics/V3SupplementCatalogExperience.tsx`
- `server/research/catalog/v3-catalog-search.test.ts`
- `server/research/catalog/v3-catalog-search.ts`
- `server/research/catalog/v3-preview-catalog.test.ts`
- `server/research/catalog/v3-preview-catalog.ts`
- `server/research/catalog/v3-product-seo.test.ts`
- `server/research/catalog/v3-product-seo.ts`
- `server/research/catalog/v3-supplement-catalog.test.ts`
- `server/research/catalog/v3-supplement-catalog.ts`
- `server/research/commerce/production-deps.test.ts`
- `server/research/commerce/production-wiring.test.ts`
- `docs/coordination/session-checkins/products-and-diagnostics.md`

MIGRATIONS: None.

ROUTES: None registered. Website 2 retains central route/composition ownership.
Pure server exports are `searchV3Catalog`, `autocompleteV3Catalog`,
`compareV3Catalog`, `getV3CatalogDetail`, `getV3ProductSeo`,
`v3ProductSitemapPaths`, `v3PublicSupplements`, and `searchV3Supplements`.

FOCUSED TESTS: PASS — 9 files / 82 tests for the complete bounded correction,
including the two explicitly leased legacy-commerce assertion suites. The
adjacent price-surface audit also passes 7 files / 155 tests across member
catalog, detail, cart selection, cart, checkout, and orders.

FULL TESTS: 3,785 passed, 3 failed, 1 skipped. No remaining failure is caused by
this correction. The unchanged local-environment failures are two 5-second
release-control Git/snapshot timeouts and one CRLF-sensitive admin-authority SQL
assertion. The exact starting head passed GitHub test/typecheck/build, and the
failing test/source blobs are unchanged from that head.

TYPECHECK: PASS.

BUILD: PASS with the existing dynamic-import and large-chunk warnings.

DIFF / SECRET / LEAK GATES: PASS — `git diff --check`; exact 18-file allowlist;
zero credential-pattern hits; zero `Renew 360`, `Northline`,
`source_reference`, `reference_sizes`, `Official Source URL`,
`Supplier / Reseller State`, or private-reference phrases in the built browser
bundle. Supplier-only source fields remain server-side input keys and are not
projected into member/server output.

BROWSER: PASS at the signed-out Research access boundary at 1440, 720, 375,
and 320 CSS pixels: exactly one `main` and one `h1`, labeled access control,
zero horizontal overflow, zero off-screen focusable controls, zero internal
source phrases, and no console warnings/errors. The focused access field uses
the existing visible purple focus border. Authenticated member rendering is
not claimed because no authorized existing session was available and none was
fabricated. The 720 layout and fixed-width regression checks cover the 200%
reflow boundary without browser zoom mutation.

BLOCKERS:

- No verified public price, Product Control variant/SKU, Website 4 inventory
  eligibility, exact lot/COA, media rights, storage/shipping facts, or launch
  approval exists for the 49 profiles. The software therefore remains
  fail-closed and uses Notify me / Request sourcing states.
- The 62 supplement candidates confirm no final format, size/count, flavor,
  price, SKU, subscription, supplier relationship, testing, or pairing. These
  fields remain explicitly pending.
- Central route/composition wiring is Website 2-owned and intentionally absent
  from this unit.

AUTHORITATIVE PRICE READINESS:

- Member catalog cards already render the exact server-supplied
  `product.price.amountCents` and `currency`; a null price renders
  `Price not currently available`.
- Member product detail already renders the exact selected approved variant
  price; a null price renders `Price not currently available`, and no approved
  variant renders the required-variant pending state.
- Cart selection resolves one exact product + variant + authorized audience +
  currency + approved/effective price identity server-side. Cart stores no
  browser price and re-resolves it; unpriced lines remain non-checkout-ready.
- Cart, checkout review, and order detail/confirmation render only
  server-calculated unit, line, subtotal, shipping, credit, and total amounts.
  The adjacent 155-test price audit passes. No surface uses a supplier cost,
  wholesale source field, zero, or an invented fallback.
- The 49 V3 profiles still have `public_price_pending`; the 62 supplement
  candidates contain no approved customer-price field. Existing internal
  source-cost fields are not authoritative customer prices and must never be
  projected.

FOUNDER CANDIDATE INPUT:

- Samuel supplied `Quantum EV/cell factors` at USD `$1,800 per vial`.
- This is recorded only as external candidate input. It is not mapped,
  published, persisted, or commerce-enabled because the current profile is
  `Quantum Foundational Reset` / `xn-quantum-foundational-reset`, the exact
  product identity is unresolved, and the audience tier is unspecified.
- Required mapping fields: canonical Product Control `productId`, exact
  `productCode`/profile key, approved active `variantId`, real approved `sku`,
  presentation/unit (`vial`) confirmation, purchase audience (`retail`,
  `member`, `professional`, or `wholesale`; never `compare_at`),
  `amountCents=180000`, `currency=USD`, `effectiveAt`, optional `expiresAt`,
  price version, approval status, approver, and approval note/evidence.

SMALLEST NEXT PRICE LEASE:

- No client price-display rewrite is required for catalog/detail/cart/checkout
  or orders; those surfaces are already server-price ready.
- For bulk founder input across all 49 profiles, lease only a new approved
  identity/price input record plus a server-only Product Control mapping/import
  validator and focused tests, for example:
  `content/research-products/v3-approved-price-matrix.json`,
  `server/research/catalog/v3-product-control-price-import.ts`, and
  `server/research/catalog/v3-product-control-price-import.test.ts`.
  The input must contain the exact fields listed above and must create draft or
  reviewable Product Control commands—not code-backed public prices or seeds.
- Relevant supplements require a separate exact lease for
  `server/research/catalog/v3-supplement-price-projection.ts` and its test plus
  the existing `V3SupplementCatalogExperience` source/test. It must read
  approved/effective Product Control prices only; missing prices remain Coming
  Soon / Request sourcing.

NEXT DELIVERABLE: Independent Website 6 exact-SHA review of the frozen PR #105
replacement. No merge or production action is authorized.

FROZEN HANDOFF FORMAT:

```text
SESSION:
BASE SHA:
FROZEN HEAD SHA:
BRANCH:
PR:
TREE SHA:
EXACT FILES:
ROUTES:
MIGRATIONS:
SERVER EXPORTS:
CLIENT EXPORTS:
SOURCE COMPLETENESS:
FOCUSED TESTS:
FULL TESTS:
TYPECHECK:
BUILD:
DIFF CHECK:
SECRET/INTERNAL-SOURCE LEAK CHECK:
BROWSER 1440/720/375/320/200%:
ACCESSIBILITY:
REAL INPUTS STILL MISSING:
ROLLBACK:
PRODUCTION MUTATION:
TERMINAL STATE:
```

TERMINAL STATE: FROZEN_PUSHED_AWAITING_EXACT_SHA_QA
