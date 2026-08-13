# Catalog v2 pricing: the read fan-out

Lane: `lane/catalog-pricing-n1`, cut from `d7984eb1cf80dea1da1eeacebe701227a8dd61ba`.

## Summary

Pricing the master offerings catalog read the entire Product Control catalog once
per variant. A page of twenty-four cards read it twenty-six times; a full price
list export read it one thousand one hundred and eighty-one times. Each of those
reads is itself two repository `list` calls plus two `get` calls per published
product, so the cost was the product of two catalog sizes rather than the sum.

The fix reads Product Control once per request. Measured against the real
generated dataset, a page went from 1,300 repository reads to 50, and a full
export went from 59,050 to 50.

The defect was latent, not live. See "Why nobody saw this" below.

## The defect, verified

### 1. Pricing loops offering by offering

`server/research/master-offerings/service.ts:50-64`, `priceMany` iterates
offerings and calls `priceOfferingVariants` for each. `price-authority.ts:195-206`
then resolves every variant of that offering. Reached from
`service.ts:96` (`select`, the page path) and `service.ts:148` (`priceList`, the
export path).

### 2. The authority resolves per variant

`price-authority.ts:141-180`. For each variant: read the binding, then call
`readApprovedPrice({ productId, variantId })`.

### 3. Each of those calls reads the whole Product Control catalog

Confirmed. `server/research/pricing/authoritative-price-resolver.ts`, in the
pre-fix file at lines 100-106:

```ts
async readProductForPricing(productId: string) {
  const catalog = await this.reader.readCatalog();
  const matches = catalog.filter((product) => product.id === productId);
  return matches.length === 1 ? matches[0] : null;
}
```

One product id, one full catalog read. Correct, and fine for the single-product
pricing route in `server/research/pricing/routes.ts`, which asks once per request.
It is not fine for a caller that asks once per variant.

### 4. Each full catalog read is a list plus two gets per product

Confirmed. `server/research/catalog/product-control-reader.ts:146-204`,
`LiveProductControlReader.readCatalog`:

- line 147: `repository.list(...)`
- lines 166-168: `readStableDetail` per publicly published product, and
  `readStableDetail` (lines 126-144) issues `repository.get` twice, at line 129
  and line 137, to drift check the record against itself
- line 169: a second `repository.list(...)` to verify the summary set

So one `readCatalog()` costs `2 + 2P` repository calls for `P` published
products. It is also O(P^2) in CPU: the filter at lines 186-203 runs
`verification.filter` for every surviving product, and `sameSummarySnapshot`
(lines 49-75) does two `JSON.stringify` calls each time.

Combining 3 and 4, the pre-fix cost of pricing `V` bound variants is:

```
repository reads = V * (2 + 2P)
```

### 5. The existing per-variant memo does not cover this

`price-authority.ts:139` and `182-190`. The memo is keyed
`` `${offering.id}|${variant.id}` `` and holds the resolved
`MasterOfferingPriceView`.

What it covers: asking about the same offering variant twice in one request. It
is what stops `detail()` re-resolving a variant that `list()` already resolved
inside the same service instance.

What it does not cover, and this is the whole defect:

- Different variants. Every distinct variant is a cache miss, and every miss
  reads the entire Product Control catalog.
- Different variants that bind to the *same* Product Control product. The memo
  key is the offering variant, not the bound `productId`, so two offering
  variants pointing at one product still cause two full catalog reads.
- Anything below the price view. The memo sits above the binding read and above
  the resolver, so it can only ever avoid work for a repeated question.

### 6. The export path runs this over the whole match set

`service.ts:126-159`. `MASTER_OFFERING_PRICE_LIST_MAX_ROWS` is 5,000
(`price-list-export.ts`). The row count is checked and refused before pricing, so
5,000 is the true worst case and `priceMany` at `service.ts:148` runs over all of
it.

### 7. Inventory lots and allocations: not reached, no fix needed

`server/research/catalog/member-catalog-projection.ts` does resolve lot COA
presentations per variant (`exactLotCoaPresentation`, line 315), but it is a pure
filter over an array already supplied in `MemberCatalogProjectionSource`, not a
per-variant read.

More to the point, catalog v2 never reaches it. `member-catalog-projection.ts` has
exactly one importer, `server/research/catalog/member-catalog-service.ts`, which
is the v1 member catalog. Nothing under `server/research/master-offerings/`
imports it, directly or transitively. There is no lot or allocation N+1 in the
catalog v2 pricing path, and this lane did not invent a fix for one.

## Why nobody saw this

`MasterOfferingCommerceBindingReader`
(`server/research/master-offerings/product-control-adapter.ts:14-22`) has no
implementation anywhere in the repository. Grepping `readBinding` across
`server/` and `shared/` finds the interface and its two consumers and nothing
else. Catalog v2 is also not registered in `server/index.ts`; the route table in
`mount.ts` is deliberately left for the composition root to register, and it has
not been.

So today `price-authority.ts:149-160` gets a null binding and returns
`Price on request` before it ever calls the resolver. The expensive path is
unreachable. The moment the first real binding exists it becomes reachable for
every bound variant at once, which is why the measurements below are taken under
a binding rather than against the current deployment.

## The fix

One Product Control read per request, indexed by product id.

`server/research/pricing/request-scoped-product-source.ts` (new) wraps a
`PricingProductSource`. If the source can hand over the whole catalog it reads it
once, indexes it, and answers every product id from that snapshot. If it cannot,
it memoizes per product id, which is never worse.

`BulkPricingProductSource` (new, in `authoritative-price-resolver.ts`) is the
capability. `CatalogPricingProductSource` implements it by exposing the catalog
read its single-product method already performed.

`server/research/master-offerings/request-scoped-bindings.ts` (new) memoizes the
read-only binding join per request. On the detail path the price authority and
the purchase resolver both ask about the same variant, so this halves those reads
and, more usefully, guarantees the two authorities answer from one binding fact.

Both are built inside `serviceForViewer` in
`server/research/master-offerings/composition.ts`, which already constructs a new
service per request precisely so per-request memoization is safe. A cache that
outlived the request would quote yesterday's approved price or a since-revoked
binding.

### Composition root change required

None. `serviceForViewer` receives `input.pricingSource` and wraps it per request,
so `server/index.ts` is untouched.

Note for whoever wires catalog v2 into `server/index.ts` later: do **not** wrap
the long-lived `pricingResolver` built at `server/index.ts:384`. That resolver
serves the single-product `/pricing/*` routes and must keep reading fresh. The
wrapper belongs only where a request-scoped object owns it, which is where this
lane put it.

## Measured

Reads are counted at the Product Control repository seam (`list` plus `get`),
which is the unit that costs a round trip in production. The chain above it is
the real one: `MasterOfferingCatalogService` -> `createMasterOfferingPriceAuthority`
-> `createAuthoritativeApprovedPriceReader` -> `AuthoritativePriceResolver` ->
`CatalogPricingProductSource` -> `LiveProductControlReader` -> a counting
repository. Every measurement is taken with a binding present for every member
variant.

### Against the real generated dataset

Built from `XENIOS_MASTER_OFFERINGS_PRICING_2026-08-09_AUSTIN_BENCHMARK_UPDATED.xlsx`:
1,121 offerings, 1,181 variants, 11 holds. Product Control seeded with 24
published products.

| Scenario | Reads before | Reads after | Factor |
| --- | ---: | ---: | ---: |
| One page, 24 cards, 26 member variants | 1,300 | 50 | 26x |
| Full price list export, 1,181 rows | 59,050 | 50 | 1,181x |

Wall clock on the same run, against an in-memory repository with zero network
latency: page 75 ms to 16 ms, export 1,209 ms to 80 ms. In production each of
those 59,050 reads is a Supabase round trip, so the wall-clock saving is the
number that understates the fix, not the read count.

### At the 5,000 row export cap

`MASTER_OFFERING_PRICE_LIST_MAX_ROWS` is 5,000, above what the real dataset
produces today, so the cap is measured with a synthetic 5,000 variant catalog.

| Product Control size | Reads before | Reads after | Factor |
| ---: | ---: | ---: | ---: |
| 8 products | 90,000 | 18 | 5,000x |
| 24 products | 250,000 | 50 | 5,000x |

The 24 product row was measured once at full scale (250,000 reads, 18.5 seconds
of CPU for the unfixed run). The committed regression test uses 8 products for
that case, because the unfixed export is O(rows * products^2) inside
`LiveProductControlReader` and an 18 second test starves everything vitest
schedules beside it. The closed form `V * (2 + 2P)` is exact, so raising
`EXPORT_PRODUCT_CONTROL_SIZE` in the test reproduces any figure in the table.

After the fix the read count is `2 + 2P` regardless of `V`: it no longer depends
on how many variants are priced at all.

## Correctness properties re-proved

Held to the unwrapped source rather than to a hand-written expectation, so the
two cannot drift apart silently.

- **Same answers, same page.** The benchmark asserts the priced page and the
  exported price-list document are deep-equal before and after
  (`catalog-pricing-reads.test.ts`).
- **Uniqueness rule preserved.** A product id present exactly once resolves; an
  id present twice resolves to null; an absent id resolves to null. Asserted
  against `CatalogPricingProductSource` itself for each case.
- **Identity re-check intact.** `price-authority.ts:167-175` still refuses a
  price that answers about a different `productId` or `variantId` than the
  binding. Untouched, and exercised through the cache.
- **Zero and negative amounts refused.** A variant priced at 0 cents resolves
  `unavailable / price_missing`, never `$0.00`.
- **Admin-only offerings and variants refused.** `price-authority.ts:145-147`
  short-circuits before any read; a `memberEligible: false` variant resolves
  `member_ineligible`.
- **Fails closed, does not throw.** A reader that throws still rejects out to the
  price authority's own `catch`, which returns `Price on request`. The shared
  promise carries a no-op handler so a rejection is never reported as unhandled
  before the first caller awaits it, and the rejection itself is not swallowed.
- **No approval detail crosses the boundary.** The customer price still carries
  no `approvalNote` and no `approvedBy`.
- **Read-only stays read-only.** The binding wrapper exposes exactly
  `readBinding`, so it cannot create, update, or delete a binding any more than
  the interface it wraps can.

One behavior does change, and it is a tightening. Before, a reader that broke
mid-request failed only the variants that happened to read after it broke, so one
page could mix prices read before the failure with `Price on request` after it.
Now a request either sees one catalog snapshot or sees none, and none means
`Price on request` everywhere. Both are fail closed; the second is also
self-consistent, which is what the composition header asks for.

## Files

Changed:

- `server/research/pricing/authoritative-price-resolver.ts` - added the
  `BulkPricingProductSource` capability; `CatalogPricingProductSource` now
  exposes `readCatalogForPricing` and its single-product read calls it. No
  resolution logic touched.
- `server/research/master-offerings/composition.ts` - wraps the pricing source
  and the binding reader per request inside `serviceForViewer`.

Added:

- `server/research/pricing/request-scoped-product-source.ts`
- `server/research/pricing/request-scoped-product-source.test.ts`
- `server/research/master-offerings/request-scoped-bindings.ts`
- `server/research/master-offerings/catalog-pricing-reads.test.ts`

Not touched, by constraint: `server/index.ts`, any composition root,
`server/research/master-offerings/dataset-reader.ts`, the
`MasterOfferingCatalogReader` interface, the query contract, search, sort, and
facets. No binding, migration, or production write was created.

## Known, not fixed here

- **`LiveProductControlReader.readCatalog` is O(P^2).** The verification filter at
  `product-control-reader.ts:186-203` scans the re-listed summaries for every
  surviving product. It no longer runs per variant, so it stopped mattering for
  this path, but it will matter on its own once Product Control holds a few
  thousand products. That file is owned by another concern.
- **The binding read is still O(V).** One read per distinct member variant, which
  is inherent to a per-variant join. Batching it needs a real binding store to
  design against, and none exists yet.
- **Pre-existing flake:**
  `server/research/master-offerings/catalog-boundaries.test.ts > boundaries: the
  ingestion model stays on the server > is not imported by any client file`
  performs a synchronous walk of 1,380 files under vitest's default 5 second
  timeout. It fails intermittently under parallel suite load on the untouched
  base commit, verified by stashing this lane and running the same suite. It was
  not modified here: it is another concern's assertion and weakening it to make a
  build look green is the wrong trade. It needs an explicit timeout.
