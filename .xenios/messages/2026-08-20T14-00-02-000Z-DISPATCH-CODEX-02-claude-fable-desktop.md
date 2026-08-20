XENIOS CODEX FLEET DISPATCH - CODEX 2

ROLE: WRITER
PROMPT FILE: 02_CODEX_RETAIL_CATALOG.md
CREATE YOUR WORKTREE:
  git worktree add C:/xenios-wt/codex2-retail-catalog -b codex/retail-catalog-426-20260820 7b16a2e06dfc227f5bc748b14480c9d072e566de
BRANCH: codex/retail-catalog-426-20260820

[XENIOS CODEX RESUME BASE]
INTEGRATION BRANCH: xenios/launch-integration-20260819
CODEX RESUME SHA: 7b16a2e06dfc227f5bc748b14480c9d072e566de
  (full test suite GREEN on this exact SHA: 659 files / 9,758 tests passed, 0 failures, 2026-08-20)
PRODUCTION SHA: a66434d980c909303d3595382e5df77342fbc127 (LIVE, Release A, deploy dep-da31altg1s2s73f6tep0)
ROLLBACK SHA: 458e7284c12cfbd95bd91371afb88cb8a6201454 (flags OFF first)

CORE LAW: Claude main (claude-fable-desktop) is the SOLE integration, release and
production owner. You never deploy, never apply production migrations, never change
production env or flags, never change live pricing, never send real email, never mark
real payment or shipment, and never edit a lead-owned seam (server/index.ts,
server/research/index.ts, client/src/research/section.tsx,
client/src/research/adminx-section.tsx, migration DAG/ledger, release manifests,
production packet, shared .xenios fleet state). Send the lead exact snippets instead.

NO-DOWNTIME LAW: the Early Access production path is LIVE and must keep working
through every phase. EXPAND -> MIGRATE -> DARK DEPLOY (feature OFF) -> SMOKE LIVE
PATHS -> ENABLE PROGRESSIVELY -> SMOKE NEW -> RECORD ROLLBACK. Never make a
destructive migration the only route forward.

OWNED PATHS (you are the ONE writer here):
scripts/research-launch/** (generator + reconciliation tooling), docs/research-launch/** pricing + matrix artifacts, customer-safe DTO tests, catalog/request/cart/quote/order consistency tests.

FORBIDDEN PATHS (another writer or the lead owns these):
Production price mutation of any kind (LEAD-owned, founder-gated); server/research/master-offerings/** service internals; the assisted-order wizard; migration DAG/ledger.

LEAD BRIEFING FOR THIS LANE (verified facts - read before you plan):
FOUNDER ROW DECISIONS (binding, 2026-08-20) for the 420->426 delta. The lead already computed the exact delta: six ADDED rows, zero removed.
- Retatrutide 60 mg -> add/reconcile as the exact variant at $249 IF identity unambiguous.
- MOTS-C 40 mg -> add/reconcile at $129 IF identity unambiguous.
- Glutathione 600 mg -> add/reconcile at $69 IF identity unambiguous.
- CJC-1295 + Ipamorelin WITH DAC -> do NOT invent the component split. Keep visible with a truthful NON-DIRECT-PURCHASE state until the exact formulation is confirmed. Retail target $99 for the exact approved identity only.
- Oxytocin 10 mg -> NO duplicate. Map/adjudicate against the EXISTING canonical variant; use the workbook retail target.
- Hexarelin 5 mg -> NO duplicate. Map/adjudicate against the EXISTING canonical variant; use the workbook retail target.
- Kisspeptin-10 10 mg -> the existing catalog match GRP-0308 (KISSPEPTIN 10 mg, $65) IS VALID; the old matcher missed it on a name mismatch. Include it in the retail reconciliation at $65. Match by normalized spec, not book product name alone.
No guessed mappings. No duplicate variants. Target: 426 rows, 424 numeric retail prices, 2 Price on request (BAM15 500 mcg; Syringes & Alcohol Swabs). NEVER $0 anywhere.
Source CSV is committed at docs/research-launch/XENIOS_RETAIL_ONLY_MASTER_CATALOG_426_VARIANTS.csv (verified 426/424/2). Workbook (4) sha256 6478ad0d3f710b75c6bf0c5f5e56ff1189ab2a2a4439cab23c2a28498134ea6f.
34 retail prices are ALREADY LIVE in production Product Control from the 2026-08-19 release (docs/research-launch/PRICE_RELEASE_2026-08-19.json) - your diff must be against CURRENT production state, not against zero. Deliver a deterministic price-update candidate; the LEAD executes it.

CHECKPOINT LAW: every coherent slice and roughly every 15 minutes - save, run focused
tests, commit, push, heartbeat, update task state, refresh an exact-SHA handoff in
.xenios/handoffs/, message dependent lanes in .xenios/messages/, continue. Do not
accumulate thousands of uncommitted lines.

FINISH LAW: when your lane is done - commit, push, hand off the exact SHA, release the
lease, run `node scripts/agentic/xenios-os.mjs next`, and with lead approval take the
next highest-priority unowned full-vision lane. Do not sit idle.

Return the standard checkpoint block (SESSION / TASK / WORKTREE / BRANCH / BASE SHA /
PUSHED SHA / LEASE / COMPLETED / FILES / TESTS / TYPECHECK / BUILD / MIGRATION /
PRODUCTION MUTATED / BLOCKERS / INTEGRATION INSTRUCTIONS / NEXT CODE ACTION).

Your full lane prompt follows verbatim.

================================================================
# CODEX 2 — FULL 426-ROW RETAIL CATALOG RECONCILIATION

Goal:
Reconcile newest master workbook against canonical Product Control.

Source:
XENIOS_MASTER_CATALOG_AFFILIATE_PRICING_2026-08-16(4).xlsx
MASTER CATALOG -> Suggested Sell Price

Target:
426 rows
424 numeric retail prices
2 Price on request

Never expose wholesale cost, supplier price, margin, markup or benchmark internals.

Produce:
- exact 426-row mapping
- duplicate/unmatched report
- production price diff
- deterministic canonical price-update candidate
- customer-safe DTO tests
- consistency tests across catalog/request/cart/quote/order

Do not mutate production.

If Claude already owns importer work, act as independent validator.
