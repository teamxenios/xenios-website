---
title: Purchase Eligibility, Final
lane: Supplier verification intake (Website / integration session)
status: 0 of 15 SKUs purchase-eligible; all 15 blocked
last_updated: 2026-07-21
---

# Purchase eligibility, final

Each SKU was evaluated independently against every current requirement. The
signed supplier master advanced fact and price confirmation substantially, so
several requirements that used to fail now pass. But the requirements that depend
on a delivered COA, on a verified lot, on real inventory, on a payment provider,
and on an explicit release all still fail. One failed requirement blocks a SKU.

**Result: 0 of 15 SKUs are purchase eligible. All 15 are blocked.** No SKU is
unblocked using another SKU's documents. Nothing here weakens authentication,
provenance, inventory, lot, COA, recall, shipping, or payment controls.

## Per-requirement status (identical across all 15 SKUs today)

The fifteen SKUs differ in their facts but not in their gating pattern, because
every one is missing the same external inputs. Each was checked on its own; the
result is the same table for each.

| Requirement | Status | Basis |
|---|---|---|
| Supplier identity | PASS | Signed and executed (Apex BioInnovations LLC, authorized rep) |
| Product identity | PASS | Signed product sheet |
| Composition | PASS | Confirmed by signed master |
| Strength | PASS | Signed (corrected from legacy for 10 of 15) |
| Format | PASS | Signed |
| Size | PASS | Signed |
| Price (member-facing) | PASS | Signed (corrected from legacy for all 15) |
| Storage | PASS | Signed |
| Shelf life or retest | PASS (statement only) | Signed retest statement. True expiry is COA-derived and remains unconfirmed |
| Inventory | BLOCKED | Supplier-reported only. No verified stock; the catalog never maps a legacy record to in_stock |
| Active lot | BLOCKED | Lot identifiers are referenced, but no COA-backed lot record was delivered |
| COA | BLOCKED | referenced_not_found. No COA file exists for any lot |
| Recall status | PASS | No recall reported by the supplier |
| Shipping profile | PASS | Signed |
| Fulfillment provider | PARTIAL | Named owner is signed (Apex Fulfillment, Austin, TX). Operational fulfillment integration is a separate provider readiness item |
| Payment provider | BLOCKED | No membership or product payment provider is configured (no credentials) |
| Required agreements | PASS | Built in the commerce and frontend flow |
| Feature flag | BLOCKED | product_commerce is off; the section is intentionally private (RESEARCH_PUBLIC=false) |
| Admin release state | BLOCKED | No SKU has been released by Samuel through the admin release control |

## The blocking requirements, and exactly what clears each

Common to all 15 SKUs:

1. **COA** and **active lot**: deliver the actual COA files (see
   [SUPPLIER_ATTACHMENT_VERIFICATION_REPORT.md](SUPPLIER_ATTACHMENT_VERIFICATION_REPORT.md),
   the 16 `COA-P0xx-LOT-xxxx` identifiers) through the approved secure channel,
   named to match, so each can be verified and tied to a lot. Storage,
   shelf-life, shipping, and spec files should come with them.
2. **Inventory**: real stock must be recorded per lot once lots are verified.
3. **Payment provider**: membership and product payment providers must be
   configured with live credentials and validated webhooks. See the provider
   readiness report.
4. **Feature flag**: `product_commerce` (and any dependent flags) flipped on,
   only after 1 through 3, security tests, and a reviewed release head.
5. **Admin release state**: Samuel releases each SKU explicitly through the admin
   control. Per SKU, not global.

Until every one of these clears for a given SKU, that SKU stays blocked, and the
commerce UI renders its honest unavailable state (this is already built and
verified: the frontend shows "Pricing not yet confirmed" and capability-disabled
states without inventing data).

## What is safe to publish now

Facts and prices confirmed by the signed master can populate the member-facing
catalog as displayable facts (the products can be shown with correct
composition, strength, format, size, storage, shelf life, shipping, and price),
while remaining not purchasable. This is exactly the state the architecture was
built for: a described catalog with no buy path until the gates above pass.

Do not publish any COA-derived claim (purity, sterility, testing, true expiry),
any supplier confidential file, or any medical, efficacy, or safety claim. The
signed master establishes supplier facts, not health outcomes.
