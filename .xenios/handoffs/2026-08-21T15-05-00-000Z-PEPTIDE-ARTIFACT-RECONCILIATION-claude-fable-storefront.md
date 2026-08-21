# HANDOFF — peptide reconciliation, ARTIFACT side

Session `claude-fable-storefront`. Complements, does not duplicate,
`claude-fable-s3`'s `PEPTIDE-LAUNCH-ACCEPTANCE` (source-workbook side).

BASE SHA: `c3712011c471ca605ee24a2a0fcd0eb9f354924e`
BRANCH: `lane/peptide-artifact-reconciliation-20260821` (pushed)
**COMMIT SHA: `762820c613e770e990465eb3635e0017a69e10e6`**
PRODUCTION MUTATED: NO

## Why this is not a duplicate of s3

s3 measured the SOURCE (`MASTER_CATALOG_2026-08-16_SUMMARY.json`, 426 rows) and
proved the founder target reconciles there: 141 / 112 / 29.

This measures what PRODUCTION ACTUALLY SERVES — the generated canonical
artifact — joined to the commerce bindings and the captured production price
snapshot. Different artifacts, different question, and the answer differs.

## The delta, and it closes exactly

| Step | Variants | Direct | Pending |
|---|---|---|---|
| Shipped artifact today | 135 | 106 sellable | 29 |
| Reclassify 2 duplicates | 135 | 108 | 27 |
| Generate 3 missing RUO | 138 | 111 | 27 |
| Generate 1 blocked combo | **139** | **111** | **27** |

Every founder number is reachable. 135 + 4 generated = 139. 106 + 2 + 3 = 111.

**Absent from the shipped artifact** (substring-checked across product name,
slug and variant label, so a relabelled row would have been found):
`Retatrutide 60 mg`, `MOTS-C 40 mg`, `Glutathione 600 mg`, and the
`CJC-1295 + Ipamorelin WITH DAC` combo.

**Present and needing only a classification flip:** `Hexarelin (5mg)` $62.50 and
`Oxytocin (10mg)` $107.50 — both already bound, priced, approved, active,
member-eligible.

## FINDING 1 (P0) — two with-DAC rows are ALREADY directly sellable

    CJC-1295 WITH DAC 2 mg    $100.00   confirmed, bound, priced, eligible
    CJC-1295 WITH DAC 5 mg    $187.50   confirmed, bound, priced, eligible

The launch brief blocks a with-DAC **combo** ("CJC-1295 + Ipamorelin WITH DAC,
5 mg total, $99") that does not exist in this catalog. What does exist is three
**standalone** with-DAC CJC rows. Two are already confirmed and sellable, so
they go on direct sale the moment direct peptide purchase is switched on. The
third (`CJC-1295 - With DAC (10mg)`, $125.00) is classification-pending and
commerce-ready, so a bulk "confirm the pending rows" pass would add it too.

s3's finding was that nothing blocks the CJC **combo**. This is the same class
of hazard on rows that are already live-eligible today.

**This is a founder decision, not a defect I fixed.** Is standalone with-DAC
blocked, or only the combo? The test pins the exact set and speaks if it
changes in either direction; it does not assert a policy nobody has stated.

## FINDING 2 — classification is the only remaining gate

All 29 classification-pending peptides are already bound, priced, approved,
active and member-eligible. Confirming a classification is a one-step change
with zero commerce work behind it. There is no pricing or binding backlog.

## FILES

    server/research/peptide-launch/reconciliation.ts       (new)
    server/research/peptide-launch/reconciliation.test.ts  (new, 10 tests)

New path, no lease overlap. Reads the three artifacts through `fs` as DATA and
imports no catalog-lane module, so `catalog-boundaries.test.ts` needed no
allowlist change. Decides no pathway: `customer-pathway.ts` stays the only
authority and is untouched.

## TESTS

`npx vitest run server/research/peptide-launch` — 10 passed. `npx tsc --noEmit`
clean.

## BLOCKERS

- The workbook revision the brief names, `...2026-08-16(4)(1).xlsx`, is NOT on
  this machine (only `(2)` and the base, both 113,774 bytes). The 4 missing
  rows cannot be generated from what is here.
- Standalone with-DAC policy: founder decision, above.

## INTEGRATION INSTRUCTIONS

Nothing to mount. Two new files, additive, no route, no migration, no flag.
Merge and the matrix runs in CI. When a newer workbook regenerates the catalog,
the pinned counts move and the diff IS the reconciliation.
