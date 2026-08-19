# LAUNCH SCOPE — frozen 2026-08-19 (emergency minimum-live directive)

Nothing outside P0 RELEASE A blocks launch. One release owner: the lead
session on `xenios/launch-integration-20260819`.

## P0 RELEASE A — minimum live order intake

- Assisted-order vertical slice (ALREADY CODE-COMPLETE at c318ec9, integrated
  here): catalog -> multi-product select -> approved prices -> contact ->
  shipping -> agreements -> idempotent submit -> durable XRR -> status ->
  admin queue.
- Affiliate minimum: /r/CODE + ?ref capture -> signed cookie -> durable touch
  -> survives auth -> affiliateAttributionRef stored on the request ->
  commission candidate `pending_program` until the founder activates the
  program economics. (lane/launch-affiliate-spine + lead seam wiring.)
- Admin minimum: assisted-order queue + detail (live in RC), payment-review
  queue UI + tracking entry (lane/launch-fulfillment-admin).
- Payment minimum: the approved manual EA lane (instructions -> proof ->
  named-admin verification). No processor. Customer/affiliate can never mark
  paid.
- Fulfillment minimum: admin-driven via the mounted EA dispatch lane
  (supplier packet, tracking, shipped); never fabricated states.
- Mobile: functional pass on 430/390/375/360/320 for the request flow.
- Gates + exact Release A RC SHA + activation runbook. Production mutation
  stays founder-approval-gated.
- Document bucket: NOT a Release A blocker (uploads are admin-initiated
  post-intake); bucket creation precedes the first identity request.

## P0 RELEASE B — Buy Now on genuinely ready variants

- Selection authority wired behind RESEARCH_MASTER_OFFERINGS_DIRECT_COMMERCE
  (default off), card-level truthful CTA, Buy Now -> auth -> return
  preservation, checkout re-resolution, canonical order via the EA cart lane
  with attribution + commission hold at settlement, member-visible cart
  orders. (lanes launch-catalog-cta + launch-ea-cart-order.)
- Start with the subset of the 143 BUY_NOW_CANDIDATE variants that passes
  supplier/docs/shipping/payment readiness from the launch matrix — not all
  143.

## POST LAUNCH (explicitly deferred)

Quote engine mount (foundation committed), organizations/M70, affiliate
payout automation and CRM, supplier portal/APIs, processor integration,
notifications center beyond the outbox, analytics, Google Workspace,
subscriptions/reorder, Care expansion, rebrand, full design system,
member-commerce lane enablement (stays fail-closed), fulfillment-engine
migrations 42/43.

## Founder decision queue (does not block Release A)

1. 34 price mismatches: production approved member prices vs the 2026-08-16
   workbook retail — docs/research-launch/PRODUCT_LAUNCH_MATRIX.md.
2. 5 unmapped price-book SKUs (Retatrutide 60mg, MOTS-C 40mg, Kisspeptin-10,
   Glutathione 600mg, with-DAC CJC combo).
3. Affiliate program activation (20%/7.5%/21d/$50 seed is configurable,
   `pending_program` until activated).
4. Phase Zero packet approval (M71 + admin email + deploy + flag) — THE
   Release A production gate.
5. EA payment/settlement env chain for the operator loop.
