# HANDOFF — PUBLIC STOREFRONT + ORDER ENTRY

Session `claude-fable-storefront`, lane `launch-public-storefront`.

## BASE SHA

`5bb3fa9d364f0d6497cebcb1766417a9bbd0ccf8`
(`xenios/launch-integration-20260819` head at claim time, Lane E integrated)

## BRANCH

`lane/launch-public-storefront` — pushed to `origin`.
Worktree: `C:\xenios-wt\storefront`.

## COMMIT SHA

**`3c7dcc77fde050f3b7112a2ec4d28c82bd7eedc6`** (branch head, pushed)

Two commits, deliberately separable:

| SHA | What | Revertible alone |
| --- | --- | --- |
| `7d5d732444031c70cf3ac43fbd29da7f2989dad1` | The public storefront: contract, projection, routes, client pages, entry-intent, tests, integration packet | yes |
| `3c7dcc77fde050f3b7112a2ec4d28c82bd7eedc6` | Commercial landing page + policy rewrite + guard rescope | **yes — revert this one alone if the founder did not intend the reversal** |

Verified: `git revert --no-commit 3c7dcc7` leaves a green tree (76 tests pass,
storefront intact and still reachable by direct link).

## ⚠ THE ONE THING THAT NEEDS A HUMAN DECISION

`3c7dcc7` reverses a directive recorded in
`docs/research/RESEARCH_HOME_CATALOG_POLICY.md` as a **repeated
nonnegotiable**: no catalog CTA of any kind on `/research`, and no way to see
catalog contents or pricing without applying or signing in. The 2026-08-19
launch directive says the opposite ("MAKE THE LANDING PAGE COMMERCIAL. Primary
CTA: Browse Research Catalog"). Both claim founder authority; the newer wins on
date alone, which is not sufficient for a nonnegotiable.

Logged in `.xenios/FOUNDER_ACTIONS.md` under Open. **Confirm before release.**

Cost of the reversal, stated plainly: the guard's phrase denylist is retired
and now empty, because the directed CTA text is itself a denylisted phrase and
the old policy forbade renaming around it. Wording is no longer guarded on that
page. The href denylist, closed allowlist, and source scan are unchanged and
still reject a disguised member-catalog link on its destination. A new positive
assertion was added so the CTA cannot silently disappear either.

## FILES CHANGED

New, lane-owned:

```
shared/research/storefront/contract.ts
server/research/storefront/projection.ts
server/research/storefront/routes.ts
server/research/storefront/mount.ts
server/research/storefront/projection.test.ts
server/research/storefront/routes.test.ts
server/research/storefront/composition.test.ts
client/src/research/storefront/storefrontApi.ts
client/src/research/storefront/entry-intent.ts
client/src/research/storefront/StorefrontCard.tsx
client/src/research/storefront/StorefrontCatalogPage.tsx
client/src/research/storefront/StorefrontCatalogSurface.tsx
client/src/research/storefront/StorefrontCatalogRoute.tsx
client/src/research/storefront/StorefrontProductPage.tsx
client/src/research/storefront/StorefrontProductRoute.tsx
client/src/research/storefront/entry-intent.test.ts
client/src/research/storefront/storefront-surface.test.tsx
client/src/research/storefront/mobile-reflow.test.tsx
docs/research-launch/INTEGRATION-LANE-STOREFRONT.md
```

Modified (all in commit `3c7dcc7`):

```
client/src/research/pages/Gateway.tsx
client/src/research/pages/Gateway.catalog-guard.test.tsx
client/src/research/pages/public-access-flow.test.tsx
docs/research/RESEARCH_HOME_CATALOG_POLICY.md
.xenios/FOUNDER_ACTIONS.md
```

**No lead-owned seam was edited.** `server/index.ts`,
`server/research/index.ts`, `client/src/research/section.tsx`, and
`client/src/research/layout.tsx` are untouched on the branch; their changes are
written out in the integration packet.

## TESTS

```powershell
npx vitest run server/research/storefront client/src/research/storefront `
  client/src/research/pages client/src/research/lib server/research/master-offerings
npm run check
```

- `npm run check` (tsc): clean, both with and without the packet's seam edits
  applied.
- Storefront suites: 64 tests, all green.
- Full `client/src/research` + `server/research/master-offerings` sweep:
  **1906 passed**, 13 skipped.
- One unrelated pre-existing flake: `kris-launch-a/access-presentation.test.tsx`
  times out (5000ms budget) only under full-suite parallel load; it passes alone
  in 5.71s. Not touched by this lane.
- `server/research/master-offerings/catalog-boundaries.test.ts` passes with **no
  allowlist change**: this lane imports nothing from the catalog lane. It owns
  its query parser and depends on the catalog read through a structural
  interface.

Decisive tests:

- `entry-intent.test.ts` — every continuation URL the storefront builds survives
  `safeResearchReturnTo` **unchanged**, for all four actionable actions. This is
  the contract the whole auth-return requirement rests on.
- `projection.test.ts` — no SKU, Product Control id, price id/version, or member
  href survives the projection; a malformed amount degrades to on-request, never
  `$0`.
- `routes.test.ts` — the flag parses only the exact `"true"` and refuses before
  touching the service; the member-only `states` filter is a 400; a wrong family
  is a 404, not another product.
- `storefront-surface.test.tsx` — all six actions produce a real next step; a
  closed storefront still offers sign-in and apply.
- `composition.test.ts` — the packet's visitor viewer resolves a **null** pricing
  identity through the real derivation.

## ROUTES TESTED / BROWSER VERIFICATION

Real Chromium, built production client assets, at
`http://localhost:5211` (throwaway scratchpad stub server — see caveat).

| Route | Result |
| --- | --- |
| `/research` | Commercial landing renders: "Browse Research Catalog" (primary) + "Member Sign In" |
| `/research/catalog` | 6 products, all six action states, correct prices |
| `/research/catalog/research_vials/research-vials-bpc-157` | Variants, prices, quantity, Order CTA |
| `/research/catalog/blends/blends-wolverine` | Long-name product, on-request price |

Measured in-browser:

- **Widths 430 / 390 / 375 / 360 / 320: zero horizontal scroll** on all four
  routes. At a true 320px viewport, `body.scrollWidth === 320`.
- **No control under 44px** on any route at 320px.
- Card actions rendered exactly: `Order`, `Request Order`, `Request Quote`,
  `Continue through Care`, then `Temporarily unavailable` + `View details`, and
  `Not available` + `View details`. **Every card had a next step; none was a
  dead end.** No `$0.00` anywhere.
- **Intent preservation, live**: selecting the 10 mg variant and quantity 3
  rewrote the CTA to
  `/research/sign-in?returnTo=/research/member/catalog/research_vials/research-vials-bpc-157?variant=mov_bpc_10&qty=3&intent=buy_now`
  and the displayed price moved $69.00 → $99.00.
- All storefront API calls returned 200.

**Caveat, stated honestly.** The real server could not be booted here: the
production bundle requires Supabase service credentials at module load, and a
lane session must never hold a production database credential
(`.xenios/FOUNDER_ACTIONS.md`). This is **pre-existing** — the committed
`scripts/preview-research.mjs` fails identically on this worktree. So the
browser pass exercised the REAL built client against a stubbed storefront API;
the server projection is covered by unit tests instead. Screenshots could not be
captured (the browser pane does not composite frames in this session); the
evidence above is DOM and layout measurement rather than images. The three
console errors seen were the PWA service worker failing to register against the
stub (it serves `index.html` for `sw.js`), not a product defect — confirmed zero
registrations and the storefront rendered.

## INTEGRATION INSTRUCTIONS

Full paste-ready text: `docs/research-launch/INTEGRATION-LANE-STOREFRONT.md`.
Summary of the five seam edits the composition-root owner applies:

1. `server/index.ts` — import the storefront mount; compose
   `serviceForVisitor` from the existing `masterOfferingCatalogDependencies`
   with a **no-grant viewer**; register 4 routes + the scoped error handler.
   **The release census moves by 4**; update the pin in
   `server/release-control-plane.test.ts`.
2. `server/research/index.ts` — punch `/storefront/catalog` (exact) and
   `/storefront/products/:family/:slug` (anchored regex) through the legacy
   review-password wall, GET/HEAD only.
3. `client/src/research/section.tsx` — mount the two public routes, literal
   before parameterized.
4. `client/src/research/layout.tsx` — add both paths to `isPublicResearchPath`,
   or the storefront renders the review-password wall and the landing page's
   primary CTA leads to a lock.
5. OPTIONAL — `MasterOfferingDetail.tsx` (Lane A's file) can accept
   `initialVariantId` / `initialQuantity` to consume the preselection.
   **Without it the flow is still correct**: the visitor returns to the exact
   product page; only the radio preselection and quantity are lost.

Both seam edits 1–4 were applied locally and **typechecked clean**, then
reverted, so the packet is verified rather than asserted.

## ENV

`RESEARCH_PUBLIC_STOREFRONT_ENABLED` — must be exactly `"true"`. Unset, every
door answers `503 storefront_closed` and the pages render "not open yet" with
sign-in and apply still offered. **Setting it in production is a production
mutation requiring Samuel's current explicit approval.**

Notably NOT required: `RESEARCH_MASTER_OFFERINGS_ENABLED`. The storefront reads
the committed dataset artifact and never consults the member visibility policy.

## CONFLICT RISKS

| Risk | Detail |
| --- | --- |
| **HIGH — governance** | The `3c7dcc7` policy reversal. Needs a founder yes/no, not a merge decision. |
| **MEDIUM** | `.xenios/FOUNDER_ACTIONS.md` — I appended one item; the lead's worktree has this file dirty. Expect a trivial append/append conflict. |
| **MEDIUM** | `server/index.ts` — the packet adds a block after the master-offerings composition. Lane A's packet edits the `selections:` property in that same block. **Apply Lane A first, then this**; they touch adjacent lines, not the same ones. |
| **MEDIUM** | `server/release-control-plane.test.ts` — the route-count pin moves by 4. Lead-owned; other lanes mounting routes will also move it. |
| **LOW** | `client/src/research/section.tsx` and `layout.tsx` — additive entries only. |
| **LOW** | `client/src/research/pages/public-access-flow.test.tsx` — one assertion narrowed; belongs to the same governance decision. |
| **NONE** | `catalog-boundaries.test.ts` — no allowlist change needed. |

## WHAT THIS LANE DID NOT DO

- Did not mount anything. No route is reachable until the packet is applied.
- Did not touch the EA gate, EA cart, assisted-order, affiliate, or fulfillment
  lanes.
- Did not consume the preselection on the member detail page (Lane A's file);
  the URL is built and validated, and honoring it is one optional change.
- Did not run a production migration, deploy, or any production mutation.
