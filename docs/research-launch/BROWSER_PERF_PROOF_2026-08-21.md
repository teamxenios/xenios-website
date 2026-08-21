# Browser, mobile, and performance proof — Early Access manual-order launch

**Session:** `claude-fable-browser-perf` (browser / mobile / performance specialist)
**Date:** 2026-08-21
**Measured head:** `23b496e125073f0de8009c21e8a3bd582414f32b` (`xenios/launch-integration-20260819`, the integrator's local head at measurement time)
**Environment:** SAFE seeded local stack. No production credentials were requested, held, or used. No production mutation.

---

## 1. The environment (P0-4 unblocked, safely)

A dedicated local Supabase stack (`supabase start`, project id `browser-perf`, API :54341)
was stood up next to s9's existing stack without touching it:

1. Schema cloned from the s9 stack's proven database (`pg_dump --schema=public`), which the
   fleet already used for a working browser order.
2. Missing objects the legacy Early Access catalog path needs (absent from the s9 schema)
   applied from repo SQL, in dependency order:
   `research-required-input-readiness.sql`, `research-inventory-lots.sql`,
   `research-products-diagnostics.sql`, `research-inventory-lot-coa-admin.sql`,
   `20260804122000_…supplier_operations.sql`, `20260804130000_…unit_holds.sql`,
   `20260726143000_…product_control_center.sql`, `20260804121000_…commerce_persistence.sql`.
3. **Full canonical scale seeded**: 217 products / 417 variants with the EXACT UUIDs from the
   committed binding artifact (`master-offering-bindings.generated.json`), display data from
   the member-safe offerings artifact, and retail+member prices from
   `XENIOS_FULL_CURRENT_RETAIL_PRICING_426_VARIANTS_2026-08-19.csv`. Zero unmatched joins.
4. The production bundle (`npm run build` at `23b496e`) served by `scripts/preview-research.mjs`
   with the local stack's own keys (the supabase CLI's public demo JWTs — not secrets).

Environment env deltas beyond the preview script's defaults, all required to reach the composed
launch surface:

```
RESEARCH_EARLY_ACCESS_OWNER_ID=<any UUID>            # durable session store mounts
RESEARCH_EARLY_ACCESS_SESSION_IDENTITY_ENABLED=true  # anonymous EA session gets an identity
RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED=true          # order intake mounts
RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL=<address>        # bridge refuses without it
RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS='[{"kind":"early_access_terms","version":"v1"}]'
```

(Do NOT set `SITE_URL` to an http:// URL — account-claim links require HTTPS and the
composition refuses to boot.)

Reproduction recipe and tooling: `e2e/browser-perf/`.

---

## 2. Performance — measured, not reasoned about

All numbers at FULL canonical scale (217 published products / 417 variants / 417 retail
prices), local DB round-trip < 3 ms. Round trips counted at the REST proxy, so they are query
COUNT and SHAPE facts that transfer to production; absolute times transfer only as lower
bounds (production adds 20–40 ms network per round trip, connection limits, and Cloudflare).

### The founder's spinner, reproduced and explained locally

| Endpoint | Time (local) | Supabase round trips | Notes |
|---|---|---|---|
| `GET /api/research/early-access/catalog` (legacy Featured) | **12.8–15.0 s** | **~4,300 per request** | ~7 tables × 2 snapshot reads × 217 products + per-variant fan-out. **Nothing cached between requests** — 3 consecutive requests cost 3 × ~4,300. |
| `GET …/assisted-orders/catalog?pageSize=24` — alone | cold **1.38 s** / warm **0.06–0.15 s** | cold 7 / warm ~2 | The repaired bulk-pricing path. Payload 18.9 KB per 24 rows, 77.7 KB per 100. |
| Same endpoint **while the legacy N+1 runs concurrently** | **3.8–4.1 s** | ~2 | Event-loop / connection-pool contention inside one Node process drags the fast endpoint 25–60×. `config`/`session` also degrade 1 ms → 130–400 ms. |
| Page shell `/research/early-access` | TTFB 18–40 ms, DOMContentLoaded ~110–140 ms | — | Shell itself is never the problem. |

**The storefront fires BOTH requests on every load.** So even with the bulk-pricing repair
live, first useful catalog in a real browser measured **~5.2 s cold / ~5.6 s warm** at
LOCAL latency — the founder's 30–60 s on production latency is this same shape, amplified
by RTT. Two independent conclusions:

1. **P0-1 (batching the declared-facts reads) is confirmed as THE fix.** The ~4,300
   round-trip fan-out is present at `23b496e` (the bulk `listDetails` seam exists but no
   production repository implements it at this head; the integrator's uncommitted work adds
   it — measured before that landed).
2. **Even before P0-1 lands, decoupling helps:** the legacy Featured fetch degrades the
   whole process while it runs. If Featured shipped 0–22 units from a request that costs
   4,300 queries, the All Products surface — which is the launch surface — pays for it.

### Founder targets at this head

| Target | Verdict at `23b496e` |
|---|---|
| warm ≤ ~1 s | **FAIL in-browser** (5.6 s; the assisted-orders API alone passes at 0.06–0.15 s) |
| first useful catalog ≤ ~2 s | **FAIL** (~5.2 s, gated by legacy N+1 contention) |
| cold ≤ ~3 s | **FAIL** (legacy endpoint alone is 12.8+ s even locally) |

These pass only when the legacy catalog read is bulked (P0-1) or the Featured fetch is
decoupled from the launch surface. Nothing else on the page is slow.

### A separate latent break found while measuring: the catalog dies at ~8 KB of URL

With 217 published products, the reader's follow-up queries
(`research_product_variants?product_id=in.(…217 UUIDs…)`,
`research_required_inputs?record_id=in.(…)`) build a **~7.7 KB query string**. The local
Kong rejected it outright with **414 Request-URI Too Large** (nginx default 8 KB buffer),
killing the entire catalog. Production's edge currently accepts it, but this is one nginx
default — or ~10 more products — away from a total catalog outage, and the bulk rewrite
(P0-1) will make single `in.()` lists LARGER, not smaller. The bulk reads should chunk the
id lists (or move to an RPC with the ids in the body). Local workaround used here:
`e2e/browser-perf/rest-proxy.conf`.

---

## 3. Browser E2E — the actual customer journey, twice, in a real browser

Two real orders taken through the COMPOSED storefront (`/research/early-access`, converged
Featured + All Products), full canonical catalog, real retail prices, live search/filters:

| | Desktop 1280px | Mobile 320px |
|---|---|---|
| Reference | **XRR-20260821-5FDD95BDE9** | **XRR-20260821-A02956DB0C** |
| Line | CJC-1295 NO DAC 2 mg × 3 = $487.50 | 5-AMINO-1MQ 50 mg × 1 |
| Affiliate code | `DANA10` typed, captured as `declaredAffiliateCode` with `affiliateAttributionRef: null` | none |
| Journey | catalog → search → variant → quantity → affiliate → customer → shipping → agreements (5, server-configured) → submit → reference → confirmation page | same, driven entirely at 320 px |
| Durable artifacts | exactly 1 request + 1 customer outbox row + 1 admin outbox row | same |

- Quantity ceiling: input clamps at **100** (101 → 100), rail total recomputes correctly
  ($16,250.00 at 100 × $162.50). Founder quantity directive holds in the UI, API
  (`maximumQuantity: 100` on every row), and submit path.
- Agreements: the client renders the SERVER-configured pair (`early_access_terms v1` from
  env) plus the 4 form acknowledgments; the admin email payload records all 5 kind+version
  pairs. The AGREEMENT_NOT_REQUIRED client/server disagreement s9 hit did **not** occur at
  this head — the wizard reads the server config (`06f8edb`).
- Orders survive a dead email provider: provider is unconfigured locally, outbox rows go
  `failed_retryable`, both orders remain `submitted`. (Same behavior s9 proved.)
- Pathway fencing held everywhere seen: 503A rows show "Care pathway" with no add button;
  RUO rows carry "Research Use Only. / Not for human or veterinary use."; BAM15 500 mcg
  shows no dollar price and a Request pricing action; WITH DAC (10mg) shows
  Request activation, not Buy.

## 4. Mobile smoke — 430 / 390 / 375 / 360 / 320

At every width, after full load: **no horizontal overflow** (`scrollWidth == innerWidth`),
24 catalog cards render with visible prices, search/filters/CTAs present, **every input
16 px** (no iOS zoom-on-focus), **no visible button under 32 px**. Full order journey
completed at 320 (above).

---

## 5. Findings for other lanes (observed, not fixed here)

1. **Stale quantity copy on the storefront** (customer-visible contradiction): the catalog
   section states "Normal order quantities are 1 through 50. Quantity 3 receives…" while
   server and UI enforce 1–100. Copy-only fix, `client/src/research/early-access/**`.
2. **BAM15 renders "Price pending" / "Price on request" divergence**: founder directive
   says the two unpriced rows display "Price on request"; the storefront card says
   "Price pending". Copy-only.
3. **WITH-DAC artifact gap reproduced exactly as s9 reported**: the committed member-safe
   artifact (420 rows) contains zero "WITH DAC + Ipamorelin" rows and no GRP-0422; only
   "CJC-1295 - With DAC (10mg)" exists (request_activation). Artifact/data gap — must not
   be patched in the client.
4. **414 URI limit** (see §2) — belongs to whoever lands P0-1.
5. **Featured section shows "The research catalogue is not available right now"** when the
   release ledger is empty — truthful, but at launch the founder should know Featured is
   release-gated (22 released units in production) while All Products is the full catalog.
6. My seeded pathway distribution (143 direct / 244 provider / 32 activation / 1 pricing)
   is more permissive than production's (109 direct) because every variant got an active
   retail price locally. Pathway COUNTS here are not production evidence; pathway
   BEHAVIOR (fencing, CTA routing) is.

## 6. What this proof does NOT cover

- Production data, production timing, or the production deploy path.
- Email delivery (provider absent by design), payment, fulfillment.
- The legacy Featured endpoint's unit-level rendering (release ledger empty locally, so it
  truthfully serves zero units; production serves 22).
- The founder price-override rows (Hexarelin/Oxytocin): local prices came from the CSV
  ($62.50 / $107.50 as the CSV states), so this environment cannot arbitrate the
  $49/$59-vs-$62.50/$107.50 decision. Recorded, not asserted.
