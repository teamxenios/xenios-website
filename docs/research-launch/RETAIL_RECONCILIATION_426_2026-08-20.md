# 426-Row Retail Catalog Reconciliation — 2026-08-20 (authoritative)

Lead: claude-fable-desktop. Founder directive 2026-08-20, section 2 and 3.

Sources reconciled:
- `docs/research-launch/XENIOS_RETAIL_ONLY_MASTER_CATALOG_426_VARIANTS.csv`
  (426 rows; 424 numeric retail prices; 2 `Price on request`), derived from
  MASTER CATALOG → Suggested Sell Price.
- **Live production Product Control**, read directly on 2026-08-20 (417 active
  member prices). The 2026-08-19 snapshot file was NOT used as truth: it was
  captured *before* the 34-change release and would have produced a false diff.

Join key: `variant.sku = 'GEN-' + <Group ID>`. Exact, 1:1, zero orphans — every
one of the 417 live priced SKUs corresponds to a workbook row, and no live price
exists outside the workbook.

## Result: the catalog is already at the founder's retail book, with one fix applied

| State | Rows |
|---|---|
| Exactly matching the book (no action) | 415 |
| Canonical variants carrying their duplicate row's newer price (correct) | 2 |
| Duplicate workbook rows already applied to those canonical variants | 2 |
| No canonical variant yet — founder decision required | 4 |
| Not a catalog product (shipping line) | 1 |
| `Price on request` (correct; never `$0`) | 2 |
| **Total** | **426** |

### Applied this session (the only pending price change)

**GRP-0308 Kisspeptin, KISSPEPTIN 10 mg: $70.00 → $65.00.** Founder decision
2026-08-20: "the existing catalog match is valid. Include it in the retail
reconciliation at $65." It was missed on 2026-08-19 because the matcher compared
book product names and the canonical name differs. Applied through the canonical
Product Control RPCs (`research_admin_create_product_price` →
`research_admin_approve_product_price`), actor
`founder-directive-2026-08-20-kisspeptin-retail-reconciliation`.
Verified: version 1 ($70.00) `superseded`, version 2 ($65.00) `active`,
approved 2026-08-20T14:30:31Z.

### The duplicate rows are already correctly adjudicated — do not "fix" them

The workbook contains two pairs of rows describing the SAME canonical variant at
two different prices. Production already carries the NEWER price on the existing
variant, so the founder's "no duplicate variants" rule is satisfied:

| Canonical variant | Old book row | New book row | Live price | Version |
|---|---|---|---|---|
| Oxytocin (10 mg), `GEN-GRP-0407` | GRP-0407 @ $107.50 | GRP-0425 @ $59.00 | **$59.00** | 2 |
| Hexarelin (5 mg), `GEN-GRP-0402` | GRP-0402 @ $62.50 | GRP-0426 @ $49.00 | **$49.00** | 2 |

WARNING for anyone regenerating this diff: a naive per-Group-ID join marks these
as "wrong" and would REVERT Oxytocin 10 mg to $107.50 and Hexarelin 5 mg to
$62.50 — a real price regression on live products. Rows GRP-0425/GRP-0426 must
be treated as duplicates of GRP-0407/GRP-0402, and the newer price wins.

## Founder decisions still required (4 rows, no canonical variant exists)

Verified against `research_product_variants` on 2026-08-20 — these are genuinely
absent from the catalog, not merely unpriced:

1. **GRP-0421 Retatrutide 60 mg → $249.00.** Existing Retatrutide variants are
   5, 10, 15, 20, 30, 40, 50 mg (plus GLP-3 12/24 mg). No 60 mg exists. Creating
   it is a Product Control catalog mutation, not a price release.
2. **GRP-0423 MOTS-C 40 mg → $129.00.** Existing: MOTS-C 10 mg, clinical
   10 mg/mL and 2 mg/mL, R360 10 mg vial. No 40 mg exists.
3. **GRP-0424 Glutathione 600 mg → $69.00.** Existing: 1500 mg, 500 mg, clinical
   200 mg/mL (10 mL and 30 mL), R360 500 mg vial. No 600 mg exists.
4. **GRP-0422 CJC-1295 WITH DAC + Ipamorelin, 5 mg total → $99.00.** No such
   combination variant exists. The catalog has CJC-1295 WITH DAC alone (2/5/10 mg)
   and CJC-1295 **No DAC** + Ipamorelin combos (5+5, 10+10) — the DAC combo is
   not among them. Per the founder's own ruling, the component split must not be
   invented: it stays visible with a truthful non-direct-purchase state until the
   exact formulation is confirmed. **No action taken.**

Also noted: **GRP-0364 FedEx Standard Overnight @ $37.50** appears as a workbook
row but is a shipping charge, not a research product. It has no Product Control
price and should not become a purchasable catalog line; it belongs to fulfillment
pricing. Flagged for the founder rather than created.

## STANDING RULE FOR ANYONE CHANGING A PRICE

**Always go through `research_admin_create_product_price` →
`research_admin_approve_product_price`. Never hand-write an UPDATE or INSERT.**

The price resolver treats two concurrently-active, in-window member rows for one
variant as ambiguous, and an ambiguous price is rendered as "Price on request".
It does not fall back to the newer row, or the older one — **the price silently
disappears from every customer surface**, and the product becomes
indistinguishable from one that was never priced. There is no error, no log line
a customer or an operator would see, and nothing in the catalog that looks wrong.

The RPC pair supersedes the previous row as part of the same transaction, which
is what keeps exactly one row active. A direct INSERT does not, and a direct
UPDATE that misses the status column does not either. Both the 2026-08-19
release and this one used the RPC pair; verification after any price change
should confirm the old version reads `superseded` and exactly one row reads
`active`, as recorded above for Kisspeptin.

## Customer-surface guarantees re-checked

- Retail only. No wholesale, supplier price, supplier quote, cost, margin,
  markup, benchmark calculation, or internal pricing note is present in any
  customer-facing projection; the reconciliation reads Product Control retail
  amounts exclusively.
- No `$0` anywhere: the two `Price on request` rows (GRP-0244 BAM15 500 mcg,
  GRP-0365 Syringes & Alcohol Swabs) carry no numeric price and must render as
  "Price on request", never as zero.
- Prices resolve through canonical server pricing, never React constants.
