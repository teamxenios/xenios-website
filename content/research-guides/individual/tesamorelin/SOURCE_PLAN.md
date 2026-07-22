---
title: "Tesamorelin Source Plan"
type: source-plan
compound: tesamorelin
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# Source Plan: Tesamorelin

Search session date: 2026-07-19. This document records how the evidence base for the
Tesamorelin Research Guide was assembled, what was deliberately excluded, and what a human
reviewer still needs to search and verify before publication.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## 1. Why this compound needed a different search design

Most compounds in this Guide series are never-approved peptides where the search question is
simply "does human evidence exist." Tesamorelin is the opposite case. It is genuinely
FDA-approved, and it carries substantial, replicated randomized human evidence. The search
question was therefore not whether evidence exists but **who the evidence is about**.

The entire search was built around one distinction:

- **Evidence in HIV-associated lipodystrophy.** This is the approved indication and the
  population in which the pivotal trials were run.
- **Evidence in any other population.** This is what a member reading a peptide Guide is
  almost certainly asking about, and it is a separate literature that may or may not exist.

Treating these as one body of evidence produces a badly misleading picture, because a strong
finding in the first category reads as a general finding. Separating them was the primary
design goal of the search, not a refinement applied afterwards.

A secondary design goal followed from the approval itself. Because the phrase "FDA-approved
peptide" is technically true for tesamorelin, the search also had to establish precisely
**what the approval attaches to**: which products, which manufacturer, which indication, and
which population. That is a product-registry question, not a literature question, so the
DailyMed product listing was treated as a primary source in its own right.

## 2. Databases and registries consulted

| Resource | What it was used for | Outcome |
|---|---|---|
| DailyMed (dailymed.nlm.nih.gov) | Current FDA-approved labeling, indication wording, Limitations of Use, contraindications, Warnings and Precautions | Retrieved successfully. Both current product labels obtained. This is the primary regulatory source for the Guide |
| DailyMed product search | Establishing how many licensed tesamorelin products exist and who markets them | Retrieved successfully. Two products, one manufacturer |
| PubMed (pubmed.ncbi.nlm.nih.gov) | Primary literature identification, and a completeness check on the randomized human evidence base | Searched successfully. Five human records retrieved at abstract level and verified |
| ClinicalTrials.gov | Trial registration records for the pivotal trials, and a check for non-HIV body composition trials | Search performed. Individual registration record retrieval FAILED (see section 6). No non-HIV body composition trial found |
| FDA accessdata (drug approval package PDFs) | The original 2010 approval label and later supplements | FAILED. All three attempted label PDFs returned HTTP 404. DailyMed used as the primary substitute |
| FDA warning letters index and individual letters | Enforcement activity relating to grey-market tesamorelin | FAILED. Three attempted letter URLs returned HTTP 404. A targeted site-restricted search surfaced no letter naming tesamorelin |
| FDA bulk drug substances page (section 503A compounding) | Compounding category status | FAILED. HTTP 404 on fetch. Status unresolved, no claim recorded |
| World Anti-Doping Agency (wada-ama.org) | Prohibited List classification | FAILED. Primary list document not retrieved. A mirror returned HTTP 403. Classification recorded as unverified |
| Manufacturer press release (GlobeNewswire) | Corroboration of the 2025 formulation approval date and confirmation that the indication was not widened | Retrieved successfully. Treated as corroborating regulatory context, never as evidence of effect |

## 3. Queries run

Literature queries:

- tesamorelin randomized
- tesamorelin visceral adipose tissue randomized controlled trial
- tesamorelin meta-analysis
- tesamorelin liver fat
- tesamorelin non-HIV body composition
- tesamorelin healthy adults trial
- tesamorelin type 2 diabetes

Regulatory and product queries:

- DailyMed label search: tesamorelin
- EGRIFTA SV prescribing information
- EGRIFTA WR approval
- FDA warning letter tesamorelin (site-restricted)
- FDA 503A bulk drug substances tesamorelin
- WADA prohibited list growth hormone releasing factors

The query "tesamorelin non-HIV body composition" and its variants were run deliberately and
repeatedly, because the answer to that query is the single most decision-relevant fact in
this Guide. Its result is reported in section 5.

## 4. Inclusion criteria

A source was admitted to the evidence spine only if all of the following held.

1. It was actually retrieved during this session, with the exact URL recorded. Nothing was
   cited from memory.
2. It was one of: FDA-approved labeling hosted by the National Library of Medicine, an
   official product registry entry, a PubMed record for a peer-reviewed human study or
   systematic review, or a trial registry record.
3. For any claim about effect, the record described a study in humans, with the population
   stated. The population then travels with the claim everywhere it appears.
4. For any regulatory claim, a jurisdiction, a date checked, and a source URL were all
   available.

One manufacturer press release was admitted for the narrow purpose of corroborating an
approval date and confirming that the indication was not expanded. It is marked as
manufacturer material in the registry and supports no claim about effect or safety.

## 5. Exclusion criteria, and what was disqualified

The following source types are disqualified as evidence in Xenios Research Guides, without
exception, regardless of how confident or specific their claims appear.

- **Peptide vendor and reseller pages.** Commercial interest in the conclusion.
- **Telehealth and clinic marketing pages**, including pages carrying clinician bylines. A
  clinician byline on a page selling the compound does not convert marketing into evidence.
- **Compounding pharmacy product pages.**
- **Wellness, longevity, and biohacking blogs.**
- **Forum, social, and anecdote-based content.**
- **Any page using "research use only" framing.** That phrase is a distribution device, not
  a scientific status, and this Guide never repeats it as though it implied human benefit.
- **Secondary summaries of regulatory documents**, where the primary document exists. Where
  the primary could not be retrieved, the claim is marked unverified rather than sourced to
  the summary.

This exclusion rule did real work on this compound. The specific search for non-HIV human
body composition evidence returned **no** primary trial from PubMed or ClinicalTrials.gov.
Every result for that query was a retailer, telehealth, or peptide-vendor page. Several of
those pages asserted that smaller studies in metabolic syndrome and abdominal obesity show
comparable visceral fat reduction in people without HIV. That assertion could not be traced
to a single retrievable trial. It is therefore recorded as an unverified vendor claim and is
handled explicitly in CONTRADICTIONS.md, rather than being quietly omitted.

The absence of non-HIV body composition evidence is itself a finding, and the Guide reports
it as one. It was not padded with lower-quality material to make the section look fuller.

## 6. Retrieval failures and gaps, recorded honestly

Each of the following is a real gap. None of them was filled from background knowledge, and
no claim resting on them is asserted as fact anywhere in this Guide.

| Gap | What was attempted | Consequence for the Guide |
|---|---|---|
| WADA Prohibited List classification | The primary list document was not retrieved. One mirror returned HTTP 403 | The anti-doping classification is recorded as UNVERIFIED and is not allowed on a member-facing surface until a human confirms the current-year list |
| Pivotal trial NCT registration numbers | ClinicalTrials.gov fetch returned only a page navigation shell, no trial data | Two NCT numbers appeared in search-result text and in a secondary article summary. They are **deliberately absent** from the evidence table. Publishing an unverified registry identifier is worse than publishing none |
| FDA warning letters naming tesamorelin | Three letter URLs attempted, all HTTP 404. A site-restricted search returned nothing naming tesamorelin | No tesamorelin-specific enforcement claim is made anywhere in this Guide. A secondary blog referenced a letter and import alert against a bulk peptide producer. It was not verified and is not recorded as fact |
| FDA section 503A compounding status | The bulk drug substances page returned HTTP 404 | No compounding claim is recorded. One general observation about the different analysis that applies to a substance with an approved product is flagged as regulatory reasoning, not as a retrieved source |
| Original 2010 approval package | Three FDA accessdata label PDFs returned HTTP 404 | The approval **year** is verified from current DailyMed labeling. A specific approval **date** in 2010 appeared only in secondary sources and is not recorded as verified |
| Full texts of the human trials | Not retrieved. All five human records were read at PubMed abstract level | Effect sizes and quoted phrases are abstract-level. Adequate for the claim table, but a reviewer extending any claim beyond the abstract must obtain the full texts |
| Preclinical literature | Not searched to exhaustion | The preclinical evidence table is deliberately empty rather than filled from memory. Given the volume of randomized human evidence for the approved indication, preclinical data is low value here |

## 7. What a human reviewer must still do before publication

In priority order.

1. **Confirm the anti-doping classification** directly against the current-year WADA
   Prohibited List document. The direction of the claim is unlikely to be wrong, but the
   section reference and current wording are unconfirmed, and an anti-doping statement is
   consequential for any member who competes.
2. **Retrieve the pivotal trial registration records** from ClinicalTrials.gov and confirm
   the NCT identifiers before any are added to the evidence table.
3. **Decide whether any FDA enforcement material exists** relating to tesamorelin, by
   retrieving primary warning letters directly. If none is found, the Guide should keep the
   quality section framed on general category risk only, which is where it currently sits.
4. **Resolve the section 503A compounding status** from the current FDA category lists.
5. **Obtain the full texts** of the two pivotal trials and the 2026 meta-analysis if any
   claim needs to go beyond abstract-level detail, particularly on adverse event rates and
   on the durability finding.
6. **Re-run the non-HIV body composition search** independently. This is the load-bearing
   negative finding in the Guide. A second reviewer confirming the absence is worth more
   than any other single verification step, because the entire member-facing framing rests
   on it.
7. **Re-verify all regulatory statements**, since labeling and formulation status change.
   REGULATORY_STATUS.md carries the dated header requiring this.

## 8. Standing search notes for the next revision

- The 2026 meta-analysis is recent. A reviewer revisiting this Guide should check whether
  any newer systematic review has appeared, and specifically whether any randomized trial
  measuring body composition in a non-HIV population has been published or registered since
  this session. That single development would change the Guide materially.
- Watch for indication changes. Across fifteen years and multiple supplements the indication
  has not widened. If that ever changes, most of this Guide changes with it.
- The formulation history matters for product identity. A new formulation approval is not
  new therapeutic territory, and future revisions should keep that distinction visible.
