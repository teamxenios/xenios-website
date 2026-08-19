# Lane A integration packet: truthful card CTA + Buy Now handoff (v2 member catalog)

Branch: `lane/launch-catalog-cta`. This document contains the ONE change Lane A
needs in a file it does not own (`server/index.ts`), exactly as it should be
pasted, plus the tests the integration owner should run. Everything else in the
lane is already wired inside its owned paths and ships inert until the flag
below is turned on.

## What the lane shipped (no action needed, listed for review)

- `shared/research/launch/customer-action.ts` — the one six-action customer
  vocabulary (`BUY_NOW | REQUEST_QUOTE | ASSISTED_ORDER | CARE |
  TEMPORARILY_HELD | NOT_AVAILABLE`) with pure adapters from the
  assisted-order workflow decision and from the master-offerings resolved
  action. Fully tested, framework free.
- Card-level actions: `MasterOfferingVariantSummary` now carries the same
  server-resolved `action` the detail variants always had; the list service
  resolves commerce for the page exactly the way `detail` does, and
  `MasterOfferingCard.tsx` renders it truthfully (Buy Now only for a resolved
  `add_to_cart`; request/care/held/unavailable copy otherwise). The
  `add_to_cart` action also carries the selection's own `sku`, which the
  SKU-keyed member cart needs.
- The cart handoff is live: `FullCatalogProductRoute.tsx` injects the existing
  `addCartLine` adapter (POST `/api/research/cart/lines`, one_time line) and
  the founder 1–50 quantity capability into `MasterOfferingDetailSurface`. A
  `commerce_disabled` answer renders its truthful copy; nothing fakes success.
- Buy Now → sign-in → return: `DYNAMIC_MEMBER_PATHS` in
  `client/src/research/lib/member-routing.ts` now allows
  `/research/member/catalog/:family/:slug` (anchored, path segments only), with
  adversarial returnTo tests.
- `server/research/master-offerings/direct-commerce-selections.ts` — the
  founder gate and the real selection authority wrapper used below.

No SQL is needed for this lane. Nothing under `supabase/` was added.

## The one `server/index.ts` change (founder-gated)

**Purpose.** Production hard-wires the v2 catalog's purchase seam to a
truthful refusal, so no card or detail page can ever say Add to Cart. This
change puts the REAL Product Control selection authority behind a default-off
environment flag:

- `RESEARCH_MASTER_OFFERINGS_DIRECT_COMMERCE` unset / anything but the exact
  string `"true"` → the identical hard-wired refusal
  (`product_commerce_unapproved`). Behaviour is byte-for-byte what ships
  today.
- `RESEARCH_MASTER_OFFERINGS_DIRECT_COMMERCE=true` → each bound variant is
  evaluated by the existing `selectCartProduct` gauntlet over live Product
  Control facts; only a fully approved, published, priced, ready, in-stock,
  member-eligible exact variant resolves, and only then does a Buy Now / Add
  to Cart appear anywhere.

**Setting the flag in any production environment is a production mutation and
requires Samuel's current explicit approval, every time.** Merging this code
change with the flag unset changes nothing a member can see or do.

### 1. Add imports (top of `server/index.ts`, beside the existing master-offerings imports)

```ts
import type { AdminProductDetail } from "@shared/research/product-admin";
import type { DomainReadiness, RequiredInput } from "@shared/research/required-inputs";
import {
  createProductControlSelectionAuthority,
  masterOfferingSelectionAuthorityFromEnv,
  type CartSelectionFactsReader,
} from "./research/master-offerings/direct-commerce-selections";
```

Also extend the existing import from `./research/catalog/member-catalog-service`
(currently `buildMemberCatalogProductionService, memberAudienceSourceVersion`)
with `buildProductionVariantInventoryFactsReader`.
`buildRequiredInputProductionRepository` and
`createProductionProductControlReader` are already imported.

### 2. Add the production facts reader (immediately above `const masterOfferingCatalogDependencies = ...`)

```ts
// Product Control facts for one exact selection request. The reader owns only
// facts Product Control can state (product, variants, prices, media, required
// inputs, readiness, inventory); the viewer's audience eligibility arrives
// through the composition's session context and is validated by the
// evaluation like every other fact. One instant (request.evaluatedAt) keys a
// small memo so a page of cards costs one catalog read, not one per variant.
const masterOfferingSelectionInputs = buildRequiredInputProductionRepository();
const masterOfferingSelectionInventory = buildProductionVariantInventoryFactsReader();
const masterOfferingSelectionReads = new Map<
  string,
  Promise<{
    products: AdminProductDetail[];
    requiredInputs: RequiredInput[];
    readiness: DomainReadiness[];
  }>
>();
function masterOfferingSelectionFactsAt(evaluatedAt: string) {
  const cached = masterOfferingSelectionReads.get(evaluatedAt);
  if (cached !== undefined) return cached;
  const read = (async () => {
    const [products, requiredInputs, readiness] = await Promise.all([
      createProductionProductControlReader().readCatalog(),
      masterOfferingSelectionInputs.list(),
      masterOfferingSelectionInputs.readinessAll(),
    ]);
    return {
      products,
      requiredInputs: requiredInputs as RequiredInput[],
      readiness: readiness as DomainReadiness[],
    };
  })();
  masterOfferingSelectionReads.set(evaluatedAt, read);
  // The instant is one request's clock, so entries die quickly; the bound
  // keeps a slow trickle of instants from growing the map forever.
  if (masterOfferingSelectionReads.size > 64) {
    const oldest = masterOfferingSelectionReads.keys().next().value;
    if (oldest !== undefined) masterOfferingSelectionReads.delete(oldest);
  }
  return read;
}
const masterOfferingSelectionFacts: CartSelectionFactsReader = {
  async readSelectionSource(request) {
    const { products, requiredInputs, readiness } =
      await masterOfferingSelectionFactsAt(request.evaluatedAt);
    const product = products.find((candidate) => candidate.id === request.productId);
    if (product === undefined) return null;
    const variant = product.variants.find(
      (candidate) => candidate.id === request.variantId,
    );
    if (variant === undefined) return null;
    const inventory = await masterOfferingSelectionInventory.readVariantInventoryFacts({
      productId: product.id,
      variant,
      evaluatedAt: request.evaluatedAt,
    });
    return {
      products: [product],
      variants: product.variants,
      prices: product.prices,
      media: product.media,
      requiredInputs,
      readiness,
      // Deliberately empty: the viewer's authorization is a session fact the
      // composition supplies, and the authority seats it only into this empty
      // seat. The evaluation then validates it (identity, instant, non-blank
      // provenance) exactly as it validates every Product Control fact.
      audienceEligibility: null,
      inventoryEligibility: inventory.inventory,
    };
  },
};
```

### 3. Replace the hard-wired refusal inside `createMasterOfferingCatalogDependencies`

Current code (`server/index.ts`, the `selections:` property around lines
570–575):

```ts
    selections: {
      // Truthful and inert: this display surface composes no purchase
      // authority, and the general units are not commerce approved. Never a
      // thrown error, so a page of cards does not pay exception churn.
      select: () => ({ ok: false, code: "product_commerce_unapproved" }),
    },
```

Replacement:

```ts
    // Purchase stays OFF until RESEARCH_MASTER_OFFERINGS_DIRECT_COMMERCE is
    // exactly "true": the gate answers the identical hard-wired refusal the
    // catalog has always answered, and the real authority is the existing
    // selectCartProduct gauntlet over live Product Control facts. Turning the
    // flag on in production requires Samuel's current explicit approval.
    selections: masterOfferingSelectionAuthorityFromEnv(
      process.env,
      createProductControlSelectionAuthority(masterOfferingSelectionFacts),
    ),
```

Nothing else in `server/index.ts` changes. The assisted-order bridge, pricing,
and every other consumer of the master-offerings composition are untouched:
they receive the same `selections` seam, which still refuses until the flag is
exactly `"true"`.

## Tests the integration owner should run after pasting

```powershell
npx vitest run server/research/master-offerings shared/research/launch `
  client/src/research/master-offerings client/src/research/lib
npm run check
```

Expected: all green. The decisive files:

- `server/research/master-offerings/direct-commerce-selections.test.ts` — the
  flag parses only the exact string `"true"`; off answers the identical
  refusal without consulting the real authority; the real authority fails
  closed on a null/throwing facts reader and relays `selectCartProduct`'s own
  codes; the session audience fact seats only into an empty seat and is then
  validated.
- `server/research/master-offerings/catalog-boundaries.test.ts` — Product
  Control identity appears only inside a resolved `add_to_cart`, on list and
  detail alike; no private field crosses the HTTP boundary.
- `server/research/master-offerings/catalog-pricing.test.ts` — the card
  carries the same action the detail resolves.
- `client/src/research/master-offerings/product-route-cart-wiring.test.tsx` —
  the routed page reaches the one mounted cart door with the server's own
  SKU/quantity, and `commerce_disabled` renders its truthful copy.
- `client/src/research/lib/member-routing.test.ts` — the catalog product
  returnTo pattern admits real product pages and refuses crafted, external,
  protocol-relative, encoded, and overlong values.

## Manual smoke (flag OFF, then ON, founder-approved envs only)

1. Flag off: v2 catalog cards show request/care/held actions and prices; no
   Buy Now anywhere; detail page unchanged. (This is exactly today.)
2. Flag on, staging: a bound, approved, priced, ready, in-stock,
   member-eligible variant shows Buy Now on its card; the detail page shows
   the quantity band (1–50) and Add to Cart; adding lands the line in
   `/research/member/cart`; an unbound or unapproved variant still shows its
   request action.
3. With the commerce env disabled but the catalog flag on: Add to Cart answers
   the `commerce_disabled` copy ("Direct checkout is not enabled yet…"), no
   fake success.
