# HANDOFF — ASSISTED-ORDER-CUSTOMER-FLOW (claude-fable-s3)

EXACT SHA: 33af738e5825e0032e249dbf16ef1d7055d6c848
BRANCH:    fable/assisted-order-customer-flow-20260819
WORKTREE:  C:/xenios-wt/assisted-order-flow
BASE:      5bb3fa9d364f0d6497cebcb1766417a9bbd0ccf8 (xenios/launch-integration-20260819)
SCOPE:     client/src/research/assisted-order/**, shared/research/assisted-order/** ONLY
PRODUCTION MUTATION: none. No server seam, no route registration, no migration, no email, no deploy.

## What this fixes (two defects that made the flow unusable in a real browser)

1. FORM ACKNOWLEDGMENTS WERE NEVER SENT — every real submission was refused 400.
   `service.requireAgreements` (server/research/assisted-order/service.ts:961-971)
   demands each `assisted_order_form_v1:<id>` pair at its exact copy hash. The
   client config parser read only `requiredAgreements` and ignored
   `formAcknowledgments` entirely, so the browser never sent them. The
   server's own E2E only passed because it spreads a server-side FORM_PAIRS
   constant (http-e2e.test.ts:97).
   FIX: `parseAssistedOrderConfig` now carries BOTH sets; the review step
   renders the union; the conditional RUO fact appears only when an RUO line
   is actually in the basket, mirroring `requiredAssistedOrderFormAcknowledgments`.

2. CONFIRMATION ROUTE WAS UNREACHABLE.
   The wizard navigated `.../order-request/confirmation?reference=XRR-...`
   but the registered route (section.tsx:295) is
   `.../order-request/confirmation/:publicReference`. Wouter fell through to
   the status route, rendering the status page with reference "confirmation",
   which then 404'd.
   FIX: navigate the registered PATH form, in-app via wouter (no full reload).
   The confirmation page reads the path segment and still accepts the old
   querystring as a fallback for any stored/shared link.

## Flow work delivered

- Catalog-first order: products -> contact -> review -> submit. The customer
  sees the shelf before a form (was: contact form first).
- Multi-product, exact variants, quantities honoring each item's MOQ /
  increment / maximum via `clampQuantity`; free-typed numbers snap to the
  allowed grid instead of carrying an invalid quantity into a submission.
- Durable draft (`draft-store.ts`): selections, quantities, per-line notes,
  step and the idempotency key persist under the shared assisted-order
  storage prefix, so an Early Access session bounce costs only the contact
  fields and the resumed submission REPLAYS AS THE SAME REQUEST.
  Contact details are never persisted (matches pendingOrderStore's decision).
  The key lives under `xenios.assisted-order.` so `clearAssistedOrderStorage`
  sweeps it at sign-out.
- Stale snapshots re-resolve (`selection-refresh.ts`): a restored draft and
  any browse of a priced page adopt CURRENT server values; items the live
  catalog no longer resolves are removed and named out loud.
- `price_changed` / `catalog_changed` keeps the customer on review with
  refreshed server values and a plain explanation, instead of a dead error.
- `idempotency_conflict` mints a fresh key and explains, so an edited
  resubmission is not silently swallowed.
- Per-line customer notes now reachable in the UI (the contract field
  existed but nothing ever set it).
- Copy is truthful: "Request received", "Reference: XRR-...", "We will
  confirm availability and payment details before fulfillment." Nothing
  says paid or fulfilled.

## Negative controls proved by test (37 passing, 5 files)

- missing agreement fails closed .... submit disabled until every required
  entry is acknowledged; `submissionBlocked(null, ...)` is true, so a config
  that never loads can never submit. (wizard-state.test.ts, AssistedOrderPage.test.tsx)
- client cannot set authoritative price .... submitted lines carry exactly
  productId/variantId/quantity/customerNotes plus the three advisory
  `expected*` pins; no authoritative price slot exists in the payload.
- missing price never becomes zero .... an all-unpriced basket estimates
  null and renders "Price pending"; a mixed basket totals only priced lines.
- duplicate submit does not create a duplicate .... a retry after failure
  replays the SAME idempotency key; the draft preserves it across a bounce.
- Care product cannot enter the Research request path .... `provider_request`
  renders an explanatory notice and NO add control;
  `selectableInResearchRequest` refuses it; the shared policy test proves a
  Care row stays `provider_request` even when priced and direct-eligible.
- held product cannot falsely appear orderable .... shared policy test
  proves held/out-of-stock resolves to `availability_review` and never
  "Add to order request", even with directEligible true and a price set.
- cross-customer request access .... unchanged; remains server-enforced
  (getStatus scopes by memberId / EA session hash / status token, 404 on miss).
  Not re-implemented client-side on purpose.

## Test command

npx vitest run client/src/research/assisted-order shared/research/assisted-order
Result at this SHA: 5 files, 37 tests, all passing.

## WIRING INSTRUCTIONS FOR THE LEAD

Nothing to mount. The three routes already exist at section.tsx:294-296 and
the CTA at EarlyAccessRoute.tsx:336. This commit only changes files inside
the two leased path families.

ONE OPTIONAL SEAM (lead-owned, NOT taken here):
`clearAssistedOrderStorage` (storage.ts) is still dead code — zero call
sites repo-wide. The Early Access sign-out (EarlyAccessRoute.tsx `signOut`,
which already calls clearBrowserCart / clearCartRecovery / clearPendingAttempt)
should call it too, so a shared machine does not leave the previous
customer's status token and draft for whoever unlocks next. That file is
outside this lease; recommend the lead apply the one-line import + call.

## FOLLOW-ON, NOT DONE HERE

- Quantity ceiling 1..100 per the Codex-3 lane spec: the contract ceiling is
  currently ASSISTED_ORDER_MAX_QUANTITY = 100_000 and production-catalog.ts
  pins minimumQuantity 1 / increment 1 / maximum null. A real 100 cap is a
  CATALOG AUTHORITY change (server), not a client clamp; the client already
  honors whatever maximum the server projects.
- Manual affiliate code entry: `affiliateAttributionRef` exists on the submit
  contract but the service deliberately ignores it and derives attribution
  from the verified cookie only (service.ts:406-408). Adding a manual code
  field requires a server decision first; do NOT add a client field that the
  server silently discards.
