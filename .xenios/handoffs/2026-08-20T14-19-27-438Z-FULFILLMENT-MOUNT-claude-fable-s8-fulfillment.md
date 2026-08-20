# FULFILLMENT-MOUNT handoff

Session: `claude-fable-s8-fulfillment`
Branch: `lane/fulfillment-tracking-min` (pushed to origin)
Exact SHA: `4b8ed62a6b0e0d0fea14915e8207abb6cbdab164`
Base: `5bb3fa9`
Date: 2026-08-20

Full detail, including the mount snippet, lives in
`server/research/fulfillment/INTEGRATION_PACKET.md` at this SHA.

## Delivered

A minimum fulfillment + tracking engine that is operationally usable the
moment the lead mounts it, and refuses to act until then. Nothing is mounted,
no production state was touched, no shipment was marked, payment was not
altered, and no commercial margin is exposed.

Pipeline: `assigned -> acknowledged -> picking -> packed -> tracking_created
-> shipped -> delivered`, plus `exception`, `returned`, `replacement`,
`refunded`, `damaged`, `lost`, `recalled`, `cancelled`.

Two rules are enforced structurally:

1. **An unpaid order cannot release to a supplier.** `assign()` consults a
   `PaidOrderReleaseGate`. The default gate refuses everything; a throwing or
   missing paid record is treated as unpaid, never as paid. The port re-checks
   independently, mirroring the production `xenios.paid_order_boundary`
   trigger, so a miswired composition root still cannot release.
2. **A tracking field existing does not mean shipped.** `record_tracking` is
   its own audited step, `shipped` is reachable only from `tracking_created`,
   and the customer projection reports `tracking_created` with
   `shipped: false` while still showing carrier and tracking.

Disposition authority is internal-only. Suppliers may acknowledge, pick, pack,
record tracking, ship, deliver, and record an exception. They cannot cancel,
recall, return, replace, refund, or record damage or loss. `replacement` and
`refunded` record fulfillment dispositions only; they move no money.

Supplier projection carries order reference, assigned lines with SKU /
quantity / lot, recipient and shipping info, handling profile, SLA fields,
tracking entry and exception state. It carries no commission, margin, retail
economics, member identity, or other customer data.

## Verification at this SHA

`npx vitest run server/research/fulfillment shared/research/fulfillment
client/src/research/operations/MitchPortal.test.tsx` -> 48 passed, 6 files.
`npx tsc --noEmit` -> clean across the whole worktree.

Negative controls exercised: unpaid release refused at both seams; paid
evidence unavailable or throwing treated as unpaid; ship-from-packed rejected;
`record_tracking` never yields `shipped`; supplier dispositions rejected;
cross-supplier read and transition return not-found so ids leak nothing;
cross-member status read returns not-found and unauthenticated returns 401;
stale version returns 409; reused idempotency key with a different payload
returns 409 while an identical replay returns the original result; unwired
supplier access and unwired customer reads return 503; customer projection
contains no supplier label, lot code, handling profile, or label reference.

## Lead-owned requirements (nothing here was done by this lane)

1. **Route mount.** `registerFulfillmentRoutes` has no caller. Mount it from
   `server/index.ts` with `requireSupabaseAdmin`, an internal actor resolver,
   and a real paid-evidence source. Without `paidOrderRelease`, every
   assignment is refused by design.
2. **Release census is RED.** `server/release-control-plane.test.ts` belongs to
   `ASSISTED-ORDER-MOUNT`, so this lane did not edit it. Accept
   `callSites 376 -> 382` and `routes 385 -> 391`. Measured with the repo's own
   scanner: `validateRouteUniqueness` returns `[]` and the scanner reports no
   issues. The scanner walks every non-test `.ts` under `server/`, so it counts
   these six descriptors even though nothing mounts them. Suggested census
   wording is in the integration packet.
3. **Candidate migration.** `server/research/fulfillment/sql/
   20260819_fulfillment_tracking_states.candidate.sql` is NOT applied and NOT
   registered. The deployed `research_fulfillment_transition` rejects
   `record_tracking`, `record_replacement`, and `record_refund` at its
   allowlist, which fails closed. Register it in the DAG and apply it only with
   Samuel's current explicit approval.
4. **Admin client silently drops the new states.**
   `client/src/research/pages/adminx/Fulfillment.tsx:61-65` validates
   `row.stage` against a hardcoded allowlist and returns `null` on a miss, and
   the caller filters nulls, so assignments in `tracking_created`,
   `replacement`, or `refunded` would not appear in the admin queue at all.
   `client/src/research/operations/MitchPortal.tsx:14,172` also needs the new
   states. This lane does not own the client.

## Confirmed pre-existing defect (not introduced here)

In the deployed `20260728010000_research_fulfillment_supplier_operations.sql`,
`research_fulfillment_exceptions.kind` allows
`('exception','return','damage','loss','recall')`, but the transition function
inserts the state name unchanged for damage, loss, and recall, producing
`'damaged'`, `'lost'`, `'recalled'`. Those three violate the check constraint,
so `record_damage`, `record_loss`, and `record_recall` can never commit in the
current database. Only `exception` and `returned` map correctly. The candidate
migration corrects the mapping and widens the constraint for `replacement` and
`refund`.

## Not done, deliberately

No production mutation, no deploy, no `server/index.ts` edit, no payment
change, no real shipment marked, no supplier CRM, and no edit to any path
owned by another active lane.
