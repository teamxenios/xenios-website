# Supplier Fact Reconciliation

Generated from the live `server/research/products-data.ts` via
`server/research/catalog/legacy-adapter.ts` on 2026-07-20.

**Owner: Samuel Boadu. This cannot be resolved by an engineer.**

## What this is

Two sources of truth disagree about what is in these products.

- `server/research/products-data.ts` states exact compositions, strengths, and prices
  as plain strings.
- The catalog content review (PR #29) recorded every one of those facts as
  `NOT CONFIRMED`, because no written supplier document establishes them.

Only one can be right, and for composition the difference is a statement about what is
in a vial. This was **not** reconciled in code. Every legacy value was preserved and
labelled `unverified_legacy`, so nothing is lost and nothing is trusted.

## Current safety position

Verified by test against the live catalog module:

- **No product is purchasable**, even with `productCommerceEnabled` and
  `quantumCommerceEnabled` both true.
- **No legacy fact is member-displayable.** `isMemberDisplayable` requires
  `confirmed` and no conflict note. Every legacy fact fails both.
- **No legacy status maps to `in_stock`.** Stock was never tracked, so a legacy
  "live" record cannot silently become sellable.
- Quality, storage, and shipping documentation are all `missing`.
- Commerce approval is `blocked_pending_written_approval` on all 22 mapped records.

So the system is safe while this stays unresolved. It just cannot sell anything.

## The 13 disputed facts

These carry an explicit conflict note because a blend's composition or ratio is
asserted with no supplier document behind it.

**KLOW (P003) is the sharpest case.** The legacy file names a four-component set at
exact strengths. The content review declined to guess even the ingredient set.

| SKU | Fact | Legacy value |
|---|---|---|
| P001 | strength | `15 mg / 15 mg` |
| P001 | priceCents | `33999` |
| P002 | strength | `10 mg / 10 mg / 50 mg` |
| P002 | priceCents | `34999` |
| **P003** | **composition** | **`TB-500, BPC-157, GHK-Cu, KPV`** |
| **P003** | **strength** | **`5 mg / 5 mg / 10 mg / 5 mg`** |
| P003 | priceCents | `33999` |
| P004 | strength | `5 mg / 5 mg / 5 mg` |
| P004 | priceCents | `38999` |
| P005 | strength | `5 mg / 5 mg` |
| P005 | priceCents | `15999` |
| P015 | composition | `Semax, Selank, DSIP` |
| P015 | strength | `10 mg / 10 mg / 2 mg` |
| P015 | priceCents | `25999` |

## The remaining 19 unconfirmed facts

Single-compound records. Not internally disputed, but still unbacked by a supplier
document, so they remain `unverified_legacy` and still block commerce.

| SKU | Slug | Strength | Price (cents) |
|---|---|---|---|
| P006 | `pt-141-bremelanotide` | `10 mg` | `11999` |
| P007 | `tesamorelin-10mg` | `10 mg` | `20999` |
| P008 | `gonadorelin-5mg` | `5 mg` | `12999` |
| P009 | `nad-plus-500mg` | `500 mg` | `15999` |
| P010 | `mots-c-10mg` | `10 mg` | `13999` |
| P011 | `epitalon-10mg` | `10 mg` | `12999` |
| P012 | `ss-31-elamipretide` | `10 mg` | `22999` |
| P013 | `slu-pp-332-capsules` | `250 mcg x 100` | `25999` |
| P014 | `dihexa-capsules` | `10 mg x 60` | `29999` |

## Facts that never existed anywhere

Absent from both sources for all 15 records, and therefore `not_confirmed` with a null
value rather than a guess:

- shelf life, and the document establishing it
- storage and handling conditions
- certificate of analysis, at lot level
- purity, sterility, and endotoxin results
- cost basis and margin supporting each price

## Records needing a lane decision

Four `programs` records have no product lane. They were **not** forced into one,
because guessing a lane would mis-apply that lane's authorization and claims rules:

```text
foundational-performance-program
recovery-routine-program
body-composition-program
precision-routine-program
```

Lanes are `supplement`, `research_material`, `quantum`, `future_clinical`. A program is
none of those. It may need a fifth lane, or it may not belong in the product catalog at
all.

## A naming discrepancy worth settling

The legacy slug is `epitalon-10mg`. The Guide content uses `epithalon`. Both spellings
appear in the literature. Pick one canonical spelling before the Guide links go live,
so the product page and its evidence Guide do not disagree in the URL.

## What resolves this

For each row above, one of:

1. **Confirm**, by attaching a written supplier document. The fact moves to
   `confirmed`, becomes member-displayable, and stops blocking commerce.
2. **Correct**, by supplying the true value from a supplier document. The legacy value
   stays in history as what was previously believed.
3. **Withdraw**, if the product will not be offered.

Until then the code holds the safe position on its own, with no further engineering
required.
