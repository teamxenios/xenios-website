---
title: Content Status Board
type: internal-documentation
status: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# Content Status Board

This is the living inventory of every content record in the Xenios Research catalog surface.
It covers 15 product records, 20 individual compound Guides, 6 blend Guides, and 11 goal pages.

Nothing on this board is approved for member-facing publication. Every record created in this
session begins at workflow state `draft` and evidence completeness
`incomplete pending human source verification`. Records advance only by a human decision that is
written back into this file.

Companion register: `docs/research-content/OPEN_RESEARCH_GAPS.md`. Every entry in the
"blocking dependency" column below resolves to a gap id in that file.

## 1. How to read this board

### 1.1 Workflow states

| State | Meaning |
| --- | --- |
| `draft` | AI-assembled or human-assembled skeleton. Not reviewed. Not visible to members. |
| `internal-review` | A named human is actively checking structure, safety language, and claim grades. |
| `source-verification` | Every claim is being matched to a retrieved primary source by a human. |
| `founder-review` | Samuel Boadu is reviewing for canon, tone, and claim posture. |
| `approved-draft` | Founder has approved the content. Still not published. Commerce remains separate. |
| `published` | Live on a member-facing surface. Requires founder publication action. |

No automated process may move a record past `draft`. AI drafts never publish automatically.
Samuel Boadu is the founder reviewer and publisher for every record on this board.

### 1.2 Evidence completeness values

| Value | Meaning |
| --- | --- |
| `incomplete pending human source verification` | Default. No claim in the record has been confirmed against a retrieved primary source by a human. |
| `partial, human verified in part` | Some claims carry a retrieved, human-checked source. Others remain unverified. |
| `complete, human verified` | Every claim carries a retrieved source, a date, and a claim evidence grade signed off by a human. |

### 1.3 Claim evidence grades

Grades apply to individual claims, never to a whole product or a whole Guide.

| Grade | Meaning |
| --- | --- |
| A | Established |
| B | Supported human evidence |
| C | Early human evidence |
| D | Preclinical (species and model must appear in the same sentence as the finding) |
| E | Manufacturer or supplier reported |
| F | Traditional or historical |
| G | Unverified |
| PROHIBITED | The claim may not be made on any member-facing surface |

Default to G or D unless a specific retrieved human study supports a better grade. Be conservative.
An unresolved grade is G, not a blank.

### 1.4 Dependency bundles

Three bundles recur across most rows. They are named here so the table stays readable.

| Bundle | Gap ids | Covers |
| --- | --- | --- |
| `SUPPLIER-BASELINE` | GAP-003, GAP-004, GAP-006, GAP-007, GAP-008, GAP-009, GAP-010, GAP-011 | Concentration, fill volume, shelf life, storage, COA, third-party testing, supplier identity, supplier quality systems |
| `COMMERCE-BASELINE` | GAP-014, GAP-015, GAP-016, GAP-017, GAP-018, GAP-021 | MAP policy, final pricing, margin, per-state availability, cold chain validation, fulfillment ownership of record |
| `EVIDENCE-BASELINE` | GAP-022, GAP-023, GAP-025, GAP-027 | Human source verification of every claim, dated and sourced regulatory statements, counsel review of the member-facing claim surface, sourced adverse effect and interaction information |

### 1.5 Content safety rules that bind every record on this board

These are not stylistic preferences. A record that violates any of them cannot advance out of `draft`.

1. No dosing of any kind. No amounts, mg, mcg, IU, mL, units, concentrations as instructions,
   frequency, timing, cycle length, titration, loading, stacking, reconstitution, injection
   technique, or route of administration. Where a source states a dose, the record does not
   reproduce it and instead states that dosing information is intentionally excluded.
2. No treatment directions, protocols, or regimens. Nothing a reader could follow as instructions.
3. No guaranteed outcomes. The words "will", "proven to", "restores", "cures", "eliminates", and
   "reverses" do not appear as claims. Use "has been studied for", "reported in", "investigated as".
4. No unsupported safety claims. "Safe", "well tolerated", and "no side effects" are not stated as
   general facts.
5. No preclinical-to-human leaps. If a finding is animal or in vitro, the species or model appears
   in the same sentence as the finding.
6. The phrase "research use only" is never used to imply human benefit. That framing is prohibited.
7. Every regulatory statement carries a date, a jurisdiction, and a source URL.
8. No medical, legal, financial, or clinical advice. No diagnosis. No self-treatment framing.
9. Citations come only from sources actually retrieved and recorded. A plausible-looking fabricated
   PMID, NCT number, DOI, author, year, journal, or URL is the worst failure mode available to this
   project. If a source cannot be retrieved, the claim is omitted and logged as a gap instead.
10. Unknown product facts are written exactly as `NOT CONFIRMED - see open supplier questions`.
    They are never estimated, inferred, or filled from a competitor listing.

### 1.6 Catalog state is separate from commerce state

A content record can exist, be reviewed, and even be approved while commerce stays disabled.
The board tracks content only. Commerce approval is tracked in section 6 and is currently blocked
across every category.

## 2. Product records (15)

Path root: `content/research-products/`

All 15 rows are peptide or capsule research product records. None is authorized for sale.
Owner notation: Samuel Boadu is reviewer and publisher. Mitch is the fulfillment owner for peptides
and Quantum for the first roughly 60 days, so supplier-side questions route through him.

| Item | Path | Workflow state | Evidence completeness | Blocking dependency | Owner | Last reviewed |
| --- | --- | --- | --- | --- | --- | --- |
| P001 BPC-157 + TB-500 | `content/research-products/p001-bpc-157-tb-500.md` | draft | incomplete pending human source verification | GAP-001, SUPPLIER-BASELINE, COMMERCE-BASELINE, EVIDENCE-BASELINE, GAP-024 | Samuel Boadu (Mitch: supplier facts) | 2026-07-19 |
| P002 BPC-157 + TB-500 + GHK-Cu | `content/research-products/p002-bpc-157-tb-500-ghk-cu.md` | draft | incomplete pending human source verification | GAP-001, SUPPLIER-BASELINE, COMMERCE-BASELINE, EVIDENCE-BASELINE, GAP-024 | Samuel Boadu (Mitch: supplier facts) | 2026-07-19 |
| P003 KLOW | `content/research-products/p003-klow.md` | draft | incomplete pending human source verification | GAP-001, GAP-002, SUPPLIER-BASELINE, COMMERCE-BASELINE, EVIDENCE-BASELINE, GAP-024 | Samuel Boadu (Mitch: supplier facts) | 2026-07-19 |
| P004 Thymosin Alpha-1 + KPV + LL-37 | `content/research-products/p004-thymosin-alpha-1-kpv-ll-37.md` | draft | incomplete pending human source verification | GAP-001, SUPPLIER-BASELINE, COMMERCE-BASELINE, EVIDENCE-BASELINE, GAP-024 | Samuel Boadu (Mitch: supplier facts) | 2026-07-19 |
| P005 CJC-1295 + Ipamorelin | `content/research-products/p005-cjc-1295-ipamorelin.md` | draft | incomplete pending human source verification | GAP-001, SUPPLIER-BASELINE, COMMERCE-BASELINE, EVIDENCE-BASELINE, GAP-024 | Samuel Boadu (Mitch: supplier facts) | 2026-07-19 |
| P006 PT-141 | `content/research-products/p006-pt-141.md` | draft | incomplete pending human source verification | SUPPLIER-BASELINE, COMMERCE-BASELINE, EVIDENCE-BASELINE, GAP-024 | Samuel Boadu (Mitch: supplier facts) | 2026-07-19 |
| P007 Tesamorelin | `content/research-products/p007-tesamorelin.md` | draft | incomplete pending human source verification | SUPPLIER-BASELINE, COMMERCE-BASELINE, EVIDENCE-BASELINE, GAP-024 | Samuel Boadu (Mitch: supplier facts) | 2026-07-19 |
| P008 Gonadorelin | `content/research-products/p008-gonadorelin.md` | draft | incomplete pending human source verification | SUPPLIER-BASELINE, COMMERCE-BASELINE, EVIDENCE-BASELINE, GAP-024 | Samuel Boadu (Mitch: supplier facts) | 2026-07-19 |
| P009 NAD+ | `content/research-products/p009-nad-plus.md` | draft | incomplete pending human source verification | SUPPLIER-BASELINE, COMMERCE-BASELINE, EVIDENCE-BASELINE, GAP-024 | Samuel Boadu (Mitch: supplier facts) | 2026-07-19 |
| P010 MOTS-C | `content/research-products/p010-mots-c.md` | draft | incomplete pending human source verification | SUPPLIER-BASELINE, COMMERCE-BASELINE, EVIDENCE-BASELINE, GAP-024 | Samuel Boadu (Mitch: supplier facts) | 2026-07-19 |
| P011 Epithalon | `content/research-products/p011-epithalon.md` | draft | incomplete pending human source verification | SUPPLIER-BASELINE, COMMERCE-BASELINE, EVIDENCE-BASELINE, GAP-024 | Samuel Boadu (Mitch: supplier facts) | 2026-07-19 |
| P012 SS-31 | `content/research-products/p012-ss-31.md` | draft | incomplete pending human source verification | SUPPLIER-BASELINE, COMMERCE-BASELINE, EVIDENCE-BASELINE, GAP-024 | Samuel Boadu (Mitch: supplier facts) | 2026-07-19 |
| P013 SLU-PP-332 Capsules | `content/research-products/p013-slu-pp-332-capsules.md` | draft | incomplete pending human source verification | GAP-005, SUPPLIER-BASELINE, COMMERCE-BASELINE, EVIDENCE-BASELINE, GAP-024 | Samuel Boadu (Mitch: supplier facts) | 2026-07-19 |
| P014 Dihexa Capsules | `content/research-products/p014-dihexa-capsules.md` | draft | incomplete pending human source verification | GAP-005, SUPPLIER-BASELINE, COMMERCE-BASELINE, EVIDENCE-BASELINE, GAP-024 | Samuel Boadu (Mitch: supplier facts) | 2026-07-19 |
| P015 Semax + Selank + DSIP | `content/research-products/p015-semax-selank-dsip.md` | draft | incomplete pending human source verification | GAP-001, SUPPLIER-BASELINE, COMMERCE-BASELINE, EVIDENCE-BASELINE, GAP-024 | Samuel Boadu (Mitch: supplier facts) | 2026-07-19 |

### 2.1 Product record notes

- Every product record carries `NOT CONFIRMED - see open supplier questions` in place of
  composition detail, concentration, fill volume, vial format, shelf life, storage temperature,
  sterility status, purity, COA content, supplier identity, price, margin, and inventory.
- Blend products (P001, P002, P003, P004, P005, P015) additionally carry
  `NOT CONFIRMED - see open supplier questions` for component ratios. Ratios are never estimated
  from the order in which components appear in a product name.
- P003 KLOW carries an additional identity gap. The component set behind the KLOW name is
  `NOT CONFIRMED - see open supplier questions` and is not inferred from the letters in the name.
- P013 and P014 are capsule formats, so they additionally require excipient and capsule shell
  disclosure before any ingredient section can be written.

## 3. Individual compound Guides (20)

Path root: `content/research-guides/individual/`

Guides are member-only. Guide completion is not a prerequisite for commerce, and commerce approval
is not a prerequisite for Guide review. The two tracks are independent.

| Item | Path | Workflow state | Evidence completeness | Blocking dependency | Owner | Last reviewed |
| --- | --- | --- | --- | --- | --- | --- |
| Guide: BPC-157 | `content/research-guides/individual/bpc-157.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE | Samuel Boadu | 2026-07-19 |
| Guide: TB-500 | `content/research-guides/individual/tb-500.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE | Samuel Boadu | 2026-07-19 |
| Guide: GHK-Cu | `content/research-guides/individual/ghk-cu.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE | Samuel Boadu | 2026-07-19 |
| Guide: Thymosin Alpha-1 | `content/research-guides/individual/thymosin-alpha-1.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE | Samuel Boadu | 2026-07-19 |
| Guide: KPV | `content/research-guides/individual/kpv.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE | Samuel Boadu | 2026-07-19 |
| Guide: LL-37 | `content/research-guides/individual/ll-37.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE | Samuel Boadu | 2026-07-19 |
| Guide: CJC-1295 | `content/research-guides/individual/cjc-1295.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE | Samuel Boadu | 2026-07-19 |
| Guide: Ipamorelin | `content/research-guides/individual/ipamorelin.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE | Samuel Boadu | 2026-07-19 |
| Guide: PT-141 | `content/research-guides/individual/pt-141.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE | Samuel Boadu | 2026-07-19 |
| Guide: Tesamorelin | `content/research-guides/individual/tesamorelin.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE, GAP-023 | Samuel Boadu | 2026-07-19 |
| Guide: Gonadorelin | `content/research-guides/individual/gonadorelin.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE, GAP-023 | Samuel Boadu | 2026-07-19 |
| Guide: NAD+ | `content/research-guides/individual/nad-plus.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE | Samuel Boadu | 2026-07-19 |
| Guide: MOTS-C | `content/research-guides/individual/mots-c.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE | Samuel Boadu | 2026-07-19 |
| Guide: Epithalon | `content/research-guides/individual/epithalon.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE | Samuel Boadu | 2026-07-19 |
| Guide: SS-31 | `content/research-guides/individual/ss-31.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE | Samuel Boadu | 2026-07-19 |
| Guide: SLU-PP-332 | `content/research-guides/individual/slu-pp-332.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE | Samuel Boadu | 2026-07-19 |
| Guide: Dihexa | `content/research-guides/individual/dihexa.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE | Samuel Boadu | 2026-07-19 |
| Guide: Semax | `content/research-guides/individual/semax.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE, GAP-023 | Samuel Boadu | 2026-07-19 |
| Guide: Selank | `content/research-guides/individual/selank.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE, GAP-023 | Samuel Boadu | 2026-07-19 |
| Guide: DSIP | `content/research-guides/individual/dsip.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE | Samuel Boadu | 2026-07-19 |

### 3.1 Individual Guide notes

- Several of these compounds have a large preclinical literature and a thin human literature.
  The default claim grade in those Guides is D or G. A D-grade line always names the species or
  model in the same sentence as the finding.
- Tesamorelin, Gonadorelin, Semax, and Selank carry an additional dependency on GAP-023 because
  their regulatory position differs by jurisdiction. Any statement about approval, scheduling, or
  availability in a Guide must carry a date, a jurisdiction, and a source URL, or it is removed.
- Guides describe what has been studied. They do not describe what a member should do. There is no
  dosing, no protocol, and no administration content in any Guide at any workflow state.

## 4. Blend Guides (6)

Path root: `content/research-guides/blends/`

A blend Guide cannot advance past `draft` until the exact composition and ratios of the blend are
confirmed in writing by the supplier of record. Until then, a blend Guide can only describe the
named components generically and must not imply an interaction, a synergy, or a combined effect.

| Item | Path | Workflow state | Evidence completeness | Blocking dependency | Owner | Last reviewed |
| --- | --- | --- | --- | --- | --- | --- |
| Blend Guide: BPC-157 + TB-500 | `content/research-guides/blends/bpc-157-tb-500.md` | draft | incomplete pending human source verification | GAP-001, EVIDENCE-BASELINE | Samuel Boadu | 2026-07-19 |
| Blend Guide: BPC-157 + TB-500 + GHK-Cu | `content/research-guides/blends/bpc-157-tb-500-ghk-cu.md` | draft | incomplete pending human source verification | GAP-001, EVIDENCE-BASELINE | Samuel Boadu | 2026-07-19 |
| Blend Guide: KLOW | `content/research-guides/blends/klow.md` | draft | incomplete pending human source verification | GAP-001, GAP-002, EVIDENCE-BASELINE | Samuel Boadu | 2026-07-19 |
| Blend Guide: Thymosin Alpha-1 + KPV + LL-37 | `content/research-guides/blends/thymosin-alpha-1-kpv-ll-37.md` | draft | incomplete pending human source verification | GAP-001, EVIDENCE-BASELINE | Samuel Boadu | 2026-07-19 |
| Blend Guide: CJC-1295 + Ipamorelin | `content/research-guides/blends/cjc-1295-ipamorelin.md` | draft | incomplete pending human source verification | GAP-001, EVIDENCE-BASELINE | Samuel Boadu | 2026-07-19 |
| Blend Guide: Semax + Selank + DSIP | `content/research-guides/blends/semax-selank-dsip.md` | draft | incomplete pending human source verification | GAP-001, EVIDENCE-BASELINE, GAP-023 | Samuel Boadu | 2026-07-19 |

### 4.1 Blend Guide notes

- There is a standing evidence problem specific to blends. Literature on a single compound does not
  transfer to a combination. A blend Guide may not present single-compound findings as if they
  describe the blend. Where no study of the combination has been retrieved, the Guide says so
  plainly and the combination claim is graded G.
- Ratios are a supplier fact, not an editorial judgment. They are never inferred from the product
  name, from a competitor listing, or from what is common in the category.

## 5. Goal pages (11)

Path root: `content/research-goals/`

Goal pages are navigational. They group records by the area of research interest a member is
exploring. Per the canonical UI guide, goal categories must not be used to imply human outcomes for
nonclinical research materials, so every goal page frames its area as a field of study rather than
as a result a member can expect. Goal wording is original to xenios and is not adapted from any
competitor or retailer taxonomy.

| Item | Path | Workflow state | Evidence completeness | Blocking dependency | Owner | Last reviewed |
| --- | --- | --- | --- | --- | --- | --- |
| Goal: Recovery and tissue repair | `content/research-goals/recovery-and-tissue-repair.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE, GAP-026 | Samuel Boadu | 2026-07-19 |
| Goal: Immune regulation | `content/research-goals/immune-regulation.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE, GAP-026 | Samuel Boadu | 2026-07-19 |
| Goal: Metabolic health | `content/research-goals/metabolic-health.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE, GAP-026 | Samuel Boadu | 2026-07-19 |
| Goal: Cellular energy and mitochondrial research | `content/research-goals/cellular-energy-and-mitochondrial-research.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE, GAP-026 | Samuel Boadu | 2026-07-19 |
| Goal: Longevity and biological aging research | `content/research-goals/longevity-and-biological-aging-research.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE, GAP-026 | Samuel Boadu | 2026-07-19 |
| Goal: Cognitive research | `content/research-goals/cognitive-research.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE, GAP-026 | Samuel Boadu | 2026-07-19 |
| Goal: Sleep and circadian research | `content/research-goals/sleep-and-circadian-research.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE, GAP-026 | Samuel Boadu | 2026-07-19 |
| Goal: Body composition research | `content/research-goals/body-composition-research.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE, GAP-026 | Samuel Boadu | 2026-07-19 |
| Goal: Endocrine and hormonal axis research | `content/research-goals/endocrine-and-hormonal-axis-research.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE, GAP-023, GAP-026 | Samuel Boadu | 2026-07-19 |
| Goal: Skin and connective tissue research | `content/research-goals/skin-and-connective-tissue-research.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE, GAP-026 | Samuel Boadu | 2026-07-19 |
| Goal: Stress response and nervous system research | `content/research-goals/stress-response-and-nervous-system-research.md` | draft | incomplete pending human source verification | EVIDENCE-BASELINE, GAP-026 | Samuel Boadu | 2026-07-19 |

### 5.1 Goal page notes

- A goal page lists records whose research literature sits in that area. Listing a record on a goal
  page is not a statement that the record produces the outcome the goal names.
- Sexual health research is deliberately not carried as its own goal page in this first pass.
  PT-141 sits under endocrine and hormonal axis research pending a founder decision on whether a
  separate goal page is appropriate for a member-facing surface.
- Goal-to-record assignment is itself unverified until a human confirms it. That is tracked as
  GAP-026.

## 6. Commerce approval state

Commerce is tracked separately from content, and every category is currently blocked. A content
record may exist, be reviewed, and be approved while all of the following remain blocked.

| Category | Commerce approval state | Fulfillment owner, first ~60 days | Notes |
| --- | --- | --- | --- |
| Peptide research products (P001 to P015) | Blocked. Not authorized. | Mitch | No sale, no pre-sale, no waitlist implying availability, no price display, until written approval exists. |
| Quantum | Blocked. Not authorized. | Mitch | Product identity and regulatory classification are both unresolved (GAP-019, GAP-020). Quantum stays outside ordinary shipped-product checkout. |
| Supplements (reseller activity) | Blocked. Not authorized. | Xenios | Momentous and Pure Encapsulations reseller authorization is unresolved (GAP-012, GAP-013). No authorization is asserted anywhere without written evidence. |

xenios does not state, imply, or display anywhere that it is authorized to resell, distribute, or
sell any product without written evidence on file.

## 7. Board totals

| Record type | Count | In `draft` | Advanced beyond `draft` |
| --- | --- | --- | --- |
| Product records | 15 | 15 | 0 |
| Individual compound Guides | 20 | 20 | 0 |
| Blend Guides | 6 | 6 | 0 |
| Goal pages | 11 | 11 | 0 |
| Total | 52 | 52 | 0 |

## 8. Maintenance rules

1. This board is updated in the same change as the content record it describes. A record that moves
   state without a board update is treated as still being in its previous state.
2. `last_reviewed` records the date a human last looked at the record, not the date a file was
   edited. An automated edit does not refresh `last_reviewed`.
3. A record may not advance to `founder-review` while any `SUPPLIER-BASELINE` or
   `EVIDENCE-BASELINE` gap in its row is open.
4. When a gap closes, update `docs/research-content/OPEN_RESEARCH_GAPS.md` first, then remove the
   gap id from every row here that referenced it.
5. New records are appended to the appropriate section at state `draft` with evidence completeness
   `incomplete pending human source verification`. There is no other valid starting state.
