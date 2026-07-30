# /research completion map and build plan

Source: the 18-agent completion audit of origin/main c8ffce4 (2026-07-30, every P1 claim
adversarially verified) plus the fix work already submitted. Standing founder instruction:
keep going until /research is fully built and live.

## Verdict by layer

| Layer | State |
| --- | --- |
| Route shell | COMPLETE. All 94 manifest routes are REAL and registered (ACCESS 9/9, MEMBER 33/33, PARTNER 17/17, ADMIN 35/35); routes-parity enforces manifest-router agreement. Frontend routing is not the blocker. |
| Account access | FIXED IN PR #147 (awaiting Codex merge). Claim, sign-in, reset, and activate all work from a fresh browser; the wall's open allowlist now covers the four account-access lanes with a dedicated wall test. 223 files / 4,269 research tests green on the branch. |
| Catalog display | BUILT BOTH HALVES, DEAD BOTH HALVES. The server adapter is never registered, its production authorizer does not exist, the gateway wall shadows its path (proven by a trap test), no env flag is set anywhere, and no client route mounts CatalogGrid/ProductDetail (no fetch adapter exists). Members today see the OTHER pipeline (MemberCatalogExperience fed by Supabase Product Control). The 70 peptide variants exist only inside the unwired catalog-display projection. |
| 911-row brand catalog | REACHABLE FROM NO SURFACE. brand-catalog.ts is consumed by nothing except brand-copy.ts; displaying the 911 rows requires a net-new brand display lane. |
| Commerce | BUILT-AND-WIRED, fail-closed in STATE 1. Full G7 endpoint set live server-side (deferred-capture Stripe adapter, FEFO reservation-before-money checkout, large-order review); cart/checkout/orders/subscriptions pages complete. Four links no flag flip fixes: no add-to-cart affordance anywhere, no payment-method collection in the wire contract (a real authorization returns payment_failed), Track B schema (MIGRATIONS.md orders 22-26) pending IN ADDITION to managed 42-46, and the review-password wall fronts /cart /checkout /subscriptions for Bearer-authed members. PR #117 is fully superseded by merged PR #136 (byte-identical payload) and should be CLOSED. |
| Server APIs | 57 live client calls have NO server route (silent pending states, not crashes): 13 member-prefix/name drift paths (client /api/research/member/X vs server /api/research/X per the frozen contract), 12 member endpoints that exist nowhere (membership view/cancel, security sessions, privacy data rights, tracker export/delete, guide corrections, voice questions), 16 partner paths (server implements only me/dashboard/apply/links), 16 adminx reads (Audit, Fulfillment, and most list/detail screens). |
| Auth model | Admin sign-in is CORRECT (server-verified JWT vs ADMIN_EMAIL, recovery-purpose sessions denied, client presentation-only). The 9.2 shared-password retirement is CHEAP: the entitlement chain already enforces everything member-facing; remaining work is the Bearer-bypass widening and then wall retirement. |

## Build order (reviewer session, code PRs for Codex to merge)

1. DONE: PR #147, fresh-browser account access (claim + activate + open lanes + tests).
2. NEXT: catalog-display wiring: build authorizeCatalogDisplayViewer (server-identity only),
   register the adapter in server/index.ts, add the gateway-wall bypass for its read path,
   client fetch adapter, mount CatalogGrid/ProductDetail on the member and admin routes,
   env flag documented and DEFAULT OFF so the merge is inert until Codex flips it.
3. Brand display lane for the 911 rows (display-with-status, zero purchasable until Product
   Control approval, preserving the existing build-time purchase guard semantics).
4. API reconciliation in three PRs: (a) the 13 drift paths (align client adapters to the frozen
   contract), (b) the 12 missing member endpoints as honest fail-closed implementations,
   (c) partner-lane endpoints. Adminx reads follow.
5. Commerce affordances: add-to-cart and subscribe-now callers (adapters already exist),
   then payment-method collection (Stripe Elements client + paymentMethodReference through
   CheckoutRequest -> routes -> checkout service).
6. Wall Bearer-bypass widening to the commerce and partner prefixes, then full 9.2 wall
   retirement (PasswordPage removal, /access endpoints, gate derivation).

## Codex-owned production actions (blocking LIVE regardless of code)

- Merge PR #147 and the PRs above; close superseded PR #117.
- Apply Track B schema (MIGRATIONS.md orders 22-26) then managed migrations 42-46, serially.
- Env: NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED, RESEARCH_CATALOG_DISPLAY_ENABLED,
  PAYMENTS_PROVIDER + STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET, RESEARCH_SERVICEABLE_STATES
  (default empty ships nowhere), SUPABASE_* for STATE 3, shipping provider.
- PR #144 rework per the REQUEST_CHANGES verdict (locked pricing values and formula).

## External prerequisites (founder / supplier)

- COAs: 0 of 15 peptide SKUs clear purchase eligibility today; supplier documentation is the
  first physical gate to any peptide sale (the 911 brand rows use supplier-unmetered policy
  per directive 7.6 and are not COA-gated, but need the display lane and Product Control
  approval batch).
- Stripe production keys and the serviceable-states decision.
- SEN-0016 decision (About-page executive bio vs directive 7.11).

## Orphans noted

pages/adminx/Inventory.tsx and pages/MemberWelcome.tsx are unwired files; the supplements
member route is a deliberate governed coming-soon pending approvals (P2 to finish).
