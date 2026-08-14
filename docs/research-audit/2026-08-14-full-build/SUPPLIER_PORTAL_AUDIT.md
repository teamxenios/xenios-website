# Supplier portal forensic audit

## Audit coordinates

- **Candidate code basis:** `f3cb2088d36c87561ec58455ccf126341fc9789a`
- **Known live production:** `ROMAN_RELEASE_0_4` at `8c8ce358263a041f13fb270d7034164a66a04896`
- **Audit date:** 2026-08-14
- **Evidence boundary:** static route/composition/persistence inspection and focused local tests; no supplier-authenticated production smoke, live database query, or provider transmission.

## Executive verdict

**P0 — no supplier-facing portal is implemented on the candidate.** The repository contains meaningful supplier, inventory, fulfillment, settlement, and provider primitives, but there is no supplier-authenticated client route, shell, HTTP composition, or complete paid-order handoff. The only rendered “Mitch Portal” is a read-only component inside the Research admin fulfillment page.

This is an unmounted supplier-operations foundation, not a production portal. Any implementation must reuse the existing supplier-user binding, fulfillment service, inventory/lot authority, order state, and provider seam. It must not introduce a second supplier identity or order architecture.

## Client reachability

No `/research/supplier` route family exists. The only fulfillment route is the administrative `/admin/research/fulfillment` entry in `client/src/research/adminx-section.tsx`.

`client/src/research/operations/MitchPortal.tsx` defines a minimum-necessary supplier assignment projection, but its only non-test consumer is `client/src/research/pages/adminx/Fulfillment.tsx`. That page passes assignments without an `onCommand` callback, so the component deliberately omits mutation controls.

There is therefore no evidence of:

- supplier sign-in or account claim;
- server-resolved supplier tenant context;
- supplier navigation/shell;
- supplier queue API called from a supplier session;
- supplier transition/action submission;
- supplier sign-out/re-entry journey.

## Existing domain foundation

### Minimum-necessary data contract

`shared/research/fulfillment/contracts.ts` defines internal and supplier actors plus a supplier-facing assignment projection. The projection excludes customer email, health data, payment data, affiliate data, prior-order history, and internal notes. That is the correct privacy baseline.

### Supplier and fulfillment services

The repository contains:

- supplier list, offers, onboarding, user assignment, and settlement RPC adapters in `server/research/operations/suppliers.ts`;
- supplier-scoped fulfillment reads/transitions in `server/research/fulfillment/service.ts`;
- production fulfillment persistence/RPC adapters in `server/research/fulfillment/production.ts`;
- canonical SQL functions and service-role grants in `supabase/migrations/20260728010000_research_fulfillment_supplier_operations.sql`.

The isolated service contracts distinguish internal actors from `supplier_operator` actors and pass a supplier ID into fixed RPCs. However, candidate production composition has no non-test use of:

- `createProductionSupplierOperations`;
- `createFulfillmentOperationsService`;
- `createProductionFulfillmentOperationsPort`.

Code presence and isolated guard logic do not create a portal.

## Paid-order boundary is unfinished

`server/research/fulfillment/production.ts` currently makes `prepareOrder()` return `PAID_ORDER_BOUNDARY_REQUIRED`. This is a deliberate fail-closed boundary: an order cannot be silently pushed into supplier fulfillment without the canonical paid-order handoff.

A complete handoff needs one atomic/replay-safe chain:

1. canonical order is payment-authorized/settled according to policy;
2. order lines carry immutable canonical product/variant/price identity;
3. exact-lot inventory is allocatable and reserved;
4. a supplier assignment is created once;
5. the outbound provider request is idempotent;
6. provider/webhook updates transition the same fulfillment/order records;
7. every actor and state change is audited.

## Mitch provider rail is not outbound proof

The provider adapter in `server/research/providers/fulfillment.ts` is disabled unless `RESEARCH_MITCH_FULFILLMENT_ENABLED=true`, and the commerce module mounts an inbound fulfillment webhook. No non-test caller of `FulfillmentProvider.submit()` was found. An inbound webhook route therefore does not prove that Xenios can transmit an order to the provider.

Before activation, the integration must prove outbound submission, idempotency/replay behavior, signature verification, tracking persistence, terminal-state handling, and recovery from partial failure.

## Admin CRM/supplier Pack 05 is not the portal

The Pack 05 page explicitly identifies itself as an unmounted integration slice. Its proposed server routes also require a storage-scoped repository and admin guard before mounting. It is an internal CRM/operations concept, not supplier tenant access, and cannot substitute for supplier identity or fulfillment APIs.

## Authorization and tenant model

The existing supplier service rules are a sound base:

- internal actors may create/manage assignments according to their role;
- supplier actors must have the supplier-operator role;
- reads and transitions are parameterized by supplier scope;
- supplier DTOs omit unrelated private data.

The missing P0 is the binding from an authenticated Supabase user to a durable active supplier-user relationship. The browser must never supply the effective `supplierId`. A production guard should:

1. verify the bearer token through the canonical Supabase project;
2. reject recovery-purpose or unverified sessions;
3. load active supplier-user bindings and roles server-side;
4. resolve exactly one allowed supplier context or require a server-authorized switch;
5. attach that context to the request;
6. audit access and use the attached supplier ID in every repository call.

## Focused test evidence

A supplier/admin specialist ran 17 focused test files—143 tests passed—covering supplier operations, fulfillment service/persistence/provider, inventory/COA routes/persistence/integration/UI, CRM routes/service/intake/UI, prelaunch authorization, and admin sign-out. This is strong local unit/integration evidence but not the full repository suite or a production runtime probe.

The specialist also found no targeted supplier/admin source difference between the known live tag and candidate. That makes these source findings relevant to both revisions if the recorded live tag is in fact what production runs; it does not verify deployment state, flags, migrations, data, or providers.

## P0 remediation

1. **Mount one supplier-authenticated surface over the existing fulfillment port.** Derive supplier identity from the durable server-side user binding and reuse canonical auth; never accept tenant authority from the browser.
2. **Complete the paid-order handoff.** Connect canonical order/payment state to exact-lot allocation, supplier assignment, and the existing provider seam with idempotency and audit.
3. **Add minimum supplier APIs.** Provide supplier-scoped queue/detail reads and reviewed transitions only; deny every cross-supplier identifier, even when it names a real assignment.
4. **Connect the client only after the APIs are proven.** Reuse `MitchPortal`'s restricted DTO and add a supplier shell/launcher entry based on server-resolved roles.
5. **Keep the feature dark until runtime proof.** Verify migrations, supplier-user bindings, exact-lot inventory, provider credentials, outbound transmission, inbound signature/replay handling, tracking persistence, and terminal transitions on the deployed SHA.

## P1 completion

- Add two-supplier browser/API tests for cross-tenant reads and writes.
- Add transition version/idempotency tests, including duplicate provider submissions and webhook replay.
- Add operations recovery for rejected/timeout/partial provider calls without duplicate fulfillment.
- Validate minimum-necessary PII at the serialized HTTP boundary, not just TypeScript types.
- Add supplier activity/audit views, notification preferences, and support escalation only after retention and privacy policies are approved.

## Release gate

The supplier portal may be called production-ready only after a real supplier user can enter through the canonical role launcher, see only that supplier's assignments, execute only allowed transitions, and process one paid canonical order through exact-lot allocation, outbound provider handoff, signed/replay-safe status updates, and tracking—while a second supplier is denied every cross-tenant attempt.
