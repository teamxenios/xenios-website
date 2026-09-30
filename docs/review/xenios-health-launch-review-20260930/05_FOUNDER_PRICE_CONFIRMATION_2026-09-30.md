# Founder price confirmation: Hexarelin 5 mg and Oxytocin 10 mg

- **Recorded:** 2026-09-30, by the Claude reviewer `claude-health-launch-review-20260930`.
- **Source:** Samuel Boadu's direct chat instruction to this session: "Confirm Hexarelin $62.50 and Oxytocin $107.50".

| Canonical variant | Canonical row (kept) | Superseded provenance row | Confirmed retail price | Cents |
| --- | --- | --- | --- | --- |
| Hexarelin, `HEXARELIN 5 mg`, RUO Research | GRP-0426 | GRP-0402 | $62.50 | 6250 |
| Oxytocin, `OXYTOCIN 10 mg`, RUO Research | GRP-0425 | GRP-0407 | $107.50 | 10750 |

## Effect on the record

- This reconfirms the 2026-08-21 decision (`.xenios/FOUNDER_DECISION_2026-08-21_PRICE_AND_PRODUCTION_GO.md`
  and `config/research/master-catalog-reconciliation-20260821.json` `priceDecision`). The $49.00 / $59.00 figures
  are stale.
- The open question in `docs/research-launch/XENIOS_CATALOG_VARIANT_RECONCILIATION_2026-08-28.md`, decision 3, is
  answered for price.
- This is a reprice, not a pathway change. Both variants stay research-use rows, directly orderable through the
  existing request path.
- Only the canonical identity is sold, with no duplicate variants. The canonical Group IDs are GRP-0426 and
  GRP-0425; the runtime identity migration is the successor's regeneration task.

## What this does NOT do

- **Live price:** no live change. The last recorded live values, as of 2026-08-20, are $49.00 on `GEN-GRP-0402` and
  $59.00 on `GEN-GRP-0407`. Changing them needs a separately authorized Product Control release through
  `research_admin_create_product_price` → `research_admin_approve_product_price`, then a read-back showing exactly
  one active row per variant.
- **Existing orders:** accepted historical orders keep their immutable sold-price snapshots.
- **Everything else:** this is not an approval of any other row. The 17 rounding rows (HL-18) and the three missing
  variants remain open.

---

# Founder decision: the three missing variants stay out for now

- **Recorded:** 2026-09-30, by the Claude reviewer `claude-health-launch-review-20260930`.
- **Source:** Samuel Boadu's direct chat instruction to this session: "Leave the three missing variants out for now".

| Workbook row | Variant | Recorded book price | Decision |
| --- | --- | --- | --- |
| GRP-0421 | Retatrutide 60 mg | $249.00 | **Out for now.** No variant is created and it is not sold. |
| GRP-0423 | MOTS-C 40 mg | $129.00 | **Out for now.** No variant is created and it is not sold. |
| GRP-0424 | Glutathione 600 mg | $69.00 | **Out for now.** No variant is created and it is not sold. |

## What this means for the successor

- These rows remain in the workbook as evidence and in the row ledger with the disposition
  `EXCLUDED_BY_FOUNDER_2026-09-30`. They are not silently dropped.
- No Product Control catalog mutation or price row is created for them.
- They must not be aliased to neighbouring strengths:
  - Retatrutide 5–50 mg is not 60 mg.
  - MOTS-C 10 mg is not 40 mg.
  - Glutathione 500 mg and 1500 mg are not 600 mg.
- The catalog count is 424 canonical minus these 3 = **421 intended variants**, including GRP-0422, which stays
  visible under its formulation hold.
- The served runtime today is 420, which includes the superseded identities for GRP-0402/GRP-0407 and the FedEx
  shipping line (HL-19). The successor's regenerated count must be explained against 421, not forced to it.
- "For now": re-adding any of them later needs a new founder decision plus eligibility authority.
  - Retatrutide carries a human-use procurement exclusion.
