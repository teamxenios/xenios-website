---
title: Peptide Vial Label System
lane: XCA-W15-PEPTIDE-CATALOG
status: DRAFT_AWAITING_FOUNDER_CONFIRMATION
data_source: shared/research/catalog/peptide-catalog.ts
last_updated: 2026-07-29
---

# Peptide label system

The vial and bottle label system for the private peptide catalog, in the Renew 360
visual language. Every product name, compound name, strength, package designation,
and SKU in this document is generated from `shared/research/catalog/peptide-catalog.ts`,
so a label can never state something the data layer does not.

## Contents

1. [What this document is](#1-what-this-document-is)
2. [Truthfulness rules that bind every label](#2-truthfulness-rules-that-bind-every-label)
3. [The design system](#3-the-design-system)
4. [The field layout](#4-the-field-layout)
5. [Asset naming convention](#5-asset-naming-convention)
6. [Tier 1 label specifications](#6-tier-1-label-specifications)
   - [PEP-001 BPC-157 + TB-500 Research Blend](#pep-001-bpc-157--tb-500-research-blend)
   - [PEP-002 BPC-157 + TB-500 + GHK-Cu Research Blend](#pep-002-bpc-157--tb-500--ghk-cu-research-blend)
   - [PEP-003 KLOW Research Blend](#pep-003-klow-research-blend)
   - [PEP-004 Thymosin Alpha-1 + KPV + LL-37 Research Blend](#pep-004-thymosin-alpha-1--kpv--ll-37-research-blend)
   - [PEP-005 CJC-1295 + Ipamorelin Research Blend](#pep-005-cjc-1295--ipamorelin-research-blend)
   - [PEP-006 PT-141 Research Material](#pep-006-pt-141-research-material)
   - [PEP-007 Tesamorelin Research Material](#pep-007-tesamorelin-research-material)
   - [PEP-008 Gonadorelin Research Material](#pep-008-gonadorelin-research-material)
   - [PEP-009 NAD+ Research Material](#pep-009-nad-research-material)
   - [PEP-010 MOTS-C Research Material](#pep-010-mots-c-research-material)
   - [PEP-011 Epithalon Research Material](#pep-011-epithalon-research-material)
   - [PEP-012 SS-31 Research Material](#pep-012-ss-31-research-material)
   - [PEP-013 SLU-PP-332 Research Capsules](#pep-013-slu-pp-332-research-capsules)
   - [PEP-014 Dihexa Research Capsules](#pep-014-dihexa-research-capsules)
   - [PEP-015 Semax + Selank + DSIP Research Blend](#pep-015-semax--selank--dsip-research-blend)
7. [Asset manifest](#7-asset-manifest)
8. [Export list](#8-export-list)
9. [What is deliberately not specified yet](#9-what-is-deliberately-not-specified-yet)

## 1. What this document is

A production specification. It gives a designer or an image model everything
needed to draw one label, and it gives operations a manifest to check deliveries
against.

It covers the whole catalog in the manifest, but it specifies individual labels
only for the Tier 1 workbook variants, which are the only presentations with an
authoritative cost basis and therefore the only ones that could be sold. Tier 2
and Tier 3 appear in the manifest with a reserved filename and no spec. Their
specs are generated once a founder decision and a cost basis exist, which is the
same gate that governs the catalog itself.

## 2. Truthfulness rules that bind every label

These are not style preferences. A label is the most durable customer-facing
surface we produce, and a wrong line on a vial cannot be edited after it ships.

1. **Lot and expiry are placeholder tokens.** Every spec below prints `{{LOT}}`
   and `{{EXP}}`. No artwork carries an invented lot number or date. The tokens
   are replaced at fill time from the real record, or the label does not print.
2. **No purity, sterility, endotoxin, or COA statement appears on any label.** No
   certificate of analysis file exists for any SKU in this catalog (see
   `SUPPLIER_ATTACHMENT_VERIFICATION_REPORT.md`, 65 attachments referenced, 0
   files found). A label may not assert what no document establishes.
3. **No storage condition is printed.** No supplier document establishes a
   temperature, light condition, or shelf life for these items. The label points
   to the accompanying documentation instead of inventing a number.
4. **No claim of effect, no indication, no dosing.** The label states what is in
   the container and nothing about what it does.
5. **The research notation is a restriction, never a benefit device.** The exact
   line is the one already used on the product surfaces in this repository:
   "Research use only. Not for human or veterinary use." Per
   `docs/research-content/GUIDE_CONTENT_SCHEMA.md` section 2.6, that phrase may
   never be used to imply human benefit, and on a label it functions only as a
   restriction.
6. **The strength printed is the strength in the data layer.** Twelve of the
   fifteen workbook SKUs have a strength the signed supplier master disputes.
   Those disputes are recorded on the variant and are unresolved. No label goes
   to print for a disputed SKU until the founder settles the value, which is
   listed as a per-SKU blocker below.

## 3. The design system

### 3.1 Palette

The repository holds no Renew 360 color tokens today. The only Renew 360
reference in code is the catalog eyebrow label in
`client/src/research/products-diagnostics/ProductCatalogExperience.tsx`. The hex
values below are therefore a **proposal for the founder to confirm**, not a
recorded brand fact. Once confirmed they belong in a token file, and this table
becomes a pointer to it.

| Token | Proposed value | Use |
| --- | --- | --- |
| `--r360-navy` | `#0B1B2B` | Brand bar field, primary dark ground |
| `--r360-ink` | `#0A0A0A` | Body text on white |
| `--r360-paper` | `#FFFFFF` | Label ground, reversed type on navy |
| `--r360-accent` | `#2E6BE6` | The accent arc, and nothing else |
| `--r360-rule` | `#C8CFD6` | Hairlines between zones |

Four colors, one accent. The accent is reserved for the arc so it stays a mark
rather than decoration. Nothing on a label is colored to signal quality, grade,
or approval, because no such status exists yet.

### 3.2 Type scale

One family, weights only. The scale is set for a small label read at arm's
length, so the strength is the largest element after the wordmark.

| Role | Size | Weight | Tracking | Case |
| --- | --- | --- | --- | --- |
| Wordmark | 9 pt | 600 | +0.14 em | Upper |
| Catalog mark | 5 pt | 500 | +0.20 em | Upper |
| Product name | 8 pt | 600 | -0.01 em | Title |
| Compound name | 6 pt | 400 | 0 | Sentence |
| Strength | 12 pt | 600 | -0.02 em | As recorded |
| Package designation | 6 pt | 500 | 0 | Sentence |
| Meta (SKU, lot, expiry) | 5 pt | 500 | +0.04 em | Upper |
| Compliance | 4.5 pt | 400 | +0.02 em | Sentence |

Minimum printed size is 4.5 pt, which is why the export list requires a 600 ppi
proof: the compliance block is the first thing that fails on a cheap print run.

### 3.3 Grid and zones

A vial label is a 12-column grid on a 60 mm x 30 mm face, 3 mm gutters, 3 mm safe
margin on every edge. A capsule bottle label uses the same grid on a 100 mm x
50 mm face. Three horizontal zones, in this order, top to bottom:

```
+------------------------------------------------------------+
| ZONE A  brand bar        navy field, reversed type    6 mm  |
|   XENIOS                                   RENEW 360        |
+------------------------------------------------------------+
| ZONE B  identity         white ground               17 mm   |
|   Product name                                              |
|   Compound name                                             |
|                                                             |
|   STRENGTH                       ( accent arc, right )      |
|   Package designation                                       |
+------------------------------------------------------------+
| ZONE C  compliance       white ground, hairline top  7 mm   |
|   SKU . LOT {{LOT}} . EXP {{EXP}}                           |
|   Storage and handling: see accompanying documentation.     |
|   Research use only. Not for human or veterinary use.       |
|   Private catalog. Access by approval.                      |
+------------------------------------------------------------+
```

The hierarchy is deliberately clinical: brand, then what it is, then what the law
and the record require. Nothing persuasive appears on a label.

### 3.4 The accent arc

A single 2 pt stroke in `--r360-accent`, drawn as a 90 degree arc with its center
off the right edge of the label, sweeping from the baseline of the strength up
past the top of Zone B. It is clipped by the label edge, so it reads as part of a
larger circle continuing around the vial. It never crosses type, never carries a
gradient, and never appears more than once per face.

## 4. The field layout

Every label carries exactly these eleven lines, in this order. A field with no
value is not printed blank, the label is held.

| # | Zone | Field | Source | Notes |
| --- | --- | --- | --- | --- |
| 1 | A | Brand wordmark | Fixed | `XENIOS`, upper, left aligned |
| 2 | A | Catalog mark | Fixed | `RENEW 360`, upper, right aligned |
| 3 | B | Product name | `displayName` | Title case, as recorded |
| 4 | B | Compound name | `canonicalName` | The chemically exact name |
| 5 | B | Strength | `variant.strength` | Verbatim, never reformatted |
| 6 | B | Package designation | `variant.format` and `capsuleCount` | |
| 7 | C | Internal SKU | `variant.sku` | Verbatim |
| 8 | C | Lot | Placeholder | `LOT {{LOT}}`, replaced at fill |
| 9 | C | Expiry | Placeholder | `EXP {{EXP}}`, replaced at fill |
| 10 | C | Storage pointer | Fixed | No condition is stated on the label |
| 11 | C | Research and access notation | Fixed | Two lines, verbatim below |

The two fixed compliance lines, verbatim:

```
Research use only. Not for human or veterinary use.
Private catalog. Access by approval.
```

## 5. Asset naming convention

One label asset per VARIANT, not per product, because the strength is printed on
the container. The filename is derived from the SKU so it is machine checkable:

```
r360-label-<sku lowercased, R360- prefix dropped, underscores to hyphens>-v1.<ext>
```

Worked example:

```
SKU       R360-BPC157_TB500-15MG_15MG-VIAL
Asset     r360-label-bpc157-tb500-15mg-15mg-vial-v1.svg
```

Version suffix increments on any artwork change (`-v2`, `-v3`). A strength or
format change is a NEW SKU and therefore a new asset, never a new version of the
old one.

## 6. Tier 1 label specifications

Twenty one specs, one per Tier 1 variant. Presentations without a sourced cost
basis are marked, because artwork should not be commissioned for a size we cannot
yet buy.

### PEP-001 BPC-157 + TB-500 Research Blend

- Compound: `BPC-157 (pentadecapeptide BPC-157) and TB-500 (thymosin beta-4 fragment)`
- Regulatory status on record: Category 1 (both components)
- Variants: 1

#### R360-BPC157_TB500-15MG_15MG-VIAL

Print blockers: strength disputed by the signed supplier master, which states `5 mg BPC-157 / 5 mg TB-500 (10 mg total)`; no COA file on record for this SKU.

Exact label copy, in layout order:

| # | Zone | Line |
| --- | --- | --- |
| 1 | A | `XENIOS` |
| 2 | A | `RENEW 360` |
| 3 | B | `BPC-157 + TB-500 Research Blend` |
| 4 | B | `BPC-157 (pentadecapeptide BPC-157) and TB-500 (thymosin beta-4 fragment)` |
| 5 | B | `15 mg / 15 mg` |
| 6 | B | `Single vial` |
| 7 | C | `R360-BPC157_TB500-15MG_15MG-VIAL` |
| 8 | C | `LOT {{LOT}}` |
| 9 | C | `EXP {{EXP}}` |
| 10 | C | `Storage and handling: see accompanying documentation.` |
| 11 | C | `Research use only. Not for human or veterinary use.` |
| 12 | C | `Private catalog. Access by approval.` |

Asset: `r360-label-bpc157-tb500-15mg-15mg-vial-v1.svg`

Rendering prompt:

```
A flat, front-facing pharmaceutical label design for a lyophilized powder vial, 60 mm by 30 mm,
rendered as clean vector artwork on a white ground. No photography, no
product mockup, no drop shadow, no gloss, no 3D.

Top band, 6 mm tall, solid deep navy #0B1B2B, type reversed to white: the
wordmark XENIOS at 9 pt semibold with wide letter spacing on the left, and
RENEW 360 at 5 pt medium with wider letter spacing on the right.

Middle block on white, left aligned, generous space: the product name
"BPC-157 + TB-500 Research Blend" at 8 pt semibold in near black #0A0A0A;
directly beneath it the compound name "BPC-157 (pentadecapeptide BPC-157) and TB-500 (thymosin beta-4 fragment)"
at 6 pt regular; then the strength "15 mg / 15 mg" set large at 12 pt
semibold as the dominant element; then "Single vial" at 6 pt medium.

A single 2 pt arc in blue #2E6BE6 sweeps from the strength baseline up and
off the right edge of the label, clipped by the edge so it reads as part of
a larger circle wrapping the container. It touches no type.

Bottom block, separated by a 0.5 pt hairline in #C8CFD6, set at 5 pt and
4.5 pt: the line "R360-BPC157_TB500-15MG_15MG-VIAL" then
"LOT {{LOT}}   EXP {{EXP}}" with the braces shown literally as unfilled
placeholders, then three small lines of compliance text reading exactly
"Storage and handling: see accompanying documentation.",
"Research use only. Not for human or veterinary use.", and
"Private catalog. Access by approval."

Calm, clinical, premium. No icons, no badges, no seals, no purity or
quality marks, no invented lot or expiry values, no additional text of any
kind beyond the lines listed above.
```

### PEP-002 BPC-157 + TB-500 + GHK-Cu Research Blend

- Compound: `BPC-157, TB-500 (thymosin beta-4 fragment), and GHK-Cu (copper tripeptide-1)`
- Regulatory status on record: All components Category 1
- Variants: 1

#### R360-BPC157_TB500_GHKCU-10MG_10MG_50MG-VIAL

Print blockers: strength disputed by the signed supplier master, which states `GHK-Cu 50 mg / BPC-157 10 mg / TB-500 10 mg (70 mg total)`; no COA file on record for this SKU.

Exact label copy, in layout order:

| # | Zone | Line |
| --- | --- | --- |
| 1 | A | `XENIOS` |
| 2 | A | `RENEW 360` |
| 3 | B | `BPC-157 + TB-500 + GHK-Cu Research Blend` |
| 4 | B | `BPC-157, TB-500 (thymosin beta-4 fragment), and GHK-Cu (copper tripeptide-1)` |
| 5 | B | `10 mg / 10 mg / 50 mg` |
| 6 | B | `Single vial` |
| 7 | C | `R360-BPC157_TB500_GHKCU-10MG_10MG_50MG-VIAL` |
| 8 | C | `LOT {{LOT}}` |
| 9 | C | `EXP {{EXP}}` |
| 10 | C | `Storage and handling: see accompanying documentation.` |
| 11 | C | `Research use only. Not for human or veterinary use.` |
| 12 | C | `Private catalog. Access by approval.` |

Asset: `r360-label-bpc157-tb500-ghkcu-10mg-10mg-50mg-vial-v1.svg`

Rendering prompt:

```
A flat, front-facing pharmaceutical label design for a lyophilized powder vial, 60 mm by 30 mm,
rendered as clean vector artwork on a white ground. No photography, no
product mockup, no drop shadow, no gloss, no 3D.

Top band, 6 mm tall, solid deep navy #0B1B2B, type reversed to white: the
wordmark XENIOS at 9 pt semibold with wide letter spacing on the left, and
RENEW 360 at 5 pt medium with wider letter spacing on the right.

Middle block on white, left aligned, generous space: the product name
"BPC-157 + TB-500 + GHK-Cu Research Blend" at 8 pt semibold in near black #0A0A0A;
directly beneath it the compound name "BPC-157, TB-500 (thymosin beta-4 fragment), and GHK-Cu (copper tripeptide-1)"
at 6 pt regular; then the strength "10 mg / 10 mg / 50 mg" set large at 12 pt
semibold as the dominant element; then "Single vial" at 6 pt medium.

A single 2 pt arc in blue #2E6BE6 sweeps from the strength baseline up and
off the right edge of the label, clipped by the edge so it reads as part of
a larger circle wrapping the container. It touches no type.

Bottom block, separated by a 0.5 pt hairline in #C8CFD6, set at 5 pt and
4.5 pt: the line "R360-BPC157_TB500_GHKCU-10MG_10MG_50MG-VIAL" then
"LOT {{LOT}}   EXP {{EXP}}" with the braces shown literally as unfilled
placeholders, then three small lines of compliance text reading exactly
"Storage and handling: see accompanying documentation.",
"Research use only. Not for human or veterinary use.", and
"Private catalog. Access by approval."

Calm, clinical, premium. No icons, no badges, no seals, no purity or
quality marks, no invented lot or expiry values, no additional text of any
kind beyond the lines listed above.
```

### PEP-003 KLOW Research Blend

- Compound: `TB-500 (thymosin beta-4 fragment), BPC-157, GHK-Cu (copper tripeptide-1), and KPV (lysine-proline-valine)`
- Regulatory status on record: All components Category 1
- Variants: 1

#### R360-TB500_BPC157_GHKCU_KPV-5MG_5MG_10MG_5MG-VIAL

Print blockers: strength disputed by the signed supplier master, which states `GHK-Cu 50 mg / BPC-157 10 mg / TB-500 10 mg / KPV 10 mg (80 mg total)`; no COA file on record for this SKU.

Exact label copy, in layout order:

| # | Zone | Line |
| --- | --- | --- |
| 1 | A | `XENIOS` |
| 2 | A | `RENEW 360` |
| 3 | B | `KLOW Research Blend` |
| 4 | B | `TB-500 (thymosin beta-4 fragment), BPC-157, GHK-Cu (copper tripeptide-1), and KPV (lysine-proline-valine)` |
| 5 | B | `5 mg / 5 mg / 10 mg / 5 mg` |
| 6 | B | `Single vial` |
| 7 | C | `R360-TB500_BPC157_GHKCU_KPV-5MG_5MG_10MG_5MG-VIAL` |
| 8 | C | `LOT {{LOT}}` |
| 9 | C | `EXP {{EXP}}` |
| 10 | C | `Storage and handling: see accompanying documentation.` |
| 11 | C | `Research use only. Not for human or veterinary use.` |
| 12 | C | `Private catalog. Access by approval.` |

Asset: `r360-label-tb500-bpc157-ghkcu-kpv-5mg-5mg-10mg-5mg-vial-v1.svg`

Rendering prompt:

```
A flat, front-facing pharmaceutical label design for a lyophilized powder vial, 60 mm by 30 mm,
rendered as clean vector artwork on a white ground. No photography, no
product mockup, no drop shadow, no gloss, no 3D.

Top band, 6 mm tall, solid deep navy #0B1B2B, type reversed to white: the
wordmark XENIOS at 9 pt semibold with wide letter spacing on the left, and
RENEW 360 at 5 pt medium with wider letter spacing on the right.

Middle block on white, left aligned, generous space: the product name
"KLOW Research Blend" at 8 pt semibold in near black #0A0A0A;
directly beneath it the compound name "TB-500 (thymosin beta-4 fragment), BPC-157, GHK-Cu (copper tripeptide-1), and KPV (lysine-proline-valine)"
at 6 pt regular; then the strength "5 mg / 5 mg / 10 mg / 5 mg" set large at 12 pt
semibold as the dominant element; then "Single vial" at 6 pt medium.

A single 2 pt arc in blue #2E6BE6 sweeps from the strength baseline up and
off the right edge of the label, clipped by the edge so it reads as part of
a larger circle wrapping the container. It touches no type.

Bottom block, separated by a 0.5 pt hairline in #C8CFD6, set at 5 pt and
4.5 pt: the line "R360-TB500_BPC157_GHKCU_KPV-5MG_5MG_10MG_5MG-VIAL" then
"LOT {{LOT}}   EXP {{EXP}}" with the braces shown literally as unfilled
placeholders, then three small lines of compliance text reading exactly
"Storage and handling: see accompanying documentation.",
"Research use only. Not for human or veterinary use.", and
"Private catalog. Access by approval."

Calm, clinical, premium. No icons, no badges, no seals, no purity or
quality marks, no invented lot or expiry values, no additional text of any
kind beyond the lines listed above.
```

### PEP-004 Thymosin Alpha-1 + KPV + LL-37 Research Blend

- Compound: `Thymosin alpha-1, KPV (lysine-proline-valine), and LL-37 (cathelicidin fragment)`
- Regulatory status on record: All components Category 1
- Variants: 1

#### R360-THYMOSINALPHA1_KPV_LL37-5MG_5MG_5MG-VIAL

Print blockers: no COA file on record for this SKU.

Exact label copy, in layout order:

| # | Zone | Line |
| --- | --- | --- |
| 1 | A | `XENIOS` |
| 2 | A | `RENEW 360` |
| 3 | B | `Thymosin Alpha-1 + KPV + LL-37 Research Blend` |
| 4 | B | `Thymosin alpha-1, KPV (lysine-proline-valine), and LL-37 (cathelicidin fragment)` |
| 5 | B | `5 mg / 5 mg / 5 mg` |
| 6 | B | `Single vial` |
| 7 | C | `R360-THYMOSINALPHA1_KPV_LL37-5MG_5MG_5MG-VIAL` |
| 8 | C | `LOT {{LOT}}` |
| 9 | C | `EXP {{EXP}}` |
| 10 | C | `Storage and handling: see accompanying documentation.` |
| 11 | C | `Research use only. Not for human or veterinary use.` |
| 12 | C | `Private catalog. Access by approval.` |

Asset: `r360-label-thymosinalpha1-kpv-ll37-5mg-5mg-5mg-vial-v1.svg`

Rendering prompt:

```
A flat, front-facing pharmaceutical label design for a lyophilized powder vial, 60 mm by 30 mm,
rendered as clean vector artwork on a white ground. No photography, no
product mockup, no drop shadow, no gloss, no 3D.

Top band, 6 mm tall, solid deep navy #0B1B2B, type reversed to white: the
wordmark XENIOS at 9 pt semibold with wide letter spacing on the left, and
RENEW 360 at 5 pt medium with wider letter spacing on the right.

Middle block on white, left aligned, generous space: the product name
"Thymosin Alpha-1 + KPV + LL-37 Research Blend" at 8 pt semibold in near black #0A0A0A;
directly beneath it the compound name "Thymosin alpha-1, KPV (lysine-proline-valine), and LL-37 (cathelicidin fragment)"
at 6 pt regular; then the strength "5 mg / 5 mg / 5 mg" set large at 12 pt
semibold as the dominant element; then "Single vial" at 6 pt medium.

A single 2 pt arc in blue #2E6BE6 sweeps from the strength baseline up and
off the right edge of the label, clipped by the edge so it reads as part of
a larger circle wrapping the container. It touches no type.

Bottom block, separated by a 0.5 pt hairline in #C8CFD6, set at 5 pt and
4.5 pt: the line "R360-THYMOSINALPHA1_KPV_LL37-5MG_5MG_5MG-VIAL" then
"LOT {{LOT}}   EXP {{EXP}}" with the braces shown literally as unfilled
placeholders, then three small lines of compliance text reading exactly
"Storage and handling: see accompanying documentation.",
"Research use only. Not for human or veterinary use.", and
"Private catalog. Access by approval."

Calm, clinical, premium. No icons, no badges, no seals, no purity or
quality marks, no invented lot or expiry values, no additional text of any
kind beyond the lines listed above.
```

### PEP-005 CJC-1295 + Ipamorelin Research Blend

- Compound: `CJC-1295 and ipamorelin`
- Regulatory status on record: Category 1
- Variants: 2

#### R360-CJC1295_IPAMORELIN-5MG_5MG-VIAL

Print blockers: no COA file on record for this SKU.

Exact label copy, in layout order:

| # | Zone | Line |
| --- | --- | --- |
| 1 | A | `XENIOS` |
| 2 | A | `RENEW 360` |
| 3 | B | `CJC-1295 + Ipamorelin Research Blend` |
| 4 | B | `CJC-1295 and ipamorelin` |
| 5 | B | `5 mg / 5 mg` |
| 6 | B | `Single vial` |
| 7 | C | `R360-CJC1295_IPAMORELIN-5MG_5MG-VIAL` |
| 8 | C | `LOT {{LOT}}` |
| 9 | C | `EXP {{EXP}}` |
| 10 | C | `Storage and handling: see accompanying documentation.` |
| 11 | C | `Research use only. Not for human or veterinary use.` |
| 12 | C | `Private catalog. Access by approval.` |

Asset: `r360-label-cjc1295-ipamorelin-5mg-5mg-vial-v1.svg`

Rendering prompt:

```
A flat, front-facing pharmaceutical label design for a lyophilized powder vial, 60 mm by 30 mm,
rendered as clean vector artwork on a white ground. No photography, no
product mockup, no drop shadow, no gloss, no 3D.

Top band, 6 mm tall, solid deep navy #0B1B2B, type reversed to white: the
wordmark XENIOS at 9 pt semibold with wide letter spacing on the left, and
RENEW 360 at 5 pt medium with wider letter spacing on the right.

Middle block on white, left aligned, generous space: the product name
"CJC-1295 + Ipamorelin Research Blend" at 8 pt semibold in near black #0A0A0A;
directly beneath it the compound name "CJC-1295 and ipamorelin"
at 6 pt regular; then the strength "5 mg / 5 mg" set large at 12 pt
semibold as the dominant element; then "Single vial" at 6 pt medium.

A single 2 pt arc in blue #2E6BE6 sweeps from the strength baseline up and
off the right edge of the label, clipped by the edge so it reads as part of
a larger circle wrapping the container. It touches no type.

Bottom block, separated by a 0.5 pt hairline in #C8CFD6, set at 5 pt and
4.5 pt: the line "R360-CJC1295_IPAMORELIN-5MG_5MG-VIAL" then
"LOT {{LOT}}   EXP {{EXP}}" with the braces shown literally as unfilled
placeholders, then three small lines of compliance text reading exactly
"Storage and handling: see accompanying documentation.",
"Research use only. Not for human or veterinary use.", and
"Private catalog. Access by approval."

Calm, clinical, premium. No icons, no badges, no seals, no purity or
quality marks, no invented lot or expiry values, no additional text of any
kind beyond the lines listed above.
```

#### R360-CJC1295_IPAMORELIN-20MG-VIAL

Print blockers: no sourced cost basis, so this size is request access only; no COA file on record for this SKU.

Exact label copy, in layout order:

| # | Zone | Line |
| --- | --- | --- |
| 1 | A | `XENIOS` |
| 2 | A | `RENEW 360` |
| 3 | B | `CJC-1295 + Ipamorelin Research Blend` |
| 4 | B | `CJC-1295 and ipamorelin` |
| 5 | B | `20 mg` |
| 6 | B | `Single vial` |
| 7 | C | `R360-CJC1295_IPAMORELIN-20MG-VIAL` |
| 8 | C | `LOT {{LOT}}` |
| 9 | C | `EXP {{EXP}}` |
| 10 | C | `Storage and handling: see accompanying documentation.` |
| 11 | C | `Research use only. Not for human or veterinary use.` |
| 12 | C | `Private catalog. Access by approval.` |

Asset: `r360-label-cjc1295-ipamorelin-20mg-vial-v1.svg`

Rendering prompt:

```
A flat, front-facing pharmaceutical label design for a lyophilized powder vial, 60 mm by 30 mm,
rendered as clean vector artwork on a white ground. No photography, no
product mockup, no drop shadow, no gloss, no 3D.

Top band, 6 mm tall, solid deep navy #0B1B2B, type reversed to white: the
wordmark XENIOS at 9 pt semibold with wide letter spacing on the left, and
RENEW 360 at 5 pt medium with wider letter spacing on the right.

Middle block on white, left aligned, generous space: the product name
"CJC-1295 + Ipamorelin Research Blend" at 8 pt semibold in near black #0A0A0A;
directly beneath it the compound name "CJC-1295 and ipamorelin"
at 6 pt regular; then the strength "20 mg" set large at 12 pt
semibold as the dominant element; then "Single vial" at 6 pt medium.

A single 2 pt arc in blue #2E6BE6 sweeps from the strength baseline up and
off the right edge of the label, clipped by the edge so it reads as part of
a larger circle wrapping the container. It touches no type.

Bottom block, separated by a 0.5 pt hairline in #C8CFD6, set at 5 pt and
4.5 pt: the line "R360-CJC1295_IPAMORELIN-20MG-VIAL" then
"LOT {{LOT}}   EXP {{EXP}}" with the braces shown literally as unfilled
placeholders, then three small lines of compliance text reading exactly
"Storage and handling: see accompanying documentation.",
"Research use only. Not for human or veterinary use.", and
"Private catalog. Access by approval."

Calm, clinical, premium. No icons, no badges, no seals, no purity or
quality marks, no invented lot or expiry values, no additional text of any
kind beyond the lines listed above.
```

### PEP-006 PT-141 Research Material

- Compound: `PT-141 (bremelanotide)`
- Regulatory status on record: Category 1
- Variants: 1

#### R360-PT141-10MG-VIAL

Print blockers: no COA file on record for this SKU.

Exact label copy, in layout order:

| # | Zone | Line |
| --- | --- | --- |
| 1 | A | `XENIOS` |
| 2 | A | `RENEW 360` |
| 3 | B | `PT-141 Research Material` |
| 4 | B | `PT-141 (bremelanotide)` |
| 5 | B | `10 mg` |
| 6 | B | `Single vial` |
| 7 | C | `R360-PT141-10MG-VIAL` |
| 8 | C | `LOT {{LOT}}` |
| 9 | C | `EXP {{EXP}}` |
| 10 | C | `Storage and handling: see accompanying documentation.` |
| 11 | C | `Research use only. Not for human or veterinary use.` |
| 12 | C | `Private catalog. Access by approval.` |

Asset: `r360-label-pt141-10mg-vial-v1.svg`

Rendering prompt:

```
A flat, front-facing pharmaceutical label design for a lyophilized powder vial, 60 mm by 30 mm,
rendered as clean vector artwork on a white ground. No photography, no
product mockup, no drop shadow, no gloss, no 3D.

Top band, 6 mm tall, solid deep navy #0B1B2B, type reversed to white: the
wordmark XENIOS at 9 pt semibold with wide letter spacing on the left, and
RENEW 360 at 5 pt medium with wider letter spacing on the right.

Middle block on white, left aligned, generous space: the product name
"PT-141 Research Material" at 8 pt semibold in near black #0A0A0A;
directly beneath it the compound name "PT-141 (bremelanotide)"
at 6 pt regular; then the strength "10 mg" set large at 12 pt
semibold as the dominant element; then "Single vial" at 6 pt medium.

A single 2 pt arc in blue #2E6BE6 sweeps from the strength baseline up and
off the right edge of the label, clipped by the edge so it reads as part of
a larger circle wrapping the container. It touches no type.

Bottom block, separated by a 0.5 pt hairline in #C8CFD6, set at 5 pt and
4.5 pt: the line "R360-PT141-10MG-VIAL" then
"LOT {{LOT}}   EXP {{EXP}}" with the braces shown literally as unfilled
placeholders, then three small lines of compliance text reading exactly
"Storage and handling: see accompanying documentation.",
"Research use only. Not for human or veterinary use.", and
"Private catalog. Access by approval."

Calm, clinical, premium. No icons, no badges, no seals, no purity or
quality marks, no invented lot or expiry values, no additional text of any
kind beyond the lines listed above.
```

### PEP-007 Tesamorelin Research Material

- Compound: `Tesamorelin`
- Regulatory status on record: Category 1 (FDA-approved molecule)
- Variants: 2

#### R360-TESAMORELIN-10MG-VIAL

Print blockers: strength disputed by the signed supplier master, which states `5 mg`; no COA file on record for this SKU.

Exact label copy, in layout order:

| # | Zone | Line |
| --- | --- | --- |
| 1 | A | `XENIOS` |
| 2 | A | `RENEW 360` |
| 3 | B | `Tesamorelin Research Material` |
| 4 | B | `Tesamorelin` |
| 5 | B | `10 mg` |
| 6 | B | `Single vial` |
| 7 | C | `R360-TESAMORELIN-10MG-VIAL` |
| 8 | C | `LOT {{LOT}}` |
| 9 | C | `EXP {{EXP}}` |
| 10 | C | `Storage and handling: see accompanying documentation.` |
| 11 | C | `Research use only. Not for human or veterinary use.` |
| 12 | C | `Private catalog. Access by approval.` |

Asset: `r360-label-tesamorelin-10mg-vial-v1.svg`

Rendering prompt:

```
A flat, front-facing pharmaceutical label design for a lyophilized powder vial, 60 mm by 30 mm,
rendered as clean vector artwork on a white ground. No photography, no
product mockup, no drop shadow, no gloss, no 3D.

Top band, 6 mm tall, solid deep navy #0B1B2B, type reversed to white: the
wordmark XENIOS at 9 pt semibold with wide letter spacing on the left, and
RENEW 360 at 5 pt medium with wider letter spacing on the right.

Middle block on white, left aligned, generous space: the product name
"Tesamorelin Research Material" at 8 pt semibold in near black #0A0A0A;
directly beneath it the compound name "Tesamorelin"
at 6 pt regular; then the strength "10 mg" set large at 12 pt
semibold as the dominant element; then "Single vial" at 6 pt medium.

A single 2 pt arc in blue #2E6BE6 sweeps from the strength baseline up and
off the right edge of the label, clipped by the edge so it reads as part of
a larger circle wrapping the container. It touches no type.

Bottom block, separated by a 0.5 pt hairline in #C8CFD6, set at 5 pt and
4.5 pt: the line "R360-TESAMORELIN-10MG-VIAL" then
"LOT {{LOT}}   EXP {{EXP}}" with the braces shown literally as unfilled
placeholders, then three small lines of compliance text reading exactly
"Storage and handling: see accompanying documentation.",
"Research use only. Not for human or veterinary use.", and
"Private catalog. Access by approval."

Calm, clinical, premium. No icons, no badges, no seals, no purity or
quality marks, no invented lot or expiry values, no additional text of any
kind beyond the lines listed above.
```

#### R360-TESAMORELIN-20MG-VIAL

Print blockers: no sourced cost basis, so this size is request access only; no COA file on record for this SKU.

Exact label copy, in layout order:

| # | Zone | Line |
| --- | --- | --- |
| 1 | A | `XENIOS` |
| 2 | A | `RENEW 360` |
| 3 | B | `Tesamorelin Research Material` |
| 4 | B | `Tesamorelin` |
| 5 | B | `20 mg` |
| 6 | B | `Single vial` |
| 7 | C | `R360-TESAMORELIN-20MG-VIAL` |
| 8 | C | `LOT {{LOT}}` |
| 9 | C | `EXP {{EXP}}` |
| 10 | C | `Storage and handling: see accompanying documentation.` |
| 11 | C | `Research use only. Not for human or veterinary use.` |
| 12 | C | `Private catalog. Access by approval.` |

Asset: `r360-label-tesamorelin-20mg-vial-v1.svg`

Rendering prompt:

```
A flat, front-facing pharmaceutical label design for a lyophilized powder vial, 60 mm by 30 mm,
rendered as clean vector artwork on a white ground. No photography, no
product mockup, no drop shadow, no gloss, no 3D.

Top band, 6 mm tall, solid deep navy #0B1B2B, type reversed to white: the
wordmark XENIOS at 9 pt semibold with wide letter spacing on the left, and
RENEW 360 at 5 pt medium with wider letter spacing on the right.

Middle block on white, left aligned, generous space: the product name
"Tesamorelin Research Material" at 8 pt semibold in near black #0A0A0A;
directly beneath it the compound name "Tesamorelin"
at 6 pt regular; then the strength "20 mg" set large at 12 pt
semibold as the dominant element; then "Single vial" at 6 pt medium.

A single 2 pt arc in blue #2E6BE6 sweeps from the strength baseline up and
off the right edge of the label, clipped by the edge so it reads as part of
a larger circle wrapping the container. It touches no type.

Bottom block, separated by a 0.5 pt hairline in #C8CFD6, set at 5 pt and
4.5 pt: the line "R360-TESAMORELIN-20MG-VIAL" then
"LOT {{LOT}}   EXP {{EXP}}" with the braces shown literally as unfilled
placeholders, then three small lines of compliance text reading exactly
"Storage and handling: see accompanying documentation.",
"Research use only. Not for human or veterinary use.", and
"Private catalog. Access by approval."

Calm, clinical, premium. No icons, no badges, no seals, no purity or
quality marks, no invented lot or expiry values, no additional text of any
kind beyond the lines listed above.
```

### PEP-008 Gonadorelin Research Material

- Compound: `Gonadorelin (gonadotropin-releasing hormone)`
- Regulatory status on record: Category 1
- Variants: 1

#### R360-GONADORELIN-5MG-VIAL

Print blockers: strength disputed by the signed supplier master, which states `2 mg`; no COA file on record for this SKU.

Exact label copy, in layout order:

| # | Zone | Line |
| --- | --- | --- |
| 1 | A | `XENIOS` |
| 2 | A | `RENEW 360` |
| 3 | B | `Gonadorelin Research Material` |
| 4 | B | `Gonadorelin (gonadotropin-releasing hormone)` |
| 5 | B | `5 mg` |
| 6 | B | `Single vial` |
| 7 | C | `R360-GONADORELIN-5MG-VIAL` |
| 8 | C | `LOT {{LOT}}` |
| 9 | C | `EXP {{EXP}}` |
| 10 | C | `Storage and handling: see accompanying documentation.` |
| 11 | C | `Research use only. Not for human or veterinary use.` |
| 12 | C | `Private catalog. Access by approval.` |

Asset: `r360-label-gonadorelin-5mg-vial-v1.svg`

Rendering prompt:

```
A flat, front-facing pharmaceutical label design for a lyophilized powder vial, 60 mm by 30 mm,
rendered as clean vector artwork on a white ground. No photography, no
product mockup, no drop shadow, no gloss, no 3D.

Top band, 6 mm tall, solid deep navy #0B1B2B, type reversed to white: the
wordmark XENIOS at 9 pt semibold with wide letter spacing on the left, and
RENEW 360 at 5 pt medium with wider letter spacing on the right.

Middle block on white, left aligned, generous space: the product name
"Gonadorelin Research Material" at 8 pt semibold in near black #0A0A0A;
directly beneath it the compound name "Gonadorelin (gonadotropin-releasing hormone)"
at 6 pt regular; then the strength "5 mg" set large at 12 pt
semibold as the dominant element; then "Single vial" at 6 pt medium.

A single 2 pt arc in blue #2E6BE6 sweeps from the strength baseline up and
off the right edge of the label, clipped by the edge so it reads as part of
a larger circle wrapping the container. It touches no type.

Bottom block, separated by a 0.5 pt hairline in #C8CFD6, set at 5 pt and
4.5 pt: the line "R360-GONADORELIN-5MG-VIAL" then
"LOT {{LOT}}   EXP {{EXP}}" with the braces shown literally as unfilled
placeholders, then three small lines of compliance text reading exactly
"Storage and handling: see accompanying documentation.",
"Research use only. Not for human or veterinary use.", and
"Private catalog. Access by approval."

Calm, clinical, premium. No icons, no badges, no seals, no purity or
quality marks, no invented lot or expiry values, no additional text of any
kind beyond the lines listed above.
```

### PEP-009 NAD+ Research Material

- Compound: `NAD+ (nicotinamide adenine dinucleotide)`
- Regulatory status on record: Category 1
- Variants: 2

#### R360-NAD-500MG-VIAL

Print blockers: strength disputed by the signed supplier master, which states `100 mg`; no COA file on record for this SKU.

Exact label copy, in layout order:

| # | Zone | Line |
| --- | --- | --- |
| 1 | A | `XENIOS` |
| 2 | A | `RENEW 360` |
| 3 | B | `NAD+ Research Material` |
| 4 | B | `NAD+ (nicotinamide adenine dinucleotide)` |
| 5 | B | `500 mg` |
| 6 | B | `Single vial` |
| 7 | C | `R360-NAD-500MG-VIAL` |
| 8 | C | `LOT {{LOT}}` |
| 9 | C | `EXP {{EXP}}` |
| 10 | C | `Storage and handling: see accompanying documentation.` |
| 11 | C | `Research use only. Not for human or veterinary use.` |
| 12 | C | `Private catalog. Access by approval.` |

Asset: `r360-label-nad-500mg-vial-v1.svg`

Rendering prompt:

```
A flat, front-facing pharmaceutical label design for a lyophilized powder vial, 60 mm by 30 mm,
rendered as clean vector artwork on a white ground. No photography, no
product mockup, no drop shadow, no gloss, no 3D.

Top band, 6 mm tall, solid deep navy #0B1B2B, type reversed to white: the
wordmark XENIOS at 9 pt semibold with wide letter spacing on the left, and
RENEW 360 at 5 pt medium with wider letter spacing on the right.

Middle block on white, left aligned, generous space: the product name
"NAD+ Research Material" at 8 pt semibold in near black #0A0A0A;
directly beneath it the compound name "NAD+ (nicotinamide adenine dinucleotide)"
at 6 pt regular; then the strength "500 mg" set large at 12 pt
semibold as the dominant element; then "Single vial" at 6 pt medium.

A single 2 pt arc in blue #2E6BE6 sweeps from the strength baseline up and
off the right edge of the label, clipped by the edge so it reads as part of
a larger circle wrapping the container. It touches no type.

Bottom block, separated by a 0.5 pt hairline in #C8CFD6, set at 5 pt and
4.5 pt: the line "R360-NAD-500MG-VIAL" then
"LOT {{LOT}}   EXP {{EXP}}" with the braces shown literally as unfilled
placeholders, then three small lines of compliance text reading exactly
"Storage and handling: see accompanying documentation.",
"Research use only. Not for human or veterinary use.", and
"Private catalog. Access by approval."

Calm, clinical, premium. No icons, no badges, no seals, no purity or
quality marks, no invented lot or expiry values, no additional text of any
kind beyond the lines listed above.
```

#### R360-NAD-1000MG-VIAL

Print blockers: no sourced cost basis, so this size is request access only; no COA file on record for this SKU.

Exact label copy, in layout order:

| # | Zone | Line |
| --- | --- | --- |
| 1 | A | `XENIOS` |
| 2 | A | `RENEW 360` |
| 3 | B | `NAD+ Research Material` |
| 4 | B | `NAD+ (nicotinamide adenine dinucleotide)` |
| 5 | B | `1000 mg` |
| 6 | B | `Single vial` |
| 7 | C | `R360-NAD-1000MG-VIAL` |
| 8 | C | `LOT {{LOT}}` |
| 9 | C | `EXP {{EXP}}` |
| 10 | C | `Storage and handling: see accompanying documentation.` |
| 11 | C | `Research use only. Not for human or veterinary use.` |
| 12 | C | `Private catalog. Access by approval.` |

Asset: `r360-label-nad-1000mg-vial-v1.svg`

Rendering prompt:

```
A flat, front-facing pharmaceutical label design for a lyophilized powder vial, 60 mm by 30 mm,
rendered as clean vector artwork on a white ground. No photography, no
product mockup, no drop shadow, no gloss, no 3D.

Top band, 6 mm tall, solid deep navy #0B1B2B, type reversed to white: the
wordmark XENIOS at 9 pt semibold with wide letter spacing on the left, and
RENEW 360 at 5 pt medium with wider letter spacing on the right.

Middle block on white, left aligned, generous space: the product name
"NAD+ Research Material" at 8 pt semibold in near black #0A0A0A;
directly beneath it the compound name "NAD+ (nicotinamide adenine dinucleotide)"
at 6 pt regular; then the strength "1000 mg" set large at 12 pt
semibold as the dominant element; then "Single vial" at 6 pt medium.

A single 2 pt arc in blue #2E6BE6 sweeps from the strength baseline up and
off the right edge of the label, clipped by the edge so it reads as part of
a larger circle wrapping the container. It touches no type.

Bottom block, separated by a 0.5 pt hairline in #C8CFD6, set at 5 pt and
4.5 pt: the line "R360-NAD-1000MG-VIAL" then
"LOT {{LOT}}   EXP {{EXP}}" with the braces shown literally as unfilled
placeholders, then three small lines of compliance text reading exactly
"Storage and handling: see accompanying documentation.",
"Research use only. Not for human or veterinary use.", and
"Private catalog. Access by approval."

Calm, clinical, premium. No icons, no badges, no seals, no purity or
quality marks, no invented lot or expiry values, no additional text of any
kind beyond the lines listed above.
```

### PEP-010 MOTS-C Research Material

- Compound: `MOTS-c (mitochondrial open reading frame of the 12S rRNA type-c)`
- Regulatory status on record: PCAC review, likely Category 1
- Variants: 2

#### R360-MOTSC-10MG-VIAL

Print blockers: strength disputed by the signed supplier master, which states `5 mg`; no COA file on record for this SKU.

Exact label copy, in layout order:

| # | Zone | Line |
| --- | --- | --- |
| 1 | A | `XENIOS` |
| 2 | A | `RENEW 360` |
| 3 | B | `MOTS-C Research Material` |
| 4 | B | `MOTS-c (mitochondrial open reading frame of the 12S rRNA type-c)` |
| 5 | B | `10 mg` |
| 6 | B | `Single vial` |
| 7 | C | `R360-MOTSC-10MG-VIAL` |
| 8 | C | `LOT {{LOT}}` |
| 9 | C | `EXP {{EXP}}` |
| 10 | C | `Storage and handling: see accompanying documentation.` |
| 11 | C | `Research use only. Not for human or veterinary use.` |
| 12 | C | `Private catalog. Access by approval.` |

Asset: `r360-label-motsc-10mg-vial-v1.svg`

Rendering prompt:

```
A flat, front-facing pharmaceutical label design for a lyophilized powder vial, 60 mm by 30 mm,
rendered as clean vector artwork on a white ground. No photography, no
product mockup, no drop shadow, no gloss, no 3D.

Top band, 6 mm tall, solid deep navy #0B1B2B, type reversed to white: the
wordmark XENIOS at 9 pt semibold with wide letter spacing on the left, and
RENEW 360 at 5 pt medium with wider letter spacing on the right.

Middle block on white, left aligned, generous space: the product name
"MOTS-C Research Material" at 8 pt semibold in near black #0A0A0A;
directly beneath it the compound name "MOTS-c (mitochondrial open reading frame of the 12S rRNA type-c)"
at 6 pt regular; then the strength "10 mg" set large at 12 pt
semibold as the dominant element; then "Single vial" at 6 pt medium.

A single 2 pt arc in blue #2E6BE6 sweeps from the strength baseline up and
off the right edge of the label, clipped by the edge so it reads as part of
a larger circle wrapping the container. It touches no type.

Bottom block, separated by a 0.5 pt hairline in #C8CFD6, set at 5 pt and
4.5 pt: the line "R360-MOTSC-10MG-VIAL" then
"LOT {{LOT}}   EXP {{EXP}}" with the braces shown literally as unfilled
placeholders, then three small lines of compliance text reading exactly
"Storage and handling: see accompanying documentation.",
"Research use only. Not for human or veterinary use.", and
"Private catalog. Access by approval."

Calm, clinical, premium. No icons, no badges, no seals, no purity or
quality marks, no invented lot or expiry values, no additional text of any
kind beyond the lines listed above.
```

#### R360-MOTSC-40MG-VIAL

Print blockers: no sourced cost basis, so this size is request access only; no COA file on record for this SKU.

Exact label copy, in layout order:

| # | Zone | Line |
| --- | --- | --- |
| 1 | A | `XENIOS` |
| 2 | A | `RENEW 360` |
| 3 | B | `MOTS-C Research Material` |
| 4 | B | `MOTS-c (mitochondrial open reading frame of the 12S rRNA type-c)` |
| 5 | B | `40 mg` |
| 6 | B | `Single vial` |
| 7 | C | `R360-MOTSC-40MG-VIAL` |
| 8 | C | `LOT {{LOT}}` |
| 9 | C | `EXP {{EXP}}` |
| 10 | C | `Storage and handling: see accompanying documentation.` |
| 11 | C | `Research use only. Not for human or veterinary use.` |
| 12 | C | `Private catalog. Access by approval.` |

Asset: `r360-label-motsc-40mg-vial-v1.svg`

Rendering prompt:

```
A flat, front-facing pharmaceutical label design for a lyophilized powder vial, 60 mm by 30 mm,
rendered as clean vector artwork on a white ground. No photography, no
product mockup, no drop shadow, no gloss, no 3D.

Top band, 6 mm tall, solid deep navy #0B1B2B, type reversed to white: the
wordmark XENIOS at 9 pt semibold with wide letter spacing on the left, and
RENEW 360 at 5 pt medium with wider letter spacing on the right.

Middle block on white, left aligned, generous space: the product name
"MOTS-C Research Material" at 8 pt semibold in near black #0A0A0A;
directly beneath it the compound name "MOTS-c (mitochondrial open reading frame of the 12S rRNA type-c)"
at 6 pt regular; then the strength "40 mg" set large at 12 pt
semibold as the dominant element; then "Single vial" at 6 pt medium.

A single 2 pt arc in blue #2E6BE6 sweeps from the strength baseline up and
off the right edge of the label, clipped by the edge so it reads as part of
a larger circle wrapping the container. It touches no type.

Bottom block, separated by a 0.5 pt hairline in #C8CFD6, set at 5 pt and
4.5 pt: the line "R360-MOTSC-40MG-VIAL" then
"LOT {{LOT}}   EXP {{EXP}}" with the braces shown literally as unfilled
placeholders, then three small lines of compliance text reading exactly
"Storage and handling: see accompanying documentation.",
"Research use only. Not for human or veterinary use.", and
"Private catalog. Access by approval."

Calm, clinical, premium. No icons, no badges, no seals, no purity or
quality marks, no invented lot or expiry values, no additional text of any
kind beyond the lines listed above.
```

### PEP-011 Epithalon Research Material

- Compound: `Epithalon (Ala-Glu-Asp-Gly tetrapeptide)`
- Regulatory status on record: PCAC review, likely Category 1
- Variants: 2

#### R360-EPITHALON-10MG-VIAL

Print blockers: strength disputed by the signed supplier master, which states `5 mg`; no COA file on record for this SKU.

Exact label copy, in layout order:

| # | Zone | Line |
| --- | --- | --- |
| 1 | A | `XENIOS` |
| 2 | A | `RENEW 360` |
| 3 | B | `Epithalon Research Material` |
| 4 | B | `Epithalon (Ala-Glu-Asp-Gly tetrapeptide)` |
| 5 | B | `10 mg` |
| 6 | B | `Single vial` |
| 7 | C | `R360-EPITHALON-10MG-VIAL` |
| 8 | C | `LOT {{LOT}}` |
| 9 | C | `EXP {{EXP}}` |
| 10 | C | `Storage and handling: see accompanying documentation.` |
| 11 | C | `Research use only. Not for human or veterinary use.` |
| 12 | C | `Private catalog. Access by approval.` |

Asset: `r360-label-epithalon-10mg-vial-v1.svg`

Rendering prompt:

```
A flat, front-facing pharmaceutical label design for a lyophilized powder vial, 60 mm by 30 mm,
rendered as clean vector artwork on a white ground. No photography, no
product mockup, no drop shadow, no gloss, no 3D.

Top band, 6 mm tall, solid deep navy #0B1B2B, type reversed to white: the
wordmark XENIOS at 9 pt semibold with wide letter spacing on the left, and
RENEW 360 at 5 pt medium with wider letter spacing on the right.

Middle block on white, left aligned, generous space: the product name
"Epithalon Research Material" at 8 pt semibold in near black #0A0A0A;
directly beneath it the compound name "Epithalon (Ala-Glu-Asp-Gly tetrapeptide)"
at 6 pt regular; then the strength "10 mg" set large at 12 pt
semibold as the dominant element; then "Single vial" at 6 pt medium.

A single 2 pt arc in blue #2E6BE6 sweeps from the strength baseline up and
off the right edge of the label, clipped by the edge so it reads as part of
a larger circle wrapping the container. It touches no type.

Bottom block, separated by a 0.5 pt hairline in #C8CFD6, set at 5 pt and
4.5 pt: the line "R360-EPITHALON-10MG-VIAL" then
"LOT {{LOT}}   EXP {{EXP}}" with the braces shown literally as unfilled
placeholders, then three small lines of compliance text reading exactly
"Storage and handling: see accompanying documentation.",
"Research use only. Not for human or veterinary use.", and
"Private catalog. Access by approval."

Calm, clinical, premium. No icons, no badges, no seals, no purity or
quality marks, no invented lot or expiry values, no additional text of any
kind beyond the lines listed above.
```

#### R360-EPITHALON-100MG-VIAL

Print blockers: no sourced cost basis, so this size is request access only; no COA file on record for this SKU.

Exact label copy, in layout order:

| # | Zone | Line |
| --- | --- | --- |
| 1 | A | `XENIOS` |
| 2 | A | `RENEW 360` |
| 3 | B | `Epithalon Research Material` |
| 4 | B | `Epithalon (Ala-Glu-Asp-Gly tetrapeptide)` |
| 5 | B | `100 mg` |
| 6 | B | `Single vial` |
| 7 | C | `R360-EPITHALON-100MG-VIAL` |
| 8 | C | `LOT {{LOT}}` |
| 9 | C | `EXP {{EXP}}` |
| 10 | C | `Storage and handling: see accompanying documentation.` |
| 11 | C | `Research use only. Not for human or veterinary use.` |
| 12 | C | `Private catalog. Access by approval.` |

Asset: `r360-label-epithalon-100mg-vial-v1.svg`

Rendering prompt:

```
A flat, front-facing pharmaceutical label design for a lyophilized powder vial, 60 mm by 30 mm,
rendered as clean vector artwork on a white ground. No photography, no
product mockup, no drop shadow, no gloss, no 3D.

Top band, 6 mm tall, solid deep navy #0B1B2B, type reversed to white: the
wordmark XENIOS at 9 pt semibold with wide letter spacing on the left, and
RENEW 360 at 5 pt medium with wider letter spacing on the right.

Middle block on white, left aligned, generous space: the product name
"Epithalon Research Material" at 8 pt semibold in near black #0A0A0A;
directly beneath it the compound name "Epithalon (Ala-Glu-Asp-Gly tetrapeptide)"
at 6 pt regular; then the strength "100 mg" set large at 12 pt
semibold as the dominant element; then "Single vial" at 6 pt medium.

A single 2 pt arc in blue #2E6BE6 sweeps from the strength baseline up and
off the right edge of the label, clipped by the edge so it reads as part of
a larger circle wrapping the container. It touches no type.

Bottom block, separated by a 0.5 pt hairline in #C8CFD6, set at 5 pt and
4.5 pt: the line "R360-EPITHALON-100MG-VIAL" then
"LOT {{LOT}}   EXP {{EXP}}" with the braces shown literally as unfilled
placeholders, then three small lines of compliance text reading exactly
"Storage and handling: see accompanying documentation.",
"Research use only. Not for human or veterinary use.", and
"Private catalog. Access by approval."

Calm, clinical, premium. No icons, no badges, no seals, no purity or
quality marks, no invented lot or expiry values, no additional text of any
kind beyond the lines listed above.
```

### PEP-012 SS-31 Research Material

- Compound: `SS-31 (elamipretide)`
- Regulatory status on record: Category 1
- Variants: 2

#### R360-SS31-10MG-VIAL

Print blockers: strength disputed by the signed supplier master, which states `5 mg`; no COA file on record for this SKU.

Exact label copy, in layout order:

| # | Zone | Line |
| --- | --- | --- |
| 1 | A | `XENIOS` |
| 2 | A | `RENEW 360` |
| 3 | B | `SS-31 Research Material` |
| 4 | B | `SS-31 (elamipretide)` |
| 5 | B | `10 mg` |
| 6 | B | `Single vial` |
| 7 | C | `R360-SS31-10MG-VIAL` |
| 8 | C | `LOT {{LOT}}` |
| 9 | C | `EXP {{EXP}}` |
| 10 | C | `Storage and handling: see accompanying documentation.` |
| 11 | C | `Research use only. Not for human or veterinary use.` |
| 12 | C | `Private catalog. Access by approval.` |

Asset: `r360-label-ss31-10mg-vial-v1.svg`

Rendering prompt:

```
A flat, front-facing pharmaceutical label design for a lyophilized powder vial, 60 mm by 30 mm,
rendered as clean vector artwork on a white ground. No photography, no
product mockup, no drop shadow, no gloss, no 3D.

Top band, 6 mm tall, solid deep navy #0B1B2B, type reversed to white: the
wordmark XENIOS at 9 pt semibold with wide letter spacing on the left, and
RENEW 360 at 5 pt medium with wider letter spacing on the right.

Middle block on white, left aligned, generous space: the product name
"SS-31 Research Material" at 8 pt semibold in near black #0A0A0A;
directly beneath it the compound name "SS-31 (elamipretide)"
at 6 pt regular; then the strength "10 mg" set large at 12 pt
semibold as the dominant element; then "Single vial" at 6 pt medium.

A single 2 pt arc in blue #2E6BE6 sweeps from the strength baseline up and
off the right edge of the label, clipped by the edge so it reads as part of
a larger circle wrapping the container. It touches no type.

Bottom block, separated by a 0.5 pt hairline in #C8CFD6, set at 5 pt and
4.5 pt: the line "R360-SS31-10MG-VIAL" then
"LOT {{LOT}}   EXP {{EXP}}" with the braces shown literally as unfilled
placeholders, then three small lines of compliance text reading exactly
"Storage and handling: see accompanying documentation.",
"Research use only. Not for human or veterinary use.", and
"Private catalog. Access by approval."

Calm, clinical, premium. No icons, no badges, no seals, no purity or
quality marks, no invented lot or expiry values, no additional text of any
kind beyond the lines listed above.
```

#### R360-SS31-50MG-VIAL

Print blockers: no sourced cost basis, so this size is request access only; no COA file on record for this SKU.

Exact label copy, in layout order:

| # | Zone | Line |
| --- | --- | --- |
| 1 | A | `XENIOS` |
| 2 | A | `RENEW 360` |
| 3 | B | `SS-31 Research Material` |
| 4 | B | `SS-31 (elamipretide)` |
| 5 | B | `50 mg` |
| 6 | B | `Single vial` |
| 7 | C | `R360-SS31-50MG-VIAL` |
| 8 | C | `LOT {{LOT}}` |
| 9 | C | `EXP {{EXP}}` |
| 10 | C | `Storage and handling: see accompanying documentation.` |
| 11 | C | `Research use only. Not for human or veterinary use.` |
| 12 | C | `Private catalog. Access by approval.` |

Asset: `r360-label-ss31-50mg-vial-v1.svg`

Rendering prompt:

```
A flat, front-facing pharmaceutical label design for a lyophilized powder vial, 60 mm by 30 mm,
rendered as clean vector artwork on a white ground. No photography, no
product mockup, no drop shadow, no gloss, no 3D.

Top band, 6 mm tall, solid deep navy #0B1B2B, type reversed to white: the
wordmark XENIOS at 9 pt semibold with wide letter spacing on the left, and
RENEW 360 at 5 pt medium with wider letter spacing on the right.

Middle block on white, left aligned, generous space: the product name
"SS-31 Research Material" at 8 pt semibold in near black #0A0A0A;
directly beneath it the compound name "SS-31 (elamipretide)"
at 6 pt regular; then the strength "50 mg" set large at 12 pt
semibold as the dominant element; then "Single vial" at 6 pt medium.

A single 2 pt arc in blue #2E6BE6 sweeps from the strength baseline up and
off the right edge of the label, clipped by the edge so it reads as part of
a larger circle wrapping the container. It touches no type.

Bottom block, separated by a 0.5 pt hairline in #C8CFD6, set at 5 pt and
4.5 pt: the line "R360-SS31-50MG-VIAL" then
"LOT {{LOT}}   EXP {{EXP}}" with the braces shown literally as unfilled
placeholders, then three small lines of compliance text reading exactly
"Storage and handling: see accompanying documentation.",
"Research use only. Not for human or veterinary use.", and
"Private catalog. Access by approval."

Calm, clinical, premium. No icons, no badges, no seals, no purity or
quality marks, no invented lot or expiry values, no additional text of any
kind beyond the lines listed above.
```

### PEP-013 SLU-PP-332 Research Capsules

- Compound: `SLU-PP-332`
- Regulatory status on record: Category 1
- Variants: 1

#### R360-SLUPP332-250MCGX100-CAP

Print blockers: strength disputed by the signed supplier master, which states `1500 mcg per capsule, 60 capsules`; no COA file on record for this SKU.

Exact label copy, in layout order:

| # | Zone | Line |
| --- | --- | --- |
| 1 | A | `XENIOS` |
| 2 | A | `RENEW 360` |
| 3 | B | `SLU-PP-332 Research Capsules` |
| 4 | B | `SLU-PP-332` |
| 5 | B | `250 mcg` |
| 6 | B | `Capsule bottle, 100 capsules` |
| 7 | C | `R360-SLUPP332-250MCGX100-CAP` |
| 8 | C | `LOT {{LOT}}` |
| 9 | C | `EXP {{EXP}}` |
| 10 | C | `Storage and handling: see accompanying documentation.` |
| 11 | C | `Research use only. Not for human or veterinary use.` |
| 12 | C | `Private catalog. Access by approval.` |

Asset: `r360-label-slupp332-250mcgx100-cap-v1.svg`

Rendering prompt:

```
A flat, front-facing pharmaceutical label design for an opaque capsule bottle, 100 mm by 50 mm,
rendered as clean vector artwork on a white ground. No photography, no
product mockup, no drop shadow, no gloss, no 3D.

Top band, 6 mm tall, solid deep navy #0B1B2B, type reversed to white: the
wordmark XENIOS at 9 pt semibold with wide letter spacing on the left, and
RENEW 360 at 5 pt medium with wider letter spacing on the right.

Middle block on white, left aligned, generous space: the product name
"SLU-PP-332 Research Capsules" at 8 pt semibold in near black #0A0A0A;
directly beneath it the compound name "SLU-PP-332"
at 6 pt regular; then the strength "250 mcg" set large at 12 pt
semibold as the dominant element; then "Capsule bottle, 100 capsules" at 6 pt medium.

A single 2 pt arc in blue #2E6BE6 sweeps from the strength baseline up and
off the right edge of the label, clipped by the edge so it reads as part of
a larger circle wrapping the container. It touches no type.

Bottom block, separated by a 0.5 pt hairline in #C8CFD6, set at 5 pt and
4.5 pt: the line "R360-SLUPP332-250MCGX100-CAP" then
"LOT {{LOT}}   EXP {{EXP}}" with the braces shown literally as unfilled
placeholders, then three small lines of compliance text reading exactly
"Storage and handling: see accompanying documentation.",
"Research use only. Not for human or veterinary use.", and
"Private catalog. Access by approval."

Calm, clinical, premium. No icons, no badges, no seals, no purity or
quality marks, no invented lot or expiry values, no additional text of any
kind beyond the lines listed above.
```

### PEP-014 Dihexa Research Capsules

- Compound: `Dihexa (N-hexanoic-tyrosyl-isoleucyl-(6)-aminohexanoic amide)`
- Regulatory status on record: Category 1
- Variants: 1

#### R360-DIHEXA-10MGX60-CAP

Print blockers: strength disputed by the signed supplier master, which states `10 mg per capsule, 30 capsules`; no COA file on record for this SKU.

Exact label copy, in layout order:

| # | Zone | Line |
| --- | --- | --- |
| 1 | A | `XENIOS` |
| 2 | A | `RENEW 360` |
| 3 | B | `Dihexa Research Capsules` |
| 4 | B | `Dihexa (N-hexanoic-tyrosyl-isoleucyl-(6)-aminohexanoic amide)` |
| 5 | B | `10 mg` |
| 6 | B | `Capsule bottle, 60 capsules` |
| 7 | C | `R360-DIHEXA-10MGX60-CAP` |
| 8 | C | `LOT {{LOT}}` |
| 9 | C | `EXP {{EXP}}` |
| 10 | C | `Storage and handling: see accompanying documentation.` |
| 11 | C | `Research use only. Not for human or veterinary use.` |
| 12 | C | `Private catalog. Access by approval.` |

Asset: `r360-label-dihexa-10mgx60-cap-v1.svg`

Rendering prompt:

```
A flat, front-facing pharmaceutical label design for an opaque capsule bottle, 100 mm by 50 mm,
rendered as clean vector artwork on a white ground. No photography, no
product mockup, no drop shadow, no gloss, no 3D.

Top band, 6 mm tall, solid deep navy #0B1B2B, type reversed to white: the
wordmark XENIOS at 9 pt semibold with wide letter spacing on the left, and
RENEW 360 at 5 pt medium with wider letter spacing on the right.

Middle block on white, left aligned, generous space: the product name
"Dihexa Research Capsules" at 8 pt semibold in near black #0A0A0A;
directly beneath it the compound name "Dihexa (N-hexanoic-tyrosyl-isoleucyl-(6)-aminohexanoic amide)"
at 6 pt regular; then the strength "10 mg" set large at 12 pt
semibold as the dominant element; then "Capsule bottle, 60 capsules" at 6 pt medium.

A single 2 pt arc in blue #2E6BE6 sweeps from the strength baseline up and
off the right edge of the label, clipped by the edge so it reads as part of
a larger circle wrapping the container. It touches no type.

Bottom block, separated by a 0.5 pt hairline in #C8CFD6, set at 5 pt and
4.5 pt: the line "R360-DIHEXA-10MGX60-CAP" then
"LOT {{LOT}}   EXP {{EXP}}" with the braces shown literally as unfilled
placeholders, then three small lines of compliance text reading exactly
"Storage and handling: see accompanying documentation.",
"Research use only. Not for human or veterinary use.", and
"Private catalog. Access by approval."

Calm, clinical, premium. No icons, no badges, no seals, no purity or
quality marks, no invented lot or expiry values, no additional text of any
kind beyond the lines listed above.
```

### PEP-015 Semax + Selank + DSIP Research Blend

- Compound: `Semax, Selank, and DSIP (delta sleep-inducing peptide)`
- Regulatory status on record: PCAC review, expected Category 1
- Variants: 1

#### R360-SEMAX_SELANK_DSIP-10MG_10MG_2MG-VIAL

Print blockers: strength disputed by the signed supplier master, which states `Semax 5 mg / Selank 5 mg / DSIP 5 mg (15 mg total)`; no COA file on record for this SKU.

Exact label copy, in layout order:

| # | Zone | Line |
| --- | --- | --- |
| 1 | A | `XENIOS` |
| 2 | A | `RENEW 360` |
| 3 | B | `Semax + Selank + DSIP Research Blend` |
| 4 | B | `Semax, Selank, and DSIP (delta sleep-inducing peptide)` |
| 5 | B | `10 mg / 10 mg / 2 mg` |
| 6 | B | `Single vial` |
| 7 | C | `R360-SEMAX_SELANK_DSIP-10MG_10MG_2MG-VIAL` |
| 8 | C | `LOT {{LOT}}` |
| 9 | C | `EXP {{EXP}}` |
| 10 | C | `Storage and handling: see accompanying documentation.` |
| 11 | C | `Research use only. Not for human or veterinary use.` |
| 12 | C | `Private catalog. Access by approval.` |

Asset: `r360-label-semax-selank-dsip-10mg-10mg-2mg-vial-v1.svg`

Rendering prompt:

```
A flat, front-facing pharmaceutical label design for a lyophilized powder vial, 60 mm by 30 mm,
rendered as clean vector artwork on a white ground. No photography, no
product mockup, no drop shadow, no gloss, no 3D.

Top band, 6 mm tall, solid deep navy #0B1B2B, type reversed to white: the
wordmark XENIOS at 9 pt semibold with wide letter spacing on the left, and
RENEW 360 at 5 pt medium with wider letter spacing on the right.

Middle block on white, left aligned, generous space: the product name
"Semax + Selank + DSIP Research Blend" at 8 pt semibold in near black #0A0A0A;
directly beneath it the compound name "Semax, Selank, and DSIP (delta sleep-inducing peptide)"
at 6 pt regular; then the strength "10 mg / 10 mg / 2 mg" set large at 12 pt
semibold as the dominant element; then "Single vial" at 6 pt medium.

A single 2 pt arc in blue #2E6BE6 sweeps from the strength baseline up and
off the right edge of the label, clipped by the edge so it reads as part of
a larger circle wrapping the container. It touches no type.

Bottom block, separated by a 0.5 pt hairline in #C8CFD6, set at 5 pt and
4.5 pt: the line "R360-SEMAX_SELANK_DSIP-10MG_10MG_2MG-VIAL" then
"LOT {{LOT}}   EXP {{EXP}}" with the braces shown literally as unfilled
placeholders, then three small lines of compliance text reading exactly
"Storage and handling: see accompanying documentation.",
"Research use only. Not for human or veterinary use.", and
"Private catalog. Access by approval."

Calm, clinical, premium. No icons, no badges, no seals, no purity or
quality marks, no invented lot or expiry values, no additional text of any
kind beyond the lines listed above.
```

## 7. Asset manifest

Every variant in the catalog, keyed by SKU. Tier 1 rows have a spec above. Tier 2
and Tier 3 rows reserve the filename only.

| SKU | Tier | Product | Presentation | Format | Asset | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| `R360-BPC157_TB500-15MG_15MG-VIAL` | Tier 1 workbook | BPC-157 + TB-500 Research Blend | 15 mg / 15 mg | vial | `r360-label-bpc157-tb500-15mg-15mg-vial-v1.svg` | specified |
| `R360-BPC157_TB500_GHKCU-10MG_10MG_50MG-VIAL` | Tier 1 workbook | BPC-157 + TB-500 + GHK-Cu Research Blend | 10 mg / 10 mg / 50 mg | vial | `r360-label-bpc157-tb500-ghkcu-10mg-10mg-50mg-vial-v1.svg` | specified |
| `R360-TB500_BPC157_GHKCU_KPV-5MG_5MG_10MG_5MG-VIAL` | Tier 1 workbook | KLOW Research Blend | 5 mg / 5 mg / 10 mg / 5 mg | vial | `r360-label-tb500-bpc157-ghkcu-kpv-5mg-5mg-10mg-5mg-vial-v1.svg` | specified |
| `R360-THYMOSINALPHA1_KPV_LL37-5MG_5MG_5MG-VIAL` | Tier 1 workbook | Thymosin Alpha-1 + KPV + LL-37 Research Blend | 5 mg / 5 mg / 5 mg | vial | `r360-label-thymosinalpha1-kpv-ll37-5mg-5mg-5mg-vial-v1.svg` | specified |
| `R360-CJC1295_IPAMORELIN-5MG_5MG-VIAL` | Tier 1 workbook | CJC-1295 + Ipamorelin Research Blend | 5 mg / 5 mg | vial | `r360-label-cjc1295-ipamorelin-5mg-5mg-vial-v1.svg` | specified |
| `R360-CJC1295_IPAMORELIN-20MG-VIAL` | Tier 1 workbook | CJC-1295 + Ipamorelin Research Blend | 20 mg | vial | `r360-label-cjc1295-ipamorelin-20mg-vial-v1.svg` | specified |
| `R360-PT141-10MG-VIAL` | Tier 1 workbook | PT-141 Research Material | 10 mg | vial | `r360-label-pt141-10mg-vial-v1.svg` | specified |
| `R360-TESAMORELIN-10MG-VIAL` | Tier 1 workbook | Tesamorelin Research Material | 10 mg | vial | `r360-label-tesamorelin-10mg-vial-v1.svg` | specified |
| `R360-TESAMORELIN-20MG-VIAL` | Tier 1 workbook | Tesamorelin Research Material | 20 mg | vial | `r360-label-tesamorelin-20mg-vial-v1.svg` | specified |
| `R360-GONADORELIN-5MG-VIAL` | Tier 1 workbook | Gonadorelin Research Material | 5 mg | vial | `r360-label-gonadorelin-5mg-vial-v1.svg` | specified |
| `R360-NAD-500MG-VIAL` | Tier 1 workbook | NAD+ Research Material | 500 mg | vial | `r360-label-nad-500mg-vial-v1.svg` | specified |
| `R360-NAD-1000MG-VIAL` | Tier 1 workbook | NAD+ Research Material | 1000 mg | vial | `r360-label-nad-1000mg-vial-v1.svg` | specified |
| `R360-MOTSC-10MG-VIAL` | Tier 1 workbook | MOTS-C Research Material | 10 mg | vial | `r360-label-motsc-10mg-vial-v1.svg` | specified |
| `R360-MOTSC-40MG-VIAL` | Tier 1 workbook | MOTS-C Research Material | 40 mg | vial | `r360-label-motsc-40mg-vial-v1.svg` | specified |
| `R360-EPITHALON-10MG-VIAL` | Tier 1 workbook | Epithalon Research Material | 10 mg | vial | `r360-label-epithalon-10mg-vial-v1.svg` | specified |
| `R360-EPITHALON-100MG-VIAL` | Tier 1 workbook | Epithalon Research Material | 100 mg | vial | `r360-label-epithalon-100mg-vial-v1.svg` | specified |
| `R360-SS31-10MG-VIAL` | Tier 1 workbook | SS-31 Research Material | 10 mg | vial | `r360-label-ss31-10mg-vial-v1.svg` | specified |
| `R360-SS31-50MG-VIAL` | Tier 1 workbook | SS-31 Research Material | 50 mg | vial | `r360-label-ss31-50mg-vial-v1.svg` | specified |
| `R360-SLUPP332-250MCGX100-CAP` | Tier 1 workbook | SLU-PP-332 Research Capsules | 250 mcg | capsule_bottle | `r360-label-slupp332-250mcgx100-cap-v1.svg` | specified |
| `R360-DIHEXA-10MGX60-CAP` | Tier 1 workbook | Dihexa Research Capsules | 10 mg | capsule_bottle | `r360-label-dihexa-10mgx60-cap-v1.svg` | specified |
| `R360-SEMAX_SELANK_DSIP-10MG_10MG_2MG-VIAL` | Tier 1 workbook | Semax + Selank + DSIP Research Blend | 10 mg / 10 mg / 2 mg | vial | `r360-label-semax-selank-dsip-10mg-10mg-2mg-vial-v1.svg` | specified |
| `R360-BPC157-10MG-VIAL` | Tier 2 expansion | BPC-157 Research Material | 10 mg | vial | `r360-label-bpc157-10mg-vial-v1.svg` | pending founder decision |
| `R360-BPC157-20MG-VIAL` | Tier 2 expansion | BPC-157 Research Material | 20 mg | vial | `r360-label-bpc157-20mg-vial-v1.svg` | pending founder decision |
| `R360-TB500-10MG-VIAL` | Tier 2 expansion | TB-500 Research Material | 10 mg | vial | `r360-label-tb500-10mg-vial-v1.svg` | pending founder decision |
| `R360-GHKCU-100MG-VIAL` | Tier 2 expansion | GHK-Cu Research Material | 100 mg | vial | `r360-label-ghkcu-100mg-vial-v1.svg` | pending founder decision |
| `R360-KPV-10MG-VIAL` | Tier 2 expansion | KPV Research Material | 10 mg | vial | `r360-label-kpv-10mg-vial-v1.svg` | pending founder decision |
| `R360-SEMAX-10MG-VIAL` | Tier 2 expansion | Semax Research Material | 10 mg | vial | `r360-label-semax-10mg-vial-v1.svg` | pending founder decision |
| `R360-SEMAX-30MG-VIAL` | Tier 2 expansion | Semax Research Material | 30 mg | vial | `r360-label-semax-30mg-vial-v1.svg` | pending founder decision |
| `R360-SELANK-10MG-VIAL` | Tier 2 expansion | Selank Research Material | 10 mg | vial | `r360-label-selank-10mg-vial-v1.svg` | pending founder decision |
| `R360-DSIP-15MG-VIAL` | Tier 2 expansion | DSIP Research Material | 15 mg | vial | `r360-label-dsip-15mg-vial-v1.svg` | pending founder decision |
| `R360-THYMOSINALPHA1-10MG-VIAL` | Tier 2 expansion | Thymosin Alpha-1 Research Material | 10 mg | vial | `r360-label-thymosinalpha1-10mg-vial-v1.svg` | pending founder decision |
| `R360-IPAMORELIN-10MG-VIAL` | Tier 2 expansion | Ipamorelin Research Material | 10 mg | vial | `r360-label-ipamorelin-10mg-vial-v1.svg` | pending founder decision |
| `R360-5AMINO1MQ-5MG-VIAL` | Tier 2 expansion | 5-Amino-1MQ Research Material | 5 mg | vial | `r360-label-5amino1mq-5mg-vial-v1.svg` | pending founder decision |
| `R360-5AMINO1MQ-50MG-VIAL` | Tier 2 expansion | 5-Amino-1MQ Research Material | 50 mg | vial | `r360-label-5amino1mq-50mg-vial-v1.svg` | pending founder decision |
| `R360-ADAMAX-10MG-VIAL` | Tier 2 expansion | Adamax Research Material | 10 mg | vial | `r360-label-adamax-10mg-vial-v1.svg` | pending founder decision |
| `R360-AOD9604-5MG-VIAL` | Tier 2 expansion | AOD-9604 Research Material | 5 mg | vial | `r360-label-aod9604-5mg-vial-v1.svg` | pending founder decision |
| `R360-AOD9604-10MG-VIAL` | Tier 2 expansion | AOD-9604 Research Material | 10 mg | vial | `r360-label-aod9604-10mg-vial-v1.svg` | pending founder decision |
| `R360-CJC1295DAC-5MG-VIAL` | Tier 2 expansion | CJC-1295 with DAC Research Material | 5 mg | vial | `r360-label-cjc1295dac-5mg-vial-v1.svg` | pending founder decision |
| `R360-FOLLISTATIN-1MG-VIAL` | Tier 2 expansion | Follistatin Research Material | 1 mg | vial | `r360-label-follistatin-1mg-vial-v1.svg` | pending founder decision |
| `R360-GLUTATHIONE-600MG-VIAL` | Tier 2 expansion | Glutathione Research Material | 600 mg | vial | `r360-label-glutathione-600mg-vial-v1.svg` | pending founder decision |
| `R360-GLUTATHIONE-1500MG-VIAL` | Tier 2 expansion | Glutathione Research Material | 1500 mg | vial | `r360-label-glutathione-1500mg-vial-v1.svg` | pending founder decision |
| `R360-HCG-5000IU-VIAL` | Tier 2 expansion | HCG Research Material | 5000 IU | vial | `r360-label-hcg-5000iu-vial-v1.svg` | pending founder decision |
| `R360-IGF1LR3-0P1MG-VIAL` | Tier 2 expansion | IGF-1 LR3 Research Material | 0.1 mg | vial | `r360-label-igf1lr3-0p1mg-vial-v1.svg` | pending founder decision |
| `R360-IGF1LR3-1MG-VIAL` | Tier 2 expansion | IGF-1 LR3 Research Material | 1 mg | vial | `r360-label-igf1lr3-1mg-vial-v1.svg` | pending founder decision |
| `R360-KISSPEPTIN10-10MG-VIAL` | Tier 2 expansion | Kisspeptin-10 Research Material | 10 mg | vial | `r360-label-kisspeptin10-10mg-vial-v1.svg` | pending founder decision |
| `R360-LCARNITINE-600MG-VIAL` | Tier 2 expansion | L-Carnitine Research Material | 600 mg | vial | `r360-label-lcarnitine-600mg-vial-v1.svg` | pending founder decision |
| `R360-LIPOC-100MG-VIAL` | Tier 2 expansion | LIPO-C Research Material | 100 mg | vial | `r360-label-lipoc-100mg-vial-v1.svg` | pending founder decision |
| `R360-MELANOTAN1-10MG-VIAL` | Tier 2 expansion | Melanotan I Research Material | 10 mg | vial | `r360-label-melanotan1-10mg-vial-v1.svg` | pending founder decision |
| `R360-MELANOTAN2-10MG-VIAL` | Tier 2 expansion | Melanotan II Research Material | 10 mg | vial | `r360-label-melanotan2-10mg-vial-v1.svg` | pending founder decision |
| `R360-SERMORELIN-10MG-VIAL` | Tier 2 expansion | Sermorelin Research Material | 10 mg | vial | `r360-label-sermorelin-10mg-vial-v1.svg` | pending founder decision |
| `R360-THYMALIN-10MG-VIAL` | Tier 2 expansion | Thymalin Research Material | 10 mg | vial | `r360-label-thymalin-10mg-vial-v1.svg` | pending founder decision |
| `R360-VIP-10MG-VIAL` | Tier 2 expansion | VIP Research Material | 10 mg | vial | `r360-label-vip-10mg-vial-v1.svg` | pending founder decision |
| `R360-SEMAX_SELANK-10MG-VIAL` | Tier 2 expansion | Semax + Selank Research Blend | 10 mg | vial | `r360-label-semax-selank-10mg-vial-v1.svg` | pending founder decision |
| `R360-TESAMORELIN_IPAMORELIN-15MG-VIAL` | Tier 2 expansion | Tesamorelin + Ipamorelin Research Blend | 15 mg | vial | `r360-label-tesamorelin-ipamorelin-15mg-vial-v1.svg` | pending founder decision |
| `R360-SEMAGLUTIDE-10MG-VIAL` | Tier 3 regulatory hold | Semaglutide | 10 mg | vial | `r360-label-semaglutide-10mg-vial-v1.svg` | pending founder decision |
| `R360-SEMAGLUTIDE-15MG-VIAL` | Tier 3 regulatory hold | Semaglutide | 15 mg | vial | `r360-label-semaglutide-15mg-vial-v1.svg` | pending founder decision |
| `R360-SEMAGLUTIDE-20MG-VIAL` | Tier 3 regulatory hold | Semaglutide | 20 mg | vial | `r360-label-semaglutide-20mg-vial-v1.svg` | pending founder decision |
| `R360-SEMAGLUTIDE-30MG-VIAL` | Tier 3 regulatory hold | Semaglutide | 30 mg | vial | `r360-label-semaglutide-30mg-vial-v1.svg` | pending founder decision |
| `R360-SEMAGLUTIDE-50MG-VIAL` | Tier 3 regulatory hold | Semaglutide | 50 mg | vial | `r360-label-semaglutide-50mg-vial-v1.svg` | pending founder decision |
| `R360-TIRZEPATIDE-10MG-VIAL` | Tier 3 regulatory hold | Tirzepatide | 10 mg | vial | `r360-label-tirzepatide-10mg-vial-v1.svg` | pending founder decision |
| `R360-TIRZEPATIDE-20MG-VIAL` | Tier 3 regulatory hold | Tirzepatide | 20 mg | vial | `r360-label-tirzepatide-20mg-vial-v1.svg` | pending founder decision |
| `R360-TIRZEPATIDE-30MG-VIAL` | Tier 3 regulatory hold | Tirzepatide | 30 mg | vial | `r360-label-tirzepatide-30mg-vial-v1.svg` | pending founder decision |
| `R360-TIRZEPATIDE-60MG-VIAL` | Tier 3 regulatory hold | Tirzepatide | 60 mg | vial | `r360-label-tirzepatide-60mg-vial-v1.svg` | pending founder decision |
| `R360-TIRZEPATIDE-100MG-VIAL` | Tier 3 regulatory hold | Tirzepatide | 100 mg | vial | `r360-label-tirzepatide-100mg-vial-v1.svg` | pending founder decision |
| `R360-TIRZEPATIDE-120MG-VIAL` | Tier 3 regulatory hold | Tirzepatide | 120 mg | vial | `r360-label-tirzepatide-120mg-vial-v1.svg` | pending founder decision |
| `R360-RETATRUTIDE-10MG-VIAL` | Tier 3 regulatory hold | Retatrutide | 10 mg | vial | `r360-label-retatrutide-10mg-vial-v1.svg` | pending founder decision |
| `R360-RETATRUTIDE-15MG-VIAL` | Tier 3 regulatory hold | Retatrutide | 15 mg | vial | `r360-label-retatrutide-15mg-vial-v1.svg` | pending founder decision |
| `R360-RETATRUTIDE-20MG-VIAL` | Tier 3 regulatory hold | Retatrutide | 20 mg | vial | `r360-label-retatrutide-20mg-vial-v1.svg` | pending founder decision |
| `R360-RETATRUTIDE-30MG-VIAL` | Tier 3 regulatory hold | Retatrutide | 30 mg | vial | `r360-label-retatrutide-30mg-vial-v1.svg` | pending founder decision |
| `R360-RETATRUTIDE-50MG-VIAL` | Tier 3 regulatory hold | Retatrutide | 50 mg | vial | `r360-label-retatrutide-50mg-vial-v1.svg` | pending founder decision |

Totals: 70 variants. Tier 1 21 specified, Tier 2 33 reserved, Tier 3 16 reserved.

Tier 3 artwork is not produced at all while the hold stands. The rows exist so
the manifest is complete and the reserved filenames cannot be taken by something
else.

## 8. Export list

| Item | Vial | Capsule bottle |
| --- | --- | --- |
| Trim | 60 mm x 30 mm | 100 mm x 50 mm |
| Bleed | 3 mm all edges | 3 mm all edges |
| Safe margin | 3 mm inside trim | 4 mm inside trim |
| Corner radius | 2 mm | 3 mm |
| Wrap overlap | 5 mm right edge | 8 mm right edge |

Deliverables per asset:

| Format | Purpose | Requirement |
| --- | --- | --- |
| `.svg` | Master | Text as live text, not outlines. One artboard per SKU. |
| `.pdf` (PDF/X-1a:2001) | Print | CMYK, fonts embedded, 3 mm bleed, crop marks. |
| `.png` 300 ppi | Proof | RGB, trim size, no bleed, for review in the console. |
| `.png` 600 ppi | Legibility check | Crop of Zone C only, to verify 4.5 pt type. |

Naming for the derived formats reuses the base name with the format extension.
Nothing is exported until the SKU's print blockers listed in section 6 are
cleared.

## 9. What is deliberately not specified yet

- **The confirmed palette.** The hex values in section 3.1 are a proposal. The
  repository has no Renew 360 tokens to read from.
- **The typeface.** The scale is set in roles and sizes, not in a family name,
  because no licensed brand face is recorded in this repository.
- **Tier 2 and Tier 3 label specs.** Generated once a founder decision and a cost
  basis exist. The manifest reserves their filenames now.
- **Any quality mark.** No batch, grade, purity, or certification device is
  designed, because none of those facts is established for any SKU.
