# Full Repository Test Matrix

## Before frozen-SHA rebase

```powershell
npx tsc -p .local/research/master-offerings/tsconfig.isolated.json --pretty false
npx vitest run server/research/master-offerings client/src/research/master-offerings
npm run check -- --pretty false
```

Focused regression:

```powershell
npx vitest run server/research/catalog-display
npx vitest run server/research/catalog/member-catalog-projection.test.ts server/research/catalog/member-catalog-service.test.ts server/research/catalog/member-catalog-routes.test.ts
npx vitest run server/research/commerce/cart-product-selection.test.ts
npx vitest run server/research/product-requests.test.ts server/research/product-requests-routes.test.ts server/research/products-diagnostics/product-request-integration.test.ts
```

Data gates:

```text
package checksums: 36/36
workbook SHA: c6937431bcb64f628352016d5af16ea133add9a0a05b5947d5a0ac75d9e2d438
source rows: 1,236
offerings: 1,121
variants: 1,181
holds: 11
available-now variants: 18
overlaps: 31
provider identity leaks: 0
hold IDs in public catalog: 0
```

## Immediately after frozen-SHA rebase

1. Re-run every pre-rebase gate.
2. Run the final Quantity lane focused suite from the accepted commit.
3. Run all Early Access cart, checkout, order, payment, settlement, legal,
   fulfilment, and route-pin tests named by the accepted release handoff.
4. Verify route uniqueness and migration DAG without modifying either.
5. Run `npm test`.
6. Run `npm run build`.

## API integration gates

- flag absent/false -> uniform private 503;
- unauthenticated -> 401;
- active non-allowlisted member during first launch -> 403;
- allowlisted member/admin -> 200;
- browser audience/breadth query -> 400;
- family/state/page validation -> closed 400;
- held/missing/wrong-family detail -> uniform 404;
- private cache/noindex headers on all responses;
- OPTIONS advertises GET, HEAD, OPTIONS only;
- malformed URI -> closed private 400;
- no mutation method;
- list default 24, maximum 100, stable pages;
- v1/legacy member catalog unchanged when v2 flag is off.

## Commerce and quantity gates

- planning price, no selection -> no Add to Cart;
- available-now, no selection -> Request Access;
- binding only -> no Add to Cart;
- selection only -> no Add to Cart;
- mismatched product/variant -> no Add to Cart;
- Product Control refusal -> fallback CTA and detail persists;
- exact valid binding/selection -> Add to Cart;
- removing binding -> fallback CTA and detail persists;
- non-commerce actions -> no purchase quantity control;
- add-to-cart without accepted quantity capability -> no quantity control;
- accepted exact variant policy -> 1-20 and aggregate <=20, tested from the
  final Quantity authority rather than catalog constants.

## UI gates

- 390, 768, 1024, 1440, and 1920 widths;
- keyboard, focus, semantic headings, labeled controls, status text;
- loading/empty/error/unavailable/restricted/success;
- URL search/filter/page round trip;
- no 1,121-card initial DOM;
- no private dataset import;
- no provider or hold leakage;
- no amount on non-commerce CTA;
- request/notify/waitlist/apply/update links preserve safe attribution.
