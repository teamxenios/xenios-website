# Catalog Zero-Delay Fast Follow Packet

**Foundation:** `87001760237323a7cf3399aaffd49bbf484b9633`
**Rebase target:** waiting for the frozen final Early Access SHA
**Current posture:** isolated, unmounted, undeployed

## Non-negotiable boundary

Display authority is not commerce authority. The planning catalog can make a
member-safe offering visible. Only an exact binding plus an existing
runtime-valid `CartProductSelection` can produce `Add to Cart`. No workbook
price, display state, reconciliation recommendation, or quantity input can do
so.

This packet creates no catalog database, Product Control binding, route mount,
client route, migration, Early Access change, or production mutation.

## 1. Final catalog list API composition packet

Prepared route:

```text
GET /api/research/catalog-display/v2/catalog
```

Implementation:

```text
server/research/master-offerings/routes.ts
server/research/master-offerings/service.ts
shared/research/master-offerings/contract.ts
```

The route is active-member/admin only, private/no-store/noindex, display-flag
gated, founder/admin-first gated, and server paginated. Response shape:

```text
ok
audience
launchScope
catalog.page
catalog.pageSize
catalog.total
catalog.totalPages
catalog.products[]
```

Cards contain no amount or action. Exact variant actions are resolved only on
detail, preventing a planning card from looking transaction-ready.

## 2. Final catalog detail API composition packet

Prepared route:

```text
GET /api/research/catalog-display/v2/products/:family/:slug
```

Family and slug use closed validation. Missing, held, wrong-family, and
unauthorized-breadth identities must not become enumeration oracles. The detail
response contains member-safe metadata, disclosures, exact planning variants,
and a server-resolved action.

The API handler composition exists, but it contains zero Express registration
calls. `server/index.ts` does not import or mount it. This keeps the current
route census and route pins unchanged until the frozen-SHA integration commit.

## 3. Search/filter composition packet

Accepted inputs:

```text
q          <= 160 characters
families   closed MasterOfferingFamily values, comma or repeated form
states     closed MasterOfferingDisplayState values, comma or repeated form
page       positive safe integer
pageSize   positive integer, maximum 100
```

Unknown query keys are rejected. The browser cannot select audience, breadth,
launch scope, price, or commerce mode. Default page size remains 24. Search
normalizes punctuation, dashes, plus signs, trademarks, Greek alpha/beta, and
research framing.

## 4. Existing product-request integration

Prepared adapter:

```text
server/research/master-offerings/product-request-adapter.ts
```

CTA mapping:

| Display state | CTA | Existing durable action |
| --- | --- | --- |
| `available_now` without valid selection | Request Access | Product request |
| `available_this_week` | Notify Me | Product request, future interest |
| `request_access` | Request Access | Product request |
| `approval_required` | Apply | Product request, review intent |
| `temporarily_unavailable` | Notify Me | Product request, future interest |
| `coming_soon` | Join Waitlist | Product request, future interest |
| `care_pathway` | Explore Care | Existing Care route |
| `planned` | Get Updates | Product request, future interest |
| `unavailable` | None | No action |

The adapter delegates to `toExistingProductRequest`. It creates no parallel
table or service. Offering, variant, and intent are safe URL attribution. The
request prefill carries no purchase quantity.

## 5. Product Control action resolver adapter

Prepared adapter:

```text
server/research/master-offerings/product-control-adapter.ts
```

Injected dependencies:

```text
read-only exact binding reader
existing Product Control selection authority
server-derived audience/currency/evaluation context
```

The binding interface has no mutation method. The adapter asks the accepted
Product Control selector for the exact bound product and variant, then passes
through the returned `CartProductSelection`. Missing binding, invalid context,
selection refusal, or an exception yields no commerce and leaves display intact.

## 6. Member-safe catalog UI integration packet

Prepared client-only helper:

```text
client/src/research/master-offerings/integration-packet.ts
```

It composes list/detail API URLs, preserves the existing member detail path,
pins the closed state filter vocabulary, and hides purchase quantity unless the
action is `add_to_cart` and an accepted exact-variant quantity capability is
injected.

Recommended component split after rebase:

```text
MasterOfferingCatalogControls
MasterOfferingCatalogGrid
MasterOfferingCard
MasterOfferingPagination
MasterOfferingDetail
MasterOfferingVariantAction
MasterOfferingDemandCta
```

No raw dataset enters the client bundle. The client consumes only the shared
browser contract.

## 7. `/research/member/products` upgrade packet

Reuse these existing routes without adding a storefront:

```text
/research/member/products
/research/member/products/:slug
```

Post-rebase composition changes are limited to:

```text
client/src/research/adapters/memberCatalogApi.ts
client/src/research/pages/member/Products.tsx
client/src/research/pages/member/ProductPage.tsx
client/src/research/products-diagnostics/MemberCatalogExperience.tsx
client/src/research/products-diagnostics/MemberProductDetailExperience.tsx
```

Upgrade sequence:

1. Switch reads to the v2 API behind the display-first flag.
2. Move filtering and pagination to URL query state and server requests.
3. Render 24 cards initially; never render 1,121 cards into the first DOM.
4. Preserve neutral copy and the existing member shell.
5. Render exactly one server-provided CTA per selected variant.
6. Keep the legacy API/client adapter available for flag-off rollback.

## 8. Public/full catalog visibility plan

The catalog remains private and noindex. “Full” means full member-safe breadth,
not public internet access.

```text
RESEARCH_CATALOG_DISPLAY_ENABLED
  Existing v1 display control; unchanged.

RESEARCH_MASTER_OFFERINGS_ENABLED
  New v2 display-first reachability; exact true enables.

RESEARCH_FULL_CATALOG_MEMBERS
  Existing exact-email allowlist; reused for founder/early-member access.
```

None of these flags changes action kind, Product Control readiness, quantity,
or a regulatory/provider hold.

## 9. Founder/admin-only first-launch flag

```text
RESEARCH_MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY=true
```

Fail-closed default is founder/admin-only when unset or malformed. Admins pass
through the existing admin authorizer. Members require exact membership in
`RESEARCH_FULL_CATALOG_MEMBERS`. After founder smoke, an explicit value of
`false` expands display to all active members; it does not expand commerce.

## 10. Route census forecast

| Surface | Current | Candidate | Composition action |
| --- | --- | --- | --- |
| Member UI list | `/research/member/products` | unchanged | Upgrade existing page |
| Member UI detail | `/research/member/products/:slug` | unchanged | Upgrade existing page |
| Existing member API | `/api/research/member/products` | retained for rollback | No initial removal |
| Existing member detail API | `/api/research/member/products/:slug` | retained for rollback | No initial removal |
| v2 catalog list | absent | `/api/research/catalog-display/v2/catalog` | One controlled mount |
| v2 catalog detail | absent | `/api/research/catalog-display/v2/products/:family/:slug` | One controlled mount |
| Product requests | `/api/research/member/product-requests` | unchanged | Reuse |
| Care | existing member Care route | unchanged | Reuse |

Expected protected composition edits after frozen-SHA rebase:

1. `server/index.ts`: create the handler packet and register the two GET and two
   OPTIONS routes once, plus the path-scoped error handler.
2. `server/research/index.ts`: admit GET/HEAD under
   `/catalog-display/v2/` to the stronger downstream member guard.
3. Client pages listed in section 7: switch behind the display flag.

No `register.ts`, Early Access route pin, migration DAG, checkout, payment,
settlement, proof, legal, or fulfilment file belongs in this diff.

## 11. Responsive/accessibility test packet

Required viewports:

```text
390 x 844
768 x 1024
1024 x 768
1440 x 900
1920 x 1080
```

Required checks:

- one semantic `h1`, ordered section headings, cards inside a list;
- labeled search, family, state, and pagination controls;
- keyboard access and visible focus for every CTA and variant control;
- live result count without announcing every keystroke twice;
- state text in addition to color;
- 44px touch targets at mobile width;
- no horizontal overflow at 390px;
- focus moves to results heading after explicit page change;
- empty, loading, unavailable, restricted, error, and success states;
- `Add to Cart` absent from all planning/request fixtures;
- purchase quantity absent unless accepted exact-variant capability exists;
- 200% zoom and reduced-motion smoke;
- screen-reader names for variant selector and CTA include product/variant.

## 12. Full repository test matrix

See `FULL_REPOSITORY_TEST_MATRIX.md`. The pre-rebase packet must pass isolated
compile, master-offering tests, current member-catalog tests, catalog-display
tests, Product Control selection tests, product-request tests, TypeScript, and
build. After rebase, add Early Access quantity/cart regression and route-census
gates from the frozen SHA.

## 13. Rollback packet

See `ROLLBACK_PACKET.md`. Primary rollback is:

```text
RESEARCH_MASTER_OFFERINGS_ENABLED=false
```

The legacy member catalog remains mounted for the first launch. No schema or
data rollback is required because this packet adds none.

## Quantity policy handoff

The UI adapter accepts an `AcceptedExactVariantQuantityCapability` but defines
no quantity constants. After the final Quantity candidate is accepted, compose
its exact source into that interface and test:

```text
exact purchasable variant: 1 through 20
same exact variant aggregate: <= 20
planning/request action: no purchase quantity selector
```

Do not infer this capability from a planning state or duplicate the final cart
policy in catalog code.

## Reconciliation handoff

Prepared adapter:

```text
server/research/master-offerings/approved-reconciliation-adapter.ts
```

It refuses `recommended` and `held_for_human_review` envelopes. Only a complete
approved decision with reviewer, approval actor, timezone-qualified timestamps,
source digest, valid target, and valid disposition compiles into a read-only
identity plan. The plan carries no amount, purchasable field, binding write, or
action mutation.

Current state:

```text
MERGE recommendations: 26
HOLD recommendations: 3
HUMAN REVIEW recommendations: 2
APPROVED/APPLIED: 0
```
