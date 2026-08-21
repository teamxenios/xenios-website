# Peptide launch acceptance — 141 rows reconciled against canonical data

Session: `claude-fable-s3` · Task: `PEPTIDE-LAUNCH-ACCEPTANCE`
Source of truth: `docs/research-launch/MASTER_CATALOG_2026-08-16_SUMMARY.json` (426 rows)
Enforced by: `shared/research/launch/peptide-launch-acceptance.test.ts` (14 tests)

No production mutation. No canonical artifact was hand-edited. Nothing here is
a runtime authority; pathway resolution stays in
`shared/research/early-access/customer-pathway.ts` and pricing stays in
canonical Product Control.

## The founder target reconciles exactly

| Founder target | Canonical data | Status |
|---|---|---|
| 141 workbook peptide rows | 141 rows, family `Research Peptides & Materials` | MATCH |
| 112 confirmed RUO | 112 rows, channel `RUO Research` | MATCH |
| 29 classification pending | 29 rows, channel `Supplier Catalog / Classification Pending` | MATCH |
| 111 direct | 112 RUO minus 1 composition-blocked | MATCH, **once the exclusion exists** |
| 1 CJC with DAC blocked | `CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)` | FOUND |

All 112 confirmed-RUO peptides carry a positive retail price. Zero rows price
to 0, and zero RUO rows are missing a price, so none of the 112 degrades to
"Price pending" on the shelf.

The five reconciliation rows the founder named are all present and all
confirmed RUO: `HEXARELIN 5 mg`, `OXYTOCIN 10 mg`, `RETATRUTIDE 60 mg`,
`MOTS-C 40 mg`, `GLUTATHIONE 600 mg`.

## FINDING 1 — nothing currently blocks the CJC row, so the launch ships 112, not 111

This is the one material defect. It is a product-integrity issue, not a
counting quibble.

`customer-pathway.ts` earns BUY_NOW from exactly three canonical facts:
approved direct-purchase family, confirmed RUO classification, approved retail
price. The row

    CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)   $99

satisfies **all three**. It is in `research_peptides_materials`, its channel is
`RUO Research`, and it is priced. A repo-wide search for any
composition/split/DAC exclusion returns nothing in `shared/`, `server/`,
`client/src/` or `scripts/` that would stop it.

So as the code stands today the storefront will offer Buy Now on a product
whose component split Xenios cannot yet state. That is selling something we
cannot describe — worse than showing one row too many.

**Recommended fix, for the lead** (`customer-pathway.ts` is lead-owned and
currently dirty, so I have not touched it): the exclusion should be a
*canonical fact about the row*, not a SKU denylist, so the row becomes
purchasable automatically the day the split is resolved — matching the design
intent already written into that file. Two options:

1. Preferred: a `compositionResolved: boolean` input on the pathway function,
   sourced from the catalog authority, checked in the same precedence block as
   classification. A row with an unresolved composition resolves to
   `assisted_order` (Request Order), not `buy_now`.
2. Interim, if plumbing a new field is too slow for launch: treat a
   specification matching `/split pending|pending split|tbd|unresolved/i` as
   composition-unresolved. My suite already uses exactly this predicate, so the
   two agree, and it correctly catches a second such row the day it appears.

Either way the acceptance suite already asserts the target is 111, so the fix
is verified the moment it lands.

## FINDING 2 — two pending rows duplicate an already-orderable strength

| Pending row | Already confirmed RUO |
|---|---|
| `Hexarelin (5mg)` | `HEXARELIN 5 mg` |
| `Oxytocin (10mg)` | `OXYTOCIN 10 mg` |

These are leftovers from the classification corrections the founder described.
Both are legitimately still pending, but each duplicates a strength that is
already directly orderable at a different retail price. Any storefront that
lists pending rows beside RUO rows will show the same product twice, at two
prices, with two different actions. The suite pins the duplicate set at exactly
these two, so a third is caught in CI rather than on the shelf.

This is a merchandising decision, not a code fix: either suppress a pending row
whose product+strength is already RUO, or retire the duplicate rows in the
workbook. Flagging for the founder rather than deciding it here.

`HCG` looks like a third duplicate under a naive product+strength key and is
**not** one — `HCG 5000 IU` and `HCG(120000iu)` are different products, and the
suite deliberately refuses to key rows whose strength is not expressed in mg.

## Boundaries proved

- **Research Capsules stay out.** 16 rows, separate family. A generic
  "researchUseOnly + priced" rule would have swept them into direct purchase;
  the family-based rule does not.
- **503A clinical formulations stay out.** All 242 rows, priced and unpriced
  alike. Showing a price is not permission to buy.
- **Wholesale never reaches a customer projection.** The workbook artifact
  carries `Buy Cost / Unit`. The suite asserts the customer-safe field set is
  an explicit allow-list that excludes it, so a future projection written as a
  spread of the workbook row fails the test instead of leaking cost.

## Verification

    npx vitest run shared/research/launch --pool=threads
    -> 2 files, 24 tests, all passing (14 new, 10 pre-existing customer-action)

**These assertions can fail.** Mutation-checked before commit: changing the
expected row count 141 -> 140 and the direct count 111 -> 112 produced two real
failures reporting the true values. The numbers are computed from the artifact,
not restated as constants.

## Not in scope here

Quantity 100, the affiliate code, order emails, payment and fulfilment are
other lanes. This lane only answers: *is the peptide set the founder approved
the peptide set the system will actually offer?* Answer: yes for 111 of 112
rows, and the 112th needs the exclusion in Finding 1 before launch.
