# Dead code, duplicate systems, and convergence register

## Scope and evidence boundary

This register is based on candidate `f3cb2088d36c87561ec58455ccf126341fc9789a`; known live production is `ROMAN_RELEASE_0_4` at `8c8ce358263a041f13fb270d7034164a66a04896`. “Unmounted” means no production registration was found in the candidate composition root. It does not mean the code should be deleted without dependency and release-history review.

## Classification rules

- **Canonical candidate:** should own a platform truth after integration review.
- **Projection/adapter:** may remain, but cannot independently create authoritative product, price, identity, or order state.
- **Prepared/unmounted:** tested code without a candidate production registration.
- **Compatibility path:** currently supports an older runtime contract and should have an explicit retirement gate.
- **Specialized door:** valid cohort-specific behavior downstream of canonical authority.
- **Potentially obsolete:** no evidenced production caller and no unique authority; verify before removal.

## Register

| System/family | Current classification | Evidence | Decision |
|---|---|---|---|
| Product Control + member catalog | Canonical candidate | Mounted member catalog and admin control; Product Control reader also feeds pricing | Retain and declare canonical product identity/facts |
| Shared pricing core | Canonical candidate | Server resolver, audience fingerprint, cart/order snapshots; candidate resolver reads Product Control | Retain as the only price authority |
| Master offerings | Projection; prepared server API | 1,121 member-safe products; client routes mounted; server composition root has no registration | Retain as full-range import/search/projection; mount only through canonical Product Control authority |
| Kris/Roman Launch A | Specialized adapter | 420-item buyer profile; candidate mounts read routes; Buy Now depends on Early Access bindings and buyer price | Retain; never treat as a second master catalog |
| Private Early Access | Specialized door | Durable cohort cart/order/payment/proof/fulfillment composition with fail-closed gates | Retain; converge identity/order reporting with general commerce |
| Legacy `products-data.ts` | Compatibility path | 26-item array is the default general-commerce catalog while Product Control is separately canonical for member/pricing reads | Replace as default; time-box and then retire |
| Catalog-display routes | Prepared/unmounted projection | Route factory and tests exist; no `server/index.ts` registration found | Fold useful viewer DTO behavior into the canonical read side or explicitly mount; otherwise retire |
| Buyer-commerce routes | Prepared/unmounted commerce factory | `/api/research/buyer/order-requests` exists in module tests; no production registration found | Do not independently activate; merge requirements into the one commerce spine |
| Persistent-cart repository | Prepared/unintegrated duplicate candidate | `createPersistentCartRepository` is referenced only by its test; active production composition uses the cart-store path | Integrate only if it replaces the active store under one owner; otherwise archive |
| Pack04 order/payment/fulfillment workflow | Prepared/unintegrated duplicate candidate | Workflow service/persistence symbols have test/compatibility references but no production composition hit | Do not mount as a second order engine; merge unique invariants or archive |
| Legacy Research order containment route | Compatibility/safety path | Returns `ordering_not_open` rather than accepting an unsupported order | Retain until all callers move to canonical commerce; then retire deliberately |
| Product requests | Canonical demand-intake workflow | Mounted, durable, private files and review lifecycle; explicitly cannot create commerce state | Retain; add a governed link to Product Control rather than conversion side effects |
| Partner/affiliate v1 and v2 layers | Transitional parallel versions | Multiple route and contract families coexist; detailed verdict in `AFFILIATE_PORTAL_AUDIT.md` | Choose one public contract and migration plan; preserve referral history |
| Account-identity organization pack | Canonical candidate backend, client activation incomplete | Backend mounted; account UI pack exists but route ownership was actively changing outside this lane | Retain; integrate through the one account/role launcher |
| Admin CRM/supplier operations pack | Prepared/unmounted operations slice | UI describes Pack 05 as unmounted; route tests also call it unmounted | Mount behind canonical admin guard or fold into existing queues; do not leave a second intake authority |
| Supplier/inventory/fulfillment services | Internal operations boundary | Supplier facts and provider ports exist; inventory admin is mounted; no supplier tenant portal evidenced | Retain internal services; decide whether supplier access is actually required before creating a portal |

## Concrete drift and duplication findings

### Catalog truth is split

The strongest present contradiction is not duplicate code by itself; it is different default data sources at different stages:

- member catalog reads Product Control;
- mounted pricing reads Product Control;
- general commerce defaults to the legacy 26-product array;
- master offerings supplies a 1,121-product member-safe projection but is server-unmounted;
- Kris supplies a 420-product specialized artifact;
- Early Access has its own release/catalog door.

These can coexist only if all but Product Control are explicitly downstream projections/adapters with stable canonical keys.

### Comments and tests mask catalog drift

General commerce has a nearby “0 of 15 today” comment, while the imported array currently has 26 products and its test accepts any count at or above 15. Replace the lower-bound assertion with a revisioned expectation or canonical Product Control fixture so silent additions/removals cannot masquerade as coverage.

The same static legacy adapter is also used by Product Diagnostics/Website3 readiness. Retiring it from cart/checkout alone would leave a second operational view of catalog truth; both composition points need to move together.

### Mounted UI can target unmounted APIs

The full catalog client routes are reachable, but their API adapter deliberately recognizes the SPA catch-all as unavailable. That is safe failure behavior, not a complete product journey. Route presence must not be reported as feature completion.

### Factories are not production features

Catalog-display, buyer-commerce, and Admin CRM/supplier operations have substantial tested modules but no evidenced candidate production mount. Their code is useful integration material; counting them as live features would be inaccurate.

The persistent-cart repository and Pack04 order/payment/fulfillment workflow are also not production-composed on this candidate. They should be treated as future/duplicate candidates until an owner either replaces the active store/engine with them or preserves their unique invariants in the current spine.

### Repository migrations are not a complete bootstrap ledger

The dated Product Control migration alters a base `research_products` table whose creation was found only in standalone SQL/bundle files, not in `supabase/migrations`. Several commerce and product-request bases have the same pattern. Do not delete those standalone bundles as “duplicate SQL” until the actual Supabase migration history is reconciled and zero-to-current bootstrap is proven.

## Removal safety checklist

Before deleting or replacing any listed family:

1. search imports, dynamic imports, route registrations, test fixtures, migrations, scripts, and documentation;
2. inspect deployed SHA and release branches, not only the candidate;
3. preserve immutable order, payment, referral, audit, and price-snapshot records;
4. provide a data migration or compatibility reader where durable rows exist;
5. add a route-level negative test proving the retired path cannot create state;
6. remove feature flags and environment variables only after the final caller is gone;
7. keep rollback compatibility for the current production release train.

## Recommended convergence order

1. Declare Product Control + shared pricing as product/price authority.
2. Adapt general commerce to that authority.
3. Bind Early Access and Kris to the same canonical keys and order reporting.
4. Integrate master-offerings breadth as governed Product Control import/projection.
5. Merge or retire catalog-display and buyer-commerce factories.
6. Choose one affiliate contract/version and one organization identity/portal entry.
7. Decide whether supplier users require a portal; otherwise keep supplier work internal and avoid an unused identity architecture.

No source family should be removed during this audit-only slice. Runtime changes belong to the owning implementation lanes and the sole release integrator.
