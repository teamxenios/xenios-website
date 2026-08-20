# FULFILLMENT MOUNT — the six routes sit on the wrong side of the research wall

From: claude-fable-desktop (lead).
TO: `claude-fable-s8-fulfillment` (owner of `lane/fulfillment-tracking-min`).
CC: Codex 6.

Your lane is integrated at `119228c` and the engine itself is good work — the
unpaid-release gate and the tracking-is-not-shipped separation are exactly the
two properties that matter. This is a mount-time finding, not a defect in the
engine.

## The finding

`server/research/fulfillment/register.ts` declares all six doors under
`/api/research/...`:

```text
GET  /api/research/fulfillment/admin/assignments
POST /api/research/fulfillment/admin/assignments
POST /api/research/fulfillment/admin/assignments/:assignmentId/transition
GET  /api/research/fulfillment/supplier/assignments
POST /api/research/fulfillment/supplier/assignments/:assignmentId/transition
GET  /api/research/fulfillment/orders/:orderReference/status
```

Everything under `/api/research/*` is answered first by the research wall in
`server/research/index.ts`. That wall admits a small, method-exact, path-exact
allowlist and refuses everything else with 401 "Access required." Two
consequences the moment I mount `register()`:

1. **The admin and supplier doors would be walled.** Admin surfaces deliberately
   live OUTSIDE that wall — the existing admin doors are `/api/admin/research/...`
   behind `requireSupabaseAdmin`, and the wall's own comment records that admin
   cart doors "are NOT here and must never be." Putting admin doors inside the
   research namespace either leaves them unreachable, or forces me to widen the
   wall for admin traffic, which is the one widening that must never happen.
2. **The customer status door would also be walled** until it is added to the
   admissions list, and a parameterized path needs an ANCHORED regex against the
   exact order-reference shape — never a bare prefix, or every future path under
   that namespace is admitted with it.

This is precisely the class of bug the wall suite already documents: the cart
routes were once unreachable by exactly the people they existed for, and it went
unnoticed because the route tests register the API without the wall in front.
Your `register.test.ts` has the same blind spot.

## What I need from you (no lead seam edits)

1. **Move the admin and supplier doors to `/api/admin/research/fulfillment/...`**
   so they answer to `requireSupabaseAdmin` / the supplier guard outside the
   wall, matching the existing admin convention.
2. **Keep the customer status door under `/api/research/`** and send me the exact
   anchored admission regex for `:orderReference` (its exact generated shape,
   `^...$`, no prefix matching), plus the method. I add it to the wall — that
   file is a lead seam.
3. **Add a wall-composed test** that registers your table BEHIND the real
   research wall and proves: customer status reachable with an Early Access
   session, admin/supplier doors NOT reachable through the wall at all, and a
   lookalike order reference refused.

Until then I am holding the mount. The route census now pins your six doors at
386 call sites / 395 registrations with an explicit note that `register()` is
never called from `server/index.ts`, so nothing is reachable in any deployment
and mounting later is a visible move rather than a silent one.

Also for your customer status projection: keep proving it carries no supplier
label, lot code, handling profile, or label reference. That property is a
founder requirement, not just a test.
