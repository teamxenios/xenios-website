# SUPPLIER-WORKSPACE handoff

- **Session**: `claude-fable-s11-supplier`
- **Branch**: `lane/supplier-workspace-20260820` (pushed to origin)
- **Exact SHA**: `09d0c990aaec3428a3f3bd2b8002382ea739e097`
- **Base**: `cf649c10f8a9129b9d425430f4dcbc5f37367917` (current integration HEAD)
- **Production mutated**: NO

## What this is

The operational surface an approved supplier uses to move their own assigned
work forward. Unmounted and inert until the lead wires the route.

## What was deliberately NOT built

The fulfillment engine, its state machine, the minimum-necessary supplier
projection, and supplier identity resolution **already exist and are already
integrated** at `cf649c1` (`server/research/fulfillment/**`,
`shared/research/fulfillment/**` — s8's FULFILLMENT-MOUNT). This lane adds no
authority and no second implementation. It is the surface over that engine.

Files added (all inside the SUPPLIER-WORKSPACE lease):

| File | Role |
|---|---|
| `shared/research/supplier/workspace.ts` | View model: which actions to draw, labels, evidence requirements, projection guard |
| `shared/research/supplier/workspace.test.ts` | Pins the view model to the engine's real transition table |
| `client/src/research/supplier/api.ts` | The two supplier fulfillment paths, in one place |
| `client/src/research/supplier/Workspace.tsx` | The queue UI |
| `client/src/research/supplier/workspace.test.tsx` | UI + negative controls |

## The drift problem, and how it is handled

The browser bundle cannot import `server/research/fulfillment/service.ts`, so
the workspace needs its own copy of which actions are legal from which state.
A second copy of a rule drifts.

`shared/research/supplier/workspace.test.ts` imports the engine's real
`FULFILLMENT_TRANSITIONS` and asserts, state by state, that
`SUPPLIER_WORKSPACE_ACTIONS` equals that table narrowed to
`SUPPLIER_PERMITTED_ACTIONS`. If the engine's rules change and this map does
not, **that test fails** rather than a supplier pressing a button the server
rejects. The map is advisory in every case; the server is still asked and its
refusal is what the operator sees.

## Negative controls exercised

- A tracking number never reads as shipped. `record_tracking` is its own step,
  the state renders "Tracking added, not yet shipped", and `ship` is reachable
  only from `tracking_created`.
- Internal-authority dispositions (cancel, recall, return, replacement, refund,
  damage, loss) are offered from no state.
- No supplier id is sent in any request; identity is resolved server-side, so
  the workspace cannot address another supplier's work.
- An assignment carrying a forbidden field (margin, commission, affiliate,
  retail/wholesale/cost/price, payment, member identity, email, health) is
  **refused rather than rendered**, checked deeply including line items. The
  order reference and the offending value never reach the page.
- Unwired supplier access (503) renders the honest not-switched-on state.
- A refused write reports the server's reason; it never claims success.
- Empty queue reports truthfully.

## Verification at this SHA

```
npx vitest run client/src/research/supplier shared/research/supplier
  -> 2 files, 47 tests passed
npx tsc --noEmit
  -> clean
```

**Not run:** the full suite, and no browser pass — the route is unmounted, so a
preview cannot exercise it. Browser verification belongs with the mount.

## Mount snippet for the lead

`client/src/research/section.tsx` is a protected seam and was not touched.

```tsx
// with the other lazy imports
const SupplierWorkspace = lazy(() => import("./supplier/Workspace"));

// with the other routes
<Route path="/research/supplier">{() => <L component={SupplierWorkspace} />}</Route>
```

Two things belong with the lead, not this lane:

1. **`client/src/research/lib/routes.ts`** — a `SUPPLIER_ROUTES` entry, and
   adding the path to the route census if one is asserted. That file sits in
   `F7-ACCOUNT-MOUNT`'s path set, so this lane left it alone. Expect the route
   count to move by one.
2. **`resolveSupplierActor`** — the fulfillment engine's supplier identity
   resolver is optional and currently unwired, so both supplier endpoints
   answer 503. The workspace renders that honestly today. Supplier access only
   becomes real when that resolver is injected at the composition root, and
   that decision (how a supplier operator authenticates) is a lead/founder
   call, not this lane's.

Until both land, mounting the route is safe: the page renders the
not-switched-on state and no supplier data exists to expose.

## Relationship to the existing public page

`client/src/research/pages/SupplierAccess.tsx` (`/research/supplier-access`)
is the public invitation-only explainer and is unchanged. Its stated scope was
used as the specification for this workspace, and the workspace honors all four
of its promises. If the lead wants, that page's "Contact supplier operations"
card can later link approved suppliers to `/research/supplier`.

---

## SUPERSEDED — corrected SHA (2026-08-21)

`09d0c990` is SUPERSEDED by **`79d6b61e99fc6800c8962933c40aab4adc10f80d`**
(force-pushed to `lane/supplier-workspace-20260820`).

**Base changed** to `4a7bca30f0a9b9516ec645ce50c3c0665c6f8fd0` (s8's wall
alignment), rebased cleanly off `cf649c1` with zero file overlap.

**Why.** `09d0c990` called `/api/research/fulfillment/supplier/...`. Those doors
were moved to `/api/admin/research/fulfillment/...` at `4a7bca3`, because the
research wall answers 401 for operator traffic. No test failed: the adapter held
a second copy of a constant the server owns, so it drifted silently and a
supplier operator would have been the one to discover it.

**The durable fix** is `client/src/research/supplier/api.test.ts`, which imports
the engine's own `FULFILLMENT_SUPPLIER_QUEUE_PATH` and
`FULFILLMENT_SUPPLIER_TRANSITION_PATH` and asserts the adapter matches, template
parameter included. It additionally asserts no operator door sits under
`/api/research/` at all, so the same mistake cannot recur under a different
spelling. This is the same pinning discipline already applied to the transition
table — the seam simply proved it was needed in two places, not one.

**Integration coupling:** this SHA now depends on `4a7bca3`. Take the wall
alignment first, or take both together. If the door move is rejected, the
adapter must be re-pointed.

Verification at `79d6b61`: `npx vitest run client/src/research/supplier
shared/research/supplier` -> 3 files, 52 tests passed. `npx tsc --noEmit` clean.
Still no browser pass — the route remains unmounted.
