# Catalog, pricing, and commerce forensic audit

## Audit coordinates

- **Repository:** `teamxenios/xenios-website`
- **Candidate code basis:** `f3cb2088d36c87561ec58455ccf126341fc9789a`
- **Known live production:** `ROMAN_RELEASE_0_4` at `8c8ce358263a041f13fb270d7034164a66a04896`
- **Audit date:** 2026-08-14
- **Evidence type:** static source, generated artifacts, route inventory, and targeted tests
- **Runtime caveat:** this audit does not assert the deployed feature-flag values, database migrations/rows, provider credentials, or authenticated browser behavior.

## Executive verdict

**P0 — the platform is not yet one general-purpose catalog-to-order system.** It has substantial, security-conscious implementations, but product truth and purchase execution are split across multiple differently activated paths:

1. Product Control is the strongest candidate for canonical product facts and is the source for the mounted member catalog and mounted pricing reads.
2. The full 1,121-product master-offerings projection has member UI routes but its server API is deliberately unmounted.
3. The 420-item Kris/Roman catalog is a specialized buyer-profile adapter. Its read routes are mounted; purchase opens only when the Early Access door, customer bindings, release ledger, and buyer-scoped pricing are all present.
4. General Research commerce and Product Diagnostics are mounted behind fail-closed capabilities, but both default to a separate 26-product legacy array rather than Product Control.
5. Private Early Access has the most complete durable order/payment/proof/fulfillment path, but it is a controlled cohort door, not the general member storefront.
6. Product requests are a durable demand-signal workflow and explicitly do not create a product, price, inventory record, commerce state, or order.
7. The buyer-commerce and catalog-display factories exist and are tested, but are not registered by `server/index.ts` on this candidate.

The safe direction is convergence around Product Control identity and pricing authority, with the Kris, master-offerings, and Early Access code retained as projections/adapters. Enabling all existing paths independently would preserve conflicting catalog and order authorities. The current client has no non-test caller for the general-commerce add-to-cart adapter, so Product Control browse is also disconnected from the mounted general cart at the composition layer.

## Reproducible evidence

The machine-readable evidence is committed beside this report:

- `CATALOG_COMMERCE_OPERATIONS_EVIDENCE.json` — code-basis metadata, route/client/file inventory, guard/config/persistence signals, system families, and limitations.
- `CATALOG_COMMERCE_OPERATIONS_ROUTE_MATRIX.csv` — one row per statically discovered domain API route or classified client route, with API guard signals kept distinct from client wrapper signals.
- `scripts/research/generate-catalog-commerce-ops-audit.ts` — deterministic generator.
- `server/research/catalog-commerce-ops-audit.test.ts` — classification, route, guard, private-field, and CSV negative controls.

Static inventory on the candidate:

| Measure | Result |
|---|---:|
| All statically discovered API registrations | 369 |
| All static Express registration call sites | 360 |
| Domain API routes after overlapping classification | 251 |
| Catalog-classified API routes | 43 |
| Pricing-classified API routes | 4 |
| Commerce-classified API routes | 62 |
| Catalog client routes | 2 |
| Commerce client routes | 11 |
| Catalog-classified tests | 132 |
| Pricing-classified tests | 24 |
| Commerce-classified tests | 133 |
| Route-scanner errors | 0 |
| Static review items requiring parent/runtime guard trace | 20 |

Counts overlap when one route serves multiple domains. Static presence is not proof of mount, enablement, migration, data, or deployment.

## Authority map

| System | What it contains | Candidate reachability | Authority verdict |
|---|---|---|---|
| Product Control/member catalog | Product facts, publication/visibility, member-safe projection, Product Control administration | `registerMemberCatalogApi(...)` is mounted in `server/index.ts`; Product Control admin is mounted separately | **Canonical candidate for product identity and facts** |
| Pricing core | Server-authoritative price resolution, cart/order snapshots, audience fingerprint | `registerPricingApi(...)` is mounted; enablement uses the shared commerce flag | **Canonical price boundary, but runtime-dark until enabled/configured** |
| Master offerings | 1,236 source rows normalized to 1,121 canonical products and 1,181 variants | Client routes `/research/member/catalog` and detail are mounted; server routes are deliberately unmounted | **Full-range projection, not independently authoritative** |
| Kris/Roman Launch A | 420 products; 418 priced and 2 price-pending under `KRIS_VOLUME_PARTNER` | Candidate registers list/detail GET and OPTIONS explicitly | **Specialized adapter; must remain downstream of canonical truth** |
| Legacy Research catalog | 26 hard-coded products with `coming-soon`, `hold`, `professional-only`, or `request-access` states | Default input to general commerce dependencies | **Transitional source; not acceptable as a second master catalog** |
| General commerce | Catalog/goals, cart, checkout, orders, subscriptions, claims, partners | Mounted; stateful surfaces fail closed unless flag, repository, and provider gates pass | **Target general commerce spine, not fully activated** |
| Private Early Access | Cohort catalog, cart, agreements, checkout, order, payment proof/review, fulfillment | Mounted through the Early Access composition root when its exact gates pass | **Operational specialized door, not the general member spine** |
| Product requests | Member submission, messages, files, admin queue, status, analytics | Mounted by the member-platform composition root | **Durable demand intake only** |
| Buyer commerce | Buyer order-request factory and durable dependency adapters | No production registration found in `server/index.ts` | **Prepared/unmounted; do not create a parallel buyer architecture** |
| Catalog display | Viewer-authorized display projection | No production registration found in `server/index.ts` | **Prepared/unmounted projection** |

## Catalog evidence

### Product Control is the runtime read-side anchor

`server/index.ts:422-426` registers the member catalog with `buildMemberCatalogProductionService()` and `requireActiveMember`. The production reader filters to published, public, active Product Control records, performs a stable/unique identity read, and emits a member DTO rather than returning internal rows. The service also reads inventory lots through the canonical inventory projection and signs media URLs on the server. The same composition root builds pricing reads from `createProductionProductControlReader()` at `server/index.ts:469-501`.

The primary member path `/research/member/products` calls `/api/research/member/products`; its detail experience does not expose a general Buy/Add action. Its available action is a product-request handoff when the offer is not directly available. The general-commerce adapter exports `addCartLine`, but a non-test client call site was not found on this candidate.

### Full master offerings is broad but server-unmounted

The generated member-safe artifact reports:

- 1,236 source rows;
- 1,121 canonical products;
- 1,181 variants;
- no supplier identity, wholesale cost, planning price, margin, internal notes, or provider names;
- no planning row capable of becoming purchasable.

The UI routes exist at `/research/member/catalog` and `/research/member/catalog/:family/:slug`. However, `client/src/research/master-offerings/catalogApi.ts` documents that the prepared server routes are deliberately unmounted, and the production composition root contains no master-offerings registration. The client intentionally converts the SPA catch-all response into an unavailable state rather than treating it as an empty catalog.

### Kris/Roman is specialized and gated

The generated Launch A artifact reports 420 items, 418 priced, and 2 price-pending. Its member-safe invariants exclude supplier identity, buy cost, margin, savings claims, internal sourcing notes, and suggested-sell price; artifact data alone cannot make an item purchasable.

The candidate explicitly mounts four read descriptors. The composition root states that Buy Now remains closed unless the Early Access door sources, release ledger, customer bindings, and buyer-scoped prices exist. This is appropriate containment, but it is not evidence that the currently deployed runtime has those dependencies.

### Legacy catalog drift is measurable

`server/research/commerce/production-deps.ts:1391-1398` defaults general commerce to `adaptLegacyCatalog(legacyProducts, "2026-07-20")`. `server/research/products-diagnostics/production-deps.ts:901-920` repeats that legacy adaptation for the diagnostics/readiness surface. A direct import on the candidate reports 26 entries across the `consumer` and `research` lanes. The nearby commerce comment still says “0 of 15 today,” while its test only enforces `>= 15`. The legacy adapter marks those prices unverified and blocks commerce approval; that mismatch is a concrete drift signal even though the adapter itself is provenance-safe.

## Pricing evidence

The shared pricing contract is structurally sound:

- the server resolves authoritative price;
- cart snapshots are recomputed rather than trusted from the browser;
- order-line snapshots are immutable records of the agreed amount;
- pricing audiences carry a source-version fingerprint;
- the candidate pricing resolver reads Product Control, not a client price.

The unresolved issue is activation and convergence. The pricing API uses `NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED`, while the general commerce catalog still defaults to the legacy 26-product source. A canonical Product Control price does not by itself make a legacy commerce item, a master-offerings projection, and a Kris overlay the same sellable SKU.

## Commerce journey matrix

| Journey | Client route | Server path | Candidate verdict |
|---|---|---|---|
| Browse primary member products | `/research/member/products` | `/api/research/member/products` | Mounted, member-guarded Product Control read side |
| Browse full master catalog | `/research/member/catalog` | prepared master-offerings API | Client mounted; server deliberately unmounted |
| Browse Kris catalog | `/research/member/kris-catalog` | `/api/research/kris-launch-a/v1/*` | Read routes mounted; purchase dependency-gated |
| Request an unavailable product | `/research/member/product-requests/new` | `/api/research/member/product-requests*` | Durable member/admin workflow; not commerce conversion |
| General cart | `/research/member/cart` | `/api/research/cart*` | Mounted; fails closed unless general commerce is live |
| General checkout | `/research/member/checkout` | `/api/research/checkout*` | Mounted; repository/provider/flag gated |
| General orders | member/admin order routes | `/api/research/orders*` and admin variants | General state depends on commerce wiring; Early Access history can project into reads |
| Subscriptions | `/research/member/subscriptions` | `/api/research/subscriptions*` | UI truthfully says controls unlock when ordering opens |
| Private Early Access | private door and cart journey | Early Access route families | Specialized durable flow under its own activation gates |
| Buyer order request | no production client entry established | `/api/research/buyer/order-requests` factory | Unmounted on this candidate |

The legacy containment route in `server/research/index.ts` returns 503 for Research ordering when the general catalog is not open. This is safer than accepting an order against the wrong authority.

The general-commerce client adapter contains browse, cart, checkout, order, subscription, claim, and credit calls, but no non-test caller was found for its `listProducts`, `getProduct`, `addCartLine`, or `createSubscription` exports. Current member product pages use the Product Control adapter, while the cart UI can update/remove existing lines. This is direct evidence of a missing browse-to-cart handoff, not merely a hidden button.

## Migration-path finding

The repository's dated Product Control migration begins by altering `public.research_products` and then creates variants, prices, media, and audit structures. The base `CREATE TABLE research_products` was not found in `supabase/migrations`; it exists in standalone SQL/bundle files. The same repository-path pattern applies to several general-commerce and product-request base tables. This proves a **repository migration-ledger gap**, not that production lacks those tables. Before release, the integrator must compare the actual Supabase migration history and schema to the intended bundle, then make bootstrap-from-zero reproducible.

## Product-request boundary

The product-request contract supports `submitted`, review, diligence, planning, `added_to_catalog`, unavailable, rejection, closure, and withdrawal states. It also supports member messages, private attachments, admin assignment/priority/status, and analytics. The product-request UI and server explicitly state the non-commerce invariant: a request never creates a product, order, inventory record, commerce state, price, approval, or availability.

That makes product requests a valid interim CTA, but there is no evidenced atomic conversion from an accepted request to Product Control product + governed price + quote/order. The `added_to_catalog` status is a review outcome, not proof of that conversion.

## P0 remediation sequence

1. **Publish one authority declaration.** Product Control owns product identity, variants, publication, visibility, and sellability. The master-offerings and Kris datasets remain revisioned inputs/projections, never independent order authorities.
2. **Replace the general commerce default catalog.** Feed cart/checkout/order eligibility from a Product Control-backed sellable projection. Keep the legacy adapter only as an explicit, time-bounded compatibility path.
3. **Bind one stable product/variant key across projections.** Master offerings, Kris overlays, Early Access releases, pricing snapshots, carts, product requests, and orders must resolve to the same canonical identity or fail closed.
4. **Create one controlled request-to-offer transition.** An administrator may link an accepted request to an existing or newly governed Product Control item, but only a separately authorized price/publication action may make it offerable. Do not let a request status create commerce state.
5. **Prove activation before enabling general checkout.** Verify the production SHA, flag, migrations, Product Control rows, repository mode, payment provider, webhook verification, idempotency, inventory/fulfillment behavior, and member/admin guards in the actual deployment.
6. **Keep specialized doors downstream.** Kris and Private Early Access may apply entitlement, release, quantity, and buyer-price overlays after canonical identity resolution; they must not fork product or order truth.
7. **Close the migration-ledger gap.** Register or document the canonical base schemas in the release migration path, prove a disposable zero-to-current bootstrap, and probe the real project before relying on later `ALTER TABLE` migrations.

## P1 cleanup

- Remove or update the stale “0 of 15” comment and pin an exact expected legacy catalog count while the compatibility path remains.
- Mark every prepared/unmounted module in one lifecycle registry: activate, retain as adapter, or retire after convergence.
- Give `/research/member/catalog` an explicit server capability response rather than relying on SPA-shell normalization once the authority decision is final.
- Reconcile the member information architecture so “Products,” “Catalog,” and “Kris Catalog” communicate why each exists and which actions are available.
- Add an integration test that starts from one canonical variant and proves the same identity and server-computed price through browse, cart, checkout, order snapshot, admin view, and fulfillment projection.

## Security and privacy notes

- The full and Kris generated artifacts contain explicit private-field invariants and currently report those invariants as false.
- Product Control uses a member-safe projection rather than exposing administrative rows.
- Static scanning found files containing supplier/cost/margin vocabulary, but that is expected in internal operations code. The scanner does **not** call those files leaks; endpoint DTO and runtime authorization must be traced.
- Twenty mutation registrations lack a recognized guard token in the same file. Most use injected parent guards, so these are review items rather than vulnerability findings. The exact rows are in the CSV and JSON evidence.

## Release gate

Do not represent the candidate as a complete general storefront until all of the following are proven on the deployed SHA:

- Product Control is the catalog and price identity used by general cart/checkout;
- the requested member catalog breadth is published and visible;
- feature flags and migrations match the candidate;
- one real member can browse, request or buy only what policy permits;
- a replayed checkout cannot create a second order;
- admin order/payment/fulfillment views show the same immutable price and product identity;
- specialized Kris/Early Access overlays cannot bypass canonical visibility, quantity, or eligibility rules.
