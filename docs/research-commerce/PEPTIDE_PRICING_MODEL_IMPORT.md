---
title: Peptide Pricing Model Import
lane: XCA-W21-PRICING-MODEL
owner: Samuel Boadu
status: prices imported as founder draft targets, activation blocked
data_source: shared/research/catalog/peptide-pricing-model.ts
source_workbook: XENIOS_PEPTIDE_MASTER_PRICING_MODEL_2026-07-29.xlsx
source_sha256: f11742ae7801bcf465a5cf1a68af5ebdfab5dee9b6fba60aa9468e880161d519
last_updated: 2026-07-29
---

# Peptide pricing model import

The founder-authored pricing model is now in the codebase, joined to the
implemented catalog by variant SKU. This closes the pricing question that has
blocked the peptide lane: two founder-approved multiplier rules disagreed, two
more prices for the same items existed elsewhere in the repository, and
`peptide-catalog.ts` recorded all of them side by side rather than choose. The
workbook chooses, and it chooses by comparable market evidence rather than by a
multiple of supplier cost.

It does not, however, unblock selling. The workbook's own Compliance Gates sheet
records twelve gates that are "Required before price activation" and none of them
is met. So every price imports as a founder draft target and no price can reach an
active state in code.

## Contents

1. [What was built](#1-what-was-built)
2. [The source workbook](#2-the-source-workbook)
3. [The join result](#3-the-join-result)
4. [The fifteen recommended member prices](#4-the-fifteen-recommended-member-prices)
5. [The identity problem, which is the real one](#5-the-identity-problem-which-is-the-real-one)
6. [The thirty-nine expansion draft targets](#6-the-thirty-nine-expansion-draft-targets)
7. [The sixteen that stay blank](#7-the-sixteen-that-stay-blank)
8. [The gates that block activation](#8-the-gates-that-block-activation)
9. [The discount doctrine](#9-the-discount-doctrine)
10. [What the workbook's own margin arithmetic says](#10-what-the-workbooks-own-margin-arithmetic-says)
11. [Exactly what activates prices](#11-exactly-what-activates-prices)
12. [Transcription decisions](#12-transcription-decisions)

## 1. What was built

| Artifact | Path |
| --- | --- |
| Price targets, joined by SKU | `shared/research/catalog/peptide-pricing-model.ts` |
| Price target tests | `shared/research/catalog/peptide-pricing-model.test.ts` |
| Compliance gates and the activation verdict | `shared/research/catalog/peptide-pricing-gates.ts` |
| Gate tests | `shared/research/catalog/peptide-pricing-gates.test.ts` |
| Discount and offer architecture | `shared/research/catalog/peptide-discount-policy.ts` |
| Discount tests | `shared/research/catalog/peptide-discount-policy.test.ts` |
| This document | `docs/research-commerce/PEPTIDE_PRICING_MODEL_IMPORT.md` |

Nothing in `peptide-catalog.ts` was changed. The pricing model is a new module
that joins to it by `PeptideVariant.sku`, so the catalog stays the single record
of what the products are and the new module is the single record of what the
founder proposes to charge.

## 2. The source workbook

| Field | Value |
| --- | --- |
| File | `XENIOS_PEPTIDE_MASTER_PRICING_MODEL_2026-07-29.xlsx` |
| sha256 | `f11742ae7801bcf465a5cf1a68af5ebdfab5dee9b6fba60aa9468e880161d519` |
| Sheets | Dashboard, Assumptions, Current 15 Pricing, All 70 Draft Targets, Market Benchmarks, Competitor Observations, Site Positioning, Volume Scenarios, Discounts and Offers, Compliance Gates, Source Notes |
| Market evidence | 97 price observations across 50 sites, accessed 2026-07-29 |

The hash is pinned in the module and in a test, so a different workbook cannot be
described by this document without the test failing.

The workbook was generated from this repository's own extraction work. Its Source
Notes sheet cites `XENIOS_MITCH_CODE_EXTRACTED_CATALOG.json`,
`XENIOS_MITCH_CODE_EXTRACTION_AUDIT.md`, `XENIOS_MITCH_RETURN_IMPORT_SCHEMA.json`,
and `XENIOS_MITCH_CODE_EXTRACTED_SOURCING_PACKAGE.xlsx`. That is why the join is
exact rather than approximate.

The market prices are point-in-time web listings gathered on one day. The workbook
states plainly that they are observations, not an endorsement of anyone's quality,
and that they should be refreshed before a final approval.

## 3. The join result

| Measure | Result |
| --- | --- |
| Sheet rows in "All 70 Draft Targets" | 70 |
| Variants in `peptide-catalog.ts` | 70 |
| Matched on exact variant SKU | **70 of 70** |
| Sheet SKUs with no catalog variant | **0** |
| Catalog variants with no price row | **0** |
| Field disagreements | **0** |

Every SKU matched. There are no unmatched SKUs to report in either direction.

The join was also cross-checked on the fields both artifacts carry
independently: product code, tier, strength, size, format, availability, and
market reference price all agree on all 70 rows. Tier counts agree exactly:
21 workbook variants, 33 expansion, 16 regulatory hold.

`joinToCatalog()` recomputes the match at runtime and a test asserts all three
mismatch lists are empty, so the day a SKU is renamed, a product is retiered, or a
variant is added, the drift surfaces as a failing test rather than as a silently
unpriced product.

## 4. The fifteen recommended member prices

These are the founder's own numbers from the "Current 15 Pricing" and "Market
Benchmarks" sheets, with the comparable market distribution alongside. Every one
is a **draft target**, not an active price.

| SKU | Product | Obs | Market median | Market P75 | Recommended | vs median | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `R360-BPC157_TB500-15MG_15MG-VIAL` | BPC-157 + TB-500 Blend | 6 | $99.995 | $103.75 | **$109** | +9.0% | High |
| `R360-BPC157_TB500_GHKCU-10MG_10MG_50MG-VIAL` | BPC-157 + TB-500 + GHK-Cu (GLOW) | 8 | $129.995 | $187.50 | **$149** | +14.6% | High |
| `R360-TB500_BPC157_GHKCU_KPV-5MG_5MG_10MG_5MG-VIAL` | KLOW Blend | 14 | $150.995 | $169.74 | **$199** | +31.8% | High |
| `R360-THYMOSINALPHA1_KPV_LL37-5MG_5MG_5MG-VIAL` | Thymosin Alpha-1 + KPV + LL-37 | 4 | $185.00 | $200.00 | **$189** | +2.2% | Low |
| `R360-CJC1295_IPAMORELIN-5MG_5MG-VIAL` | CJC-1295 + Ipamorelin | 7 | $80.00 | $99.995 | **$109** | +36.3% | High |
| `R360-PT141-10MG-VIAL` | PT-141 | 9 | $45.00 | $55.00 | **$69** | +53.3% | High |
| `R360-TESAMORELIN-10MG-VIAL` | Tesamorelin | 5 | $55.00 | $65.00 | **$79** | +43.6% | Medium |
| `R360-GONADORELIN-5MG-VIAL` | Gonadorelin | 4 | $37.50 | $40.00 | **$49** | +30.7% | High |
| `R360-NAD-500MG-VIAL` | NAD+ | 7 | $45.00 | $48.00 | **$59** | +31.1% | High |
| `R360-MOTSC-10MG-VIAL` | MOTS-C | 6 | $54.995 | $58.74 | **$69** | +25.5% | Medium |
| `R360-EPITHALON-10MG-VIAL` | Epithalon | 5 | $45.00 | $55.00 | **$59** | +31.1% | Medium |
| `R360-SS31-10MG-VIAL` | SS-31 | 4 | $99.50 | $113.00 | **$109** | +9.5% | Low |
| `R360-SLUPP332-250MCGX100-CAP` | SLU-PP-332 Capsules | 4 | $122.00 | $134.25 | **$129** | +5.7% | Low |
| `R360-DIHEXA-10MGX60-CAP` | Dihexa Capsules | 7 | $140.00 | $144.00 | **$149** | +6.4% | Medium |
| `R360-SEMAX_SELANK_DSIP-10MG_10MG_2MG-VIAL` | Semax + Selank + DSIP | 4 | $139.50 | $155.50 | **$149** | +6.8% | Low |

Range: $49 to $199. The ladder is deliberately institutional: every one of the
fifteen ends in a 9, no price uses a .99 ending, and there is no struck-through
comparison price anywhere.

Five of the fifteen sit at or below the market P75: GLOW at $149 against a P75 of
$187.50, the Thymosin Alpha-1 blend at $189 against $200, SS-31 at $109 against
$113, SLU-PP-332 at $129 against $134.25, and Semax + Selank + DSIP at $149
against $155.50. The other ten sit above the P75, which the workbook's doctrine
supports ("price to the 70th to 85th percentile of comparable evidence-backed
vendors") on the condition that the evidence exists. The evidence is exactly what
does not exist yet: see section 8.

The two largest premiums over the median are PT-141 at plus 53.3% and Tesamorelin
at plus 43.6%, on medians drawn from nine and five observations.

Five of the fifteen rest on only four comparable observations (PEP-004, PEP-008,
PEP-012, PEP-013, PEP-015). Four of those five are marked Low confidence; the
fifth, Gonadorelin, is marked High. A four-listing median is a weak basis for a
premium claim and should be refreshed before approval.

## 5. The identity problem, which is the real one

The workbook priced the presentation the supplier attested. The catalog SKU
records the presentation this repository implemented. **For 11 of the 15 those are
not the same item.**

| SKU strength | Priced presentation | Conflict |
| --- | --- | --- |
| BPC-157 + TB-500 at 15 mg / 15 mg | 5 mg / 5 mg (10 mg total) | STRENGTH |
| KLOW at 5/5/10/5 mg | 50/10/10/10 mg (80 mg total) | STRENGTH |
| Tesamorelin 10 mg | 5 mg per vial | STRENGTH |
| Gonadorelin 5 mg | 2 mg per vial | STRENGTH |
| NAD+ 500 mg | 100 mg per vial | STRENGTH |
| MOTS-C 10 mg | 5 mg per vial | STRENGTH |
| Epithalon 10 mg | 5 mg per vial | STRENGTH |
| SS-31 10 mg | 5 mg per vial | STRENGTH |
| Semax + Selank + DSIP at 10/10/2 mg | 5/5/5 mg | STRENGTH |
| SLU-PP-332 250 mcg x 100 | 1500 mcg x 60 | STRENGTH + PACK COUNT |
| Dihexa 10 mg x 60 | 10 mg x 30 | PACK COUNT |

The twelfth flagged row (GLOW) differs only in the order the components are
listed, which is not a material difference, so it is recorded as
`COMPONENT ORDER ONLY` and is not counted among the 11.

This is why the identity gate is CRITICAL rather than administrative. Resolving
the presentation does not tidy up a label, it decides which number is even the
right one. Several of these are large: a $59 price set for a 100 mg NAD+ vial
against a SKU that says 500 mg, and a $129 price set for 60 capsules at 1500 mcg
against a SKU that says 100 capsules at 250 mcg.

In code, `pricedPresentation` states verbatim what was priced and
`priceAppliesToRecordedPresentation()` returns false for all 11. No price is ever
inherited across a strength or a pack count in this import.

## 6. The thirty-nine expansion draft targets

Thirty-nine variants have a draft target with no founder override. Each was
computed by the workbook's own stated rule, and the module reproduces all
thirty-nine exactly:

```
target = roundUpTo($5, max(marketReference x 1.15, $49))
```

That is the Assumptions sheet's 15% fallback premium uplift over a single market
reference, held at or above the $49 minimum member price, on the $5 institutional
ladder. `expansionTargetFromMarketReference()` implements it and a test asserts it
returns the exact recorded target for every one of the thirty-nine, so the method
is captured and not just its output.

Every one of these rests on a **single** market reference. The workbook marks them
"Single reference" confidence and its own note is the honest framing:
"Single-reference premium target only; requires real supplier cost, product
identity, COA, and founder approval."

| SKU | Product | Market reference | Draft target |
| --- | --- | --- | --- |
| `R360-CJC1295_IPAMORELIN-20MG-VIAL` | CJC-1295 + Ipamorelin Research Blend | $159.99 | $185 |
| `R360-TESAMORELIN-20MG-VIAL` | Tesamorelin Research Material | $124.99 | $145 |
| `R360-NAD-1000MG-VIAL` | NAD+ Research Material | $129.99 | $150 |
| `R360-MOTSC-40MG-VIAL` | MOTS-C Research Material | $129.99 | $150 |
| `R360-EPITHALON-100MG-VIAL` | Epithalon Research Material | $87.99 | $105 |
| `R360-SS31-50MG-VIAL` | SS-31 Research Material | $159.99 | $185 |
| `R360-BPC157-10MG-VIAL` | BPC-157 Research Material | $87.99 | $105 |
| `R360-BPC157-20MG-VIAL` | BPC-157 Research Material | $104.99 | $125 |
| `R360-TB500-10MG-VIAL` | TB-500 Research Material | $99.99 | $115 |
| `R360-GHKCU-100MG-VIAL` | GHK-Cu Research Material | $99.99 | $115 |
| `R360-KPV-10MG-VIAL` | KPV Research Material | $74.99 | $90 |
| `R360-SEMAX-10MG-VIAL` | Semax Research Material | $89.99 | $105 |
| `R360-SEMAX-30MG-VIAL` | Semax Research Material | $119.99 | $140 |
| `R360-SELANK-10MG-VIAL` | Selank Research Material | $89.99 | $105 |
| `R360-DSIP-15MG-VIAL` | DSIP Research Material | $79.99 | $95 |
| `R360-THYMOSINALPHA1-10MG-VIAL` | Thymosin Alpha-1 Research Material | $99.99 | $115 |
| `R360-IPAMORELIN-10MG-VIAL` | Ipamorelin Research Material | $74.99 | $90 |
| `R360-5AMINO1MQ-5MG-VIAL` | 5-Amino-1MQ Research Material | $89.99 | $105 |
| `R360-5AMINO1MQ-50MG-VIAL` | 5-Amino-1MQ Research Material | $199.99 | $230 |
| `R360-ADAMAX-10MG-VIAL` | Adamax Research Material | $69.99 | $85 |
| `R360-AOD9604-5MG-VIAL` | AOD-9604 Research Material | $79.99 | $95 |
| `R360-AOD9604-10MG-VIAL` | AOD-9604 Research Material | $109.99 | $130 |
| `R360-CJC1295DAC-5MG-VIAL` | CJC-1295 with DAC Research Material | $99.99 | $115 |
| `R360-FOLLISTATIN-1MG-VIAL` | Follistatin Research Material | $138.99 | $160 |
| `R360-GLUTATHIONE-600MG-VIAL` | Glutathione Research Material | $79.99 | $95 |
| `R360-GLUTATHIONE-1500MG-VIAL` | Glutathione Research Material | $109.99 | $130 |
| `R360-HCG-5000IU-VIAL` | HCG Research Material | $87.99 | $105 |
| `R360-IGF1LR3-0P1MG-VIAL` | IGF-1 LR3 Research Material | $34.99 | $50 |
| `R360-IGF1LR3-1MG-VIAL` | IGF-1 LR3 Research Material | $99.99 | $115 |
| `R360-KISSPEPTIN10-10MG-VIAL` | Kisspeptin-10 Research Material | $99.99 | $115 |
| `R360-LCARNITINE-600MG-VIAL` | L-Carnitine Research Material | $59.99 | $70 |
| `R360-LIPOC-100MG-VIAL` | LIPO-C Research Material | $79.99 | $95 |
| `R360-MELANOTAN1-10MG-VIAL` | Melanotan I Research Material | $69.99 | $85 |
| `R360-MELANOTAN2-10MG-VIAL` | Melanotan II Research Material | $69.99 | $85 |
| `R360-SERMORELIN-10MG-VIAL` | Sermorelin Research Material | $99.99 | $115 |
| `R360-THYMALIN-10MG-VIAL` | Thymalin Research Material | $69.99 | $85 |
| `R360-VIP-10MG-VIAL` | VIP Research Material | $84.99 | $100 |
| `R360-SEMAX_SELANK-10MG-VIAL` | Semax + Selank Research Blend | $99.99 | $115 |
| `R360-TESAMORELIN_IPAMORELIN-15MG-VIAL` | Tesamorelin + Ipamorelin Research Blend | $109.99 | $130 |

Six of those thirty-nine belong to workbook products (larger vial sizes of items
we already list). The other thirty-three are the expansion tier, which has no
supplier cost basis at all and stays request-access only regardless of price.

## 7. The sixteen that stay blank

The three GLP compounds (semaglutide, tirzepatide, retatrutide, 16 variants
between them) have **no price** in this import. The workbook leaves those cells
empty and states "Regulatory hold. No price recommendation and no customer
display."

They are recorded with a status of `NO_PRICE_REGULATORY_HOLD` and null in all
three price fields. A blank source cell became null, never zero. Even with every
compliance gate cleared, `resolvePriceStatus` returns
`NO_PRICE_REGULATORY_HOLD` for them, because the hold is about lawfulness and not
about evidence quality. A test proves that.

The workbook's own Compliance Gates row is the instruction: keep them unavailable
unless a separate lawful clinical or counsel-approved lane exists.

## 8. The gates that block activation

The five gates that are specifically about per-SKU price evidence, verbatim from
the Compliance Gates sheet:

| Gate | State | What was measured | Severity | Owner |
| --- | --- | --- | --- | --- |
| Exact product identity / presentation | **FAIL** | 11 material strength or pack conflicts across 15 current SKUs | CRITICAL | Mitch + Xenios |
| Lot-matched COA files | **FAIL** | 0 of 65 referenced attachments received or verified | CRITICAL | Mitch + QA |
| Purity, mass, sterility, endotoxin | **UNKNOWN** | Not present in current implementation | CRITICAL | QA + counsel |
| Lot and expiry | **FAIL** | No lot or expiry record on file | CRITICAL | Mitch + QA |
| New supplier unit cost | **FAIL** | Cheaper sourcing reported, but no exact per-SKU quote supplied | HIGH | Mitch + Samuel |

The sheet records seven further gates, and all seven also block: payment
processor approval (CRITICAL, FAIL, no written category approval), claims and
intended-use review (CRITICAL, FAIL), commerce capability and founder release
(CRITICAL, FAIL, 0 of 15 purchase eligible), regulatory-hold compounds (CRITICAL,
BLOCKED), cold-chain and shipping validation (HIGH, PARTIAL), inventory
availability (HIGH, UNVERIFIED), and price approval itself (HIGH, DRAFT).

All twelve are transcribed in `peptide-pricing-gates.ts` rather than only the five,
because a dropped blocker would make the file understate what stands in the way.
Twelve gates, eight CRITICAL and four HIGH, **zero cleared**.

`canActivatePricing()` is pure and fails closed twice over: a gate blocks unless it
is explicitly CLEARED, and the verdict is allowed only when the blocking list is
empty. An empty gate list is also refused, because no evidence is not the same as a
clear gate set. Tests prove it blocks today, that clearing every CRITICAL gate
still leaves the four HIGH gates blocking, that leaving any single CRITICAL gate
failing keeps every price a draft, and that it allows only when all twelve clear.

## 9. The discount doctrine

The sheet is explicit about which of its own rows are decided, and the module keeps
that line in code.

**Approved doctrine (exactly one row).** A single unit sells at one clean private
member price, with no discount. The Assumptions sheet marks the display-price
doctrine LOCKED: one clean member price, no fake MSRP, no permanent
strike-through.

**Draft (not decided).** The whole volume ladder: 3% at 3 to 4 units, 5% at 5 to 9,
8% at 10 to 19, 10% at 20 or more, plus 8% on a 3-item order (10% maximum), free
shipping over $250, and the 10% affiliate commission. The affiliate rate is
explicitly not customer-facing: a commission must not become a customer discount.

**Optional.** A 5% founding-member benefit, usable only if separately approved and
consistently applied.

**Blocked.** No auto-renewing peptide subscription at launch. No BOGO or sitewide
20% sale. No struck-through MSRP unless bona fide, which is an FTC
price-comparison exposure and not only a brand preference.

Because only the single-unit row is decided, `decidedDiscountBasisPoints()`
returns zero at every quantity, including 20 units. The draft ladder is readable
through `draftUnitDiscount()`, which hands back the DRAFT status alongside the
number, so there is no way to take the 8% without also taking the word DRAFT. The
10% cap is pinned and no rate in the file exceeds it.

## 10. What the workbook's own margin arithmetic says

Worth the founder's attention, and stated carefully because the cost input is not
trustworthy.

The workbook's contribution columns use the legacy per-unit cost already recorded
in `peptide-catalog.ts` as `wholesaleSourceCostCents`, because its "New Mitch unit
cost" column is empty on all 70 rows. On that cost, plus the sheet's illustrative
$20 per unit of freight, QA, packaging, fulfilment, shipping subsidy, and support,
a 3% plus $0.30 payment fee, and a 1.5% refund reserve, **8 of the 15 recommended
prices show a negative direct contribution**: BPC-157 + TB-500 (minus $50.21, a
$109 price against a $141.50 landed cost), Tesamorelin (minus $23.86), NAD+ (minus
$18.96), GLOW (minus $17.01), Gonadorelin (minus $16.51), Epithalon (minus $8.96),
SS-31 (minus $5.21), and MOTS-C (minus $1.41).

That does not mean the prices are wrong. It means the cost is unknown: the legacy
cost is attached to the wrong presentation for 11 of the 15 (a $134 cost for a
15 mg / 15 mg vial cannot be compared with a price set for a 5 mg / 5 mg vial), and
no signed per-SKU cost sheet exists. The workbook's per-unit overhead figures are
labelled illustrative and awaiting real quotes.

Which is the same conclusion from a different direction: **the missing signed cost
sheet is not a formality.** Until it arrives, no one can say whether these prices
are profitable. That cost is deliberately not restated in the pricing module, so
there is only one copy of a disputed number in the codebase.

## 11. Exactly what activates prices

Nothing in this import can be charged. In code, `memberPriceCentsForDisplay()`
returns null for all 70 variants today, and a test asserts it.

To activate the fifteen current prices, in order:

1. **Signed per-SKU presentation confirmation** from Mitch, resolving the 11
   material strength and pack conflicts, then update the catalog variants and the
   labels. This comes first because it decides which price is even the right one.
2. **The actual COA files**, lot-matched, hashed, and independently verified.
   Currently 0 of 65. A founder decision cannot substitute: the gate is keyed to
   the presence of a document.
3. **Defined and verified purity, mass, sterility, and endotoxin panels** per
   format, from QA and counsel.
4. **Lot release records and stability-supported expiry dates.**
5. **A signed supplier cost sheet** with SKU, presentation, MOQ, lead time,
   shipping, and terms, so the margin question in section 10 can be answered.
6. **Written payment-processor approval** for the exact product category and
   descriptor.
7. **Counsel-approved claims** and a page-level intended-use review.
8. **A founder release** at an exact commit, with the commerce flag and an
   operational smoke test.
9. Then, and only then, **the per-SKU price approval itself**: set each gate's
   state to CLEARED in `peptide-pricing-gates.ts` with its evidence recorded, and
   record the effective date. That last step needs a change to the
   `PeptidePriceTarget` interface, because `effectiveDate` is typed as the literal
   `null` today. That is intentional: putting a date on a price is a reviewed edit,
   not a data entry.

The regulatory-hold compounds are outside this list. They stay unavailable, at no
price, unless counsel opens a separate lawful lane.

The volume discount ladder is a separate founder approval and is not required for
activation: shipping at one clean member price with no volume tiers is the approved
doctrine already.

## 12. Transcription decisions

**Money.** Every amount is integer US cents. Every price target in the workbook is
a whole dollar, so no price was rounded. Seven of the 45 market statistics land on
half a cent, because a median of two listings can (for example $99.995). Those are
stored rounded to the nearest cent and every one of the seven is listed in
`SUB_CENT_ROUNDING_LEDGER` with its exact sheet value. Nothing else was
transformed.

**Blank cells.** A blank source cell is null. There is no zero anywhere in this
import standing in for a missing number, and a test walks every price field on
every row to prove it.

**Cost.** Not restated. See section 10.

**Confidence.** The sheet uses four values, not two: High (7 rows), Medium (4),
Low (4), and "Single reference" (55). "Single reference" is kept as its own value
rather than folded into Low, so one data point can never read as a range.

**House style.** The source workbook was scanned for em dashes and en dashes
across every sheet and every shared string before transcription. It contains
none, so nothing required normalisation; `SOURCE_DASH_SCAN` records the zero
counts. The directory's dash ban is still asserted by a test that reads every
`.ts` file in `shared/research/catalog/`, and the test constants are written as
`\u2014` and `\u2013` escapes so the test file is not itself the violation it catches.

**Deviation from the brief.** The task asked for the five compliance gates. All
twelve from the sheet are transcribed, with the five exported as
`PRICE_EVIDENCE_GATE_IDS`. Recording more blockers than asked is safe; recording
fewer would not be.
