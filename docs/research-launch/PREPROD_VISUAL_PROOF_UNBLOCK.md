# Unblocking visual proof and mobile performance measurement

Four launch items are blocked on one missing thing, and none of them can be
solved by the fleet:

1. **P0-G visual proof** — nobody has opened `/research/early-access` in a browser.
2. **Mobile performance measurement** — TTFB, catalog duration, time to first
   price, TTI, payload, at 430/390/375/360/320.
3. **Confirming the deploy helps** — the pricing fix is real but serves a
   different catalog.
4. **Confirming the EA-catalog N+1 fix works on a phone** once it lands.

This document says exactly what is required, so the ask is concrete rather than
"we need credentials".

## What the page needs to render with real data

`/research/early-access` calls `GET /api/research/early-access/catalog`. That
route answers a truthful 503 unless Product Control is configured, so an
unconfigured environment shows an empty state rather than the catalog — which
is why a local run without these proves nothing about the storefront.

Environment names read by that path (names only; no values appear in this repo):

| Variable | Why |
|---|---|
| `SUPABASE_URL` | Product Control connection |
| `SUPABASE_SERVICE_ROLE_KEY` | Product Control reads — **see the warning below** |
| `RESEARCH_EARLY_ACCESS_ENABLED` | Turns the Early Access surface on |
| `RESEARCH_EARLY_ACCESS_PASSWORD_HASH` | The one customer gate (hash, never plaintext) |
| `RESEARCH_EARLY_ACCESS_SESSION_SECRET` | Signs the EA session |
| `RESEARCH_SESSION_SECRET` | Signs the research session |
| `RESEARCH_ACCESS_PASSWORD` / `RESEARCH_PUBLIC` | Outer research gateway |
| `SITE_URL`, `ADMIN_EMAIL` | Links and admin routing |

`RESEARCH_EARLY_ACCESS_OPEN_ACCESS` exists and bypasses the customer gate. For a
throwaway preprod environment that is the simplest way in; it must never be set
on anything reachable by the public.

## The warning that matters

`SUPABASE_SERVICE_ROLE_KEY` is a **full-privilege credential that bypasses row
level security**. The correct unblock is NOT to paste the production service
role key into a worker session. Two safe options, in order of preference:

1. **A seeded local Supabase.** `supabase start` against the repo's migrations,
   with catalog rows seeded. No production data, no production credentials, and
   it can be thrown away. This is what the blocked mobile pass actually needs —
   the measurements care about query COUNT and shape, not about real customer
   rows.
2. **A read-only preprod project** with its own keys, holding a copy of the
   catalog. Still not production, still disposable.

A worker session holding a production service role key is a larger risk than the
thing it unblocks. I have declined it on that basis, and would decline it again.

## What a real pass must then prove

Per the founder's directive, on the CONVERGED storefront rather than the legacy
22-product page:

- full canonical catalog, retail prices, Featured and All Products, search, filters
- an eligible RUO peptide reaching the order form, with variant and quantity
- affiliate code field, customer and shipping fields, agreements, submit
- order reference and confirmation
- `GRP-0422` shows a retail price and **Request Order** — never Buy Now, never
  Temporarily Unavailable. Assert on the CTA the customer sees, never on the
  product name: the reviewed reconciliation strips the marker from the canonical
  specification, so any assertion keyed on text silently stops firing.
- WITH DAC 2 mg and 5 mg direct; 10 mg Request Order
- Care rows keep "Continue through Care"
- no horizontal overflow at 430/390/375/360/320

Performance targets: first products ≈2s, warm ≈1s, cold ≈3s. Desktop-fast and
mobile-30s is a FAIL, so measure at mobile widths, cold and warm.

## Known caveat for whoever runs it

The duplicate collapse is not applied in the runtime yet, and the founder's
price override is not encoded pending confirmation in the lead's session. So
Hexarelin 5 mg and Oxytocin 10 mg will not yet read as the founder expects.
**Record what you see and flag it**; do not treat any figure or CTA for those two
as the expected value.
