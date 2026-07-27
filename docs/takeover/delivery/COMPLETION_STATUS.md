# Xenios Non-Clinical Takeover Completion Status

## Verdict

This repository is a verified, current-base integration candidate. It is not yet a truthful production-complete commerce launch.

The candidate preserves the frozen `origin/main` at `64cceb82f72170004525d5c78dc49ea7b77fdf6b`, reproduces PR #103 at exact source head `97ee1895763ea9c243de7365f224660d83773966`, reconciles the preserved Website 1 authority work, imports the five supplied V3 master artifacts into supplier-independent preview records, exposes all 49 profiles without inventing sellable facts, wires the RPC-only persistent-cart API, and routes checkout reservations through the atomic inventory reservation port.

Care and clinical functionality were not expanded or enabled. Existing dormant Care source inherited from the frozen base remains disabled and absent from the Research navigation.

## Completed in this candidate

- Exact snapshot and frozen-base verification.
- Exact PR #103 reconstruction without applying its migration.
- Durable admin authority command boundary, two-phase legacy/durable cutover support, server-authoritative landing, and admin/member experience switching.
- Actor-scoped preference locking closes the concurrent first-write race even when callers use different idempotency keys.
- Forty-nine supplier-independent V3 product preview profiles.
- Safe V3 supplement-candidate, purchase-option, and customer-journey source records.
- Product Control-first production catalog composition; legacy catalog is no longer the transaction authority.
- All 49 preview profiles appear in member discovery, while only Product Control-ready records may become transactional.
- RPC-only persistent-cart repository and HTTP route seam for member and anonymous carts.
- Product/variant/SKU/price/readiness/inventory/fulfillment snapshot binding for persistent cart items.
- Checkout composition through the atomic inventory reservation port rather than the legacy direct lot decrement.
- PostgreSQL apply-twice, forced-RLS, grant, direct-DML-denial, concurrency, replay, audit, and rollback-zero verification for the two new command domains.

## Software gates still open

1. The current Cart and Checkout pages still call the older `/api/research/cart` model. The new persistent-cart API is mounted, but the browser journey has not been cut over. Two writable cart systems must not be enabled together.
2. Checkout does not yet create or claim a durable pending order before inventory/payment side effects.
3. The legacy order repository still uses direct service-role DML and child replacement. A reviewed RPC-only order command boundary is required.
4. The old PR #48 fulfillment, Mitch, affiliate, CRM, professional-account, task, and notification implementation is unsafe to merge wholesale because it grants broad service-role DML and uses direct writes. No unsafe extraction was imported.
5. Current Product Control creation defaults fulfillment ownership to `not_assigned`; a reviewed administrative command must assign a real fulfillment owner before cart eligibility.
6. Supplier, price, variant, inventory, exact-lot COA, shipping, payment, media, and legal facts are intentionally absent until supplied and approved.
7. Authenticated member/admin/checkout browser acceptance is pending a real authorized existing account. No session was fabricated.

## Launch implication

The repository can safely continue through controlled integration and migration review. It must not be described as accepting real product orders until the software gates and real-input gates above are closed.
