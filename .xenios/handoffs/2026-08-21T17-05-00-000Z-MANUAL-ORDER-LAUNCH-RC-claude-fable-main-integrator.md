# MANUAL ORDER LAUNCH — CODE RC

**Session:** claude-fable-main-integrator (sole integrator / RC / release / production owner, 3-session command)
**Written:** 2026-08-21
**Base handoff:** `6977f24` (`XENIOS_IMMEDIATE_MANUAL_ORDER_LAUNCH_TAKEOVER_2026-08-21.md`)
**CODE-FINAL SHA:** `5ca944f0427a1fc6be5904798fb2f12d8f63b827` — the tree the full
suite certified. The RC SHA the founder approves is the commit that ADDS this
handoff on top of it (docs-only delta); verify both against origin.
**Production predecessor:** `c3712011c471ca605ee24a2a0fcd0eb9f354924e` (verified live on Render by the takeover handoff; `RELEASE_STATE.json` corrected this session — the previously recorded `77e782e0` is the DEACTIVATED prior deploy)
**PRODUCTION MUTATED: NO.** No deploy, no env change, no migration applied, no catalog data touched, no real email sent.

---

## P0-1: THE LEGACY STOREFRONT N+1 IS ELIMINATED

The founder's 30–60s phone spinner was `GET /api/research/early-access/catalog`
(57.6s for 22 units, measured in the takeover handoff): `readCatalog()` read
every product twice at seven queries each (~3,300 round trips), then the
declared-facts projection paid 1 lot query + 1 hold RPC + 1 confirmation RPC
PER VARIANT on top. Fixed at three layers, one rule throughout — the fetch
strategy changed, the derivation did not:

| Layer | Before | After |
|---|---|---|
| Product catalog read | 2 list + 2×`get()` per product (7 queries each) ≈ 3,306 | `listDetails()`: 2 bulk reads × 7 queries = 14, same row mappers as `get()` (`product-admin-production.ts`) |
| Declared facts | (1 lot query + lots RPCs + 1 hold RPC + ~1 confirmation RPC) × every variant | 1 lot query + 1 RPC per REAL lot + 1 bulk hold RPC + 1 bulk confirmation RPC per projection (`declared-facts-source.ts` window) |
| Cross-request | nothing cached | catalog content cached 60s TTL + SWR + 15f436b empty-read guard (`cached-product-catalog-reader.ts`); safety facts deliberately NOT cached |

Per-request remote cost: **~3,300+ → ~5 bounded reads warm** (cold adds the
2×7 catalog reads once per 60s window). QA R4 preserved: holds and supplier
confirmations are read fresh at EVERY projection — the bulk window is
per-request, never cached; a hold recorded now is in the next projection.

Query counts are test-pinned (`catalog-read-amplification.test.ts` pins the old
2N+2 arithmetic and the new constant-2; `declared-facts-bulk-window.test.ts`
pins 1 lot select + 1 RPC per decided lot). Parity is pinned the way the fleet
learned to demand on 2026-08-21: bulk and per-unit strategies run against the
SAME rows must produce byte-identical facts INCLUDING the inventory
`sourceVersion` fingerprint (which has a SQL twin in the persistent-cart
migration). Both paths end in one derivation function each.

**Migration `20260821170000_research_early_access_bulk_unit_facts.sql`
(ledger row 76) is OPTIONAL for this RC.** The two set-valued SECURITY DEFINER
reads copy the per-unit functions' WHERE clauses verbatim; the server detects
them structurally and falls back to per-unit RPCs when absent (the
migration-54 tolerance ladder), so deploy order is free. REHEARSED on
disposable PostgreSQL 17: applied twice at exit 0, bulk == per-unit for both
fact families, withdrawal and expiry behave, EXECUTE is service_role-only.
Without it the catalog is still fast (the 3,306-query layer is gone either
way); with it the per-variant hold/confirmation RPCs collapse to 2 per load.

The `SupplierConsistentCatalogSource` wrapper still costs ~1 supplier lookup
per released row per request (~22 today, ~111 after the data release). Bounded
and acceptable for launch; bulk-routes read is P1.

## P0-2: COMPOSED E2E — EXACTLY-ONCE, AT THE REAL DOOR

`e2e/` suite (run: `npx vitest run --config e2e/vitest.config.ts`) drives the
REAL production composition through the HTTP door a customer reaches:

- **Acceptance path:** 1 durable XRR request + exactly 1 customer notification
  intent + exactly 1 admin notification intent; replay and race collapse to
  one of each; refused submissions notify nobody.
- **Negatives (53 tests total, all green):** price tamper, variant swap,
  quantity 0/negative/fractional/string/null/101, empty and duplicate lines,
  Care / pending / held / GRP-0422 / capsule direct-order refusals, agreement
  version staleness, age gate, anonymous caller, affiliate self-verification,
  IDOR, wholesale/cost/margin leakage, absent contact/shipping/billing
  objects (the QA-found 500 → now clean 400s).

## INTEGRATED WORKER SLICES (17 commits, all origin-verified before take)

| Worker | Commits | What |
|---|---|---|
| fable/catalog-action-unification-20260820 | 10 (aff8e95→4852e91) | Pathway authority gating the live FullCatalogPage action seam (was UNGATED at 6977f24), founder-record formulation hold (GRP-0422), price-vanished handling, 420-row order-intake matrix, catalog read measurement + bulk `readCatalog` port |
| lane/e2e-conversion-qa-20260819 | 3 (bfc9136, 4adf61a, d3f14ed) | Composed door harness + exactly-once acceptance + routing negatives |
| lane/ea-browser-order-journey-20260821 | a9d6604 | Client config fetched once, not three times (catalog request unblocked ~2.5s earlier) |
| lane/preview-harness-boot-20260821 | 6241845 | Local preview boots the production bundle with placeholder env |
| claude-fable-adversarial-qa (this session, on-branch) | f1af60b, 1e7c623 | 22 composed door negatives + the malformed-submission 500 reproduction |

Deliberately NOT taken: `97644c5` (pricing-cache adversarial spec — superseded
by the in-tree bulk pricing source), `06e3804`/`ff46ed9` (markdown evidence
only), s10's branch (prompt persistence only — s10 never pushed an N+1 fix).

## MAIN-SESSION WORK THIS RC

1. `listDetails()` production bulk repository read (products, variants,
   prices, MEDIA, CONTENT, required-input counts — same mappers as `get()`;
   `history` omitted, no catalog consumer reads it).
2. Bulk declared-facts window + per-unit fallback ladder + `unitFactKey`.
3. Bulk inventory reader sharing `deriveVariantInventoryFacts` with the
   per-variant read (fingerprint byte-parity), RPC fan-out bounded at 8.
4. `CachedProductCatalogReader` (TTL/SWR/empty-guard, catalog content only).
5. Migration 76 + disposable rehearsal + ledger/DAG entries.
6. Contract presence guards (QA's confirmed defect): absent contact / address
   objects / line elements now 400, never 500.
7. `RELEASE_STATE.json` corrected to verified production reality.

## TEST STATE AT THIS RC

| Suite | Result |
|---|---|
| typecheck (`tsc --noEmit`) | PASS |
| build (`npm run build`) | PASS |
| e2e composed door (53) | PASS |
| assisted-order lanes (190) | PASS |
| early-access release + launch + shared (328) | PASS |
| early-access catalog + persistence + pricing + server catalog | PASS |
| products-diagnostics (217, 1 skipped) | PASS |
| master-offerings (incl. 420-row matrix) | PASS |
| new: declared-facts bulk window (7) | PASS |
| new: cached catalog reader (6) | PASS |
| **full suite at `5ca944f`** | **709 files passed / 4 skipped · 10,383 tests passed / 43 skipped · 0 failed** |

Two full-suite failures found and fixed on the way to green, both control-plane
fallout from registering migration 76, neither a runtime defect: the DAG
validator needed a commit-pinned `sourceSha` and an existing rollback document
(`supabase/production/research-early-access-bulk-unit-facts-rollback-notes.md`),
and `hold-rpc-compatibility` modeled an impossible database (per-unit hold RPC
missing but the newer bulk RPC answering); its fake now fails both together,
which exercises the real fallback ladder and the once-per-projection warning.

## BROWSER / MOBILE STATE

Main-session smoke (production bundle via `scripts/preview-research.mjs`,
placeholder env): server boots, shell endpoints answer in single-digit ms,
Early Access gate FAILS CLOSED without a durable session store (correct), and
the reachable surface has NO horizontal overflow at 430/390/375/360/320.
Behind-the-gate visual/perf proof requires the seeded local environment —
tasked twice to `claude-fable-browser-perf` (lane/browser-perf-proof-20260821);
no branch on origin and no message at freeze, so this RC records
**BROWSER PERFORMANCE PROOF: ENVIRONMENT BLOCKED / WORKER UNREPORTED** rather
than waiting. The architectural proof (query counts, cache, SWR, empty-guard)
is test-pinned and does not depend on it. **Production smoke after founder GO
remains the authoritative visual proof**, exactly as the takeover handoff said.

## DEPLOY (only after exact founder GO on this SHA)

```bash
git push origin <RC_SHA>:refs/heads/release/early-access-code-session-checkout
# then trigger the Render deploy and CONFIRM the returned commit id == <RC_SHA>
# service srv-d8s9vej7uimc7384dfcg, autodeploy OFF — a naive redeploy ships the old head
```

Post-deploy light smoke: fresh browser → catalog useful quickly → retail
prices visible → eligible CTA → form → submit → ONE reference, ONE customer
intent, ONE admin intent. Do not stress production.

**CATALOG DATA RELEASE IS A SEPARATE PACKET** (Hexarelin/Oxytocin flips,
Retatrutide/MOTS-C/Glutathione/GRP-0422 creation + structured hold). Not
applied, not part of this RC. GRP-0422's hold wiring now exists at the
master-offerings action seam (this RC), so the data release no longer ships an
ungated GRP-0422 — but the data release still needs its own GO.

## P1 (do not block launch)

- Bulk supplier-routes read for `SupplierConsistentCatalogSource` (~R lookups/request).
- Wire member catalog + master-offerings selection to the cached reader (they
  already get bulk `listDetails` via `readCatalog`, but not the cross-request cache).
- Fold `MigrationTolerantUnitHoldRegistry`'s warning and `onBulkDegraded` into
  one operator surface.
