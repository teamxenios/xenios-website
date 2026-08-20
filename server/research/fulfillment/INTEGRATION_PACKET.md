# FULFILLMENT-MOUNT integration packet

Session: `claude-fable-s8-fulfillment`
Branch: `lane/fulfillment-tracking-min`
Base: `5bb3fa9` (Lane E integration)
Task: `FULFILLMENT-MOUNT`

The lane owns `server/research/fulfillment/**` and `shared/research/fulfillment/**`.
It does **not** edit `server/index.ts`, does not deploy, does not mark real
shipments, does not touch payment, and exposes no commercial margin.

## What this lane delivers

A minimum fulfillment + tracking engine that is operationally usable the
moment the lead mounts it, and refuses to do anything unsafe until then.

| File | Role |
| --- | --- |
| `shared/research/fulfillment/contracts.ts` | State machine vocabulary, supplier action allowlist, minimum-necessary partner projection |
| `shared/research/fulfillment/customer-status.ts` | Customer-safe status projection |
| `server/research/fulfillment/service.ts` | Validation, transition graph, disposition authority, paid-release enforcement |
| `server/research/fulfillment/release-gate.ts` | Paid-order boundary port (fail-closed by default) |
| `server/research/fulfillment/in-memory.ts` | Deterministic port for tests and pre-production composition |
| `server/research/fulfillment/errors.ts` | Typed errors mapped to HTTP status |
| `server/research/fulfillment/register.ts` | HTTP surface; mounts nothing by itself |
| `server/research/fulfillment/sql/20260819_*.candidate.sql` | Candidate migration, **not applied, not registered** |

## State machine

```
order_received (canonical paid-order authority, not this lane)
  -> assigned            supplier_assigned
  -> acknowledged        supplier_acknowledged
  -> picking             packing
  -> packed              packing
  -> tracking_created    tracking_created
  -> shipped
  -> delivered
```

Also: `exception`, `returned`, `replacement`, `refunded`, `damaged`, `lost`,
`recalled`, `cancelled`.

Two rules are enforced structurally, not by convention:

1. **An unpaid order cannot release to a supplier.** `service.assign` consults
   a `PaidOrderReleaseGate` before calling the port. The default gate refuses
   everything (`PAID_ORDER_EVIDENCE_UNAVAILABLE`); a thrown or missing paid
   record is treated as unpaid, never as paid. The in-memory port re-checks
   independently, mirroring the production `xenios.paid_order_boundary`
   trigger, so a miswired composition root still cannot release.
2. **A tracking field existing does not mean shipped.** `shipped` is reachable
   only from `tracking_created` via an explicit `ship` action. `record_tracking`
   is its own audited step. The customer projection reports
   `status: "tracking_created"` with `shipped: false` while showing carrier and
   tracking, and withholds tracking entirely before that state.

`replacement` and `refunded` record fulfillment **dispositions** only. They move
no money and issue no stock. Payment and claims stay with their canonical
owners; replacement stock ships as a new assignment.

## Supplier view

The supplier projection (`FulfillmentAssignmentView`) carries exactly: Xenios
order reference, assignment/order ids, supplier id and label, state, version,
expected ship date, recipient and shipping address, shipping service, handling
profile (`ambient` / `cold_chain`), assigned lines with SKU / quantity / lot id
and lot code, label reference, carrier, tracking reference, updated timestamp.

It carries no affiliate commission, no Xenios margin, no retail economics, no
member id or email, no health or assessment data, no other customer's data, and
no internal notes.

Suppliers may perform: `acknowledge`, `start_picking`, `pack`,
`record_tracking`, `ship`, `deliver`, `record_exception`. Every disposition
(`cancel`, `record_recall`, `record_return`, `record_replacement`,
`record_refund`, `record_damage`, `record_loss`) is internal-only and is
rejected for supplier actors at the service seam, at the HTTP seam, and in the
candidate SQL.

## Lead-owned route mount requirements

`registerFulfillmentRoutes` never mounts itself. The composition root
(`server/index.ts`, lead-owned) must call it. Nothing is wired here.

```ts
import { createFulfillmentOperationsService } from "./research/fulfillment/service";
import { createPaidOrderReleaseGate } from "./research/fulfillment/release-gate";
import { createProductionFulfillmentOperationsPort } from "./research/fulfillment/production";
import { registerFulfillmentRoutes } from "./research/fulfillment/register";

const fulfillmentService = createFulfillmentOperationsService(
  createProductionFulfillmentOperationsPort(supabaseAdminClient),
  {
    // MUST answer from the canonical paid-order authority.
    // Omitting this leaves every release refused.
    paidOrderRelease: createPaidOrderReleaseGate(isFulfillmentOrderPaid),
  },
);

registerFulfillmentRoutes(app, {
  service: fulfillmentService,
  requireAdmin: requireSupabaseAdmin,
  resolveInternalActor,      // -> internal FulfillmentActor | null
  resolveSupplierActor,      // optional; omit -> supplier routes 503
  customerReads,             // optional; omit -> customer status 503
});
```

Routes registered:

| Method | Path | Guard |
| --- | --- | --- |
| GET | `/api/admin/research/fulfillment/assignments` | `requireAdmin` + internal actor |
| POST | `/api/admin/research/fulfillment/assignments` | `requireAdmin` + internal actor |
| POST | `/api/admin/research/fulfillment/assignments/:assignmentId/transition` | `requireAdmin` + internal actor |
| GET | `/api/admin/research/fulfillment/supplier/assignments` | supplier actor (NOT `requireAdmin`) |
| POST | `/api/admin/research/fulfillment/supplier/assignments/:assignmentId/transition` | supplier actor + action allowlist |
| GET | `/api/research/fulfillment/orders/:orderReference/status` | member identity, server-derived |

The five operator doors sit under `/api/admin/research/...` so the research
wall never answers for them and never has to be widened for operator traffic.
The supplier pair shares that namespace for the same reason but answers to the
supplier guard, not `requireSupabaseAdmin` — a supplier operator is not an
admin, and there is no blanket guard on `/api/admin/*` to assume otherwise.

Required of the lead before these do real work:

1. **Paid evidence source.** Without `paidOrderRelease`, every assignment is
   refused. This is deliberate.
2. **`resolveInternalActor`.** Must map the authenticated admin to an internal
   actor. Returning `null` yields 403.
3. **`resolveSupplierActor`.** Absent until the supplier workspace
   (`SUPPLIER-WORKSPACE`) lands; supplier routes answer 503 meanwhile.
4. **`customerReads`.** `resolveMemberId` must derive identity server-side,
   never from the request body, and `findAssignmentForMember` must only return
   an assignment the member owns.
5. **Route uniqueness.** These six paths must be added to whatever route
   registry the release control plane checks.
6. **Candidate migration.** The deployed
   `research_fulfillment_transition` does not know `record_tracking`,
   `record_replacement`, or `record_refund`, and rejects them at its allowlist
   (fail-closed). The production port cannot execute the new pipeline until the
   candidate SQL is reviewed, registered in the migration DAG, and applied with
   current founder approval.

## Release census — no change needed

The lead already pinned this lane at **386 call sites / 395 registrations**
at `119228c`. Moving the five operator doors out of the research namespace
changes the paths but not the count, so those pins remain correct.
Re-measured with the repo's own scanner on this branch: `callSites` 386,
`routes` 395, `validateRouteUniqueness` returns `[]`, no scanner issues.

The scanner walks every non-test `.ts` under `server/`, so it still records
these six descriptors even though **nothing mounts them** —
`registerFulfillmentRoutes` has no caller.

## The wall admission (lead seam — exact verified diff)

`server/research/index.ts` is a lead seam, so this lane did not change it.
The pattern is exported from `server/research/fulfillment/wall-admission.ts`,
a module that deliberately imports nothing but the order-number regex, so the
wall depends on a shape rather than on the fulfillment subsystem:

```ts
export const FULFILLMENT_CUSTOMER_STATUS_ADMISSION = new RegExp(
  `^/fulfillment/orders/(?:${EARLY_ACCESS_ORDER_NUMBER.source.replace(/^\^|\$$/g, "")})/status$`,
);
```

Expanded, that is `^/fulfillment/orders/(?:XEA-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{16})/status$`,
anchored at both ends, against the path AFTER the `/api/research` mount prefix.
Method: **GET** only. The segment comes from the generator's own anchored
regex, so the door cannot drift from the shape the server mints.

This exact diff was applied locally, verified, and reverted — the full
wall-composed suite goes from 10 passed / 2 skipped to **12 passed**:

```diff
 import { z } from "zod";
+import { FULFILLMENT_CUSTOMER_STATUS_ADMISSION } from "./fulfillment/wall-admission";

           EARLY_ACCESS_CART_READ.test(req.path) ||
-          EARLY_ACCESS_ASSISTED_ORDER_READ.test(req.path))) ||
+          EARLY_ACCESS_ASSISTED_ORDER_READ.test(req.path) ||
+          FULFILLMENT_CUSTOMER_STATUS_ADMISSION.test(req.path))) ||
```

Census paragraph, if the existing note needs refreshing for the new paths:

> +6 (minimum fulfillment and tracking, FULFILLMENT-MOUNT): the six
> descriptors from the fulfillment lane's own registrar. Five operator doors
> sit under `/api/admin/research/fulfillment/...`, OUTSIDE the research wall,
> so admin and supplier traffic is never a reason to widen that allowlist:
> three answer to the injected `requireAdmin` guard and two to the supplier
> guard. One customer door stays inside the research namespace and is admitted
> by an anchored pattern on the exact generated order-number shape. The
> registrar is not called from `server/index.ts`, so these
> are scanner call sites and not yet reachable doors; unwired supplier
> access and unwired customer reads answer 503 rather than 200.

## The wall-composed test

`register.test.ts` registers the route table on a bare app with no wall in
front of it — the same blind spot that once left every cart route unreachable
by the customers it existed for. `register-wall.test.ts` closes it: it composes
the REAL `registerResearchApi` wall in front of the real table and pins that
the customer door reaches its own handler, that the five operator doors are
never answered by the wall, that a lookalike or wrong-method order reference
stays walled, and that no operator door has drifted back inside the research
namespace.

Two of its assertions cannot pass until the wall admission lands, so they
**skip with a named reason** rather than failing the branch, and they activate
automatically the moment the lead adds the entry — nothing has to be
remembered or unskipped by hand. The skip is driven by probing the real wall,
so it cannot pass by accident. Verified: with the admission applied locally the
file goes from 10 passed / 2 skipped to 12 passed.

## Client state-list gaps this contract change creates (lead-owned)

The three new states are not known to the existing admin client, which this
lane does not own. Both need updating when the states go live:

1. **`client/src/research/pages/adminx/Fulfillment.tsx:61-65`** — `toAssignment`
   validates `row.stage` against a hardcoded allowlist and returns `null` on a
   miss, and the caller filters nulls. Assignments in `tracking_created`,
   `replacement`, or `refunded` would therefore be **silently dropped from the
   admin queue** rather than displayed. This is the one that matters: an
   operator would not see work that exists.
2. **`client/src/research/operations/MitchPortal.tsx:14,172`** — the tone map
   treats only `exception/damaged/lost/recalled` as danger, and the
   terminal-state check at line 172 excludes `returned/damaged/lost/recalled/
   cancelled` but not `replacement`/`refunded`, so the portal would offer
   actions on terminal dispositions.

## Confirmed pre-existing defect (not introduced here)

In the deployed `20260728010000_research_fulfillment_supplier_operations.sql`,
`research_fulfillment_exceptions.kind` allows
`('exception','return','damage','loss','recall')`, but the transition function
inserts the state name unchanged for damage/loss/recall — `'damaged'`,
`'lost'`, `'recalled'`. Those three values violate the check constraint, so
`record_damage`, `record_loss`, and `record_recall` can never commit in the
current database. Only `exception` and `returned` map correctly.

The candidate migration corrects the mapping and widens the constraint to
include `replacement` and `refund`.

## Negative controls exercised

- Unpaid order refuses supplier release (service gate and port, independently).
- Paid-evidence source unavailable or throwing is treated as unpaid.
- Ship directly from `packed` is rejected as an invalid transition.
- `record_tracking` never yields `shipped` in any state.
- Supplier attempting cancel / recall / return / replacement / refund / damage /
  loss is rejected.
- Supplier reading or transitioning another supplier's assignment gets
  not-found, so ids leak nothing.
- Customer reading another member's order gets not-found; unauthenticated gets
  401.
- Stale optimistic version yields 409 `VERSION_CONFLICT`.
- Idempotency key reused with a different payload yields 409
  `IDEMPOTENCY_REUSED`; identical replay returns the original result.
- Unwired supplier access and unwired customer reads answer 503, not 200.
- Customer projection contains no supplier label, lot code, handling profile,
  or label reference.
