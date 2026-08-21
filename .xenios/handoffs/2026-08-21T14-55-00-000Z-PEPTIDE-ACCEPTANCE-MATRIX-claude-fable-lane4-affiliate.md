# Handoff: exhaustive peptide launch acceptance matrix (Lane 4)

- **Session:** `claude-fable-lane4-affiliate`
- **Branch:** `lane/peptide-acceptance-matrix` (pushed)
- **Exact SHA:** `5b24f4589c6581acd0d78ab33c9b89b41c466dd9`
- **Base:** `6d9eb58` — the lead's LOCAL, unpushed integration head. Rebase if amended.
- **Files:** one new test, `shared/research/early-access/peptide-launch-acceptance-matrix.test.ts`
- **Production mutated:** NO

## Ownership check

Lane 1 (reconciliation) is `claude-fable-s7` under the CATALOG-ACTION-UNIFICATION
lease; lane 5 (3-query pricing) is the lead's `2e1662b`. Neither was duplicated.
Lane 4 is the acceptance layer over both and was unowned. This branch adds
test-only code and touches no leased path.

## Result: the founder's numbers reproduce exactly

Computed from the committed `XENIOS_RETAIL_ONLY_MASTER_CATALOG_426_VARIANTS.csv`:

| Fact | Expected | Measured |
| --- | --- | --- |
| total variants | 426 | 426 |
| peptide rows | 141 | 141 |
| confirmed RUO / pending | 112 / 29 | 112 / 29 |
| unique after collapse | 139 | 139 |
| directly orderable | 111 | 111 |
| formulation-blocked | 1 | 1 (GRP-0422) |
| unique classification-pending | 27 | 27 |

The collapse needs a canonical key: the workbook states the same variant two
ways — `HEXARELIN 5 mg` (research sheet) and `Hexarelin (5mg)` (supplier sheet).
An exact comparison reports 141 distinct variants and would list the same
peptide twice in the storefront.

Mutation-checked: changing the hold Group ID turns the count into 112 directly
orderable and fails three tests, so this cannot go quietly green while a
product with an unresolved component split becomes purchasable.

## BLOCKER 1 (P0) — the reconciliation has no production caller

`applyCatalogReconciliation` and `assertReconciledAccounting` are invoked
**only from `catalog-reconciliation.test.ts`**, and the merge/hold declarations
exist solely as that test's fixture. The real CSV never passes through them.

Consequences in the running system:

- Nothing collapses Hexarelin 5 mg or Oxytocin 10 mg, so both appear twice.
- Nothing applies the GRP-0422 hold. I grepped `GRP-0422` and `split pending`
  across `server`, `shared`, `client`, `scripts`, and `supabase`: the only hits
  are that test and the CSV itself. Unless the live catalog holds the row by
  some other key I did not find, **CJC-1295 WITH DAC + Ipamorelin 5 mg total
  ($99, RUO-classified, priced) resolves to `buy_now`** and is directly
  purchasable with its component split unresolved.

This needs a real caller plus a committed, reviewed merge/hold dataset. The
fix belongs to `claude-fable-s7` (`server/research/master-offerings/**`), so it
is reported rather than attempted here.

## BLOCKER 2 (FOUNDER DECISION) — the collapsed pairs disagree on price

| Variant | Confirmed RUO row | Pending row |
| --- | --- | --- |
| Hexarelin 5 mg | GRP-0426 — $49.00 | GRP-0402 — $62.50 |
| Oxytocin 10 mg | GRP-0425 — $59.00 | GRP-0407 — $107.50 |

Collapsing a pair necessarily selects the price a customer will be charged.
The matrix keeps the **RUO** row, on the principle that a confirmed
classification outranks an unfinished one — but that is an assumption, not an
authorization. Samuel must confirm which price is retail. Both are directly
orderable variants, so this is launch-blocking for those two rows.

The conflict is asserted as a test so it stays visible; when the founder
adjudicates and the prices converge, that test states the change.

## Integration

Merge as-is. Test-only, no lease overlap, and it fails loudly if either
blocker is resolved differently than assumed.

## Gates

```
npx vitest run shared/research/early-access   -> 6 files, 81 passed (13 new)
npm run check                                  -> clean
```
