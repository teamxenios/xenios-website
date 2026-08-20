# S9 QA — mobile + end-to-end conversion attack report

Session: `claude-fable-s9-conversion-qa`
Lane: `launch-conversion-qa`
Branch: `lane/e2e-conversion-qa-20260819` (isolated worktree from `5bb3fa9`)
Date: 2026-08-19 / 2026-08-20

Scope: attack the real launch conversion flows (direct order request, affiliate,
Buy Now readiness) at 430/390/375/360/320 and 1366/1440, and separate genuine
product defects from environment gaps.

**Payment authority was not modified.** No production mutation. No production
data was written or read beyond read-only schema introspection used to
reconstruct a local stack.

## How this was tested

A production-shaped local stack was reconstructed from read-only introspection
of the production schema: 38 tables, the assisted-order RPC family, the Private
Early Access session RPCs, and an 18-product / 46-variant / 46-price catalog
slice with real approved member prices. The dev server ran against that local
Supabase, never against production.

## Blocker table

| SEVERITY | ROUTE | REPRO | EXPECTED | ACTUAL | OWNER |
|---|---|---|---|---|---|
| **P0** | `POST /api/research/early-access/assisted-orders` (composition root) | Open the order-request wizard, pick any product, submit | Line resolves to its Product Control identity and the request is accepted | 0 of 417 bindings resolve, every line is projected `unbound:…`, price is suppressed to "Price pending", submit fails **HTTP 500** | **FIXED on this branch** (lead integrates) |
| **P0** | `/research/early-access/order-request` step 3 | Tick every checkbox the page renders, press Submit | Submission accepted | Server refuses: "The accuracy acknowledgment must be confirmed on the current form". The client renders **none** of the 4 server-published `formAcknowledgments`, so the requirement is **unsatisfiable from the UI** | `claude-fable-s3` (owns `client/src/research/assisted-order/**`) |
| **P0** | `POST /api/research/early-access/unlock` | Set `RESEARCH_EARLY_ACCESS_OWNER_ID` to any canonical UUID other than the hardcoded default, enter the **correct** password | Session minted | 401 `invalid_credentials`. The route never wires `deps.ownerId` from the environment, so nonces are issued under the env owner and exchanged under `PRIVATE_ACCESS_DEFAULT_OWNER_ID`. No log, no diagnostic — post-password failures are deliberately indistinguishable from a wrong password | lead |
| **P0** | `/r/:code` (affiliate short link) | Visit `/r/ANYCODE`, or `/research?ref=CODE` | Attribution cookie set, durable touch, redirect into the funnel | **404 "That page is not here"** on the public marketing site. No cookie. `referral-capture-routes.ts` exists but is **not mounted**; the SPA catch-all swallows `/r/*`. All submitted orders carried `affiliate_attribution_ref = null` | lead |
| **P1** | 35 Early Access route registrations | Any persistence call rejects inside an EA route handler | Failed request returns 5xx, server stays up | **The Node process exits.** `register.ts` mounts handlers as `void handler(req,res)` with no `.catch` (35 sites, 1 guarded). Observed: a failing call in the agreements route terminated the server. `placeOrder` and `readOrder` are registered the same way, so a database blip mid-order is a **total outage**, not a failed request | lead |
| **P2** | `/research/early-access/order-request` (all widths) | Focus any field on iOS Safari | No zoom | Every input is **14.4px**; iOS auto-zooms on focus below 16px, shifting the layout on every field of the order form | frontend (this lane / s3) |
| **P2** | assisted-order client (`api.ts`) | Sign in as a member, open the wizard | Catalog loads for an authenticated member | `request()` sends only cookies, never the member Supabase JWT, so a signed-in member gets **"This request is not authorized."** at step 2 and on the status page, with **no recovery affordance** (no re-auth prompt, no retry that can succeed) | `claude-fable-s3` |
| **P3** | EA config | Set `RESEARCH_EARLY_ACCESS_OWNER_ID` to a non-RFC-4122 UUID (e.g. `…-4444-…`) | Rejected at startup with a named reason | Persistence-layer shape check accepts it (`[0-9a-f]{4}`), the session repository's canonical check rejects it at runtime, so the deployment looks configured and silently denies **every** unlock | lead |
| **P3** | order-request step 2 | Browse the product picker | Human-readable group headers | Raw enum keys render as headers (`CLINICAL_FORMULATIONS_503A`) while the filter dropdown shows proper labels | frontend |

P0 = customer cannot submit business.

## What passed

- **Idempotency / duplicate submit.** Two genuinely concurrent POSTs with one
  idempotency key returned the same `XRR-…` reference; exactly one row persisted.
  Double-clicking Submit does not create a second order.
- **Widths.** No horizontal overflow at 320 / 360 / 375 / 390 / 430 / 1366 / 1440
  on the gateway, sign-in, member dashboard, full catalog, product detail, EA
  gate, or the order-request wizard. No CTA rendered off-screen on the wizard at
  any width. Page-level `scrollWidth` equalled viewport width in every case.
- **Fail-closed behaviour is real.** With acknowledgments incomplete the Submit
  button is genuinely `disabled`, not merely styled. The unconfigured legal
  package refuses truthfully. An unreachable catalog says "we cannot reach the
  catalog", never "there is nothing available".
- **Back navigation.** Returning from step 2 to step 1 preserves every contact
  field; no state loss, no dead end.
- **Dead links.** Every sampled internal link resolves to a declared route. The
  only 404 found was `/r/:code`, reported above.
- **Server chain, once unblocked.** With the binding fix and a complete
  acknowledgment set, submit returns **HTTP 201** with a real `XRR-…` reference,
  correct `$33.50` line pricing, and a durable status token.

## The fix carried on this branch

`server/index.ts` — the assisted-order seam looked bindings up by offering
variant id against an index keyed `offeringId|offeringVariantId`, so every
lookup missed. A variant-keyed forward map is now built alongside the existing
reverse map. Offering variant ids are globally unique across the artifact (417
of 417 distinct), so the map is total.

Verified after the fix: catalog rows carry real Product Control UUIDs, the
action upgrades from `request_pricing` to `direct_order_request`, price resolves
to `$33.50`, and submit returns 201.

## Environment gaps (not product defects)

These were local reconstruction gaps, recorded so the next session does not
re-investigate them: the EA commerce persistence layer needs many RPCs that were
not ported, `research_early_access_*` identity/session tables and functions had
to be created by hand, and prices need `approved_by` stamped or the authoritative
resolver correctly refuses them.
