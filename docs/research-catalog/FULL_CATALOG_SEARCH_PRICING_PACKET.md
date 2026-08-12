# Full Catalog, Search and Pricing (pack 03)

**Base:** `851d4b05af86ad46d780df267bbd9337d0dafa39` (frozen Catalog Foundation)
**Branch:** `lane/pack03-full-catalog-search-pricing`
**Worktree:** `C:\xenios-wt\pack03-catalog`
**Lane:** BUYER-A, catalog display, search and pricing
**Posture:** isolated, unmounted, undeployed, no production mutation

`REBASE_OR_RECREATE_REQUIRED`. This work sits on the Catalog Foundation, which is a
sibling of the accepted Early Access candidate. It must be recreated or rebased onto
`FINAL_EA_FAST_FOLLOW_BASE` and re-proved before integration.

## What this pack adds

The foundation already had the member-safe catalog, search, filters, pagination, the
truthful display states, the Product Control action adapter, and the product-request
adapter. It deliberately had no price anywhere except inside a resolved `Add to Cart`.

This pack adds the buyer's view of price, and the pieces the directive named that the
foundation had not built:

| Deliverable | Where |
| --- | --- |
| Approved pricing projection | `server/research/master-offerings/price-authority.ts` |
| Price summary and variant rows | `server/research/master-offerings/price-projection.ts` |
| Full buyer price view on card and detail | `shared/research/master-offerings/pricing-contract.ts`, `customer-projection.ts` |
| Strengths and variants visible while browsing | `MasterOfferingCardView.variants` |
| Download and export price list | `price-list-export.ts`, `routes.ts` price-list handler |
| Manual Early Access purchase CTA | `action.ts`, `product-request-adapter.ts`, `visibility-policy.ts` |
| Full catalog client surface | `client/src/research/master-offerings/` |
| All member-safe offerings viewable | `catalog-completeness.test.ts` |

## The pricing boundary

There is exactly one path from a catalog row to a displayed price:

```text
planning variant
  -> read-only exact binding (no create, update, or delete method on the interface)
  -> Product Control product and variant
  -> the existing AuthoritativePriceResolver
  -> one approved, active, in-window price row
```

Every other outcome renders `Price on request`. No binding, no price. No approval, no
price. Ambiguity, no price. A thrown error, no price. `price-authority.ts` holds no
amount of its own and has no fallback branch that could produce one, so "do not invent
prices" is a property of the code rather than a promise about it.

Today the foundation reports **0 Product Control bindings**, so today every row of the
catalog and every row of the export reads `Price on request`. That is the correct and
truthful output, and it will start showing prices the moment Product Control binds and
approves an exact variant. Nothing else has to change.

**Display authority is still not commerce authority.** A price can be visible while the
variant is not purchasable, and `catalog-pricing.test.ts` pins exactly that case: a
priced, bound variant whose Product Control selection was refused still resolves to
`Request Access`, not `Add to Cart`. Cards carry prices and carry no action at all; only
the detail surface resolves one action for one exact variant.

## Search, filters, strengths and states

Unchanged from the foundation, with one refactor: the filter and sort pass is now
`matchMasterOfferings`, and `selectMasterOfferings` pages it. The export and the
completeness gate read the unpaged form, so the paged and unpaged views cannot disagree
about what a filter means.

Strengths are now visible while browsing. `MasterOfferingCardView.variants` carries each
variant's label, its truthful state in words, and its price, with no action attached.

## Price list export

```text
GET /api/research/catalog-display/v2/price-list?q=&families=&states=&format=csv|json
```

- Same gate as the catalog: display flag, authenticated member or admin, founder/admin
  launch scope, private and `noindex` headers.
- Same closed filter vocabulary. Paging keys are rejected, because a price list is the
  whole match set or an explicit refusal, never a page of one.
- One row per member-safe variant. Admin-only offerings and admin-only variants never
  appear.
- `Price on request` where no approved price exists. The amount column is empty, never
  `0`: a missing price is not a free product.
- Refuses with `413 master_offerings_export_too_large` above the row ceiling rather than
  truncating. A truncated price list reads as "this is everything".
- CSV is RFC 4180, CRLF terminated, with a formula-injection guard: a catalog name
  beginning `=`, `+`, `-`, `@`, tab, or carriage return is prefixed so a downloaded file
  executes nothing when it is opened.
- The row type in `pricing-contract.ts` is the whole privacy surface, and
  `assertNoPrivateFields` is the runtime backstop. No supplier, owner, wholesale cost,
  planning price, margin, markup, source SKU, source row, canonical key, or Product
  Control identifier can cross it.

## Manual Early Access purchase CTA

A new action kind, `request_early_access_purchase`, for the case the directive named:
a member-safe variant that is available now and has no direct purchase authority. The
buyer asks to buy, and a named human completes it. It creates no cart, no order, no
payment, and no quantity commitment; it routes into the existing product-request domain
with intent `early_access_purchase` and timing `asap`.

It is reached only after the exact `CartProductSelection` check has already declined, so
it can never shadow or weaken a real `Add to Cart`. It appears on no other display state,
and on no admin-only offering or variant.

It is **off by default**, behind:

```text
RESEARCH_MASTER_OFFERINGS_MANUAL_PURCHASE_REQUESTS=true
```

Fail closed on anything other than an exact `true`. It is buyer-facing copy that promises
a person will pick the request up, so switching it on is a decision, not a default.

## Environment flags

| Flag | Effect | Default |
| --- | --- | --- |
| `RESEARCH_MASTER_OFFERINGS_ENABLED` | v2 catalog and price list reachable | off |
| `RESEARCH_MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY` | `false` widens display to all active members | founder and admin only |
| `RESEARCH_FULL_CATALOG_MEMBERS` | exact-email allowlist for founder and early members | existing |
| `RESEARCH_MASTER_OFFERINGS_MANUAL_PURCHASE_REQUESTS` | manual Early Access purchase CTA | off |

None of these changes action kind, Product Control readiness, quantity, or a regulatory
or provider hold.

## Route census delta

| Surface | Current | Candidate |
| --- | --- | --- |
| v2 catalog list | prepared, unmounted | `/api/research/catalog-display/v2/catalog` |
| v2 catalog detail | prepared, unmounted | `/api/research/catalog-display/v2/products/:family/:slug` |
| v2 price list | **new, prepared, unmounted** | `/api/research/catalog-display/v2/price-list` |

`routes.ts` contains zero Express registration calls, and no composition root imports it.
`server/index.ts`, `server/routes.ts`, `server/research/index.ts`, and
`client/src/research/section.tsx` are untouched in this diff. The client components are
presentational, perform no fetch, hold no token, and are routed nowhere.

## Composition, for the integration manager

Once the lane is rebased onto `FINAL_EA_FAST_FOLLOW_BASE`, one owner mounts:

```ts
const handlers = createMasterOfferingCatalogApiHandlers({
  authorizeViewer,          // from the authenticated session, never the request body
  serviceForViewer,         // request scoped, see below
  now: () => new Date().toISOString(),
});
app.get(MASTER_OFFERING_CATALOG_LIST_ROUTE, handlers.privateHeaders, handlers.list);
app.get(MASTER_OFFERING_CATALOG_DETAIL_ROUTE, handlers.privateHeaders, handlers.detail);
app.get(MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE, handlers.privateHeaders, handlers.priceList);
```

`serviceForViewer` builds a **request-scoped** service, because the price authority memoizes
per variant for the life of one instance:

```ts
new MasterOfferingCatalogService(
  reader,
  createMasterOfferingProductControlResolver({ bindings, selections, context }),
  createMasterOfferingPriceAuthority({
    bindings,                                    // the same read-only binding reader
    prices: createAuthoritativeApprovedPriceReader(
      createAuthoritativePriceResolver(new CatalogPricingProductSource(catalogReader)),
      () => ({ authenticatedAudience, currency: "USD" }),
    ),
  }),
  { manualEarlyAccessPurchase: masterOfferingsManualPurchaseRequests() },
);
```

`authenticatedAudience` must come from `authorizeAudienceFromServerIdentity` with facts
derived from the authenticated session. The browser never chooses it. The pricing instant
is taken from that same fact, so a stale authorization cannot price a later moment.

## Verification

```text
TypeScript, repository tsc              PASS
Vitest, master offerings (17 files)     PASS, 103 tests
Vitest, client master offerings         PASS,  13 tests
Vitest, whole repository                PASS, 512 files, 8,361 tests, 27 skipped
```

The whole-repository run needs `--testTimeout=30000` on this Windows host. At the default
five seconds, three unrelated files time out under parallel load; the two captured were
`shared/research/catalog/supplement-catalog` (a filesystem boundary scan) and
`server/research/early-access/routes/ops-doors`. Both pass on their own, and the whole
suite is green at thirty seconds. That is host slowness, not a regression from this lane,
but the run to trust is the thirty-second one.

Acceptance evidence pinned by tests:

- every member-safe offering is reachable across pages exactly once, at foundation scale
  (1,121 offerings, 1,181 variants, 11 admin-only holds);
- no admin-only hold reaches a page, a filter, a detail, or an export;
- a catalog row can never create a price, and a price can never create a purchase;
- a card never renders an action, an `Add to Cart`, or a `$0.00`;
- the export refuses rather than truncating, and carries no private field.

## Rollback

`RESEARCH_MASTER_OFFERINGS_ENABLED=false` removes the whole surface, including the
export. The manual purchase CTA rolls back on its own flag without touching the catalog.
This pack adds no migration, no table, no Product Control binding, and no data, so there
is nothing to roll back below the flag.

## Known gaps for the integration manager

1. The lane is on the Catalog Foundation, not on `FINAL_EA_FAST_FOLLOW_BASE`. Recreate or
   rebase, then re-prove.
2. Pricing the export walks every matching variant. With zero bindings that is cheap; once
   bindings exist, measure a full 1,181-variant export before widening the launch scope,
   and consider a cached price snapshot behind the same authority.
3. The 31 unresolved reconciliation overlaps are untouched and remain
   `reconcile_variant_or_source`, per the foundation handoff.
4. The quantity capability seam in `integration-packet.ts` still defines no constants, and
   must be fed from the accepted quantity authority after its own release chain.
