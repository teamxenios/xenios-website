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
| Exact-variant detail surface and CTA | `MasterOfferingDetail.tsx` |
| Read adapter and surface states | `catalogApi.ts` |
| All member-safe offerings viewable | `catalog-completeness.test.ts` |
| Adversarial and privacy gates | `catalog-boundaries.test.ts` |
| Production catalog reader | `dataset-reader.ts` |
| Authoritative count verification | `scripts/research/verify-master-offerings-dataset.ts` |
| URL state, deep links, back and forward | `useCatalogQueryState.ts` |
| Loading, error recovery, retry | `MasterOfferingCatalogSurface.tsx` |
| Quantity 1 through 50 | `quantity-band.test.tsx`, and the register beside this file |
| Exact-variant detail container | `MasterOfferingDetailSurface.tsx` |
| Handoff into the existing cart | `catalog-cart-handoff.ts` |
| Named-member breadth grant | `named-member-breadth.test.ts` |

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

## The catalog has to come from somewhere

Until now the only `MasterOfferingCatalogReader` was the in-memory one used by tests. A
fully mounted catalog would have served zero offerings, which is the single thing between
"the code is complete" and "Kris can see the catalog".

`dataset-reader.ts` reads the member-safe file that
`scripts/research/build-master-offerings.ts` generates. It refuses rather than degrades:
absent, unreadable, wrong schema, ambiguous, or privacy failing all raise
`MasterOfferingDatasetUnavailable`, the route answers `503`, and the browser says "not
available yet". It never returns an empty catalog on failure, because zero offerings is
indistinguishable from "Xenios sells nothing".

It re-checks the builder's own privacy ban list on read. The file is produced by a
separate process, possibly on a different day, and a reader that trusts its input is how a
supplier name reaches a browser. It also refuses a duplicate id or slug rather than
picking one, and it counts the offerings itself instead of trusting the file's header.

Configure with `XENIOS_MASTER_OFFERINGS_DATASET`. Unset means no reader, which the
composition root should surface as unavailable rather than empty.

### Verifying the authoritative count

```bash
npx tsx scripts/research/verify-master-offerings-dataset.ts <generated.json> [offerings] [variants]
```

It defaults to the foundation's independently verified 1,121 offerings and 1,181 variants,
loads through the same reader the server uses, counts both itself, and fails if the file's
own header disagrees with its body. Exercised against a foundation-shaped dataset of
exactly 1,121 and 1,181: `PASS`, with the family and availability breakdown printed.

**The real dataset is not in this repository.** The foundation deliberately left the
generated payload under the ignored `.local` boundary pending registry reconciliation, so
the count above is verified against the documented shape, not against live data. Producing
the runtime dataset is the first integration requirement below.

## Speed at catalog scale

Measured against a real 1,121 offering and 1,181 variant dataset through the production
reader, average of twenty runs:

```text
first page                          0.95 ms
page 40 of 47                       0.85 ms
search, hit                         5.97 ms   (was 39.64 ms)
search, miss                        4.91 ms   (was 17.61 ms)
family filter                       0.58 ms
detail by slug                      0.24 ms
full price list export, 1181 rows  15.51 ms
```

Search was the one slow path. Every query re-normalized the full text of all 1,121
offerings. The haystack is now memoized per offering object in a `WeakMap`, which needs no
invalidation because a regenerated dataset produces new objects. A regression guard in
`catalog-completeness.test.ts` runs a hundred searches over the full catalog and fails
above two seconds, which the unmemoized version would exceed by about double.

Twenty-four cards render per page. The full catalog never enters the first DOM.

## Quantity: 1 through 50

The founder decision is 1 through 50 with no review threshold inside it. This lane owns no
quantity constant and never did, so it follows the injected authority to 50 with no code
change, and it could not create a threshold even by accident: quantity is not an input to
action resolution anywhere in the catalog.

Out of band is refused, never clamped. See
`QUANTITY_1_50_STALE_CONSTRAINT_REGISTER.md` beside this file for the exact stale
constraints elsewhere in the system, with their owners. This lane changed none of them.

## The detail surface

`MasterOfferingDetail.tsx` is where an exact variant is chosen and where the one
server-resolved action renders. It decides nothing: the action kind, its label, its href,
and the amount inside `add_to_cart` all come from the server, and the component renders
exactly one CTA for the selected variant.

The quantity control appears only when the server said `add_to_cart` **and** an accepted
exact-variant quantity capability matches that exact product and variant identity. There
are still no quantity constants anywhere in this lane. Changing the selected variant
clears the quantity, because carrying it across would apply one variant's limit to
another.

The variant radio group and every CTA carry accessible names that include the product and
the variant, so a CTA is never a bare verb to a screen reader.

## Read adapter and surface states

`catalogApi.ts` wraps the repository's `apiGet` and maps the closed error taxonomy onto a
surface state. `restricted` is deliberately separate from `unauthorized`: a signed-in
member outside the founder launch scope is not signed out, and telling them to sign in
again would be a lie.

Because the routes are unmounted, they currently fall through to the SPA catch-all and
answer `200` with the app shell. `apiGet` normalizes that to `unavailable`, so a surface
wired to this adapter today renders a pending state rather than an empty catalog that
would read as "we sell nothing". A test pins that.

## Adversarial and QA gates

`catalog-boundaries.test.ts` holds the checks an attacker or a careless integration would
find first:

- **Not an enumeration oracle.** Missing, admin-only held, wrong-family, and
  held-plus-wrong-family identities all return one byte-identical `404` body. A restricted
  viewer is refused with `403` before any existence signal, and a real slug and a fake one
  are indistinguishable to them. Traversal and wildcard slugs are rejected without echoing
  input.
- **No private field crosses HTTP.** A fixture with every private field populated is
  served through list, detail, CSV, and JSON, and the raw response text is scanned for the
  supplier name, source SKU, source group, canonical key, and the private key names.
- **Product Control identity only inside `add_to_cart`.** A planning variant's action
  carries no `productId`, and the list carries none at all even when a variant is fully
  purchasable.
- **Private headers on errors too**, not only on success.
- **Query hardening.** Repeated scalars, array-form keys, `__proto__` and `constructor`
  shapes, zero and negative pages, exponent notation, and an over-length `q` are all
  refused. A browser cannot widen audience, breadth, or launch scope.
- **The lane is imported by nothing outside itself.** This is the tripwire: the moment a
  router or composition root imports the catalog, it fails and forces the mounting
  conversation. It was mutation-checked by adding a probe import, confirming it fires and
  names the offending file and line.
- Both filesystem scans assert they actually walked the repository, so neither can start
  passing vacuously.

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
Vitest, the whole lane (25 files)       PASS, 174 tests
Vitest, whole repository                PASS, 512 files, 8,361 tests, 27 skipped
Production build, node script/build.mjs PASS
```

Independent pre-freeze QA (CODEX_MISSION_CONTROL, `PREFREEZE_QA_20260812`) ran this lane
at `0c911fc` and recorded `PASS: 19 files, 116 tests` and `PASS: typecheck and local
production build`. The integration collision audit recorded no unexpected collision, no
composition-root touch, and no ownership correction for this lane. The counts above are
the later, larger figures after the detail surface, the adapter, and the adversarial
gates were added.

**The lane does not ship.** Verified against a real production build: neither
`dist/public/assets` nor `dist/index.cjs` contains any string from this catalog. It is
unmounted in fact, not only by intention.

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
- the export refuses rather than truncating, and carries no private field;
- the detail surface renders exactly one server-provided CTA, and no quantity control
  without a matching accepted exact-variant capability.

## QA runbook

For an independent reviewer, in this worktree, with no mounting and no deployment:

```bash
npx tsc --noEmit
npx vitest run server/research/master-offerings client/src/research/master-offerings --testTimeout=30000
node script/build.mjs
```

Expect `PASS`, `22 files / 143 tests`, and a clean build. The thirty-second timeout is a
host allowance, not a lane requirement; the default five seconds is unreliable on this
Windows machine for unrelated filesystem-scan tests.

Then confirm the lane still does not ship:

```bash
grep -rl "catalog-display/v2" dist/public/assets dist/index.cjs
```

Expect no match. A match means something now imports the catalog, and the mounting
question is open.

The adversarial pass is `server/research/master-offerings/catalog-boundaries.test.ts`. To
confirm its tripwire is live rather than vacuous, add a file anywhere under `client/src`
that imports `./master-offerings/FullCatalogPage`, rerun that one file, and expect a
failure naming your probe. Delete the probe afterwards.

### What cannot be verified here

The responsive and accessibility matrix in `ZERO_DELAY_FAST_FOLLOW_PACKET.md` section 11
(390, 768, 1024, 1440 and 1920 widths, 200 percent zoom, reduced motion, real keyboard
traversal) needs a rendered route. These components are deliberately routed nowhere, so
that matrix runs after the composition-root owner mounts the surface, not before. The
structural half of it is covered by unit tests today: one `h1`, labelled controls, list
semantics, state in words as well as tone, a polite live result count, focus moved to the
results heading on an explicit page change, 44px minimum targets, and accessible names
that carry the product and the variant.

## Rollback

`RESEARCH_MASTER_OFFERINGS_ENABLED=false` removes the whole surface, including the
export. The manual purchase CTA rolls back on its own flag without touching the catalog.
This pack adds no migration, no table, no Product Control binding, and no data, so there
is nothing to roll back below the flag.

## The handoff into the existing cart

`catalog-cart-handoff.ts` is not a cart. It builds no line, holds no total,
persists nothing, and knows no pricing rule. It takes the `add_to_cart` action the
server already resolved, checks the quantity against the injected accepted capability,
and hands an exact-variant request to whatever the composition root injects as the real
cart. Product id, variant id, amount and evaluation instant all come from the action, so
a catalog row cannot reach the cart on its own.

Three properties are worth stating because they are the ones that bite in production:

- **A double click is one add.** The idempotency key is derived from the exact identity,
  the quantity and the price instant, and an in-flight set keyed on it serializes repeats.
  It is keyed per request rather than a single boolean, so adding a different variant
  while one add is in flight is still allowed. The lock releases even when the cart
  throws, because a stuck lock would leave the button dead for the session.
- **`evaluatedAt` is part of the key.** Adding the same variant again after the price was
  re-evaluated is a new intent, not a duplicate of the old one.
- **A Care pathway stays a Care pathway.** No quantity, capability, or repetition can turn
  a non-purchase action into a checkout; the handoff refuses every action kind except
  `add_to_cart` before anything else happens.

The detail container surfaces a refusal in plain words and never shows the cart's own
code to a member.

## Kris and the named-member breadth grant

Kris's canonical identity belongs to the Pack 02 account lane, which recorded his
organization's canonical email and his existing Supabase Auth UID in its own human-gated
binding runbook. **This lane does not restate either, and no test here contains them.**
Duplicating an identity across lanes is how two systems start disagreeing about who
someone is.

What this lane owns is the mechanism, and it is proven: an allowlisted address on
`RESEARCH_FULL_CATALOG_MEMBERS` sees the full member-safe breadth, a near miss does not,
an unset or misspelled variable grants nobody, and the grant selects which records are
listed without touching price, action, or purchase verdict.

For Kris to see the catalog, `RESEARCH_FULL_CATALOG_MEMBERS` must contain the exact
canonical email from the Pack 02 lane's accepted artifact. Take the value from there, not
from here.

## Integration requirements, in order

1. **Produce the runtime dataset.** Run `scripts/research/build-master-offerings.ts`
   against the private intake, then verify it with
   `verify-master-offerings-dataset.ts`. Without this there is nothing to show, however
   the surface is mounted. This is the blocker for "Kris sees the catalog".
2. **Point the server at it** with `XENIOS_MASTER_OFFERINGS_DATASET`, and decide whether
   the file ships with the build or is mounted alongside it.
3. **Mount the three prepared handlers once**, per the composition section above, with a
   request-scoped service.
4. **Add Kris to `RESEARCH_FULL_CATALOG_MEMBERS`**, or set
   `RESEARCH_MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY=false` once founder smoke has passed.
   Either way `RESEARCH_MASTER_OFFERINGS_ENABLED=true` is required first.
5. **Create Product Control bindings** for the exact variants that should show a price and
   a cart. Until then every row correctly reads `Price on request` and offers a request
   path, which is a truthful launch state rather than a broken one.
6. **Decide the manual purchase CTA.** Business priority 7 wants a useful order path
   rather than a dead product card, and that is exactly what
   `RESEARCH_MASTER_OFFERINGS_MANUAL_PURCHASE_REQUESTS=true` provides.
7. **Feed the quantity capability** from the accepted quantity authority at the 1 to 50
   band, after the register's repair order has been followed.

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
