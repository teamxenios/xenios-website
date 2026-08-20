# Lane integration packet: public storefront + order entry door

Branch: `lane/launch-public-storefront`. Base: `5bb3fa9`.

This document contains every change the lane needs in a file it does not own,
exactly as it should be pasted, plus the tests to run afterwards. Everything
else ships inside the lane's own paths and is inert until the flag below is
turned on.

**One flag gates the whole surface: `RESEARCH_PUBLIC_STOREFRONT_ENABLED`.**
Unset, or anything but the exact string `"true"`, every storefront door
answers `503 storefront_closed` and the public pages render their "not open
yet" state with sign-in and apply still offered. Setting it in any production
environment is a production mutation and requires Samuel's current explicit
approval, every time.

## ⚠ READ FIRST: one change reverses a standing nonnegotiable

The Gateway CTA change reverses the directive recorded in
`docs/research/RESEARCH_HOME_CATALOG_POLICY.md` ("no catalog CTA on
`/research`", logged there as a repeated nonnegotiable). The 2026-08-19 launch
directive says the opposite. It is implemented as its own isolated commit and
logged in `.xenios/FOUNDER_ACTIONS.md`. **Confirm with Samuel before
release.** Reverting that one commit drops the Gateway CTA and the guard
rescope while leaving the storefront itself intact and reachable by direct
link.

## What the lane shipped (no action needed, listed for review)

- `shared/research/storefront/contract.ts` — the public wire contract. A
  customer-safe subset by construction: no SKU, no Product Control identity,
  no price provenance, no member hrefs. Prices are the server's or they are
  `on_request`; there is no zero and no client fallback anywhere.
- `server/research/storefront/projection.ts` — canonical catalog answer in,
  public shapes out, field by field (never a spread, so nothing the member
  contract grows later leaks by default). Each variant's resolved action is
  translated by the existing closed six-word vocabulary, which can restate or
  downgrade but never widen.
- `server/research/storefront/routes.ts` + `mount.ts` — two read-only doors
  behind the flag, with the route table as data so the release census moves
  when the surface genuinely becomes reachable. It owns its own query parser
  (the public vocabulary has no `states` filter) and depends on the catalog
  read through a STRUCTURAL interface, `PublicCatalogReadService`, not by
  importing the catalog lane. That is deliberate: `catalog-boundaries.test.ts`
  pins that the lane is imported only by the composition root, and this lane
  adds no import to it anywhere in its shipping code or its tests. **No
  allowlist in that boundary test needed changing.**
- `client/src/research/storefront/**` — the catalog page (search, category and
  type filters from the server's own facets, sort, pagination), the product
  page, the API adapter, and `entry-intent.ts`, which builds the auth-return
  continuation.
- `client/src/research/pages/Gateway.tsx` — the commercial landing page.
- The rescoped `Gateway.catalog-guard.test.tsx` and the rewritten policy doc.

No SQL. Nothing under `supabase/` was added or changed.

## 1. `server/index.ts` — compose and register the storefront

### 1a. Imports (beside the existing master-offerings imports, around line 101)

```ts
import {
  PUBLIC_STOREFRONT_ERROR_BASE_PATH,
  publicStorefrontErrorHandler,
  publicStorefrontRouteTable,
} from "./research/storefront/mount";
```

### 1b. The visitor composition (immediately AFTER the existing
`masterOfferingCatalogDependencies` block, i.e. after its closing `);` around
line 585)

It reuses the identical composition input as the member catalog, with one
difference: the identity is always `null`. That is what makes the surface
safe, and it is a property of the composition rather than of the projection,
so the storefront cannot be argued into a priced view later.

```ts
// THE PUBLIC STOREFRONT (2026-08-19 launch directive), dark by default.
//
// Composed over the SAME canonical master-offerings authorities as the member
// catalog, with one deliberate difference: identityFor is hard-wired to null,
// so there is no audience, no pricing grant, and no purchase authority for
// this surface to resolve. Every price fails closed to "Price on request"
// exactly as it already does for an anonymous probe, and the selection
// authority is the same truthful refusal the display catalog composes.
//
// A NEW service per request, like the member catalog: the price authority
// memoizes for its instance's lifetime, and an instance that outlived the
// request would serve yesterday's catalog.
const publicStorefrontDependencies = {
  serviceForVisitor: () =>
    masterOfferingCatalogDependencies.serviceForViewer({
      // A viewer with no grant. masterOfferingViewerForMember is deliberately
      // NOT used: there is no member row here, and inventing one would be a
      // second authentication system.
      audience: "member" as const,
      email: "",
    }),
};
const [
  publicStorefrontCatalogRoute,
  publicStorefrontDetailRoute,
  publicStorefrontCatalogOptionsRoute,
  publicStorefrontDetailOptionsRoute,
] = publicStorefrontRouteTable(publicStorefrontDependencies);
// Keep these four registrations explicit: the release scanner must see every
// reachable door, while their paths and handler order still come from the one
// authoritative descriptor table.
app.get("/api/research/storefront/catalog", ...publicStorefrontCatalogRoute.handlers);
app.get("/api/research/storefront/products/:family/:slug", ...publicStorefrontDetailRoute.handlers);
app.options("/api/research/storefront/catalog", ...publicStorefrontCatalogOptionsRoute.handlers);
app.options("/api/research/storefront/products/:family/:slug", ...publicStorefrontDetailOptionsRoute.handlers);
app.use(
  PUBLIC_STOREFRONT_ERROR_BASE_PATH,
  publicStorefrontErrorHandler(publicStorefrontDependencies),
);
```

**The release census moves by four static registrations.** Update the pinned
count in `server/release-control-plane.test.ts`, which is yours.

## 2. `server/research/index.ts` — punch the storefront doors through the wall

The legacy shared-review-password gateway answers before every
`/api/research/*` route. The storefront must be reachable by someone with no
credential at all — that is the entire point — so it needs the same
door-by-door admission Early Access has.

In `registerResearchApi`, beside `EARLY_ACCESS_OPEN_READ_PATHS` (around line
287), add:

```ts
  // THE PUBLIC STOREFRONT DOORS.
  //
  // Read-only, parameterless-or-anchored, and admitted for a visitor with no
  // credential of any kind. Admission is not authorization: each handler owns
  // a STRONGER gate downstream (the storefront flag, which fails closed) and
  // reads through a composition with no pricing grant, so getting through
  // this wall reaches display facts and on-request prices, never a member
  // price, a SKU, or anything purchasable.
  //
  // Path-exact for the list; the detail door carries two segments, so it is
  // ANCHORED on the closed family vocabulary and the server's own slug shape
  // rather than admitted by prefix. A future route under this namespace stays
  // walled until it is listed here on purpose.
  const STOREFRONT_OPEN_READ_PATHS = new Set(["/storefront/catalog"]);
  const STOREFRONT_PRODUCT_READ = /^\/storefront\/products\/[a-z0-9]+(?:_[a-z0-9]+)*\/[a-z0-9][a-z0-9-]{0,191}$/;
```

Then in the wall middleware (the `app.use("/api/research", ...)` around line
605), beside the existing Early Access branch, add:

```ts
    if (
      (req.method === "GET" || req.method === "HEAD") &&
      (STOREFRONT_OPEN_READ_PATHS.has(req.path) ||
        STOREFRONT_PRODUCT_READ.test(req.path))
    ) {
      return next();
    }
```

## 3. `client/src/research/section.tsx` — mount the three public routes

Beside the other lazy imports:

```ts
const StorefrontCatalog = lazy(() => import("./storefront/StorefrontCatalogRoute"));
const StorefrontProduct = lazy(() => import("./storefront/StorefrontProductRoute"));
```

In the access family, BEFORE the legacy redirect block (the literal
`/research/catalog` route must precede the parameterized one):

```tsx
          {/* The public storefront. No member gate: the server composes it
              for a viewer with no pricing grant and fails closed on its own
              flag. */}
          <Route path="/research/catalog">{() => <L component={StorefrontCatalog} />}</Route>
          <Route path="/research/catalog/:family/:slug">{() => <L component={StorefrontProduct} />}</Route>
```

## 4. `client/src/research/layout.tsx` — keep the storefront outside the shared password gate

`isPublicResearchPath` decides which routes render without the legacy review
password. Add the two storefront paths:

```ts
    || normalized === "/research/catalog"
    || normalized.startsWith("/research/catalog/")
```

Without this the storefront renders the review-password wall and the
commercial landing page's primary CTA leads to a lock.

## 5. OPTIONAL, and only if you want intent preselection to land visually

`client/src/research/master-offerings/MasterOfferingDetail.tsx` currently
defaults its variant selection to `variants[0]` and its quantity to
`undefined`. The storefront's continuation carries `?variant=&qty=` on the
member detail URL, and `safeResearchReturnTo` already preserves that query
through sign-in, so the values ARRIVE today and are simply not read.

The lane did not edit that file (it is Lane A's). To honor the preselection,
Lane A or the integrator can accept two optional props:

```ts
  initialVariantId?: string;
  initialQuantity?: number;
```

and seed the two `useState` calls from them, reading the values with
`preselectionFromSearch` (exported from
`client/src/research/storefront/entry-intent.ts`) in
`FullCatalogProductRoute.tsx`.

**Without this change the flow is still correct and still non-dead-ended**:
the visitor returns to the exact product page they chose, with every variant
listed; only the radio preselection and the quantity are lost. The
storefront's own tests assert the URL is built and survives validation, not
that the member page consumes it.

## Tests to run after pasting

```powershell
npx vitest run server/research/storefront client/src/research/storefront `
  client/src/research/pages/Gateway.catalog-guard.test.tsx `
  client/src/research/lib/member-routing.test.ts server/research/master-offerings
npm run check
```

The decisive files:

- `server/research/storefront/projection.test.ts` — every action translates
  into the closed vocabulary; a malformed amount degrades to on-request rather
  than zero; no SKU, price id, price version, or member href survives the
  projection.
- `server/research/storefront/routes.test.ts` — the flag parses only the exact
  string `"true"` and refuses before touching the service; the member-only
  `states` filter and any unknown key are 400s; a wrong family is a 404, not
  another product; a throwing composition is an honest 503.
- `client/src/research/storefront/entry-intent.test.ts` — the continuation URL
  every storefront CTA builds survives `safeResearchReturnTo` **unchanged**,
  for all four actionable actions. This is the contract the whole auth-return
  requirement rests on.
- `client/src/research/storefront/storefront-surface.test.tsx` — every card
  carries a real next step for all six actions; a closed storefront still
  offers sign-in and apply; Care routes to Care and never to a purchase.
- `client/src/research/pages/Gateway.catalog-guard.test.tsx` — the rescoped
  guard: the public CTA is asserted present, and a member-catalog link is
  still refused alongside it.

## Manual smoke (flag OFF, then ON)

1. Flag off: `/research` shows the commercial landing page; Browse Research
   Catalog leads to the "not open yet" state WITH sign-in and apply. No dead
   end, nothing purchasable, nothing priced.
2. Flag on, staging: `/research/catalog` lists products with server prices and
   on-request rows; search, category, type, sort and paging work; each card
   has an action or a status plus a details link.
3. Pick a priced, orderable product, choose a variant and quantity, press
   Order: it lands on `/research/sign-in?returnTo=...`; sign in as an active
   member and the member catalog product page opens (with the selection
   preselected only if change 5 was applied).
4. A Care product offers Continue through Care and reaches the access hub.
5. Widths 430 / 390 / 375 / 360 / 320: no horizontal scroll on the landing
   page, the catalog, or the product page; every control stays >= 44px.
