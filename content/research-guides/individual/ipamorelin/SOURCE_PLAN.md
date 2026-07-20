---
title: Ipamorelin Source Plan
type: research-guide-source-plan
compound: ipamorelin
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# Ipamorelin: Source Plan

This document records how the evidence base for the Ipamorelin Guide was assembled, what
was deliberately excluded, and what a human reviewer still has to do before any of this
reaches a member.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## 1. Question the search was built to answer

Four questions, in this order of priority:

1. What is ipamorelin, precisely, and what is it commonly confused with?
2. What human evidence exists, for any outcome, and what did it show?
3. What is its regulatory status, by jurisdiction, as of the date checked?
4. What is known about product quality and identity in the market where members
   would encounter it?

A fifth question was treated as a control: what do commercial sellers claim, and does
the literature support those claims? Commercial pages were read only to identify claims
worth checking. They were never treated as evidence.

## 2. Databases and registries consulted

| Source type | Resource | What it was used for |
| --- | --- | --- |
| Trial registry (primary) | ClinicalTrials.gov API v2 | Complete list of registered ipamorelin studies, sponsor, phase, enrollment, status, and whether results were posted |
| Literature database (primary) | PubMed | Peer-reviewed human and preclinical studies, anti-doping analytical work, peptide quality-control literature |
| Regulator (primary) | fda.gov | Attempted for 503A bulk drug substances list, Category 2 designations, Pharmacy Compounding Advisory Committee (PCAC) materials. NOT RETRIEVED, see section 6 |
| Regulator (primary) | Federal Register | Attempted for the PCAC meeting notice. NOT RETRIEVED, see section 6 |
| Anti-doping authority (primary) | wada-ama.org, usada.org | Attempted for the WADA Prohibited List document. NOT RETRIEVED, see section 6 |
| Investigative journalism (secondary) | ProPublica | Used as a substitute account of FDA's Category 2 action only because fda.gov was unreachable |
| Trade association (secondary) | Alliance for Pharmacy Compounding | Used as a substitute account of the October 29, 2024 PCAC vote |
| Legal practice analysis (secondary) | Boesen Snow Law | Used as a substitute account of the April 15, 2026 Category 2 removals and the July 2026 PCAC agenda |

## 3. Queries run

Registry queries:

- ClinicalTrials.gov API v2, term "ipamorelin", page size 50, to enumerate all registered studies
- ClinicalTrials.gov API v2, single-study fetch for NCT01280344
- ClinicalTrials.gov API v2, single-study fetch for NCT00672074

Literature queries:

- PubMed term search "ipamorelin" (returned 53 records across 6 result pages)
- The same search restricted by the humans filter (returned 27 records)
- Targeted record retrieval for PMIDs 25331030, 10496658, 25869809, 9849822
- Peptide product quality and counterfeiting searches, which returned PMIDs 18342612,
  26003685, and 41880199

Regulatory queries:

- Direct fetch attempts against fda.gov pages for the 503A bulks list, the Category 2 list,
  the PCAC meeting calendar entry for October 29, 2024, and two FDA media documents
  (a briefing document and meeting minutes)
- Direct fetch attempts against the WADA Prohibited List PDF, a WADA athlete guide PDF,
  a third-party mirror, drugs.com, and usada.org
- Federal Register notice for the PCAC meeting
- Secondary retrieval of the ProPublica article, the Alliance for Pharmacy Compounding
  report, and the Boesen Snow Law analysis

## 4. Inclusion criteria

A source was included if all of the following held:

- It was actually retrieved during the research session on 2026-07-19, at a recorded URL
- It is a trial registry record, a peer-reviewed publication, a regulator or anti-doping
  authority document, or a disinterested secondary account of a regulatory action that
  could not be retrieved at its primary source
- Its role in the record is stated explicitly, including whether it supports a human
  claim, a preclinical claim, an analytical or forensic claim, or a regulatory claim

Preclinical work was included, but only when the model or species can be carried in the
same sentence as the finding. A preclinical finding that cannot be stated with its model
attached is not usable in this Guide.

## 5. Exclusion criteria and disqualified source types

The following are disqualified as evidence for any claim in this Guide, without exception:

- Peptide vendor, reseller, and marketplace pages, including their reference lists
- Telehealth clinic, longevity clinic, and med-spa marketing pages
- Supplement and nootropic affiliate content, ranked list sites, and coupon or review sites
- Manufacturer or compounder product literature and certificates supplied by a seller
- Forum posts, subreddits, anecdote threads, and social media
- Content marketing that cites a real study but describes an outcome the study did not measure

These were read in search results only, to identify which claims circulate in the market so
that those claims could be checked against the literature. Where a commercial claim conflicts
with the retrieved literature, the conflict is recorded in CONTRADICTIONS.md and the commercial
position is not carried forward.

Also excluded:

- Any dose, amount, concentration, frequency, schedule, cycle, route, or preparation detail
  appearing in any retrieved source. These were not recorded and are not reproduced anywhere
  in this Guide.
- Sourcing, purchasing, or acquisition guidance of any kind.
- Background knowledge that could not be tied to a retrieved source, unless explicitly marked
  [UNVERIFIED - background knowledge, requires human source check] and flagged for deletion or
  sourcing by a reviewer.

## 6. Retrieval failures that materially limit this record

These are not minor. They shape how conservatively the Guide must be written.

1. fda.gov was entirely unreachable during the session. Every attempted FDA URL failed.
   As a result, every FDA statement in this record is secondhand, drawn from journalism,
   a trade association, and a law firm analysis. None of it has been confirmed against the
   regulator.
2. The FDA PCAC briefing document on ipamorelin could not be retrieved. That document is
   the single most important primary source on FDA's safety assessment of this compound,
   and it is missing from the record.
3. The WADA Prohibited List document could not be retrieved. Prohibited status rests on a
   peer-reviewed anti-doping paper stating it, not on the list itself. No S2 subsection
   number may be published until a human confirms it in the actual WADA document.
4. The Federal Register notice for the PCAC meeting could not be retrieved.
5. A 2020 peer-reviewed review of growth hormone secretagogues, which would have provided
   a synthesis of the class development history, returned an access error.
6. Four preclinical records were captured at title level only, from the PubMed results
   listing. Their identifiers, titles, journals, and years are verified. Their detailed
   findings are not.
7. PubMed reported 53 total records and 27 under the humans filter. Only the first page of
   each was examined. A complete page-by-page sweep was not performed.

## 7. What a human reviewer must still search

Before publication, in priority order:

1. fda.gov directly. Confirm ipamorelin's current position on the interim 503A bulk drug
   substances list, confirm the 2023 Category 2 designation, and confirm whether the
   April 15, 2026 Category 2 removals included ipamorelin. Nothing in REGULATORY_STATUS.md
   should survive review unchecked.
2. The FDA PCAC briefing document and meeting minutes for the October 29, 2024 meeting,
   including the numeric vote tally, which this record does not have.
3. The current WADA Prohibited List document itself, to confirm the class entry and, if it
   is to be cited at all, the correct subsection.
4. The remaining five pages of PubMed results and the remaining humans-filtered records,
   to close out the possibility of a missed primary human study.
5. Abstracts for the four title-level preclinical records, so that each either gains a
   stated finding with its model, or is removed.
6. Any FDA warning letters or import alerts naming ipamorelin sellers, which could not be
   searched because fda.gov was unreachable.
7. A published analytical survey of the identity and purity of consumer products labeled
   as ipamorelin. None was located. If none exists, the Guide should say so plainly rather
   than substitute analogue evidence without labeling it as analogue.
8. Non-US regulatory status. No jurisdiction outside the United States was searched in this
   session beyond confirming that no approval was identified anywhere. UK, EU, Australian,
   and Canadian status is unsearched.

## 8. Standing rule for this compound

The consumer use case for ipamorelin (body composition, recovery, sleep, healing, aging)
has no located human trial evidence of any kind. The correct output for that section of the
Guide is an empty evidence table with an explanation, not a mechanism narrative written to
fill the space. Any draft that reads as though benefit has been shown in people has failed
review, regardless of how carefully it is hedged.
