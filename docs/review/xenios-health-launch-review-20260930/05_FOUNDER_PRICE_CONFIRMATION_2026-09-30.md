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

---

# Founder decision REVERSED: include the three variants and every product row; list Superpower

- **Recorded:** 2026-09-30, by the Claude reviewer `claude-health-launch-review-20260930`.
- **Source:** Samuel Boadu's direct chat instruction to this session: "actually reverse the decision include reta,
  mots and everything for products" and "for now put superpower in the offerings too".
- This **supersedes** the "leave the three missing variants out for now" entry above.
- The `EXCLUDED_BY_FOUNDER_2026-09-30` disposition is **withdrawn**.

## Products: include everything

| Workbook row | Variant | Recorded book price | Decision |
| --- | --- | --- | --- |
| GRP-0421 | Retatrutide 60 mg, RUO Research | $249.00 | **Include.** Create the canonical variant and publish the price. |
| GRP-0423 | MOTS-C 40 mg, RUO Research | $129.00 | **Include.** Create the canonical variant and publish the price. |
| GRP-0424 | Glutathione 600 mg, RUO Research | $69.00 | **Include.** Create the canonical variant and publish the price. |
| All other product rows | per the 2026-08-21 reconciliation | per the ledger | **Include.** |

**Intended catalog:** all 424 canonical variants from the 426 workbook rows, after the Hexarelin/Oxytocin merges.

**Reviewer's reading of "everything for products" (founder to correct if wrong):**
- Every product row is in scope.
- GRP-0364 "FedEx Standard Overnight" ($37.50) is a shipping charge, not a product. It is kept as fulfillment
  pricing, not a catalog item.
- GRP-0422, the CJC-1295 with DAC + Ipamorelin 5 mg total ($99), is included and visible. It stays on a Request
  Order path under its structured formulation hold, because the founder's own 2026-08-21 ruling says the component
  split must not be invented.
- GRP-0244 BAM15 and GRP-0365 Syringes & Alcohol Swabs are included as "Price on request", never $0.

**Boundaries that still apply to every row:**
- **Care:** Care (503A) rows keep the provider pathway.
- **Research use:** research-use rows keep "Research use only. Not for human or veterinary use." Inclusion as a
  research listing is not human-use or clinical authority.
- **Retatrutide:** the pack's Retatrutide human-use procurement exclusion still applies to any human-use or Care
  channel.

**What the successor must deliver:** create each new variant with its exact identity (product, strength, form and
pack basis) and never alias it to a neighbouring strength.

**Live effect:** no live catalog or price change is authorized by this record. Creating Product Control variants
and price rows in production is a separate, authorized hosted action, with read-back.

## Superpower: list it in the offerings "for now"

- This supersedes the earlier direction (prompts 10, 11, 16, 17) that Superpower was uncontracted and not to be an
  active offer. Finding HL-14 is re-scoped from "unapproved surface" to "approved for listing, with guardrails".
- **Guardrails the review will check** (from the same founder prompts and the existing `SuperpowerOfferConfig`
  fields):
  - **Price:** no price unless a real, dated source exists (`verifiedPriceDate`, `lastVerificationDate`). An unknown
    price is shown as unknown, never invented or $0.
  - **Claims:** no claim of a partnership, contract, clinician review, pharmacy or live availability that has not
    been verified. The `disclosure` text must be truthful.
  - **Affiliate link:** only a real, founder-supplied URL. None is fabricated.
  - **Boundaries:** diagnostics stay separate from Research products and Care prescriptions, and there are no
    clinical claims.
  - **Dependencies:** the offer is not a launch dependency. The Health catalog and commerce closeout must not wait on
    it.
- **Open question for the founder:** does a signed agreement with Superpower (affiliate, resale or referral) exist?
  Until one is confirmed, the recommended display is a disclosed listing (for example "Coming soon" or "Register
  interest") rather than "Available" with a price.

---

# Founder decision: Superpower and Mito Health shown as "Coming soon"

- **Recorded:** 2026-09-30 11:36 CT, by the Claude reviewer `claude-health-launch-review-20260930`.
- **Source:** Samuel Boadu's direct chat instruction to this session: "No agreement yet, show Superpower as coming
  soon" and "as show mito health". The second instruction is read as "also show Mito Health", with the same
  Coming soon treatment. The founder can correct this reading.

| Offering | Agreement | Display | Status in source at `c213707` |
| --- | --- | --- | --- |
| Superpower (diagnostics) | **None yet** (founder, 2026-09-30) | **Coming soon** | Exists: `server/research/products-diagnostics/diagnostics.ts` `SuperpowerOfferConfig`, default `coming_soon`, member page `/research/member/diagnostics`, admin-configurable |
| Mito Health | **None assumed**: no agreement stated | **Coming soon** | **Absent**: no reference anywhere in the repository. "Mito Recharge" is an unrelated supplement row and must not be confused with it. |

## Guardrails the review will check

These apply to both offerings for as long as no agreement exists.

- **Status:** Coming soon only. Neither is "available", orderable or bookable. No checkout, cart or assisted-order line
  may include them, and neither may become a dependency of the Health catalog or commerce path.
- **Price:** no price is shown. The config `priceCents` stays null. No price is invented or copied from the partner's
  own site.
- **Affiliate link:** no affiliate link and no commission language while there is no agreement. An interest link, if
  any, stays on Xenios (for example, register interest) and must be real.
- **Brand:** the partner's name only. No logo, trademark artwork or wording that implies a partnership, endorsement,
  integration or API. The disclosure must state plainly that there is no current agreement and that nothing is
  available yet.
- **Descriptions:** no invented description of what either company offers, how it tests, or its results or turnaround.
  Any descriptive copy must be founder-approved text.
- **Clinical boundary:** no clinical or diagnostic claims. Keep both separate from Research products (research use
  only) and from Care (provider pathway).
- **Mito Health implementation:** reuse the existing diagnostics-offer structure (generalized or with a second
  entry) with the same server-side guard. No hard-coded client-only card, and no second authority.
- **Admin override:** an admin must not be able to switch either offering to "available" or add a price or affiliate
  URL without a recorded agreement. Today the Superpower offer is admin-configurable; see HL-14.

---

# Founder decision: the book display cents are approved for the 17 rounding rows (HL-18)

- **Recorded:** 2026-09-30, by the Claude reviewer `claude-health-launch-review-20260930`.
- **Source:** Samuel Boadu's direct chat instruction to this session: "use the book display cents for the 17
  rounding rows".
- **Row list** (generated from `04_PRICE_LEDGER_c213707.csv`, not hand-typed):
  `06_ROUNDING_ROWS_BOOK_DISPLAY_CENTS.csv`.

| Group | Channel | Variant | Book display (approved) | Last recorded live (2026-08-20) | Change |
| --- | --- | --- | --- | --- | --- |
| GRP-0036 | Care | DHEA 100 mg capsule | 262 | 263 | −1¢ |
| GRP-0075 | Care | Ibutamoren 12.5 mg capsule | 412 | 413 | −1¢ |
| GRP-0076 | Care | Ibutamoren 25 mg capsule | 662 | 663 | −1¢ |
| GRP-0092 | Care | Low Dose Naltrexone 1.5 mg capsule | 212 | 213 | −1¢ |
| GRP-0104 | Care | Methylene Blue 15 mg capsule | 562 | 563 | −1¢ |
| GRP-0116 | Care | Oxandrolone 25 mg capsule | 562 | 563 | −1¢ |
| GRP-0128 | Care | Phentermine HCl 15 mg capsule | 162 | 163 | −1¢ |
| GRP-0129 | Care | Phentermine HCl 30 mg capsule | 162 | 163 | −1¢ |
| GRP-0130 | Care | Phentermine HCl 45 mg capsule | 162 | 163 | −1¢ |
| GRP-0172 | Care | Sildenafil 100 mg tablet | 312 | 313 | −1¢ |
| GRP-0199 | Care | Tadalafil 5 mg tablet | 462 | 463 | −1¢ |
| GRP-0206 | Care | Tamoxifen 10 mg tablet | 312 | 313 | −1¢ |
| GRP-0211 | Care | Tesofensine 500 mcg capsule | 562 | 563 | −1¢ |
| GRP-0303 | Research | Ipamorelin 5 mg | 15312 | 15313 | −1¢ |
| GRP-0348 | Research | Tesamorelin 5 mg | 16927 | 16927 | none |
| GRP-0371 | Supplement | GI Defend | 10812 | 10813 | −1¢ |
| GRP-0379 | Supplement | PeriMenopause Support | 4312 | 4313 | −1¢ |

## Resulting monetary contract (reviewer statement; founder may correct)

- **Approved cents:** for every priced workbook row, the approved retail cents now equal the book's `Price Display`
  cents.
  - The other 398 exact rows already agree with their display.
  - The Hexarelin 5 mg ($62.50) and Oxytocin 10 mg ($107.50) decisions are separate founder decisions.
  - The implied conversion rule for any sub-cent book value is the display's rounding of the exact decimal: half to
    even, for example 2.625 → 2.62 and 1.875 → 1.88.
- **Forbidden:** source must not parse formatted CSV text or `Math.round` a binary float. GRP-0348's raw value
  `169.27499999999998` must resolve to 16927.
- **Line totals:** unit cents × quantity, in integers. The unit cents are the approved display cents. For example,
  30 × DHEA 100 mg is 30 × 262 = 7860 cents, not 30 × 2.625 = 78.75. The customer sees one consistent unit price.
- **Scope:** approved cents do not change Care routing. The 13 Care rows remain provider-pathway items and are not
  research-purchasable.
- **Live effect:** no live price change is authorized by this record. Publishing the 16 −1¢ rows is a Product Control
  release through `research_admin_create_product_price` → `research_admin_approve_product_price`, one active row per
  variant, with read-back. Accepted historical orders keep their sold-price snapshots.
