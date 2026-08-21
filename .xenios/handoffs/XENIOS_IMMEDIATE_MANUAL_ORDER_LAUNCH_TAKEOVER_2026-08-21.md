# XENIOS IMMEDIATE LAUNCH — SINGLE-SESSION TAKEOVER HANDOFF

Written 2026-08-21 by `claude-opus5-main` (integration / release / production owner).
Everything below was verified in this session against the repo, origin and the
live control plane. Nothing was taken from memory or from a peer's word.

**PRODUCTION WAS NOT MUTATED WHILE WRITING THIS.**

---

## 0. READ THIS FIRST — THE ONE THING THAT CHANGES THE PLAN

**Deploying the current RC will NOT fix the founder's 30–60 second catalog.**

I got this wrong earlier today and corrected it here after measuring. The
storefront's primary catalog fetch is **not** the endpoint my bulk-read fix
repaired.

Measured live, 2026-08-21, single request, production `c371201`:

```
GET /api/research/early-access/catalog        -> 200 in 57.6s for 22 units
GET /api/research/early-access/assisted-orders/catalog?pageSize=24
                                              -> 200 in 26.7s (also 27.8 / 29.4 / 34.5 / 37.4)
```

`client/src/research/adapters/earlyAccessCatalog.ts:21` fetches the FIRST one.
That is the founder's spinner. **57.6 seconds to return twenty-two products.**

The N+1 lives in a different file from the one I fixed:

```
server/index.ts:446  registerPrivateEarlyAccessApi   (passes no `catalog` option)
 -> register.ts:804  createEarlyAccessCatalogSourceForDeployment
 -> product-control-source.ts:439 createProductionEarlyAccessCatalogSource
 -> ProductControlDeclaredFactsReader
 -> declared-facts-source.ts:360  Promise.all(products.map(readProductFacts))
 -> declared-facts-source.ts:371  Promise.all(variants.map(readVariantFacts))
 -> per variant: readVariantInventoryFacts (:386), activeHoldsForUnit (:471),
                 fulfillmentFact (:444), supplierConfirmations.liveForUnit (:502)
```

Four-plus round trips **per variant**. `Promise.all` makes them concurrent, not
fewer — hundreds of simultaneous Supabase calls per catalog load. That is both
the 30–60s and the Cloudflare 522s seen under sustained load.

Found by `claude-fable-s10-release-security`, confirmed by
`claude-fable-s11-supplier`, and measured independently by me before being
written here. **This is P0-1 for the takeover.**

> Stale comment worth deleting while you are in there:
> `product-control-source.ts:240` says this source is "absent in production".
> It is not. It is the production path. That comment is why an earlier grep
> concluded there was no caller.

---

## 1. STATE

### Repository

| | |
|---|---|
| Repo | `C:\xenios-wt\general-platform` |
| Branch | `xenios/launch-integration-20260819` |
| HEAD | `e1a0d05ac4ec8fba2815069ac591f23ffd325475` |
| Origin | `e1a0d05ac4ec8fba2815069ac591f23ffd325475` — **verified with `git ls-remote`** |
| Uncommitted | `.xenios/ACTIVE_TASKS.json`, `CODE_OWNERSHIP.json`, `SESSION_REGISTRY.json` and some `.xenios/handoffs/*` — **fleet coordination state written by worker sessions, not my code.** No source file is uncommitted. Nothing is lost if this session is paused. |

### Production — verified against Render, read-only

| | |
|---|---|
| Service | `srv-d8s9vej7uimc7384dfcg` (`xenios-website`) |
| Deploy | `dep-da3p9pn10e5c738vnr40`, status **live** |
| SHA | **`c3712011c471ca605ee24a2a0fcd0eb9f354924e`** |
| Tracked branch | `release/early-access-code-session-checkout` |
| Autodeploy | **off** — deploys are triggered explicitly |
| Health | `/api/health` 200, `commerceEnabled: false` |

> A peer cited `77e782e0` as production. That is the PREVIOUS deploy
> (`dep-da3o55gn74is73f9sdo0`), now `deactivated`. **`c371201` is live.**

### Deploy mechanism (non-obvious — read before deploying)

Render tracks `release/early-access-code-session-checkout`, **not** the
integration branch, and autodeploy is off. A naive "trigger deploy" redeploys
the old branch head and looks like a successful no-op. The correct sequence:

```bash
git push origin <RC_SHA>:refs/heads/release/early-access-code-session-checkout
# then trigger a deploy and CONFIRM the returned commit id equals <RC_SHA>
```

---

## 2. THE IMMEDIATE GOAL

Not the full Xenios vision. **Get Early Access taking real orders.**

```
/research/early-access
  -> catalog appears QUICKLY
  -> full canonical catalog, retail pricing
  -> eligible RUO peptide -> exact variant -> quantity (<=100)
  -> optional affiliate code
  -> customer info -> shipping -> Research agreements
  -> submit -> durable XRR reference
  -> customer confirmation email + admin email
```

The founder then handles availability, payment instructions, supplier
coordination and fulfilment **by hand**. **Automated payment is explicitly NOT
required for this P0.**

---

## 3. CATALOG TRUTH — verified against generated output, not repeated from a brief

Regenerated this session from the founder's workbook through the real pipeline:

| | count |
|---|---|
| SOURCE ROWS | 426 |
| CANONICAL VARIANTS | 424 |
| PEPTIDE SOURCE ROWS | 141 |
| CANONICAL UNIQUE PEPTIDES | 139 |
| DIRECT (after data release) | 111 |
| FORMULATION BLOCKED | 1 (GRP-0422) |
| PENDING UNIQUE | 27 |
| DUPLICATE CUSTOMER PRODUCTS | 0 |
| CAPSULES DIRECT | **NO** |

**Runtime today serves 420 rows / 109 direct.** The gap to 111 is
production DATA, not code — see §7. Do not try to make 109 look like 111 in code.

---

## 4. WHAT IS BUILT AND INTEGRATED (19 commits, `c371201..e1a0d05`)

| Area | State | Where |
|---|---|---|
| Bulk pricing 3,306 -> 3 queries + cache + SWR + empty-read guard | **DONE** | `server/research/pricing/bulk-catalog-pricing-source.ts` |
| Reconciliation wired into the real generator | **DONE** | `scripts/research/build-master-offerings-from-catalog.ts` |
| Canonical pathway router (6 pathways, hold enforced) | **DONE** | `shared/research/early-access/customer-pathway.ts` |
| Family gate (capsules excluded) | **DONE** | same file, `DIRECT_PURCHASE_FAMILIES` |
| Storefront convergence (Featured + All Products) | **DONE** | `client/src/research/early-access/EarlyAccessRoute.tsx` |
| Submit-time pathway gate (Care / unavailable refused) | **DONE** | `server/research/assisted-order/service.ts` |
| Admin email completeness | **DONE** | `communications.ts` + `service.ts` |
| Composed negatives (17) | **DONE** | `server/research/launch/manual-order-submit-negatives.test.ts` |
| Commerce-never-reads-copy guard | **DONE** | `shared/research/early-access/commerce-reads-no-copy.test.ts` |
| Founder price override ($62.50 / $107.50) | **RECORDED in config** | `config/research/master-catalog-reconciliation-20260821.json` |

### Integrated worker SHAs (do not re-take)

`510bc4b` payment eligibility · `d8afb8f` composed negatives ·
`6aaf917`+`29d8e2c` overlaps fix · `b1628fee` composition-hold fact fix

---

## 5. P0 BLOCKERS REMAINING — 4

**P0-1. Legacy catalog N+1 — 57.6s. THE founder's spinner.**
Not fixed by anything on the branch. Batch the declared-facts reads into
bounded bulk reads (inventory lots, holds, supplier confirmations), project
per-variant in memory. Same shape as `BulkCatalogPricingSource`.
Owner handed to `claude-fable-s10-release-security`.
Path `server/research/early-access/catalog/**` is in **no active lease**.
⚠️ `server/research/catalog/**` is a DIFFERENT path under s7's lease despite
looking similar.

Two guardrails, both from defects already hit today:
- A successful **empty** bulk read must not project as "no holds / no
  inventory / no confirmation" across every variant. That would flip the
  catalog to unavailable — or worse, to *unheld*. Same shape as the bug fixed
  at `15f436b`.
- If per-unit readers survive alongside the bulk projection, pin them against
  each other or delete one. A second opinion that can drift from the first is
  the defect class this fleet hit five times today.

**P0-2. Composed E2E of the full manual order journey.**
Pieces are proven; the whole journey is not asserted once end to end.
Must prove exactly **1 durable request + 1 customer notification + 1 admin
notification + 1 reference**.

**P0-3. Mobile smoke** at 430/390/375/360/320 on the converged storefront.

**P0-4. Browser proof — BLOCKED BY ENVIRONMENT, with a concrete safe unblock.**

Local preview boots the production bundle and cannot pass the Early Access gate
without Supabase credentials. Required env NAMES are recorded in
`docs/research-launch/PREPROD_VISUAL_PROOF_UNBLOCK.md` (names only; no values
exist in the repo).

**Do NOT solve this by pasting the production `SUPABASE_SERVICE_ROLE_KEY` into a
session.** That key bypasses row level security entirely — it would hand a
worker unrestricted read/write over live customer orders, member data and
pricing in order to answer a question about page latency. A session refused it
today and was right to; that refusal is now fleet policy and should stay the
answer even under launch pressure.

**The correct instrument is also the safe one:** a seeded local Supabase
(`supabase start` against the repo migrations, catalog rows seeded) or a
disposable preprod project with its own keys. TTFB, catalog duration, time to
first price and payload depend on query COUNT and SHAPE, not on real customer
rows — so a local stack answers the founder's phone question *completely*, and
it is the only place anyone can prove the EA-catalog N+1 fix actually reduces
round trips.

The ask to the founder is therefore narrow: **stand up a throwaway seeded
environment, or restart Docker on the machine that had one.** Not production
access. Until then, production smoke after deploy is the only visual proof
available.

---

## 6. WHAT IS *NOT* A BLOCKER (do not spend the hour here)

Automated payment · invoicing · settlement · commission · advanced fulfilment ·
analytics · affiliate platform · coordination refactors · architecture docs ·
P1 admin polish.

---

## 7. CATALOG DATA RELEASE — separate packet, separate GO, NOT APPLIED

| Item | Production now | Target | Operation |
|---|---|---|---|
| Hexarelin 5 mg | $49.00 active, $62.50 superseded, classified pending | **$62.50**, RUO, direct | classification correction + price adjudication **flip** |
| Oxytocin 10 mg | $59.00 active, $107.50 superseded, classified pending | **$107.50**, RUO, direct | same |
| Retatrutide 60 mg | absent | $249.00, RUO, direct | create product + variant + price + binding |
| MOTS-C 40 mg | absent | $129.00, RUO, direct | same |
| Glutathione 600 mg | absent | $69.00, RUO, direct | same |
| GRP-0422 | absent | $99.00, visible, Request Order | create + **structured hold** |

⚠️ **The founder's price decision INVERTS production.** $49.00/$59.00 are
currently ACTIVE with $62.50/$107.50 superseded by the 2026-08-19 release.
Applying the decision revives the retired figures and supersedes the live ones.
This is why the decision is stored as a fact in the config — reading the release
ledger gives the opposite answer and looks authoritative doing it.

⚠️ **Before GRP-0422 ships, wire the hold.** `commerceHold` is an input to the
pathway resolver that **no production caller passes**, and `commerceHeldRows`
in the generated artifact is read by nothing. No exposure today only because
GRP-0422 is not in the shipped catalog. The moment the data release adds it, it
goes on direct sale unless this is wired first.

---

## 8. FILE MAP

```
storefront            client/src/research/early-access/EarlyAccessRoute.tsx
                      client/src/research/early-access/EarlyAccessCatalogSection.tsx  (Featured, legacy 22)
                      client/src/research/assisted-order/AssistedOrderPage.tsx        (All Products + order form)
action routing        shared/research/early-access/customer-pathway.ts
bulk pricing + cache  server/research/pricing/bulk-catalog-pricing-source.ts
SLOW LEGACY CATALOG   server/research/early-access/catalog/declared-facts-source.ts   <-- P0-1
                      server/research/early-access/catalog/product-control-source.ts
reconciliation        config/research/master-catalog-reconciliation-20260821.json
                      server/research/master-offerings/catalog-reconciliation.ts
catalog generation    scripts/research/export-kris-launch-a.py  (--master-only)
                      scripts/research/build-master-offerings-from-catalog.ts
submit + validation   server/research/assisted-order/service.ts
emails                server/research/assisted-order/communications.ts
eligibility           server/research/early-access/release/canonical-payment-eligibility.ts
negatives             server/research/launch/manual-order-submit-negatives.test.ts
composition root      server/index.ts
```

---

## 9. TEST STATE

All at `e1a0d05` unless noted.

| Test | Result |
|---|---|
| typecheck | PASS |
| build | PASS |
| assisted-order lane | 184 pass |
| early-access release + launch | 254 pass |
| shared/research/early-access | 21 pass |
| client/src/research | 1663 pass / 166 files |
| pricing (bulk + amplification) | 13 pass |
| reconciliation | 10 pass |
| full suite | last green **693 files / 10,186 tests / 0 failed** at `2e1662b`; a run at `e1a0d05` was in flight when this handoff was requested and its result is **not** recorded here |

**Never had a browser on it.** No mobile verification. No performance test
beyond the two live curl measurements in §0.

---

## 10. ONE-HOUR PLAN — honest answer: **NO, not for all four P0s**

P0-1 alone is a real refactor of a live read path with two correctness
guardrails. P0-4 is environment-blocked and cannot be solved by coding at all.

**What one strong session CAN do in an hour:** P0-1 plus P0-2, which is what
actually matters — a fast catalog and a proven order journey.

```
0–10   Recover. Verify HEAD == origin. Read §0. Reproduce the 57.6s yourself.
10–35  P0-1: bulk the declared-facts reads. Bounded reads for inventory, holds,
       supplier confirmations; project in memory. BUILD THE EMPTY-READ GUARD IN
       FROM THE START, not afterwards.
35–50  P0-2: composed E2E of the full journey. Exactly 1 request + 1 customer
       notification + 1 admin notification + 1 reference.
50–60  typecheck, build, full suite, freeze RC, write the deploy packet.
```

Then hand the founder an RC and let the production smoke be the visual proof —
because it is the only one available.

---

## 11. TAKEOVER COMMANDS

```bash
cd C:/xenios-wt/general-platform
git fetch --all --prune --tags
git status --short --branch
git rev-parse HEAD                     # expect e1a0d05...
git ls-remote origin refs/heads/xenios/launch-integration-20260819   # must match

# reproduce the real blocker yourself before changing anything
# (single request; do NOT hammer production)

npx tsc --noEmit -p tsconfig.json
npx vitest run server/research/early-access server/research/assisted-order --maxWorkers=3
npx vitest run --maxWorkers=3
npm run build
```

**Worktrees:** several exist under `C:/tmp/*`. They are other sessions' and
some are dirty. Do not reset, clean or delete any of them.

---

## 12. DANGER / DO NOT TOUCH

- **No production mutation** without an exact-SHA founder GO. That includes
  catalog data, prices, env, flags, migrations, real email, payment, shipment.
- **Do not deploy and claim it fixed the spinner.** See §0.
- **Do not encode $6250/$10750 into production** until the data release is
  separately authorized. The config records the decision; production still
  holds the old adjudication.
- `.local/**` holds private procurement data and is gitignored. Keep it there.
- The Care boundary and the retail-only rule are non-negotiable: never expose
  wholesale, supplier cost, margin, markup, benchmark or internal notes.
- **No commerce decision may read display copy.** Violated three times today by
  three sessions. Guarded now at `commerce-reads-no-copy.test.ts`.

---

## 13. THE PATTERN WORTH CARRYING FORWARD

Five defects today were one defect: **a fact existing in one place and being
trusted somewhere else without being read.**

1. GRP-0422's hold — recorded in the artifact, consulted by nobody
2. A supplier adapter carrying its own copy of a server-owned path constant
3. `overlaps()` under-reporting, so the safety check quietly stopped checking
4. Three separate rules inferring a product fact from customer-facing copy
5. The empty-read path — the failure branch guarded, the success-with-nothing
   branch not

Two rules cover all five: **a shelf and a door must consult the same
derivation**, and **nothing that decides commerce may read display text.**

The corollary that caught the most today: *green tests derived from a shared
wrong premise are not verification.* The overlaps fix had 22 passing tests and
was wrong in the dangerous direction. The question that found it was "what file
does this pattern actually name?"
