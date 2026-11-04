# Catalog imagery — Batch 006 held source leads

This internal batch records bounded official-source recovery for ten additional NutriDyn-associated supplement rows. Every file came from the current official NutriDyn product page, but none is represented as an exact catalog asset because each row still has a material SKU, package, flavor, formula, ingredient, or revision conflict.

## Outcome

- Ten official product pages returned successfully.
- Ten original front PNG exports were downloaded without transformation.
- Ten exact canonical offering/source-variant pairs retain named evidence gaps.
- Zero exact product assets, runtime links, publication approvals, or supplier sends are claimed.

`source-leads.v1.json` is the authoritative gap ledger. It records the exact pair, current Quick Order binding, workbook code where present, official media stem, official page/image URL, original PNG receipt, visible lead facts, and the precise missing input needed to resolve the row.

`contact-sheet-v1.png` deliberately marks every card `SOURCE LEAD ONLY · NOT EXACT`. These images must not be imported into the customer media contract unless the corresponding conflict is resolved and a successor exact-asset batch passes independent review.

## Verify

```text
node deliveries/catalog-imagery/2026-11-04-batch-006/verify-batch.mjs --write-receipt
node deliveries/catalog-imagery/2026-11-04-batch-006/verify-batch.mjs
```

The verifier pins all 420 catalog pairs and binding bytes, validates the ten exact held pairs and every original PNG receipt, requires official NutriDyn URLs, rejects duplicate bytes and missing conflict text, checks the contact sheet, and enforces zero exact/public/runtime assets.
