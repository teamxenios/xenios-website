---
title: GHK-Cu Source Plan
type: research-guide-source-plan
compound: ghk-cu
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# Source plan: GHK-Cu (copper tripeptide-1)

This document records how the evidence base for the GHK-Cu Guide was searched, what was
accepted as evidence, what was refused, and what a human reviewer still has to do before
anything here can be published.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## 1. Scope decision made before searching

GHK-Cu appears in the market in two forms that consumer marketing treats as one thing:

1. A topical cosmetic ingredient carrying the INCI name Copper Tripeptide-1.
2. A grey-market injectable product.

These have different evidence and different regulatory footing. The search was structured to
keep them separate, and every retrieved record was tagged by route before it was allowed into
the evidence tables. Any Guide built on this plan must preserve that separation.

## 2. Databases and registries consulted

- ClinicalTrials.gov, through the public API, for all registered studies.
- PubMed, both a filtered search restricted to clinical trials, randomized controlled trials
  and systematic reviews, and an unfiltered date-sorted search of the whole literature.
- FDA (fda.gov) for compounding bulk drug substance status. Retrieval failed, see section 7.
- Cosmetic Ingredient Review (cir-safety.org) and the journal of record for the relevant
  safety assessment. Retrieval failed, see section 7.
- World Anti-Doping Agency (wada-ama.org) for prohibited-list status. Retrieval failed.
- ECRI, for the joint ECRI and ISMP white paper on compounded peptide products, as a
  category-level quality and safety source.
- Wikipedia, used only for identity, discovery history and mechanism framing, and treated as
  tertiary background rather than evidence.

## 3. Queries run

- ClinicalTrials.gov API: `GHK-Cu OR "copper tripeptide"`, all registered studies.
- PubMed, filtered: `GHK-Cu OR "glycyl-histidyl-lysine"` with the clinical trial, randomized
  controlled trial and systematic review publication-type filters applied. This returned only
  three records in total.
- PubMed, unfiltered and date sorted: `"copper tripeptide" OR "GHK-Cu"`, which returned 92
  publications, overwhelmingly preclinical.
- Direct fetches of the FDA 503A bulks page, the 503B bulks page, the FDA page on bulk drug
  substances that may present significant safety risks, the FDA nominated-bulks PDF, the CIR
  assessment PDF, the corresponding journal page, and the WADA prohibited list.

## 4. Inclusion criteria

A record was admitted to the evidence tables only if all of the following held.

- It was retrieved this session at a stable URL that is recorded in SOURCE_REGISTRY.md.
- It carries a durable identifier (PMID, NCT number) or is an institutional document at its
  own canonical URL.
- Its route of administration and its population are identifiable, so it can be graded and
  scoped correctly.
- For any human claim, the study was conducted in living human subjects. In vitro and ex vivo
  human tissue work was admitted only to the preclinical table.

## 5. Exclusion criteria and disqualified source types

The following were refused as evidence, without exception.

- Peptide retailers, compounding sellers, supplement vendors, and affiliate or review blogs
  monetized on the compound. This class was the majority of search results for GHK-Cu.
  Several such pages stated specific human trial results with confident numbers and no
  citation. Those statements are recorded in the Guide only as a warning about the
  information environment, never as evidence.
- Any trial statistic offered without a PMID, NCT number, DOI, or retrievable citation.
- Testimonial, before-and-after, and practitioner-anecdote content.
- Secondary summaries of regulatory positions, when used to state what a regulator holds.
  Secondary sources may flag a direction to be checked, but the regulatory statement itself
  must come from the regulator's own page.
- Any source that could not actually be retrieved. Where retrieval failed, the item is logged
  as a gap rather than cited from memory.

## 6. Citation rule applied throughout

Only sources actually retrieved this session are cited. No PMID, NCT number, DOI, author,
year, journal, or URL was reconstructed from background knowledge. Where a statement rests on
general background rather than a retrieved source, it is labelled inline as
[UNVERIFIED - background knowledge, requires human source check] and is not permitted to
support a member-facing claim until sourced.

## 7. Retrieval failures carried forward as gaps

These are not soft gaps. Each one blocks a specific statement from publication.

1. FDA compounding bulks lists. The 503A page, the 503B page, the significant-safety-risks
   page and the nominated-bulks PDF all returned HTTP 404 to automated retrieval. GHK-Cu's
   category status, and any route-based distinction, are therefore unverified. This is the
   most important open item in the record.
2. CIR safety assessment primary text. The PDF returned unparseable compressed streams, the
   journal page returned HTTP 403, and a PubMed query for the assessment returned zero
   results. The panel's exact conclusion, and the explicit inclusion of Copper Tripeptide-1
   by name within scope, are unverified.
3. WADA prohibited list. The direct fetch returned no usable content, and every search result
   addressing GHK-Cu's status was a retailer or affiliate page and was rejected. No claim
   about WADA status is made in either direction.
4. Two likely relevant reviews were located as bibliographic records only, because PubMed
   began returning reCAPTCHA challenges before their abstracts could be read. They are listed
   in SOURCE_REGISTRY.md and support nothing at present.
5. The primary papers behind the animal wound-healing findings were seen only through a
   tertiary summary and were not individually retrieved.

## 8. What a human reviewer must search next

1. Confirm GHK-Cu's current status on the FDA compounding bulk substances lists directly on
   fda.gov, including any distinction by route, and record the date checked.
2. Obtain the CIR assessment text and confirm both the panel's conclusion wording and whether
   Copper Tripeptide-1 is named within its scope.
3. Check the current WADA prohibited list directly, and note that an athlete must also check
   with their own sport's authority.
4. Read the two review records listed as bibliographic-only in SOURCE_REGISTRY.md and decide
   whether either changes the grading in CLAIM_TABLE.md.
5. Retrieve the abstracts for the preclinical records that were captured at title level only,
   so that their findings can be stated with the model named, or dropped.
6. Retrieve the primary animal wound-healing papers, or drop the animal wound-healing claim.
7. Attempt once more to locate the three vendor-claimed human trials described in
   CONTRADICTIONS.md. If they still cannot be located in any registry or index, that finding
   should be stated plainly in the Guide.
8. Monitor the registered vehicle-controlled topical trial recorded in SOURCE_REGISTRY.md for
   posted results. It is the single study most likely to change this Guide.

## 9. Honest position of this record

The controlled human evidence for GHK-Cu is small and largely negative, and the human
evidence for systemic administration is absent rather than thin. An empty or negative
evidence table is the correct output here, not a failure of searching.
