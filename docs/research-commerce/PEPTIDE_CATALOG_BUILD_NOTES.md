---
title: Peptide Catalog Build Notes
lane: XCA-W15-PEPTIDE-CATALOG
owner: Samuel Boadu
status: awaiting founder decision
data_source: shared/research/catalog/peptide-catalog.ts
last_updated: 2026-07-29
---

# Peptide catalog build notes

What the data layer records, what it deliberately refuses to decide, and what a
founder decision would unlock. Every open item here is a decision that cannot be
made by an engineer.

## Contents

1. [What was built](#1-what-was-built)
2. [The fifteen versus eighteen discrepancy](#2-the-fifteen-versus-eighteen-discrepancy)
3. [The pricing formula conflict](#3-the-pricing-formula-conflict)
4. [The COA gate and why nothing is directly purchasable](#4-the-coa-gate-and-why-nothing-is-directly-purchasable)
5. [Tier 1: the workbook, and its three differentiated blends](#5-tier-1-the-workbook-and-its-three-differentiated-blends)
6. [Tier 2: expansion](#6-tier-2-expansion)
7. [Tier 3: regulatory hold](#7-tier-3-regulatory-hold)
8. [De-duplication decisions](#8-de-duplication-decisions)
9. [Which market sizes were added, and which were not](#9-which-market-sizes-were-added-and-which-were-not)
10. [Other recorded discrepancies](#10-other-recorded-discrepancies)
11. [Vocabulary extensions and why they exist](#11-vocabulary-extensions-and-why-they-exist)
12. [What unlocks each tier](#12-what-unlocks-each-tier)

## 1. What was built

| Artifact | Path |
| --- | --- |
| Catalog data layer | `shared/research/catalog/peptide-catalog.ts` |
| Catalog tests | `shared/research/catalog/peptide-catalog.test.ts` |
| Customer-facing copy | `shared/research/catalog/peptide-copy.ts` |
| Copy tests | `shared/research/catalog/peptide-copy.test.ts` |
| Label system | `docs/research-commerce/PEPTIDE_LABEL_SYSTEM.md` |

Counts as built:

| Tier | Products | Variants | Cost basis | Purchasable |
| --- | --- | --- | --- | --- |
| 1, workbook | 15 | 21 | 15 of 21 | none |
| 2, expansion | 27 | 33 | 0 | none |
| 3, regulatory hold | 3 | 16 | 0 | none, in code |
| **Total** | **45** | **70** | **15** | **none** |

Nothing in this catalog is approved to sell. That is the correct state, and the
sections below say exactly what would change it.

## 2. The fifteen versus eighteen discrepancy

The founder's message referred to eighteen peptides. The authoritative workbook
sheet, "Peptides - Top 15 SKUs", contains exactly fifteen data rows, numbered 1
to 15.

**Fifteen were built. Three were not invented to close the gap.** A test asserts
the workbook tier is fifteen, and asserts that no `PEP-016`, `PEP-017`, or
`PEP-018` exists.

The three may be a miscount, may be planned SKUs not yet in the sheet, or may be
in a newer version of the workbook that was not supplied. Only Samuel can say
which. If a newer sheet exists, supply it and the tier extends cleanly.

## 3. The pricing formula conflict

Two founder-approved pricing rules disagree about the same fifteen items, and two
further prices for the same items already exist in this repository. **All four are
recorded side by side on every variant. None is marked active or approved.**

- Rule A, the current instruction: customer price = wholesale x 1.80.
- Rule B, the previously approved founder matrix: max($99, 2.5x wholesale),
  rounded up to the next $5.
- The legacy published price: what `server/research/products-data.ts` currently
  shows on the live catalog.
- The signed supplier master member price: stated publicly in this repository for
  three SKUs only; the rest are held in the private operations repository and are
  recorded as `null` here rather than guessed.

| SKU | Product | Wholesale | Rule A, 1.80x | Rule B, matrix | Legacy published | Signed master |
| --- | --- | --- | --- | --- | --- | --- |
| PEP-001 | BPC-157 + TB-500 Research Blend | $134.00 | $241.20 | $335.00 | $339.99 | $89.99 |
| PEP-002 | BPC-157 + TB-500 + GHK-Cu Research Blend | $139.00 | $250.20 | $350.00 | $349.99 | not public |
| PEP-003 | KLOW Research Blend | $134.00 | $241.20 | $335.00 | $339.99 | $149.99 |
| PEP-004 | Thymosin Alpha-1 + KPV + LL-37 Research Blend | $159.00 | $286.20 | $400.00 | $389.99 | not public |
| PEP-005 | CJC-1295 + Ipamorelin Research Blend | $55.00 | $99.00 | $140.00 | $159.99 | not public |
| PEP-006 | PT-141 Research Material | $38.00 | $68.40 | $100.00 | $119.99 | not public |
| PEP-007 | Tesamorelin Research Material | $79.00 | $142.20 | $200.00 | $209.99 | $149.99 |
| PEP-008 | Gonadorelin Research Material | $43.00 | $77.40 | $110.00 | $129.99 | not public |
| PEP-009 | NAD+ Research Material | $55.00 | $99.00 | $140.00 | $159.99 | not public |
| PEP-010 | MOTS-C Research Material | $47.00 | $84.60 | $120.00 | $139.99 | not public |
| PEP-011 | Epithalon Research Material | $45.00 | $81.00 | $115.00 | $129.99 | not public |
| PEP-012 | SS-31 Research Material | $89.00 | $160.20 | $225.00 | $229.99 | not public |
| PEP-013 | SLU-PP-332 Research Capsules | $99.00 | $178.20 | $250.00 | $259.99 | not public |
| PEP-014 | Dihexa Research Capsules | $119.00 | $214.20 | $300.00 | $299.99 | not public |
| PEP-015 | Semax + Selank + DSIP Research Blend | $99.00 | $178.20 | $250.00 | $259.99 | not public |

Notes on the arithmetic:

- Rule A divides evenly in integer cents for all fifteen values, so **no rounding
  is applied to any real price**. A test asserts that the numerator is divisible
  by ten in every case.
- Rule B's $99 floor binds on exactly one SKU. PEP-006 at $38.00 wholesale gives
  2.5x = $95.00, which the floor lifts to $99.00, which the $5 rounding lifts to
  $100.00.
- The two rules never agree on any of the fifteen. A test asserts that too, so
  neither can be quietly substituted for the other.

**The spread is the decision.** Rule A prices PEP-001 at $241.20 and Rule B at
$335.00, a difference of $93.80 on one vial. Meanwhile the signed supplier master
states a member price of $89.99 for the same item, which is below our own
wholesale cost of $134.00. Those two facts cannot both describe the same product,
and reconciling them is a founder and counsel question, not an engineering one.

Every price record carries `status: "draft_pending_formula_confirmation"` and
`effectiveDate: null`. A test asserts this on all seventy variants.

## 4. The COA gate and why nothing is directly purchasable

No certificate of analysis file exists in this repository for any SKU in this
catalog. This is not an assumption. `SUPPLIER_ATTACHMENT_VERIFICATION_REPORT.md`
records 65 attachments referenced in the signed package and **0 files found on
disk**, with every referenced document marked `referenced_not_found`.

So every product carries `coaStatus: "PENDING_LAB_DOCUMENTATION"`, and the gate
`coaGateAllowsDirectPurchase` returns true only for `VERIFIED_FILE_PRESENT`.

The rule is keyed to the presence of a document, not to an opinion. **A founder
decision on its own cannot open it.** That is deliberate: an approval can be given
under time pressure, a file either exists or does not.

While the gate is closed, availability comes from the regulatory status on
record:

| Regulatory status | Availability | SKUs |
| --- | --- | --- |
| Category 1 | `APPROVAL_REQUIRED_PURCHASE` | PEP-001 to PEP-009, PEP-012 to PEP-014 |
| PCAC review | `REQUEST_ACCESS_ONLY` | PEP-010, PEP-011, PEP-015 |

A second, independent gate governs cost: **a variant with no sourced wholesale
cost resolves to `REQUEST_ACCESS_ONLY` and can never reach a purchase mode**, so
a harvested size can never be sold at a guessed number. Fifty five of the seventy
variants are in that state today.

Both rules live in one function, `resolveVariantAvailability`. Flipping either is
a one-place change that a reviewer can see in a diff.

## 5. Tier 1: the workbook, and its three differentiated blends

Fifteen products, twenty one variants. The primary variant of each is the
workbook's exact presentation and is the only one with an authoritative cost.

**Three Tier 1 SKUs have no equivalent anywhere in the market reference catalog.
This is a genuine competitive asset and is worth stating plainly.**

| SKU | Product | Why it is unmatched |
| --- | --- | --- |
| PEP-004 | Thymosin Alpha-1 + KPV + LL-37 Research Blend | LL-37 appears nowhere in the reference catalog. The market carries Thymosin Alpha-1 and KPV only as standalones, so this three-way immune blend cannot be bought elsewhere in one vial. |
| PEP-008 | Gonadorelin Research Material | Gonadorelin is absent from the reference catalog entirely. The nearest listings are different molecules. |
| PEP-015 | Semax + Selank + DSIP Research Blend | The market blend is Semax and Selank only. The DSIP component makes ours a different formulation, which is why the market blend is carried separately as PEX-026 rather than treated as the same product. |

Twelve of the fifteen have a strength that the signed supplier master disputes.
Both values are recorded on the variant, neither overwrites the other, and no
label goes to print for a disputed SKU until the founder settles it. See section
6 of the label system doc for the per-SKU print blockers.

## 6. Tier 2: expansion

Twenty seven products, thirty three variants, all from the public market
reference harvest of 2026-07-29 (43 compounds, 69 size variants, complete
coverage). Two groups:

- **Standalone components of blends we already sell** (9 products): BPC-157,
  TB-500, GHK-Cu, KPV, Semax, Selank, DSIP, Thymosin Alpha-1, Ipamorelin. We
  already ship every one of these inside a blend, so selling them individually
  adds range without adding a new supply relationship.
- **Net-new compounds** (18 products): 5-Amino-1MQ, Adamax, AOD-9604, CJC-1295
  with DAC, Follistatin, Glutathione, HCG, IGF-1 LR3, Kisspeptin-10, L-Carnitine,
  LIPO-C, Melanotan I, Melanotan II, Sermorelin, Thymalin, VIP, the Semax and
  Selank blend, and the Tesamorelin and ipamorelin blend.

Every Tier 2 variant carries no cost basis, so all are `REQUEST_ACCESS_ONLY`,
readiness `NEEDS_INTERNAL_DOCS`, `coaStatus PENDING_LAB_DOCUMENTATION`, and all
price fields null.

`marketReferencePriceCents` records what the market lists each size at. **It is
an internal number and is a competitor's shelf price, not our price and not a
cost.** It exists so the founder can set cost-based pricing against a real
reference point. It is excluded from the customer projection in code, and a test
asserts that no field ending in `Cents` survives `customerCatalogProjection()`.

Excluded from this catalog entirely: Bacteriostatic Water (USP Grade) and
anything the harvest tagged `lab_supply`. A test asserts neither string appears
anywhere in the catalog data. Lab supplies are a real operational need but they
are not peptides and do not belong in this data layer.

Only factual data was taken from the harvest: names, sizes, formats, and listed
prices. **No third-party prose entered any file.** A test asserts that no copy
string appears verbatim in the catalog data, and all customer-facing copy in
`peptide-copy.ts` was written for xenios.

## 7. Tier 3: regulatory hold

Three products, sixteen variants: semaglutide, tirzepatide, retatrutide.

They are recorded as data rather than dropped, so the decision is explicit and
the compounds are not quietly forgotten when someone asks why the catalog has no
GLP class. They are held with:

- `availability: "UNAVAILABLE"` on every variant
- `readinessStatus: "NEEDS_FINAL_APPROVAL"`
- a required, non-empty `holdReason`
- no customer-facing copy of any kind

**The hold is absolute in code.** `resolveVariantAvailability` returns
`UNAVAILABLE` for the tier before it looks at anything else, and
`toCustomerProductProjection` returns `null` for a held product, so a surface
cannot render one by forgetting to filter. Tests assert both across every
combination of COA status, cost basis, and regulatory note.

The rationale, in plain terms: semaglutide and tirzepatide are approved drug
molecules, and retatrutide is in active clinical development and is not an
approved medicine. Offering any of them through a research channel carries
elevated regulatory exposure and elevated payment-processor exposure. Payment
processors in particular treat the GLP class as a high-risk category, and a
single processor action affects the whole storefront, not just those three SKUs.

**Nothing here says these cannot be sold. It says an engineer may not be the one
who decides.** The unlock is an explicit founder decision plus counsel review.

## 8. De-duplication decisions

Two items on the expansion list would have created a second product record for
something we already carry. Creating two records for one physical vial, with
different availability states, would be a data-integrity bug. Both were folded
into the existing product instead, and both decisions are called out here because
they differ from a literal reading of the expansion list.

| Item | What was done | Why |
| --- | --- | --- |
| GLOW (BPC-157/TB-500/GHK-Cu), market 70 mg | Recorded as a `nameAlias` on PEP-002 and as that variant's `marketReferencePriceCents` ($134.99). No separate product. | PEP-002 is 10 mg / 10 mg / 50 mg, which is 70 mg total of the same three components. GLOW is the market's name for the same composition, not a new product. |
| Epitalon, market 100 mg | Added as a second VARIANT of PEP-011 (`R360-EPITHALON-100MG-VIAL`), not a new product. | PEP-011 is the same compound under the canonical spelling selected in `SUPPLIER_FACT_RECONCILIATION_FINAL.md`. Epitalon is retained as a searchable alias and the legacy slug still resolves. |

If Samuel wants either presented as its own storefront product rather than an
alias or a size, that is a one-line change, but it should be a deliberate one.

## 9. Which market sizes were added, and which were not

The rule applied, stated so it is reviewable: **a market size becomes an
additional Tier 1 variant only when it is unambiguously a different presentation
of the same compound in the same format.** A market listing that merely restates
our presentation as a total, or that uses a different format, is recorded as a
note or an alias rather than duplicated as a second SKU for the same physical
container.

Six sizes were added to Tier 1:

| Product | Added size | Market reference |
| --- | --- | --- |
| PEP-005 CJC-1295 + Ipamorelin | 20 mg total | $159.99 |
| PEP-007 Tesamorelin | 20 mg | $124.99 |
| PEP-009 NAD+ | 1000 mg | $129.99 |
| PEP-010 MOTS-C | 40 mg | $129.99 |
| PEP-011 Epithalon | 100 mg | $87.99 |
| PEP-012 SS-31 | 50 mg | $159.99 |

Eleven market sizes were deliberately not added, each with its reason:

| Market listing | Reason not added |
| --- | --- |
| BPC-157/TB-500 20 mg | Single-size blend listing at a total that differs from our 15 mg / 15 mg. Cannot distinguish a different presentation from a different way of expressing one. |
| GLOW 70 mg | Same composition and same total as PEP-002. Recorded as an alias. |
| KLOW 80 mg | Matches the strength the signed supplier master states for PEP-003, which is itself an unresolved conflict. Adding it would create a second SKU for what may be the same vial. |
| CJC-1295/Ipamorelin 10 mg | Equals our 5 mg / 5 mg presentation. Recorded as the primary variant's market reference price. |
| PT-141 10 mg | Equals our presentation. Recorded as a market reference price. |
| Tesamorelin 10 mg | Equals our presentation. Recorded as a market reference price. |
| NAD+ 500 mg | Equals our presentation. Recorded as a market reference price. |
| MOTS-C 10 mg | Equals our presentation. Recorded as a market reference price. |
| SS-31 10 mg | Equals our presentation. Recorded as a market reference price. |
| SLU-PP-332 10 mg | The market sells a vial. We sell a capsule bottle. Different format, so it is not a size of our product. |
| Dihexa 10 mg | The market sells a vial. We sell a capsule bottle. Different format, so it is not a size of our product. |

The arithmetic closes exactly: 43 harvested compounds, minus 1 lab supply, minus
12 that map onto existing Tier 1 products, minus 3 held on regulatory grounds,
leaves 27 expansion products.

**A format observation worth a decision.** The market sells both SLU-PP-332 and
Dihexa as vials. We sell both as capsule bottles. Oral capsules are the reason
those two SKUs exist in our range at all, so the divergence is probably
intentional, but it is worth confirming that we are not the only ones selling
them orally for a reason.

## 10. Other recorded discrepancies

- **The legacy route slug for Epithalon.** The canonical spelling selected in
  `SUPPLIER_FACT_RECONCILIATION_FINAL.md` is Epithalon, but the live catalog
  routes on `epitalon-10mg`. The new record uses `epithalon-10mg` as its slug and
  keeps `epitalon-10mg` as `legacyCatalogSlug`, so both resolve. **A route alias
  is required at wiring time** or existing links will 404.
- **Core Aminos (BCAA)** appears in the Pairing Map's supplement column for the
  performance protocol but is not in the NutriDyn Top 20 sheet. It is recorded as
  a paired supplement name because the source says so, but it may not be a SKU we
  can actually pair.
- **Rejuvenate+ naming.** The NutriDyn sheet calls it "Rejuvenate+", the Pairing
  Map calls it "Beauty Essentials Rejuvenate+". Paired supplement names come from
  the Pairing Map, so the longer form is recorded.
- **A directory and a module now share a name.** `shared/research/catalog.ts` (the
  existing lane contract) and `shared/research/catalog/` (this lane) coexist. This
  resolves correctly under the repository's `bundler` module resolution and the
  typecheck is clean, but it is worth knowing before someone tries to move either.

## 11. Vocabulary extensions and why they exist

The product class union was extended beyond the drafted vocabulary for one
reason: **several items in this catalog are not peptides, and filing them under a
`*_peptide` class would put a false chemical statement in the data layer.**

| Added member | Used for | Why the alternative was wrong |
| --- | --- | --- |
| `mitochondrial_cofactor` | NAD+, Glutathione | NAD+ is a dinucleotide coenzyme, not a peptide. |
| `metabolic_cofactor` | L-Carnitine, LIPO-C, 5-Amino-1MQ | L-Carnitine is a quaternary ammonium compound. 5-Amino-1MQ is a small molecule. |
| `immune_peptide` | KPV, Thymosin Alpha-1, Thymalin, VIP | No immune class existed, and forcing these into repair or longevity would misdescribe them. |
| `melanocortin_peptide` | Melanotan I, Melanotan II | Same reason. |
| `hormone_analogue` | HCG, Kisspeptin-10 | HCG is a glycoprotein hormone, not a peptide in the sense the other classes use. |

A readiness value was also added, `NEEDS_INTERNAL_DOCS`, for the expansion tier,
which needs internal documentation before it needs a COA.

The class is a merchandising bucket and `canonicalName` carries the chemistry, so
the class is never a chemical claim. That is stated in the module header too.

## 12. What unlocks each tier

### Tier 1, from approval-required to sellable

Three independent things, all required:

1. **One pricing formula, confirmed.** Pick Rule A or Rule B, or supply a third.
   This unblocks all fifteen at once and takes every price record out of draft.
2. **A COA file per SKU, actually delivered.** Not a reference in a signed PDF, an
   actual file bound to the SKU and lot. This is the only thing that moves
   `coaStatus` to `VERIFIED_FILE_PRESENT` and the only thing that enables
   `DIRECT_PRIVATE_PURCHASE`.
3. **The twelve disputed strengths, settled.** Workbook value or signed supplier
   value, per SKU. This is a print blocker for labels and a truthfulness blocker
   for the product page.

Partial unlocks are real. Settling the formula alone gives every SKU a
displayable price under approval-required purchase. Delivering COAs alone moves
nothing until a price exists.

### Tier 1, the six harvested sizes

A sourced wholesale cost for each. Until then they stay request access only,
which is the honest state: we can offer to source the size, we cannot quote it.

### Tier 2, from request-access to a live range

1. A supply decision: which of the twenty seven we actually want to carry.
2. A wholesale cost for each chosen size. This is the gating item, because with
   no cost there is no price and no purchase mode.
3. Internal documentation per compound, which is what `NEEDS_INTERNAL_DOCS`
   tracks, then the same COA requirement as Tier 1.
4. Customer-facing copy, which this lane deliberately did not write for compounds
   we do not carry.

The three standalone components with the clearest case are BPC-157, TB-500, and
GHK-Cu, because we already source all three inside PEP-002 and PEP-003.

### Tier 3, from hold to a decision

An explicit founder decision plus counsel review, covering at minimum: the
regulatory position for research-channel sale of an approved drug molecule, the
payment-processor exposure and whether a separate processor or entity is needed,
and the position on retatrutide specifically, which is not an approved medicine
at all.

Until then the code holds them, and that is the intended behavior rather than an
oversight.
