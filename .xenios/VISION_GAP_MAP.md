# Xenios vision gap map (2026-08-17)

Ground truth for the founder two-lane build directive (DECISIONS.md D-009).
Produced by a ten-domain read-only survey of this repository, verified against
the three overlays in `.xenios/prompts/`. Branch `claude/assisted-order-bridge`.
Executive summary and lane tasks are maintained at the top; per-domain findings
below are the raw survey. Re-verify paths before building on them.

## Executive summary

The overlays read as greenfield; the repository is not. Two patterns dominate:

1. **Built but unmounted.** Complete, tested engines exist with no HTTP
   registration or gated dark: the fulfillment state machine + deployed SQL
   (admin fulfillment page can never load data), affiliate attribution and
   commission ledgers (zero non-test callers), the 16-route partner portal API
   (unregistered), Care's ~38-table API surface (capability seeded disabled),
   and the member commerce cart/checkout/orders services (DisabledPaymentProvider,
   commerce flag default false).
2. **Intake without conversion.** The assisted-order bridge (Phase Zero)
   fully covers survey → XRR reference → admin queue → manual status machine,
   but nothing converts a request into a quote, canonical order, or
   fulfillment record; there is no quote entity anywhere, no reorder anywhere,
   and three unreconciled record families (assisted requests, Early Access
   checkouts, member commerce orders).

Money today settles ONLY through the Early Access manual proof-based lane
(Zelle/Cash App/etc. destinations, customer proof upload, named-admin
verification). That is the approved short-term path; the payment provider
boundary is deliberately Disabled pending founder-approved credentials.

For the demo lane the base is unusually strong — in-memory repositories,
pure contracts and state machines, fixture-driven presentational pages, and
the `scripts/preview-early-access.ts` production-isolation precedent — but
`/research/demo` does not exist, production fixture paths are hard-blocked
by design (a new production-permitted `RESEARCH_DEMO_ENABLED` composition
root is required), and there is NO browser E2E framework in the repo
(vitest+supertest only): Playwright is a new capability the demo lane
introduces.

Overlay priority → task mapping (see ACTIVE_TASKS.json):

| Overlay step | Task | State |
|---|---|---|
| P0 cashflow door (survey live) | Phase Zero packet (founder-gated, not a task) | blocked on founder env action |
| P1 request → quote/order | ASSISTED-ORDER-CONVERSION | blocked on ASSISTED-ORDER-MOUNT qa |
| P2 catalog truth + cart | CATALOG-ACTION-UNIFICATION, GENERAL-COMMERCE | ready / blocked |
| P3 payment | PAYMENT-PROVIDER-INTEGRATION | blocked_external (provider approval) |
| P4–P5 fulfillment + tracking | FULFILLMENT-MOUNT, SUPPLIER-WORKSPACE | ready |
| P6 organizations/B2B | F7-PACK02-RENAME → F7-ACCOUNT-MOUNT | claimed / blocked |
| P7 affiliates | AFFILIATE-PRODUCTION | ready |
| P9 Care | CARE-DISCOVERY-BRIDGE | ready |
| Demo (build B) | FULL-VISION-DEMO | ready |

Shared mount points (`server/index.ts`, `client/src/research/section.tsx`,
`client/src/research/lib/routes.ts`) are single-writer seams: a lane needing
a mount line coordinates through `.xenios/messages` with the current lease
owner rather than editing another lane's leased file.

## Domain: assisted-order

### Exists

- `supabase/migrations/20260815150000_research_assisted_order_bridge.sql` — M71: five research_assisted_order_* tables (requests, lines, events, access_tokens, documents) plus eight security-definer RPCs; RPC-only boundary (forced RLS, zero table grants), append-only event ledger, DB-enforced status machine with evidence requirements, XRR reference CHECK, private storage bucket, self-verifying preflight/postcondition.
- `server/research/assisted-order/service.ts` — AssistedOrderService: config (D-005 fail-closed legal gating), catalog, submit (server-side line re-resolution, price/catalog-version conflict checks, exact agreement-pair matching, idempotent replay, XRR receipt), status (30-day token or ownership), admin list/detail/updateStatus with allowedTransitions + evidence, document upload/download tickets, outbox/audit/google-mirror post-commit effects.
- `server/research/assisted-order/http.ts` — Transport-neutral route table: six customer endpoints under /api/research/early-access/assisted-orders (config, catalog, submit, status, document upload-url/complete) and four admin endpoints under /api/admin/research/assisted-orders (list, detail, PATCH status, document download-url), with typed error mapping.
- `server/research/assisted-order/production-deps.ts` — Flag wiring: RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED and RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL env vars, master-offerings catalog callbacks, Supabase RPC repository + storage document store, durable notification outbox with dedupe keys, research audit sink; googleMirror is wired to null.
- `server/research/assisted-order/production.ts` — Fail-closed composition root: disabled flag or any missing dependency (catalog/repository/outbox/audit/documents/adminNotificationEmail) yields service:null with a named refusalReason instead of a memory fallback.
- `server/research/assisted-order/production-catalog.ts` — Projects the canonical master-offerings service + Product Control binding artifact into catalog authority: care_pathway -> provider_request, approval_required -> request_activation, unpriced/unbound -> request_pricing, priced+bound -> direct_order_request; submission-time resolve() re-reads the authority, never the browser snapshot.
- `shared/research/assisted-order/action-policy.ts` — Shared truthful per-product action policy: decideAssistedOrderAction maps authority state to one of five workflow modes with an honest action label (pathway takes precedence over price), plus quantityIsAllowed (minimum/maximum/increment).
- `shared/research/assisted-order/contract.ts` — Shared client/server contract: the 15-state AssistedOrderStatus union, workflow modes, catalog/submit/receipt/status-view/admin types, validateSubmitInput, lineEstimate/totalEstimate, and type guards; imported by both the Express server and the React wizard.
- `server/index.ts` — Production mount (lines ~615-720): builds the composition behind the flag, mounts the six early-access doors and four admin doors (admin behind requireSupabaseAdmin) only when composition.service exists, otherwise logs the refusal reason; dark by default per the 2026-08-15 founder directive.
- `client/src/research/assisted-order/` — Complete wizard UI: AssistedOrderPage (contact/products/review steps), ConfirmationPage, StatusPage with timeline + SecureDocumentUpload, AssistedOrderCta, admin queue/detail pages, api.ts client, pure tested wizard-state.ts; routed at /research/early-access/order-request[/...] (section.tsx:287-289) and /admin/research/assisted-orders (adminx-section.tsx:155-156).
- `server/research/assisted-order/defaults.ts` — System ports: XRR-YYYYMMDD-<10 hex> public reference generator, sha256 hasher with stable object hashing for fingerprints/idempotency keys, and base64url opaque 30-day status tokens.
- `.xenios/PHASE_ZERO_PRODUCTION_PACKET.md` — Founder-approved rollout packet: apply M71, set admin email, deploy frozen SHA, then flip RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED=true; includes rollback (scripts/verify-m71-assisted-order-bridge.sh rehearses the RPC-only boundary; supabase/production/research-assisted-order-bridge-rollback-notes.md is containment).

### Gaps vs the overlays

- No request-to-quote conversion: no quote entity/table, no admin 'issue quote' action, no customer quote acceptance step; the status machine jumps agreements_complete -> payment_pending with free-text payment instructions, and 'quoted' exists only as copy in nextSteps (service.ts:130).
- No linkage from an assisted request to a canonical order: paid/supplier_processing/shipped are certified only by opaque evidence strings (paymentVerificationId, supplierAssignmentId, trackingId) with no FK or conversion into an orders/payments/fulfillment record, so reorder-from-XRR is impossible.
- Customer-facing tracking is absent: the timeline projection (research_assisted_order_timeline_json and AssistedOrderStatusView) exposes only status/occurredAt/customerMessage; trackingId evidence never reaches the customer status page.
- Non-direct products do not deep-link into the wizard: BuyerCommerceBridge.tsx:335-336 mentions 'the existing order-request path' as prose only, and AssistedOrderPage starts with an empty selection (no product/variant prefill via query params), so catalog dead-ends are softened by text, not routed.
- The Google mirror port (google-mirror.ts) is wired to null in production (production-deps.ts:130), so the ops mirror row is never emitted.
- No /research/demo lane exists anywhere in client/ or server/ — the path appears only in .xenios prompt documents; no demo routes, personas, or isolated composition.
- The bridge is production-dark until Phase Zero completes: per the packet pre-flight the M71 tables did not exist in production and the flag was unset, and enabling requires Samuel's per-step approval.
- Entry is gated inside Early Access only ('early_access_or_member' auth on every customer door); there is no public-catalog entry point to the assisted path.
- provider_request / request_activation / availability_review lines are recorded but have no downstream workflow: nothing converts them into a provider (Xenios Care) case, activation review, or availability follow-up; they wait in the same admin queue as everything else.

### Reusable for the demo lane

- shared/research/assisted-order/contract.ts and action-policy.ts - pure, I/O-free contract + truthful per-product action decisions; a demo catalog can call decideAssistedOrderAction/projectAssistedOrderCatalogItem directly.
- server/research/assisted-order/memory-repository.ts - a complete in-memory AssistedOrderRepository already used by service tests; lets the full AssistedOrderService run with zero Supabase dependency for a production-isolated demo.
- server/research/assisted-order/http.ts createAssistedOrderRouteTable - transport-neutral; can be mounted under /api/research/demo/... with a demo viewer resolver without touching production doors.
- server/research/assisted-order/defaults.ts - XRR reference generator, hasher, and token generator work as-is for demo receipts.
- client/src/research/assisted-order components (AssistedOrderPage, StatusPage, ConfirmationPage, SecureDocumentUpload, admin queue/detail) plus wizard-state.ts - the api.ts base paths are the only production coupling; repointing them gives a full clickable buyer + admin persona flow.
- shared/research/assisted-order/form.ts acknowledgment set - gives the demo the same D-005 form-copy gating semantics without a legal backend.

### Lane notes

A build lane for assisted-order should own server/research/assisted-order/**, shared/research/assisted-order/**, client/src/research/assisted-order/**, and any new research_assisted_order* migration, plus the two mount blocks (server/index.ts assisted-order section, section.tsx/adminx-section.tsx route lines) — while treating catalog/master-offerings, buyer-commerce checkout, and payment lanes as read-only dependencies, and leaving M71 production execution to the founder-gated Phase Zero packet. The intake half of the journey (survey UI, persistence, references, status machine, documents, admin queue) is genuinely done; the missing half is conversion. First coherent milestone: a quote step — a quote record attached to an XRR request, an admin issue-quote action and customer acceptance that feed the existing agreements_pending/payment_pending transitions with real evidence, plus deep-linking non-direct catalog CTAs into the wizard with the product/variant prefilled so nothing dead-ends as prose. The demo lane can be built entirely from the memory repository + route table under /research/demo without touching any production path.

## Domain: catalog-product-control

### Exists

- `shared/research/master-offerings/contract.ts` — Display-and-action-only master offerings browser contract: 17 family slugs, truthful display states (available_now, request_access, approval_required, temporarily_unavailable, coming_soon, care_pathway, planned, unavailable), closed sort vocabulary, and the rule that visible never implies purchasable — only a server-emitted add_to_cart after an exact Product Control CartProductSelection is purchase.
- `shared/research/master-offerings/pricing-contract.ts` — Buyer price vocabulary: exhaustive priced | on_request union sourced only from approved Product Control price rows; formatPriceCents rejects non-positive/unsafe amounts so a missing price renders as 'Price on request', never $0; card-level price summaries and a privacy-pinned price-list export row.
- `server/research/master-offerings/ (service.ts, customer-projection.ts, action.ts, routes.ts)` — The canonical master-offerings catalog service (normalized workbook dataset, search/sort/facets, customer projection, price projection via the price authority) mounted at /api/research/catalog-display/v2; resolveMasterOfferingAction emits Add to Cart only when an exact commerce identity binding matches a usable CartProductSelection (audience authorized, inventory eligible, canonical readiness, positive price), else request-access/apply/notify/waitlist/care/early-access-purchase actions by display state.
- `shared/research/assisted-order/action-policy.ts` — Pure per-product pathway resolver decideAssistedOrderAction with explicit precedence: invisible -> provider_request (provider workflow) -> request_activation (classification pending) -> request_pricing (null/pending price) -> availability_review (held or out-of-stock) -> direct_order_request (direct-eligible); plus quantity band validation (min/max/increment) and RUO/access-notice fields on the projected catalog item.
- `server/research/assisted-order/ (production-catalog.ts, service.ts, http.ts, supabase-repository.ts)` — Assisted-order bridge (current branch): projects the canonical master-offerings authority into an assisted-order catalog (care_pathway -> provider workflow, approval_required -> activation, missing price -> price-on-request never zero), serves /api/research/early-access/assisted-orders (+ /catalog, /config) and an admin queue, persisted in research_assisted_order_requests/lines/events/access_tokens/documents (migration 20260815150000).
- `server/research/pricing/authoritative-price-resolver.ts` — Fail-closed buyer-scoped price authority: audience is a branded ServerAuthorizedAudience constructible only from authenticated server identity (never request input), USD-allowlisted, customer-safe explicit field picks (no cost/margin/supplier), non-positive rows never returned; siblings cart-price-binding, checkout-recompute, and order-price-snapshot bind prices through cart and order.
- `server/research/catalog/member-catalog-projection.ts (+ member-catalog-routes.ts, product-control-reader.ts)` — Member catalog projection over Product Control AdminProductDetail rows (research_product_variants/prices/media tables from the product-control-center migration) with required-inputs/readiness gates, ProductControlCurrentPriceResolver, signed media policy, and cart product selection; feeds /research/member/catalog.
- `server/research/catalog-display/projection.ts (+ visibility.ts, routes.ts; shared/research/catalog-display/contract.ts)` — v1 display projection over the three static shared catalogs (peptides/supplements/quantum) enforcing in code: the regulatory-hold tier never reaches a customer view (HeldProductNotice is admin-only), display is not purchase (offer mode carried, never upgraded), peptides carry no price by construction, and amounts render only when the offer mode permits and the amount is a positive safe integer.
- `server/research/commerce/ (cart.ts, checkout.ts, orders.ts, manual-order-payments.ts, refunds.ts)` — General member commerce lane: checkout validates every gate (cart, eligibility, agreements, address, shipping, payment, large-order review) and accumulates the complete blocking set; product commerce is disabled today so the ordinary path is a denial; manual-order-payments defines proof-based methods (cash_app, zelle, venmo, paypal, apple_cash, ach_wire) as non-executed intents — no real payment-processor integration exists.
- `supabase/migrations/ (research_early_access_* series, e.g. 20260807193000, 20260808100000, 20260813120000)` — The live manual buying journey's persistence: early-access carts, cart items/quotes/checkouts, invoices, receipts, settlements, payment proofs, supplier orders, fulfillments, dispatch/tracking events, unit and reservation holds, and member order history — around 60 research_early_access_* tables with RLS hardening.
- `client/src/research/ (master-offerings/, assisted-order/, early-access/, pages/member/)` — Client surfaces: FullCatalogPage + MasterOfferingCard/controls with catalog-cart-handoff at /research/member/catalog; AssistedOrderPage wizard + status/confirmation pages at /research/early-access/order-request; EarlyAccessOrderStatus tracking timeline ('Tracking will be provided when the shipment is released' until real events exist); member Cart/Checkout/Orders/OrderDetail pages.
- `shared/research/flags.ts` — Feature-flag DECLARATIONS only — readResearchFlags/flagFromEnv have zero callers; real gating lives at each composition root (e.g. early-access cart feature-flag.ts), so productCommerce and quantumCommerce names here enforce nothing.

### Gaps vs the overlays

- No /research/demo lane exists at all: no demo routes in client/src/research/section.tsx or App.tsx, no persona-switching surface; the only fixture-mode precedent is the dev-only screenshot gallery (client/src/research/gallery.tsx) which is compiled out in production builds and is not persona-oriented.
- No real payment-processor integration for the direct-buy journey: server/research/commerce/checkout.ts's ordinary path denies (product commerce disabled), and only manual proof-based payment methods exist; catalog -> cart -> online payment -> canonical order is not wired end to end in the general member lane.
- Three parallel catalog truths with no single canonical projection: v1 catalog-display over static shared catalogs, v2 master-offerings over the workbook dataset, and the member-catalog projection over Product Control rows; a buyer-scoped, per-variant unified pathway+price projection consumable by every surface does not exist as one contract.
- Waitlist/out-of-stock is display-only: temporarily_unavailable/coming_soon states route joinWaitlist/notifyMe to the generic product-request href; there is no waitlist persistence, position, or restock-notification workflow.
- No reorder capability: member order history exists (migration 20260813120000) and Orders/OrderDetail pages render, but no reorder-from-past-order action exists anywhere in client, server, or shared code.
- RUO is carried as a display flag (researchUseOnly, access notices) on assisted-order items and catalog disclosures, but there is no distinct RUO acknowledgement/attestation step inside the direct checkout gate set.
- The assisted-order bridge (branch claude/assisted-order-bridge) covers intake through admin queue, but the requirement's full non-direct continuum (quote issuance back to the buyer, quote acceptance converting into a canonical order) is not present — assisted requests and early-access carts/orders remain separate record families with no conversion path.
- Feature gating for any new journey must be built per-mount: shared/research/flags.ts is inert by design, so a demo lane or direct-commerce enablement needs its own env parser + mount consumer + unmounted-by-default test, which does not yet exist for these capabilities.

### Reusable for the demo lane

- shared/research/assisted-order/action-policy.ts - pure, framework-free pathway resolver (decideAssistedOrderAction, projectAssistedOrderCatalogItem, quantityIsAllowed); a demo can feed it fixture AssistedOrderCatalogAuthority rows and get truthful per-product actions with zero production coupling.
- shared/research/master-offerings/contract.ts and pricing-contract.ts - display-only wire contracts (families, display states, priced/on_request price views, never-$0 formatting) importable by any client surface without touching server ingestion.
- shared/research/catalog-display/contract.ts plus shared/research/catalog/* static datasets (peptide/supplement/quantum catalogs and their customer projections) - self-contained member-safe product data usable as demo fixtures.
- client/src/research/master-offerings components (MasterOfferingCard, MasterOfferingCatalogSurface, catalog controls, useCatalogQueryState) - presentational and driven through catalogApi.ts, which a demo lane can swap for a fixture adapter.
- client/src/research/catalog-display components (CatalogGrid, OfferModeBadge, CatalogAmount, labels.ts) and client/src/research/early-access/EarlyAccessOrderStatus.tsx tracking timeline - render truthful states/tracking from props.
- client/src/research/gallery.tsx fixture pattern (fixturesAllowed() static-false in production, devFixture data) - the existing production-isolation precedent a /research/demo lane should copy for its gate.
- server/research/assisted-order/memory-repository.ts and shared/research/commerce.ts pure order transitions (transitionOrder) - in-memory repositories and pure state machines that can back a clickable demo journey without any database or provider.
- client/src/research/assisted-order wizard-state.ts and AssistedOrderPage/Status/Confirmation components - a complete non-direct intake UX reusable against a fixture API.

### Lane notes

A catalog-product-control lane should own the canonical projection and per-product action-resolution path set — shared/research/master-offerings/**, shared/research/assisted-order/action-policy.ts, server/research/master-offerings/**, server/research/catalog/**, server/research/catalog-display/**, and server/research/pricing/catalog-price-projection.ts — and stay out of cart/checkout/payment/fulfillment modules (commerce lane) and out of client/src/research/demo/** (demo lane). Nearly all requirement primitives already exist but live in three parallel stacks, so the lane's job is unification, not invention. First coherent milestone: one buyer-scoped canonical pathway endpoint/contract that merges the v2 master-offerings projection, the authoritative price resolver, and the assisted-order action policy into a single per-variant response (direct_buy | request_pricing | provider_workflow | request_activation | availability_review/waitlist | RUO notice, price as priced/on_request with never-$0 pinned by tests), consumed first by the assisted-order catalog and then by the member full catalog, with the demo lane reading the same contract from fixtures.

## Domain: cart-checkout-payment-orders

### Exists

- `server/research/commerce/cart.ts` — Canonical member cart service: persists only sku/quantity/purchaseMode, re-runs eligibility, price, supplier-fact and lot/stock checks against the catalog on every read (true server-side line revalidation with accumulated denial codes).
- `server/research/commerce/checkout.ts` — Checkout validation/submission: accumulates the complete denial set (cart, agreements, address, serviceable state, shipping, payment, large-order review), FEFO inventory ReservationSeam (reserve before money, release on refusal, finalize on capture), store-credit debit seam.
- `server/research/commerce/orders.ts` — Canonical OrderRecord + order service: state machine via shared transitionOrder, paid states require a real provider reference, immutable checkoutIdempotencyKey, delayed capture with founder (Samuel) approval for large orders, ownership-checked member reads.
- `server/research/commerce/persistence/orders-store.ts` — Supabase persistence layer for the member commerce lane (sibling files: cart-store, idempotency-store with DB-unique scope+key replay, reservations-store, subscriptions-store, webhooks-store, persistent-cart).
- `server/research/providers/payment.ts` — PaymentProvider boundary (authorize/capture/cancel/refund/webhook-verify, no card data ever); production default is DisabledPaymentProvider returning structured refusals — no live payment key is wired anywhere.
- `supabase/research-orders.sql` — Canonical orders/carts schema (research_carts, research_cart_lines, research_orders with 14-state check, integer-cents-only, authorized/captured amount bounds); pairs with supabase/research-idempotency-keys.sql (UNIQUE scope+key) — marked DRAFT/Track B.
- `server/research/early-access/cart/checkout-service.ts` — The LIVE lane's cart checkout: quote pinned by intentHash, idempotency-key replay vs conflict detection, quote expiry/ownership checks, per-supplier child orders, invoice + payment reference; whole cart mounted only when RESEARCH_EARLY_ACCESS_CART_ENABLED==="true" (cart/feature-flag.ts).
- `shared/research/early-access-cart.ts` — Browser/server cart contract for Early Access: quantity band (max 50, 25 distinct items), line refusal codes (PRICE_CHANGED, RELEASE_REQUIRED, SUPPLIER_UNAVAILABLE...), quote/checkout DTOs where every monetary value is a server integer-cents answer.
- `server/research/early-access/commerce` — Manual-payment settlement lane: payment-instructions config (Zelle/etc. server-published destinations), payment proof upload, named-admin verification/reconciliation, overpayment exceptions, refunds, reservation store, supplier release — this is how money actually settles today (no card rails).
- `server/research/early-access/orders/member-order-history.ts` — Merges Early Access orders into the one member order-history endpoint (GET /api/research/orders) via the durable customerRef<->memberId binding, excluding weakly bound (email_entry) orders; failed reads throw rather than render empty.
- `server/research/assisted-order/service.ts` — Assisted-order bridge (M71, migration 20260815150000_research_assisted_order_bridge.sql, mounted in server/index.ts under the early-access wall at /research/early-access/order-request): submit -> reviewing -> identity/agreements/payment_pending -> payment_review -> paid workflow with document upload; shared/research/assisted-order/action-policy.ts decideAssistedOrderAction computes the truthful per-product CTA (provider_request / request_activation / request_pricing / availability_review / direct).
- `client/src/research/section.tsx` — Client route table: member commerce pages exist (/research/member/cart, /checkout, /orders, /orders/:id, /subscriptions), Early Access journey at /research/early-access (EarlyAccessCheckoutJourney, PaymentInstructions, ProofUpload, OrderStatus components), assisted-order wizard/status/confirmation pages; no /research/demo route exists.

### Gaps vs the overlays

- No live payment provider integration: DisabledPaymentProvider is the production default, server/research/providers/stripe-billing.ts covers membership billing only (also disabled), and member checkout fails closed with commerce_disabled because NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED defaults to false (server/research/commerce/production-deps.ts line 1381).
- Two parallel order models with no single canonical order: member-commerce OrderRecord/research_orders vs Early Access cart checkout records (checkout number + per-supplier child orders) vs assisted-order requests; they are only reconciled as a read-side DTO merge in member-order-history.ts, and supabase/research-orders.sql is still marked DRAFT/NOT RUN.
- No reorder / buy-again capability anywhere: no route, service method, or client control re-creates a cart from a past order in either lane.
- Truthful per-product action routing exists only inside the assisted-order lane behind the early-access wall; the member catalog pages (/research/member/catalog, /products) do not route non-direct/unpriced/held products into assisted order, quote, or provider workflows — they simply lack a purchase CTA (dead-end for non-direct products on the main catalog).
- Persistent/anonymous cart infrastructure (migration 20260727200000_research_persistent_cart.sql with member+anonymous owners, command idempotency; server/research/commerce/persistence/persistent-cart.ts) is not used by any public catalog->cart journey; the live Early Access cart is session-scoped and its mount flag defaults off.
- Fulfillment tracking is one-sided: Early Access has append-only shipment events, tracking corrections, and shipping SLA monitors (server/research/early-access/cart/shipment-status.ts, shipping-sla-*), but member-commerce OrderRecord.shipments has no wired fulfillment or carrier provider (providers/fulfillment.ts and liveShippingRates both disabled) and no member-facing tracking page beyond order detail.
- Payment webhooks are a verified seam only (server/research/commerce/webhooks.ts + webhooks-store.ts): no provider endpoint, signing secret, or production registration exists.
- No production-isolated demo lane: /research/demo does not exist in client routes or server registrations; the only demo surface is /mvps (client/src/pages/MvpLab.tsx, synthetic MVP demos) which is unrelated to a multi-persona commerce demo.
- shared/research/flags.ts is explicitly a dead declaration file (zero consumers) — any new lane must add its own composition-root flag parser like cart/feature-flag.ts, not reuse readResearchFlags.

### Reusable for the demo lane

- shared/research/commerce-api.ts + shared/research/commerce.ts — pure wire DTOs (CartDto, OrderSummaryDto/OrderDetailDto, CommerceDenialCode) and the order state machine (transitionOrder/canTransitionOrder), importable with zero server dependencies.
- shared/research/early-access-cart.ts, early-access-quantity.ts, early-access-payment-instructions.ts, early-access-payment-options.ts — complete quote/checkout/payment-presentation contracts with fail-closed decoders.
- shared/research/assisted-order/contract.ts + action-policy.ts — decideAssistedOrderAction is a pure function that yields the truthful per-product CTA for every persona state (direct, provider_request, request_activation, request_pricing, availability_review).
- In-memory stores built for isolated composition: server/research/assisted-order/memory-repository.ts, server/research/early-access/routes/store.ts (InMemoryEarlyAccessCommerceStore), server/research/commerce/acceptance-harness.ts, and DisabledPaymentProvider/stub providers — a demo can compose a full journey without Supabase or any flag.
- Client building blocks: client/src/research/ui kit, EarlyAccessCheckoutJourney/Stepper/InvoicePanel/PaymentInstructions/OrderStatus components, assisted-order wizard pages and wizard-state.ts, BuyerCommerceBridge — all presentational/state pieces a /research/demo lane can re-render against synthetic in-memory data.

### Lane notes

A build lane here should NOT rewrite the solved cart/checkout/order services; the member-commerce lane (server/research/commerce/**), the Early Access settlement lane (server/research/early-access/**), and the just-landed assisted-order bridge (this branch, claude/assisted-order-bridge / M71) each already have owners, so the lane should own only new disjoint paths: client/src/research/demo/** plus one demo-only server mount for build B, and the catalog-CTA-to-assisted-order integration seam (shared action-policy adoption in catalog-display/member catalog pages plus composition wiring slices in server/index.ts) for build A. The first coherent milestone for A is truthful action routing: every catalog surface computes its CTA from decideAssistedOrderAction-style authority so non-direct products land in the existing assisted-order/quote/provider workflow instead of dead-ending, deferring payment-rail work because live payment requires a provider key plus Samuel's explicit approval. The first milestone for B is a /research/demo mount composed entirely from the in-memory stores and shared contracts (no imports from production composition roots, no Supabase), rendering the existing journey components for multiple personas behind its own composition-root flag.

## Domain: admin-operations

### Exists

- `client/src/research/adminx-section.tsx` — Admin shell router mounting ~40 code-split pages at /admin/research* (applications, members, plans, products, product-requests, inventory/lots+COAs, assisted-orders queue+detail, orders, fulfillment, commerce-queues, questions, guides, partners, security, privacy, capabilities, activation family, esign, early-access releases+payments, audit); browser grants no authority, every panel calls admin-authorized APIs.
- `client/src/research/pages/adminx/AdminResearchHome.tsx` — Shared admin chrome: AdminScreen (Supabase-session sign-in gate inside ResearchAdminShell) and AdminBoundary (honest loading/denied/pending states) that every adminx page composes, plus the operations overview with system status, applications, and referral-fraud tiles.
- `server/research/admin-queues.ts` — Read-only member-platform work queues at GET /api/admin/research/queues/:queue and /items/:itemId (12 kinds incl. applications, blueprint_review, questions, sla_risk); allowlisted safe summaries, opaque salted subject refs, derived priorities/SLA deadlines, per-queue step-up markers; privacy_requests, security_events, product_concerns collectors return empty by design.
- `server/research/commerce/persistence/admin-queues-store.ts` — Persistent+derived commerce review queues (10 kinds: large_order_review, payment_review, refund_review, replacement_review, supplier_document_review, inventory_release, fulfillment_failure, payout_review, fraud_review, recall_response) derived from owning domain tables; explicitly flags KNOWN SCHEMA GAP that research_admin_queue_items has no migration; consumed behind default-false RESEARCH_COMMERCE_ENABLED.
- `server/research/early-access/routes/admin-routes.ts` — Early Access operator surface (paths in early-access/register.ts): payment review queue + per-order read at /api/admin/research/payments, single unrepeatable confirm/reject money decision, external-proof door, overpayment/refund records, and supplier dispatch trail at /api/admin/research/supplier-orders/:orderNumber with notification/acknowledgement/packing/tracking/shipped routes (manual tracking entry exists here).
- `server/research/early-access/cart/admin-payment-review.ts` — Cart-checkout payment review projection with explicit blockers (checkout_superseded, already_settled, agreements_not_current, submission_missing/unreconciled) and a computed canApprove; backs the /admin/research/early-access/payments page and cart admin routes at /api/admin/research/cart/:cart.
- `server/research/assisted-order/service.ts` — Assisted-order manual workflow service: 15-state status machine (submitted -> reviewing -> identity/agreements -> payment_pending -> payment_review -> paid -> supplier_processing -> shipped -> delivered -> closed, plus waiting_on_customer/cancelled) with per-transition evidence requirements (paymentVerificationId for paid, supplierAssignmentId for supplier_processing, trackingId for shipped), capability-gated admin list/detail/status routes in http.ts at /api/admin/research/assisted-orders, document upload tickets, and price-authority staleness checks; admin UI lives in client/src/research/assisted-order/AdminAssistedOrderQueue.tsx and AdminAssistedOrderDetail.tsx.
- `supabase/migrations/20260815150000_research_assisted_order_bridge.sql` — Five RPC-only tables (research_assisted_order_requests/lines/events/documents/access_tokens) with forced RLS, zero direct grants, the status machine re-enforced in research_assisted_order_set_status as the database floor, and an append-only event ledger guarded by trigger.
- `server/research/fulfillment/service.ts` — Fulfillment operations state machine (assigned -> acknowledged -> picking -> packed -> shipped -> delivered, plus exception/return/damage/loss/recall) over research_fulfillment_* tables with admin and supplier_operator actors; surfaced by client/src/research/pages/adminx/Fulfillment.tsx showing the pipeline with supplier, address, carrier, and tracking_reference columns behind the mitch_fulfillment capability.
- `server/research/commerce/routes.ts` — Admin commerce endpoints: GET /api/admin/research/commerce/queues returning the frozen six-queue AdminCommerceQueuesDto (largeOrderReview, claims, supplierFactBlocks, quarantinedLots, partnerReview, commissionDisputes) rendered by pages/adminx/CommerceQueues.tsx, plus claims review/refund/replacement decisions, partner actions, and order approve/cancel at /api/admin/research/orders/:order.
- `server/research/product-requests.ts` — Product-request admin tooling: list/detail/patch review routes and GET /api/admin/research/product-requests/analytics, rendered by ProductRequestsAdmin.tsx and ProductRequestAdminDetail.tsx — the existing 'request review' queue for catalog gaps.
- `server/research/admin-crm-supplier-operations/service.ts` — Audited CRM/supplier operations service (snapshot read + queueAction with idempotency keys) at /api/admin/research/crm-supplier-operations; trust-dial gating per action, transactional write-with-audit repository contract, and a recursive projection guard refusing any health-shaped field; UI at pages/adminx/CrmSupplierOperations.tsx over shared/research/admin-crm-supplier-operations.ts.

### Gaps vs the overlays

- No admin quote-creation tooling: the assisted-order flow promises 'price-pending items will be quoted' (service.ts nextSteps) but there is no quote entity, no admin route to compose/price/send a quote against an assisted-order request, and no customer accept-quote step; the only quote in the system is the customer-side cart price quote (research_early_access_cart_quotes, POST /api/research/early-access/cart/quote) computed at checkout time.
- research_admin_queue_items has no migration (explicitly named a KNOWN SCHEMA GAP in commerce/persistence/admin-queues-store.ts), so explicit payment_review enqueues and recall acknowledgements fail loudly and the persisted half of the ten commerce queue kinds reads empty.
- No admin analytics dashboard for commerce operations: /api/admin/analytics (server/routes.ts -> supabase-store.ts getAnalytics) covers only waitlist/LOI/bookings daily counts for the legacy site, and product-requests has its own analytics endpoint; there is no adminx page or endpoint for order volume, revenue, payment-review latency, fulfillment throughput, or queue-depth trends.
- The ten commerce queue kinds in admin-queues-store.ts (payment_review, payout_review, fraud_review, recall_response, etc.) have no UI: CommerceQueues.tsx renders the different frozen six-queue AdminCommerceQueuesDto, and the whole surface sits behind default-false RESEARCH_COMMERCE_ENABLED, so the two queue vocabularies are unreconciled.
- Supplier assignment has no unified admin surface: early-access supplier release derives the supplier from the placement (no choice step), fulfillment assignments and admin-crm-supplier-operations queued actions are separate systems, and the assisted-order supplier_processing transition demands a supplierAssignmentId as evidence but no admin tool exists to create that assignment for an assisted order.
- Tracking entry is fragmented: POST /api/admin/research/supplier-orders/:orderNumber/tracking covers early-access orders and Fulfillment.tsx displays carrier/tracking_reference, but the assisted-order shipped transition requires a trackingId evidence value with no admin UI or endpoint that mints one, and OrdersAdmin/OrderAdminDetail have no tracking-entry action.
- member-platform admin queue collectors return permanently empty for privacy_requests, security_events, and product_concerns (sources never built), so those queues on the admin console can never show work.
- No /research/demo lane exists anywhere in client/src (no demo routes, pages, or persona fixtures), so build B starts from zero apart from reusable presentation components and contracts.

### Reusable for the demo lane

- client/src/research/ui/kit.tsx and ui/shells.tsx — the full presentation-only admin UI kit (ResearchAdminShell, ResearchDataTable, ResearchMetricCard, ResearchStatusBadge, ResearchFilterBar, ResearchTabs, ResearchEmptyState, ResearchSecureNotice) with no server coupling
- shared/research contracts as typed fixtures: commerce-api.ts (AdminCommerceQueuesDto), fulfillment/contracts.ts, assisted-order/contract.ts (status unions, estimates), member-platform.ts (AdminQueueItem/AdminQueuePage/ADMIN_QUEUE_KEYS), distribution.ts (PartnerState), admin-crm-supplier-operations.ts
- Pure state-machine data: allowedTransitions in server/research/assisted-order/service.ts and FULFILLMENT_TRANSITIONS in server/research/fulfillment/service.ts — copyable transition matrices for a truthful clickable demo
- server/research/assisted-order/memory-repository.ts — an existing in-memory repository implementation of the assisted-order ports, ideal for seeding a demo lane with no database
- Pure helpers: priorityFor/safeText in server/research/admin-queues.ts, formatCents and CLAIM_REASON_LABELS in client/src/research/pages/member/commerce-presentation, ADMIN_ROUTES in client/src/research/lib/routes.ts, denialPresentation in lib/denials

### Lane notes

An admin-operations lane should own client/src/research/pages/adminx/**, client/src/research/assisted-order/Admin*.tsx, and the admin server modules (admin-queues.ts, commerce/routes.ts admin half, commerce/persistence/admin-queues-store.ts, assisted-order/http.ts admin routes), leaving customer-facing catalog/cart/checkout paths and any /research/demo path set to other lanes. The first coherent milestone for build A is closing the assisted-order operator loop: a migration for research_admin_queue_items, an admin quote-creation action on the assisted-order detail (price lines, send, customer accept), and supplier-assignment plus tracking-entry actions that mint the supplierAssignmentId/trackingId evidence the existing status machine already demands — everything else (payment review, dispatch, status ledger) is built and tested. A demo lane must not import server admin modules; it can reuse the UI kit, shared contracts, transition matrices, and the in-memory assisted-order repository listed above under a disjoint client/src/research/demo/** path set.

## Domain: affiliate

### Exists

- `shared/research/distribution.ts` — Canonical shared contract for partner roles/states, attribution windows/models/tie-breaks (resolveAttribution), and commission math (eligibleNetRevenueCents, computeCommission, transitionCommission); structurally forbids downlines and recruiting compensation.
- `server/research/partners/attribution.ts` — HMAC-signed referral link/code issuing (fails closed without a secret), opaque subject-key touch capture, and insert-if-absent one-winner-per-order conversion attribution with auditable admin override — but recordConversion has zero non-test callers.
- `server/research/partners/commissions.ts` — Append-only commission ledger service: accrual/transition/reversal chains keyed by rootId, balances derived by replay, denial-accumulating fail-closed transitions, and paid state gated on a payout proof scoped to exact ledger entry ids; instantiated only in tests today.
- `server/research/providers/payout.ts` — Payout provider boundary with states pending/paid/failed/cancelled/reversed; production default is Disabled (structured refusal), paid requires a real provider reference echoing the settled ledger entry ids, and no live payout rail exists.
- `server/research/partners/portal-routes.ts` — Complete partner portal API (16 paths: onboarding, training, leads, conversions, commissions, payouts, compliance, organizations, security) with guard-only identity and read-only payouts — deliberately UNREGISTERED because server/index.ts is a hash-pinned protected seam.
- `server/research/commerce/routes.ts` — The mounted partner HTTP surface: /api/research/partner/apply, /me, /dashboard, /links live behind the member guard via registerCommerceApi (one partner per member; member/partner isolation proven in commerce/acceptance.test.ts).
- `server/research/referrals.ts` — Member referral foundation behind RESEARCH_REFERRALS_ENABLED (default false): opaque base32 codes, referral_attributions, qualification only on verified membership activation (wired from membership.ts), held rewards promoted by a tick in server/index.ts, append-only member_credit_ledger, and fraud flags via server/research/fraud.ts.
- `server/research/early-access/commerce/commission-event.ts` — The one live-wired accrual path: early-access referral commission HOLD engine (basis = subtotal minus discount, test-locked to eligibleNetRevenueCents), consumed by early-access admin routes, refund.ts, and release-service.ts; can only ever record a hold, never a payout.
- `server/research/affiliates/v2/feature-flags.ts` — Real exact-string parsers for AFFILIATE_SYSTEM/PORTAL/CODES/CODE_UNLOCKS_EARLY_ACCESS env flags plus an unenforced-flags test; note shared/research/flags.ts documents that readResearchFlags has zero consumers, so only composition-root parsers like this one actually gate anything.
- `supabase/migrations/20260728020000_research_affiliate_professional_operations.sql` — Affiliate v1 operational schema: research_affiliate_partners/links/attribution_events/commission_events/statements plus idempotent SECURITY DEFINER command functions (record_attribution, record_commission, publish_statement) — no server route calls them (the AffiliateOperationsPort in server/research/affiliates/production.ts is unmounted).
- `supabase/migrations/20260807200000_research_affiliate_access_and_portal_v2.sql` — Affiliate v2 portal schema: applications, hashed access codes with attempt throttling, referral_links_v2, attribution_sessions_v2, order_attributions_v2, commission adjustments, content, notifications, support, audit events, and a research_affiliate_portal_snapshot function.
- `client/src/research/adapters/partner.ts` — Single client adapter mapping every /api/research/partner/* path into typed loaders for the full portal UI at /research/partners/* (client/src/research/pages/partners/ — Dashboard, Links, Conversions, Commissions, Payouts, Compliance, and more), rendering honest pending states where endpoints are absent.

### Gaps vs the overlays

- No mounted attribution capture: no HTTP route writes attribution touches or calls the attribution service's recordConversion (zero non-test callers), so a visit carrying a partner code is never recorded and no canonical order ever gets an attribution winner in the member commerce lane.
- No checkout-to-commission wiring: createCommissionService (server/research/partners/commissions.ts) is only instantiated in acceptance tests, so a paid order accrues nothing and the mounted /partner/dashboard commission balance can only ever be empty; refund-driven reversal exists only in the early-access lane.
- Partner portal API unregistered: the 16 paths in server/research/partners/portal-routes.ts await a one-line mount in the hash-pinned server/index.ts (CORE_SITE_PROTECTION_MANIFEST owns the seam), so the Conversions/Commissions/Payouts/Compliance pages all render their pending state.
- Payouts cannot execute anywhere: PayoutProvider defaults to Disabled, no admin route builds/approves/settles a batch, and research_payout_batches / research_payout_attempts (supabase/research-commission-ledger.sql) have no writer — payout states exist only as schema and types.
- No public referral link landing or code validation endpoint: signed link URLs are issuable but nothing serves the destination capture (e.g. /r/:code or ?ref=), and AffiliateCodePublicResult (shared/research/affiliate-system.ts) has no mounted public validation route; early-access checkout captures only a free-text referral string (EarlyAccessReferralField) with no lookup.
- Referral program is flag-off and stage-incomplete: RESEARCH_REFERRALS_ENABLED defaults false, and the visited/application-started attribution stages defined in shared/research/referral-types.ts have no HTTP writer, so ReferralDashboardState counts cannot move even when enabled.
- Three parallel generations with no reconciliation: member referrals (server/research/referrals.ts + referral_* tables), the partner lane (partners/* + distribution.ts + research_partners.sql tables), and affiliate v1/v2 SQL schemas each define their own attribution and commission records; the v2 tables and both migrations' command functions have zero server consumers, so a build lane must pick one canonical spine rather than adding a fourth.

### Reusable for the demo lane

- shared/research/distribution.ts (pure, no-I/O attribution resolver and commission/store-credit math — safe to import directly in a demo)
- server/research/partners/attribution.ts + server/research/partners/commissions.ts with the in-memory stores in server/research/commerce/persistence/partners-store.ts (full link -> touch -> conversion -> ledger loop runs without a database)
- client/src/research/pages/partners/* pages plus the loader indirection in client/src/research/adapters/partner.ts (a demo lane can inject fixture loaders instead of API calls without touching production routes)
- shared/research/commerce-api.ts DTOs (PartnerDashboardDto, PartnerLinkDto), shared/research/affiliates/contracts.ts, shared/research/referral-types.ts, and shared/research/affiliate-system.ts as typed shapes for persona fixture data
- client/src/research/early-access/EarlyAccessReferralField.tsx (fully controlled presentational referral input)
- the disabled/test payout providers in server/research/providers/payout.ts for honest payout-state storytelling in a demo

### Lane notes

An affiliate lane should own server/research/partners/**, server/research/affiliates/**, server/research/referrals.ts + fraud.ts, shared/research/distribution.ts + referral-types.ts + affiliates/** + affiliate-system.ts, client/src/research/pages/partners/** + adapters/partner.ts, and the affiliate/referral supabase files — disjoint from the catalog/cart/checkout/fulfillment lanes, with the checkout-to-attribution seam exposed as an exported hook the commerce lane calls in its own commit. The first coherent milestone is closing the capture loop read-only: mount a public visit-capture endpoint that writes attribution touches, call recordConversion + commission accrual from the already-mounted order-paid path, and register the portal read routes behind the parsed AFFILIATE_PORTAL_ENABLED flag (the server/index.ts wiring line must ship with the release authority's manifest update), so /research/partners/* pages go from pending to truthful data with zero money movement. Payout execution stays a later, separately approved milestone since the provider is deliberately Disabled. The /research/demo lane should not touch any of these paths — it can import the pure shared modules and in-memory stores and feed the existing partner pages through injected fixture loaders.

## Domain: supplier-fulfillment

### Exists

- `shared/research/fulfillment/contracts.ts` — Supplier-fulfillment contract: 12 states, 11 actions, internal-vs-supplier actor union, and FulfillmentAssignmentView, a minimum-data projection that deliberately excludes member id, email, health, payment, affiliate, and customer-price data.
- `server/research/fulfillment/service.ts` — Validation service with the FULFILLMENT_TRANSITIONS state machine (assigned->acknowledged->picking->packed->shipped->delivered plus exception/return/damage/loss/recall); ship requires label+carrier+service+tracking evidence and only internal actors may create assignments.
- `server/research/fulfillment/production.ts` — Supabase port calling RPCs research_fulfillment_list_assignments/assign/transition; prepareOrder hard-refuses with PAID_ORDER_BOUNDARY_REQUIRED; used only by tests, never mounted on an HTTP route.
- `supabase/migrations/20260728010000_research_fulfillment_supplier_operations.sql` — 1,524-line deployed migration: research_fulfillment_suppliers/supplier_users/supplier_offers, supplier_fulfillment_orders+lines, fulfillment_assignments+lines/events/exceptions, supplier_settlements; supplier-scoped security-definer RPCs with idempotency hashing and zero direct table grants.
- `server/research/operations/suppliers.ts` — Command client for the supplier registry (onboard supplier, configure offer with settlement terms, assign supplier auth user, record settlement) over the contract in shared/research/operations/suppliers.ts; unmounted, tests only.
- `client/src/research/operations/MitchPortal.tsx` — Pure presentational minimum-data fulfillment queue with per-state action buttons (Acknowledge, Start picking, Record packing, Record shipment, Report exception); documented as shared by internal ops and the restricted supplier view.
- `client/src/research/pages/adminx/Fulfillment.tsx` — /admin/research/fulfillment admin page rendering MitchPortal from GET /api/admin/research/fulfillment (adapters/adminOps.ts listFulfillment); that endpoint has no server registration, so the page can only ever show its unavailable boundary.
- `client/src/research/pages/SupplierAccess.tsx` — Mounted public /research/supplier-access page stating the invitation-only supplier scope and privacy limits (no affiliate, customer pricing, margin, or payment data); contact-by-email only, with no sign-in or portal behind it.
- `server/research/providers/fulfillment.ts` — Mitch data-minimization boundary: buildMitchPayload constructs the outbound payload from the fixed MITCH_ALLOWED_PAYLOAD_KEYS allowlist (no object spread) so health/referral/order-history fields cannot leak; capability-gated provider with disabled/capture modes.
- `server/research/early-access/routes/admin-routes.ts` — The live, mounted EA supplier dispatch lane: settledOrder payment gate before any dispatch, supplier order read returning the shipping packet (only response carrying the address), packed/shipped transitions, and createEarlyAccessSupplierTrackingRoute recording carrier+tracking - all operated by admins on the supplier's behalf.
- `supabase/migrations/20260804122000_research_early_access_supplier_operations.sql` — EA supplier persistence: SUPPLIER_CONFIRMED_ON_DEMAND confirmations (expiring, 72-hour handoff target) that alone make a unit sellable, the manual-actions ledger (including tracking entries), and the shipping-region allowlist; RLS forced, security-definer functions only.
- `shared/research/admin-crm-supplier-operations.ts` — Pack 05 contract for the admin CRM / supplier-operations workspace (SupplierAssignmentItem, FulfillmentItem with carrier+tracking, exceptions, intake triage, trust dial); its server routes in server/research/admin-crm-supplier-operations/routes.ts are deliberately unmounted.

### Gaps vs the overlays

- No supplier-facing authenticated portal exists: nothing lets a research_fulfillment_supplier_users account sign in and see its scoped queue; /research/supplier-access is a static contact page, and MitchPortal renders only inside the admin app.
- The fulfillment operations service (createFulfillmentOperationsService + createProductionFulfillmentOperationsPort) has zero HTTP registration - the acknowledge/pick/pack/ship/track transitions and queue reads are reachable only from tests despite complete, deployed SQL RPCs.
- GET /api/admin/research/fulfillment, which client/src/research/pages/adminx/Fulfillment.tsx calls via listFulfillment, is not registered anywhere in server/, so even the internal admin fulfillment view can never load data.
- No bridge from a paid canonical order into research_supplier_fulfillment_orders: the production prepareOrder unconditionally returns PAID_ORDER_BOUNDARY_REQUIRED, so assignments cannot be created from the real buying journey.
- Tracking submission is admin-only: the EA supplier tracking route requires adminEmail, there is no supplier-submitted tracking endpoint, and research_fulfillment_assignments.tracking_reference has no propagation into buyer-visible surfaces (research_order_shipments and EA dispatch tracking are separate, unlinked lanes).
- Supplier onboarding, offer configuration, supplier-user assignment, and settlement recording (server/research/operations/suppliers.ts) have no route or admin UI, so no supplier account can actually be provisioned.
- The admin CRM Supplier Operations workspace is deliberately unmounted (registerAdminCrmSupplierOperationsApi has no caller), leaving the supplier-assignment and tracking-follow-up queues contract-only.
- mitchFulfillment and liveShippingRates in shared/research/flags.ts are declarations with zero consumers (the file says so explicitly); real gating must be built at the composition root like early-access/cart/feature-flag.ts.
- No /research/demo route exists in client/src/research/section.tsx - the multi-persona demo lane starts from nothing.

### Reusable for the demo lane

- client/src/research/operations/MitchPortal.tsx - pure props-driven (assignments + onCommand), renders from fixtures with no network, auth, or production dependency
- shared/research/fulfillment/contracts.ts - type-only contract for demo fixtures so the demo supplier persona cannot drift from production shapes
- FULFILLMENT_TRANSITIONS and the validators in server/research/fulfillment/service.ts - a pure state machine an in-memory demo port can drive for clickable acknowledge->pick->pack->ship->track transitions
- client/src/research/operations/OperationsCommandCenter.tsx - presentational ops summary for an internal-operations demo persona
- shared/research/admin-crm-supplier-operations.ts - snapshot types (queues, exceptions, intake, audit) for a rich admin/ops demo persona
- shared/research/operations/suppliers.ts - supplier registry types for a demo supplier directory and onboarding walkthrough
- client/src/research/ui/kit and ui/shells (ResearchStatusBadge, ResearchEmptyState, ResearchPublicShell) for consistent demo chrome
- MitchPortal.test.tsx and fulfillment service.test.ts fixtures as ready-made seed-data shapes
- MITCH_ALLOWED_PAYLOAD_KEYS in server/research/providers/fulfillment.ts to visualize the supplier privacy boundary inside the demo

### Lane notes

This lane should own server/research/fulfillment/**, server/research/operations/suppliers*, the new supplier portal surface (a client/src/research supplier route set plus /api/research/supplier/*), and the missing admin mount for /api/admin/research/fulfillment, staying off buyer-commerce, checkout, and assisted-order paths except for one agreed bridge where prepareOrder consumes a paid canonical order. The first coherent milestone is mounting the already-tested engine over HTTP: register GET /api/admin/research/fulfillment against research_fulfillment_list_assignments so the existing adminx page goes live, expose the internal transition commands, then add a supplier-scoped session wall backed by research_fulfillment_supplier_users so a supplier sees only its own queue and can submit tracking. The paid-order-to-fulfillment-order bridge and tracking propagation into buyer-visible order history belong to a second slice, since they touch the buying-journey lane's tables and need a coordinated contract. Privacy boundaries are already strong in the contracts (allowlisted Mitch payload, supplier-scoped SQL, no price/margin/affiliate fields in the assignment view) and should be preserved as-is rather than redesigned.

## Domain: care-provider

### Exists

- `shared/care/contracts.ts` — Canonical Care contract: capability states (disabled..enabled), 7 care roles with permission map, branded Care/Research record IDs, the full /api/care/* route contract (including not-yet-implemented messages/labs/supplies/discovery), and the ResearchToCareDiscovery handoff type (currently unused server-side).
- `server/care/access.ts` — Fail-closed requireCarePermission middleware: every Care endpoint 503s with care_disabled unless the capability row is exactly enabled, then enforces role-permission RBAC and writes an access-audit decision for every allow/deny.
- `server/care/production-deps.ts` — Production adapter wiring Care access to Supabase (bearer token -> principal, active roles, patientId, care_capabilities row) and requiring dual env approval (CARE_ENABLED and CARE_ENABLE_APPROVED) plus approved_by/approved_at before Care reads as enabled.
- `server/care/eligibility-routes.ts` — Live patient eligibility API: GET decision, POST state-location attestation, waitlist join/withdraw, and consent grant/revoke, all zod-strict with idempotency keys, mounted in server/index.ts (lines 392-402) alongside intake, appointments, and prescriptions.
- `server/care/appointment-routes.ts` — Appointment lifecycle API: patient request/cancel/check-in and clinician assign/schedule/complete/no-show with optimistic expectedVersion, opaque provider references, readiness gating via appointment-readiness.ts, and the clinician review-queue read surface registered from the same module.
- `server/care/clinician-review.ts` — Provider-authority state machine: review actions (review, request_information, request_labs, follow_up, approve, decline, no_treatment) are allowed only for a human_clinician who is the assigned clinician, with state-coverage and appointment-completion gates enforced before any decision.
- `server/care/prescription-routes.ts` — Prescription and pharmacy-order API (9 endpoints): patient prescription list, clinician sign/supersede, pharmacy order creation and dispense/shipment events, backed by prescription-repository.ts over care_prescriptions/care_pharmacy_orders.
- `server/care/tebra-scheduling.ts` — Tebra scheduling integration module with strict HTTPS config validation, RFC3339 checking, and concierge_required fallback on every failure - but it is standalone: appointment-routes.ts never calls it and server/index.ts never wires a transport.
- `client/src/care/section.tsx` — Client Care rail: /care fail-closed pending shell reading /api/care/status, plus routed working pages /care/eligibility (state attestation + waitlist form), /care/consent, /care/appointments, /care/prescriptions, /care/pharmacy, and the clinician review queue resolved inside the Care module (App.tsx lines 176-182).
- `supabase/care-eligibility-intake.sql` — One of four applied Care migration packs (with care-access-foundation.sql, care-appointments-clinician.sql, care-prescription-pharmacy.sql) creating ~38 forced-RLS care_* tables - patients, locations, supported states, consents, eligibility checks, intakes, clinician profiles/licenses/coverage, appointments, reviews, pharmacies, prescriptions, orders; all RUN in production per supabase/MIGRATIONS.md with the care capability seeded disabled and zero data rows.
- `shared/research/assisted-order/action-policy.ts` — Truthful per-product action policy: providerWorkflowRequired rows always resolve to workflowMode provider_request with label 'Start provider workflow' before any pricing logic (pathway-before-price), feeding the assisted-order catalog projection.
- `server/research/assisted-order/production-catalog.ts` — Maps master-offering displayState 'care_pathway' to providerWorkflowRequired so provider-only products stay visible but never direct-purchasable; assisted-order submissions persist workflow_mode='provider_request' per line (migration 20260815150000) and service.ts emits a next-step saying the item 'will follow the separate Xenios Care pathway'.

### Gaps vs the overlays

- No actual research-to-care bridge: a provider_request assisted-order line stores workflow_mode and a text next-step, but nothing creates or links a Care record (intake, eligibility check, or review), the /api/care/discovery contract route has no server implementation, and shared createResearchToCareDiscovery() is called nowhere.
- Care is hard-disabled in production: care_capabilities is seeded 'disabled', enabling requires approved_by/approved_at plus CARE_ENABLED and CARE_ENABLE_APPROVED env, so every /api/care endpoint currently returns 503 care_disabled - the buying journey cannot route a real customer into a working Care flow today.
- No client navigation from commerce to Care: the catalog action 'Start provider workflow' submits into the assisted-order wizard only; no UI takes a provider-required product to /care/eligibility or intake, and no consent-carrying handoff exists.
- Zero operational data and no admin surface: care_clinician_profiles, licenses, state coverage, supported states, and pharmacies have no rows and no seeding/administration API or UI, so appointment readiness and clinician review can never pass even if the capability were enabled.
- Tebra scheduling is unwired: the module validates config and defines a transport interface with concierge fallback, but no concrete HTTP transport exists and appointment scheduling routes never invoke it - clinicians must paste opaque provider references manually.
- Contract-only routes: /api/care/messages, instructions, supplies, labs, support, and adverse-events exist in CARE_ROUTE_CONTRACTS with no server module, so post-prescription patient support and adverse-event routing are absent.
- No demo lane exists: nothing under /research/demo in client or server, and Care production-deps bind directly to Supabase auth, so a multi-persona care demo (patient, clinician, pharmacy ops) needs an isolated dependency implementation rather than a flag on production wiring.

### Reusable for the demo lane

- shared/care/contracts.ts - roles, permissions, capability states, and route contracts can drive demo persona switching without any server change
- shared/care/eligibility.ts, intake.ts, appointments.ts, clinician-review.ts, prescriptions.ts, review-queue.ts - pure shared types plus the pure state machines in server/care/clinician-review.ts, appointment-readiness.ts, and eligibility.ts (evaluateCareEligibility) are side-effect-free and can run in-browser or against in-memory fixtures
- server/care/access.ts CareAccessDependencies interface - the demo can supply an in-memory implementation (the test suites already build these) instead of production-deps.ts, keeping production Supabase untouched
- client/src/care pages (EligibilityPendingPage, CareAppointmentsPage, CarePrescriptionsPage, CarePharmacyOrdersPage, CareClinicianReviewQueuePage) - already render full flows from API JSON and only need a demo fetch adapter (client/src/care/api.ts is the single seam)
- shared/research/assisted-order/action-policy.ts decideAssistedOrderAction - reusable as-is to show truthful provider-routing decisions in a demo catalog

### Lane notes

A care-provider lane should own server/care/**, client/src/care/**, shared/care/**, and the supabase/care-*.sql chain, plus one narrow, explicitly shared seam into assisted-order (a bridge module that consumes provider_request lines) so it never touches the commerce lane's cart/checkout/order paths. The first coherent milestone is the discovery bridge: implement /api/care/discovery, have assisted-order provider_request submissions create a consented ResearchToCareDiscovery record linked to the order line, and add the client handoff from the 'Start provider workflow' action into /care/eligibility - all shippable while Care stays capability-disabled because discovery is metadata-only. For the demo lane, build /research/demo/care against an in-memory CareAccessDependencies plus a demo implementation of client/src/care/api.ts; no production flag changes and no Supabase writes are needed. Enabling real Care (seeding clinicians/states/pharmacies, flipping the capability with founder approval) is a separate later milestone requiring Samuel's explicit production approval per repo policy.

## Domain: notifications

### Exists

- `server/research/outbox.ts` — The single durable notification outbox: enqueue-once on unique event_key, 60s worker with 6-step backoff (immediate to 6h), stale-processing reclaim, permanent-failure admin alerts, template dispatch fanning out to every lane's renderer, and admin endpoints (GET /api/admin/research/outbox, POST .../outbox/run, POST .../outbox/:id/retry, POST .../test-email, GET .../system-status).
- `supabase/research-notification-outbox.sql` — Tables research_notification_outbox (status machine pending/processing/sent/delivered/failed_retryable/failed_permanent/cancelled) and research_notification_attempts, plus research_external_exports and an admin notification-preferences table; RLS on, no public policies.
- `server/services/email-config.ts` — Resend credential resolver (direct env RESEND_API_KEY, then Replit connector, then explicit unavailable) and adminRecipients() normalizing RESEARCH_NOTIFICATION_EMAILS/ADMIN_EMAILS into the one admin alert list.
- `server/services/email.ts` — Resend client factory plus site-wide direct-send emails (waitlist confirmations, contact forward/auto-reply, LOI confirmations, team@ internal alerts) — fire-and-forget, NOT outbox-backed.
- `server/research/membership-emails.ts` — Application-lifecycle sender set invoked by outbox dispatch: received/approved/declined/more-info/resubmitted/claim-success/status-link customer emails, internal admin application alerts, admin email-failure alert, and the admin-only provider test email; inspects Resend's error field so rejections are never recorded as sent.
- `server/research/membership-activation/emails.ts` — Founding-membership fm_* template catalog carried as data (activation lifecycle + renewal notices) plus assertEmailPayloadSafe, the forbidden-key guard (payment destinations/handles/tokens can never enter an email) reused at render time by every other lane.
- `server/research/early-access/notifications/communications.ts` — Early Access order-lifecycle email family — ea_checkout_created, ea_submitted_for_review, ea_payment_verified, ea_payment_rejected, ea_order_released, ea_tracking_posted, and internal ea_shipping_overdue_internal — with durable event-key builders and emailSafePaymentSummary so receiving destinations structurally cannot travel in email; enqueued via notifications/outbox-adapter.ts and legacy-order-notifier.ts (mail never blocks money).
- `server/research/assisted-order/communications.ts` — Assisted-order outbox renderers: customer submitted + status-changed emails and admin submitted + document-uploaded alerts, each reading an explicit payload allowlist (no addresses, payment evidence, or supplier data can leak).
- `server/research/buyer-commerce/outbox-adapter.ts` — BuyerCommerceOutboxAdapter implementing BuyerNotificationPort: enqueues the buyer_request_received customer acknowledgement and the buyer_request_operations admin alert (recipient from RESEARCH_BUYER_OPERATIONS_EMAIL) into the same outbox, with allowlisted payloads from buyer-commerce/communications.ts.
- `server/research/member-platform-emails.ts` — MEMBER_PLATFORM_TEMPLATES dispatch map (assessment due, document center notices, etc.): direct-sends first with the research identity and falls back to the outbox as the durable retry path — same keys recognized by outbox dispatch, so there is no second email system.
- `client/src/research/pages/adminx/SecurityAdmin.tsx` — The admin notification surface at /admin/research/security: system status panel (provider/sender/worker booleans, outbox counts, last successful send), outbox list with status filters and per-message requeue, manual drain, and admin-only test email — wired through client/src/research/adapters/adminOps.ts.
- `server/research/agreement-package-reconciliation.ts` — Reconciler run at the top of every outbox tick that materializes research_fm_agreement_email_candidates rows (written transactionally with legal acceptances, schema in supabase/research-agreement-package-notifications.sql) into consolidated agreement-package emails.

### Gaps vs the overlays

- No customer/member in-app notification surface anywhere: no bell, feed, or persistent notification list in the member portal or Early Access pages — every customer notification is email-only, and status changes are visible only by revisiting the status page.
- research_admin_notification_preferences (immediate/daily_digest columns) exists in supabase/research-notification-outbox.sql but no server code reads it; admin alerts always go to the env-derived adminRecipients() list and no digest job exists.
- No delivery feedback loop: the outbox status machine defines 'delivered' but nothing ever sets it — there is no Resend webhook handler, so bounces, complaints, and actual delivery are invisible; 'sent' means provider-accepted only.
- Buying-journey coverage is uneven: Early Access has a dedicated ea_tracking_posted email, but assisted-order shipped/delivered transitions (server/research/assisted-order/service.ts) only ride the generic status_changed template — no dedicated tracking/delivered customer email and no reorder or replenishment-reminder notification family exists anywhere.
- Site-wide emails (waitlist, contact, LOI in server/services/email.ts) bypass the outbox: a transient Resend failure loses them silently with only a console log, unlike every research-lane email.
- Admin outbox visibility is a flat status-filtered list only: no per-order/per-customer notification timeline and no search by recipient or reference in the admin UI or the GET /api/admin/research/outbox endpoint.
- system-status outbox counts fetch up to 500 ids per status and count client-side, so any status silently caps at 500.
- No no-send email preview capability: all renderers are pure functions but no route or page renders a template for inspection, which a /research/demo persona walkthrough would need to show notifications without touching the provider or the production outbox table.

### Reusable for the demo lane

- Pure renderer functions — renderEarlyAccessOutboxEmail, renderAssistedOrderOutboxEmail, renderBuyerCommerceOutboxEmail, renderFoundingEmail with the FOUNDING_EMAIL_TEMPLATES data catalog — all map (templateKey, payload) to {subject, text} with zero DB/provider access, so a demo can show realistic email previews entirely in-memory.
- assertEmailPayloadSafe and the safe-payload projections (safeBuyerCommercePayload, safeEarlyAccessPayload, emailSafePaymentSummary) as reusable contracts so demo fixtures obey the same privacy boundary as production.
- Notifier ports and null implementations (BuyerNotificationPort, EarlyAccessLegacyOrderNotifier with NO_LEGACY_ORDER_NOTIFIER, the FoundingEmailEnqueue seam) — demo services can inject an in-memory notifier and never reach research_notification_outbox.
- Durable event-key builders (earlyAccessEventKey, buyer:/fm_ key conventions) and the BACKOFF_SECONDS/status-machine shape from server/research/outbox.ts for simulating an outbox timeline with fixture rows.
- The OutboxRow shape and the SystemStatusPanel/OutboxPanel component patterns in client/src/research/pages/adminx/SecurityAdmin.tsx for an admin-persona demo screen fed by static fixtures.

### Lane notes

A notifications lane should own server/research/outbox.ts dispatch additions, the per-domain communications.ts renderer modules, notification-related supabase migrations, and the admin outbox UI panel, while every other lane touches notifications only through the existing enqueue adapters and ports — that keeps its path set disjoint from checkout, fulfillment, and payment service files. The first coherent milestone for build A is closing the buying-journey family: a dedicated shipped/delivered tracking email for assisted orders (parity with ea_tracking_posted), a reorder-ready notice, and routing the site-wide direct sends through the outbox, each renderer registered in dispatch with tests and no checkout logic modified. For build B, a demo sub-lane can compose the pure renderers plus in-memory notifier ports into a no-send notification preview under /research/demo without importing anything that reaches Supabase or Resend.

## Domain: auth-membership-organizations

### Exists

- `server/supabase.ts` — Lazy Supabase clients: service-role admin (RLS-bypassing, with a one-time privilege self-test that catches an anon key in the service slot) and anon client used only to verify user JWTs; everything fails closed via supabaseConfigured().
- `server/research/member-auth.ts` — The one member guard family: verifies the Supabase JWT server-side, denies recovery-purpose sessions via the token's AMR claim, resolves research_members by auth_user_id (email fallback), and exposes requireMember / requireActiveMember (status + billing_state + sponsored_b2b access_basis) / requireResearchSubject.
- `server/research/membership.ts` — Membership application intake, status state machine with ALLOWED_TRANSITIONS + event log on research_applications, admin review queue, and HMAC purpose-scoped tokens (v2 'status' vs 'account_claim') so a status link can never claim an account; client pages are Apply.tsx/ApplyStatus.tsx.
- `server/research/members.ts` — POST /api/research/member/claim turns an approved application + claim-purpose token into a Supabase Auth user (email pre-confirmed) plus a bound research_members row; rate-limited, heals stranded claims, and serves member referral/profile APIs.
- `server/research/membership-activation/` — Approved-to-active pipeline: activation commit, native e-sign, payment methods, identity documents/reviews/retention, obligations, renewals and scheduler — the reason requireActiveMember refuses pending_activation members.
- `server/research/early-access/private-access-routes.ts` — Early-access gate: shared-password unlock, HMAC cookie sessions with nonce store and TTL, logout, plus durable-session.ts/private-access-session-repository.ts which mint durable per-customer grants (Supabase-backed with in-memory fallback) and bridge active members into early access.
- `supabase/migrations/20260804120000_research_early_access_identity_persistence.sql` — Durable early-access identity tables: research_early_access_customers (opaque customerRef 'eac_...'), consumed tokens, session bindings, agreement acceptances, and referral grants — the guest identity spine the Pack02 claim flow binds to accounts.
- `shared/research/account-identity.ts` — Pack02 shared contracts: AccountContextDto, OrganizationRole enum (organization_owner/admin/business_buyer/billing_viewer), business profile/claim/invitation zod schemas, subject targets, AccountApiErrorCode — pure types with no runtime coupling.
- `server/research/account-identity/production-mount.ts` — Pack02 account API IS mounted in production (server/index.ts:297): nine /api/research/account/* routes with JWT+verified-email guard, Resend claim/invite delivery, and a deliberately fail-closed password-change-evidence stub — but production-store.ts still queries 'research_organizations', the unrenamed table.
- `supabase/pack02-candidates/20260812_research_account_organizations.sql` — Unapplied candidate schema for organizations, org users, invitations, claim challenges, order-ownership and request-again tables; scripts/agentic/prepare-pack02-account-rename.mjs rewrites it to research_account_organizations per decision D-004, and RELEASE_STATE.json marks release 0_5 blocked_on_migration_certification for exactly this.
- `supabase/research-partners.sql` — The collision: an already-shipped partner-system public.research_organizations (name/owner_partner_id/state) whose shape is entirely different from the Pack02 account org table, forcing the parked rename.
- `client/src/research/account/` — Parked account/organization UI (AccountSignIn, AccountHome, ClaimOrderHistory, InitialPasswordChange, OrganizationInvitation, OrganizationDashboard + api.ts) with canonical paths in client/src/research/lib/routes.ts ACCOUNT_ROUTES; deliberately unmounted in section.tsx (branch fable/pack02-account-mount) until the renamed schema lands.

### Gaps vs the overlays

- Pack02 organization schema is not applied: the candidate SQL sits in supabase/pack02-candidates (not supabase/migrations), the rename to research_account_organizations exists only as a script transform, and server/research/account-identity/production-store.ts still queries 'research_organizations' — so the mounted account API reads the colliding partner table whose columns (name/owner_partner_id/state) don't match, and every organization read fails.
- Account/organization UI is unmounted: client/src/research/account pages and ACCOUNT_ROUTES exist but section.tsx deliberately does not route them (task F7-ACCOUNT-MOUNT blocked on F7-PACK02-RENAME), so there is no reachable organization account experience.
- Password-change evidence is a permanent stub: production-mount.ts's unavailablePasswordEvidence always returns null, so any organization user flagged password_change_required is stuck at HTTP 428 with no way to clear the flag in production.
- Staff roles are a single env email: requireSupabaseAdmin (server/routes.ts:119) checks ADMIN_EMAIL only; there is no operator/fulfillment/supplier staff role model tied to Supabase auth, and organization roles exist only in the unapplied Pack02 layer.
- The canonical public membership application is not open (task APP-MEMBERSHIP is blocked_external), and membership billing remains keys-later (RESEARCH_MEMBERSHIP_BILLING_ENABLED plus the Stripe activation fee are unconfigured), so the join-as-member funnel dead-ends at 'activation opens soon'.
- Early-access guest identity (research_early_access_customers customerRef) and member identity (research_members) have no live bridge: the claim flow's routes are mounted but its challenge/binding tables (research_account_claim_challenges, research_account_binding_events, customer-subject bindings) are in the unapplied candidate SQL, so guests cannot claim their order history into an account.
- B2B sponsored access (access_basis='sponsored_b2b', status approved_sponsored_b2b, the buyer bridge and sponsored-claim functions) is entirely in pack02-candidates SQL — member-auth.ts already honors access_basis but nothing in production can set it.
- shared/research/flags.ts is declaration-only with zero runtime consumers; any demo or gating work must build its own composition-root flag parser (the pattern in early-access/cart/feature-flag.ts) rather than trusting this file.
- Nothing exists under /research/demo: no demo routes, no persona switcher, no synthetic identity — a multi-persona demo lane starts from zero on routing and needs its own isolation guard.

### Reusable for the demo lane

- shared/research/account-identity.ts — pure zod contracts and DTOs (roles, org summaries, account context, claim/invite inputs) a demo can render and validate against without any database.
- shared/research/membership-types.ts — application interests, status views, and the canTransition state machine for a truthful application-review demo persona.
- client/src/research/account/*.tsx — the parked AccountHome/OrganizationDashboard/ClaimOrderHistory/AccountSignIn pages are unmounted production UI that a demo lane could re-host under /research/demo against fixture data via their thin api.ts seam.
- server/research/account-identity/service.ts + routes.ts — dependency-injected (AccountIdentityDeps): the demo can mount the real route logic with an in-memory store and fake auth verifier exactly as the unit tests already do.
- server/research/member-platform-fixtures.ts — existing member/persona fixture data used by member-platform tests.
- In-memory repository patterns already in-tree (InMemoryPrivateAccessSessionRepository, InMemoryEarlyAccessReleaseLedger in server/research/early-access) as the template for demo-only session/persona state.
- shared/research/member-platform.ts capability registry types plus server/research/capabilities.ts's truthful-disabled pattern for showing per-persona capability states in the demo.

### Lane notes

This lane should own the identity spine end to end: server/research/{member-auth,membership,members,membership-activation,account-identity}/**, shared/research/{account-identity,membership-types}.ts, supabase/pack02-candidates/** plus the promoted migration, and client/src/research/account/** with the section.tsx/lib/routes.ts mount points — disjoint from the catalog/cart/fulfillment lanes that own buyer-commerce and early-access order paths. The first coherent milestone is finishing the parked rename: certify and promote the research_account_organizations migration (D-004), update production-store.ts's four table references off the colliding partner-system research_organizations, apply-twice-prove it, then mount the parked account UI (F7-PACK02-RENAME then F7-ACCOUNT-MOUNT) so the already-mounted account API stops failing against a wrong-shaped table. Real password-change evidence and the guest-to-account customerRef claim tables ride the same migration and unblock journey (A)'s account/reorder leg; note the standing constraint that schema application and any production mutation require Samuel's explicit approval and the single production-writer rule. The demo lane must not touch these paths — it should consume only the shared contracts and re-host the parked pages under /research/demo with in-memory deps."

## Domain: flags-demo-e2e-tooling

### Exists

- `shared/research/flags.ts` — Flag DECLARATIONS only (11 research capabilities, all default false) — explicitly documented as non-authoritative with zero runtime callers; states the real convention: enforcement lives in an exact-string parser beside the capability at its composition root.
- `server/research/early-access/cart/feature-flag.ts` — The worked flag-convention example: RESEARCH_EARLY_ACCESS_CART_ENABLED must be exactly "true" to mount cart routes (consumed in early-access/register.ts); anything else leaves routes unregistered, fail-closed.
- `server/research/affiliates/v2/feature-flags.ts` — Hierarchical affiliate flag parsers (parent AFFILIATE_SYSTEM_ENABLED gates portal/codes/unlock, double/triple gating); unenforced-flags.test.ts fails the build if a route arrives without a gate.
- `.env.example` — The full flag inventory and semantics: RESEARCH_EARLY_ACCESS_ENABLED, RESEARCH_EARLY_ACCESS_CART_ENABLED, NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED, membership billing, referrals, esign (OPENSIGN_SANDBOX_MODE), identity, affiliates — every switch defaults false/fail-closed.
- `server/routes.ts` — GET /api/health (healthHandler/buildHealthPayload): fast liveness + config PRESENCE booleans only (supabaseConfigured, commerceEnabled from NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED, turnstileConfigured), echoes sanitized X-Request-Id; pinned by server/health.test.ts.
- `scripts/preview-early-access.ts` — Browser-verification harness: serves the REAL client bundle and REAL early-access route registrations over in-memory stores with founder seed data; refuses NODE_ENV=production and is never imported by server/index.ts (guard test pins the refusal) — the closest existing thing to a production-isolated demo.
- `scripts/preview-research.mjs` — Local preview launcher (wired to .claude/launch.json as "research-preview", port 5199): boots the production build dist/index.cjs with throwaway placeholder gate credentials for screenshots/QA.
- `client/src/research/lib/fixtures.ts` — Client fixture mode with a hard production guard: devFixture() returns synthetic data only when import.meta.env.PROD is false, so no fixture can activate in a production bundle regardless of flags or URLs (server twin: server/research/member-platform-fixtures.ts, guarded on NODE_ENV).
- `server/research/e2e/account-membership-catalog.acceptance.test.ts` — The repo's "E2E" convention: vitest + supertest in-process acceptance over production route registrations with deterministic in-memory Supabase/auth/email boundaries — there is NO Playwright/Cypress anywhere (lockfile clean; npm scripts are dev/dev:client/build/start/test=vitest/check).
- `shared/research/assisted-order/action-policy.ts` — decideAssistedOrderAction(): the truthful per-product action engine — routes each catalog row to provider_request, request_activation, request_pricing, availability_review, or direct_order_request instead of dead-ending; exactly build A's non-direct-product requirement, already shipped and tested.
- `server/research/assisted-order/production-deps.ts` — Assisted-order bridge composition: gated on RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED === "true", Supabase repository + private document bucket; migration 20260815150000_research_assisted_order_bridge.sql rehearsed by scripts/verify-m71-assisted-order-bridge.sh against disposable Postgres.
- `client/src/research/lib/routes.ts` — Canonical route manifest with a parity test: member cart/checkout/orders/subscriptions, partner and admin (orders, fulfillment, commerce-queues) route families all exist — no /research/demo route exists anywhere in client or server source (only in .xenios prompt docs).

### Gaps vs the overlays

- No browser E2E framework at all: Playwright/Cypress absent from package.json and package-lock; the only browser-adjacent tooling is fetch-based read-only baseline capture (scripts/acceptance/capture-core-site-baseline.mjs) and docs/phase2/core-site-baseline/VISUAL_BASELINE_PLAN.md, which plans a browser harness but does not implement one.
- No /research/demo route, page, component, or server module exists; the multi-persona demo appears only in .xenios prompt documents. The existing demo surface (client/src/pages/MvpLab.tsx at /mvps) is unrelated synthetic MVP demos outside the research section.
- No production-safe demo/sandbox mode: both fixture systems (client fixtures.ts, server member-platform-fixtures.ts) are hard-blocked in production builds (import.meta.env.PROD / NODE_ENV), so a demo deployed to production cannot reuse them as-is — a new flag-gated, production-permitted isolation mechanism must be designed following the cart/affiliate composition-root pattern.
- No unified seed tooling for a full buying journey: seeds are piecemeal and mostly manual (supabase/research-referrals-seed.sql run in the SQL editor, scripts/initialize-founder-releases.ts, scripts/research/initialize-general-product-control.ts, storage.ensureCounterSeeded for the waitlist counter); there is no npm run seed and no demo dataset covering catalog -> order -> fulfillment -> tracking -> reorder.
- No runtime flag registry: shared/research/flags.ts is explicitly non-consumed, and per-capability env parsers are scattered (cart, affiliates, assisted-order, early-access each own theirs); nothing enumerates effective flag state for an operator, a demo, or an E2E preflight beyond the single commerceEnabled boolean on /api/health.
- No npm script or harness that drives a browser through the flag-gated buying journey end to end (early-access flag + cart flag + assisted-order bridge flag together); acceptance coverage is per-slice in-process supertest, and the two preview scripts require manual eyeballing rather than automated assertions.

### Reusable for the demo lane

- scripts/preview-early-access.ts — the production-isolated composition pattern a demo lane needs: real client bundle + real route registrations over in-memory stores with seeded data, plus its guard test pinning that production can never boot it
- server/research/assisted-order/memory-repository.ts — a full in-memory assisted-order repository already written for the service, usable as a demo backing store without touching Supabase
- shared/research/assisted-order/action-policy.ts + contract.ts — truthful per-product action decisions the demo catalog can render unchanged, guaranteeing demo and production agree on CTA semantics
- shared contracts generally (shared/research/commerce.ts, early-access-cart.ts, cart-product-selection.ts, member-catalog.ts, member-platform.ts) — typed shapes a demo can populate with synthetic data while production adapters stay untouched
- client/src/research/ui/kit.tsx and existing pages (Shop, ProductDetail, CartPage, member pages, AssistedOrderCta.tsx) — visual components that can be composed under a demo route
- client/src/research/lib/fixtures.ts devFixture pattern and server/research/member-platform-fixtures.ts deterministic synthetic members — the shape of obviously-synthetic data (needs a new production-permitted gate, but the data and typing carry over)
- server/research/early-access/cart/feature-flag.ts — the exact-string composition-root flag pattern to copy for a RESEARCH_DEMO_ENABLED gate
- GET /api/health — ready-made preflight probe for any E2E runner (unconditional 200, config presence booleans, request-id echo)
- .claude/launch.json research-preview entry + scripts/preview-research.mjs — the local-server launch convention an E2E runner can extend

### Lane notes

A flags-demo-e2e lane should own only new disjoint paths: server/research/demo/** (a flag-gated demo composition root modeled on preview-early-access.ts but production-permitted behind an exact-string RESEARCH_DEMO_ENABLED parser), client/src/research/demo/** with the /research/demo route family added to the manifest, scripts/demo-seed and an e2e/ directory introducing Playwright with npm scripts — never editing server/research/early-access/**, assisted-order production files, or shared production contracts (it imports them read-only). The repo's conventions are firm: flags are per-capability exact-string "true" parsers consumed at the mount site with a test proving the route is absent when the flag is unset, and existing "E2E" is in-process vitest+supertest, so browser E2E is a genuinely new capability to introduce rather than extend. First coherent milestone: a RESEARCH_DEMO_ENABLED-gated /research/demo shell that mounts an in-memory persona-switchable composition (reusing memory-repository and the assisted-order action policy so demo CTAs are truthful), plus one Playwright smoke that boots the preview server, asserts /api/health, and walks catalog -> per-product action for two personas, with the unmounted-when-flag-absent test in place from day one.
