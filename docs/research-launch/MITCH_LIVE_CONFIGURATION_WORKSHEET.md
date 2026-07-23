---
title: Mitch live-configuration worksheet
purpose: every real value Samuel must confirm with Mitch before fulfillment can go live
status: ALL VALUES UNCONFIRMED. Engineering proceeds on clearly-labeled synthetic fixtures.
rule: nothing on this sheet may be guessed, inferred, or copied from a fixture. A blank stays blank until Mitch confirms it.
---

# Mitch live-configuration worksheet

Engineering does not wait on this sheet: development, QA, staging, screenshots,
and running-server tests all run against the synthetic sandbox profile
(`MITCH_TEST_SUPPLIER`, `https://example.invalid/mitch-fulfillment`), which is
structurally labeled `source: synthetic_test_fixture` and is blocked from
production by the synthetic-data guard. Fulfillment can only be activated after
every REQUIRED row below is confirmed and entered as environment or admin
configuration. No application code changes are needed to swap the sandbox for
the real profile.

Fill this in during or after the meeting. Confirmed means Mitch stated it and
Samuel recorded it; documents delivered through the secure channel where noted.

## 1. Identity and contacts

| Field | Value (leave blank until confirmed) | Required for |
|---|---|---|
| Supplier legal entity | | contracts, payouts, recalls |
| Supplier display name (member-facing, if ever shown) | | UI |
| Fulfillment contact (name, role) | | operations |
| Warehouse address (ship-from) | | shipping quotes, labels, returns |
| Support email | | operational escalation |
| Support phone | | operational escalation |

## 2. Integration method

| Field | Value | Required for |
|---|---|---|
| API or file-feed method (REST API / SFTP feed / email manifest) | | adapter transport |
| Authentication method (API key / HMAC / basic / mTLS) | | adapter auth |
| Production endpoint URL | | MITCH_ENDPOINT_URL |
| Webhook endpoint they call us at (we provide; confirm they can sign) | | status updates |
| Webhook signature method + shared secret delivery | | MITCH_WEBHOOK_SECRET |
| Order acknowledgment format (sync response / async ack) | | transmission handling |
| Shipment status vocabulary they emit (exact strings) | | status mapping |

## 3. Operations

| Field | Value | Required for |
|---|---|---|
| Cancellation cutoff (how late can we cancel) | | cancellation flow |
| Return process (address, RMA, who pays) | | returns |
| Ambient shipping rules (which SKUs, packaging) | | shipping profiles |
| Temperature-controlled rules (dry ice? gel? which SKUs; validation evidence) | | cold-chain boundary; we never claim validated cold chain without this |
| Packaging requirements | | fulfillment payload |
| Shipping carrier(s) they use | | tracking mapping |
| Service-level target (order-to-ship time) | | member promise, SLA sweeps |

## 4. Inventory, lots, and documents

| Field | Value | Required for |
|---|---|---|
| Inventory feed (method, cadence) | | stock accuracy |
| Lot feed (lot ids, quantities, expiry basis) | | FEFO, lot release |
| COA delivery method (per lot, secure channel) | | per-SKU eligibility; a SKU cannot be released without its real COA |
| Document naming convention (must match Appendix B ids: SPEC-P0xx, COA-P0xx-LOT-xxxx, STORAGE-P0xx, SHIP-P0xx) | | document matching |
| Recall procedure (who notifies whom, how fast, traceability) | | recall workflow |

## 5. Commercial

| Field | Value | Required for |
|---|---|---|
| Pricing schedule (supplier cost; confidential, secure channel only, never in the repo) | | margins; the signed master defers to it |
| Payment terms | | finance |
| Test order process (can we place a flagged test order?) | | controlled production smoke |
| Production launch approval (who at Mitch signs off) | | activation gate |

## 6. Activation checklist (after the sheet is complete)

1. Enter the confirmed values as environment variables (`MITCH_ENDPOINT_URL`,
   `MITCH_API_KEY`, `MITCH_WEBHOOK_SECRET`) and admin configuration. Never paste
   them into chat, the repo, or a document.
2. Deliver the real COA and lot documents through the secure intake, named to
   the Appendix B convention.
3. Run the sandbox end-to-end suite against the real endpoint in test mode if
   Mitch offers one.
4. Per-SKU admin release only for SKUs whose real documents verified.
5. One controlled test order, then review, then enable.

The synthetic sandbox profile stays available for QA forever; the production
guard prevents any `MITCH_TEST_` or `example.invalid` value from ever being
active while `NODE_ENV=production` or a production fulfillment flag is on.
