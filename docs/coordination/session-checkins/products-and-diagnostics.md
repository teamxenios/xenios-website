# Products and diagnostics session check-in

SESSION: WEBSITE 3 — Products / Diagnostics

EXACT BASE: `51a67326ed69f6795433026b2933e7d22acd2d9e`

EXACT HEAD: Unfrozen working candidate; exact SHA will be reported after the
bounded commit.

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

FORBIDDEN FILES:

- `server/index.ts`
- `client/src/App.tsx`
- `client/src/research/section.tsx`
- `client/src/research/adminx-section.tsx`
- `server/research/catalog/member-catalog-service.ts`
- `server/research/commerce/**`
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
- `docs/coordination/session-checkins/products-and-diagnostics.md`

MIGRATIONS: None.

ROUTES: None registered. Website 2 retains central route/composition ownership.
Pure server exports are `searchV3Catalog`, `autocompleteV3Catalog`,
`compareV3Catalog`, `getV3CatalogDetail`, `getV3ProductSeo`,
`v3ProductSitemapPaths`, `v3PublicSupplements`, and `searchV3Supplements`.

FOCUSED TESTS: PASS — 7 files / 29 tests at the latest checkpoint.

FULL TESTS: 3,784 passed, 3 failed, 1 skipped. The failures are out-of-scope
takeover-base checks: two 5-second release-control Git/snapshot timeouts and one
line-ending-sensitive admin-authority SQL assertion.

TYPECHECK: PASS.

BUILD: PASS with the existing dynamic-import and large-chunk warnings.

DIFF / SECRET / LEAK GATES: PASS — `git diff --check`; zero prohibited
owned-file changes; zero credential-pattern hits; zero `Northline`,
`source_reference`, `reference_sizes`, wholesale-list, or internal-sourcing
phrases in the built browser bundle.

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

NEXT DELIVERABLE (30–60 MINUTES): Re-run the final focused/type/build/diff and
leak/secret gates, capture responsive browser evidence for accessible routes
without fabricating an authenticated session, commit/push the bounded unit,
open one draft PR, post a strict SHA-pinned out-of-band JSON manifest, and
request Website 6 exact-SHA review.

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

TERMINAL STATE: ACTIVE_BOUNDED_UNIT
