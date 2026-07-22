---
title: "TB-500 Source Plan"
type: research-guide-source-plan
compound: TB-500
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# TB-500 Source Plan

This document records how the evidence base for the TB-500 Research Guide was assembled,
what was deliberately excluded, and what a human reviewer still needs to search before
this Guide is published.

All retrieval described here was performed on 2026-07-19. Every regulatory statement in
this Guide carries its own date, jurisdiction and source URL, and must be re-verified
before publication.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## 1. Objective

Establish, from primary sources only, what is actually known about TB-500 in humans, what
is known only in animal or cell systems, what is unknown, and what its regulatory status
is by jurisdiction.

This compound carries one specific research hazard that shaped the entire search strategy.
TB-500 is a synthetic seven-amino-acid acetylated fragment (Ac-LKKTETQ, residues 17-23 of
thymosin beta-4). Thymosin beta-4 is the full-length 43-amino-acid protein. They are
different molecules. Almost every human trial that commercial sources attach to "TB-500"
was in fact a trial of full-length thymosin beta-4, or of a formulated investigational
product built from it. The search was therefore run so that every human study could be
sorted by which molecule was actually administered, before any claim was written.

The honest answer this search produced is that human evidence for TB-500 itself is absent.
The Guide is written to be correct in that state.

## 2. Databases and registries consulted

| Source type | Consulted | Notes |
| --- | --- | --- |
| PubMed | Yes | Primary literature for identity, metabolism, doping control, ophthalmic and wound trials of the parent protein, and grey-market peptide quality. |
| ClinicalTrials.gov | Yes | API v2. A full query for "thymosin beta 4" returned 18 registered studies, which were sorted by molecule. Exactly one studies the TB-500 fragment. |
| USADA (US Anti-Doping Agency) | Yes | The 2018 Prohibited List summary of major changes was retrieved and names TB-500 explicitly. |
| WADA (World Anti-Doping Agency) | Attempted, failed | Three attempts (Prohibited List landing page, the 2026 list PDF, and a TB-500 metabolism research page) returned empty content to the fetcher. Prohibited status was therefore established indirectly. Logged as a gap. |
| FDA (fda.gov) | Attempted, failed | Five separate URLs returned HTTP 404 to the fetcher, including the 503A bulks list, the significant-safety-risks list, a warning letter, the July 2026 advisory committee page, and the nomination page. No FDA claim is verified in this Guide. Logged as a gap. |
| Federal Register | Partially | The API returned document 2026-07361 (Pharmacy Compounding Advisory Committee meeting notice, published 2026-04-16). The abstract names no substances, so it does not inform this compound. Document pages themselves redirect the fetcher to an unblock interstitial. |
| precision.fda.gov (GSRS substance registry) | Attempted, failed | Returned empty content. The FDA substance-registry identity record (UNII, substance class) was not captured. |
| Embase, Cochrane | No | Not queried. Logged as a gap. |
| EU Clinical Trials Register, EudraCT, ISRCTN, ANZCTR, Chinese trial registry | No | Not searched. Logged as a gap. |
| Vendor, retailer and peptide industry pages | Encountered, not used | Disqualified as evidence. See section 5. Their conflicting claims are recorded only in CONTRADICTIONS.md as claims, never as findings. |

## 3. Queries run

The following queries were executed, and their results are reflected in SOURCE_REGISTRY.md.

1. ClinicalTrials.gov API v2, full query for the term `thymosin beta 4`. Eighteen registered
   studies returned. Each was checked for which molecule it administers. Exactly one
   (NCT07487363) studies the TB-500 fragment. This sorting step is the backbone of the Guide.
2. ClinicalTrials.gov API v2, direct retrieval of NCT07487363.
3. PubMed record retrieval, by PMID, for records confirmed to exist by retrieval:
   23084823, 38382158, 41476424, 25826322, 17495250, 26003685.
4. PMC full record retrieval for PMC9820614 (the RGN-259 Phase 3 report).
5. Direct retrieval of the USADA 2018 Prohibited List summary of major changes.
6. Federal Register API retrieval of document 2026-07361.
7. Repeated attempts against fda.gov, wada-ama.org and precision.fda.gov, all of which
   failed. The failures are recorded rather than worked around.

## 4. Inclusion criteria

A source was included if all of the following held.

- It was retrieved directly during the 2026-07-19 session, at a URL recorded in the source
  registry.
- It is a peer-reviewed indexed publication, a clinical trial registry entry, a database
  query result, an anti-doping authority document, or a government regulatory notice.
- Its claims can be attributed precisely, with the population, and the model or species,
  stated.
- For any human study, the molecule actually administered could be identified from the
  retrieved record.

No PMID, NCT number, DOI, author, journal, year or URL was constructed, inferred or
recalled from memory. Where a source could not be retrieved, the claim that depended on it
was dropped and logged as a gap.

## 5. Exclusion criteria

The following are disqualified as evidence for this Guide and were not used to support any
claim.

- Vendor, retailer, marketplace and compounding pharmacy pages of any kind, including their
  certificates of analysis, their citation lists, and their summaries of studies. These are
  commercial documents, not evidence. Several were encountered during the session and
  several made regulatory claims that conflict with each other. Those conflicts are logged
  in CONTRADICTIONS.md as unresolved vendor claims, not as findings.
- Peptide industry blogs, affiliate content and supplement review sites.
- Forum, social media and podcast claims.
- Search engine result summaries and AI-generated overviews.
- Any source that could not be retrieved.
- Any dosing, administration, protocol, reconstitution, route or acquisition content from
  any source. Where a retrieved source stated a formulation concentration or an
  administration frequency, it was omitted at the point of extraction and never entered
  this record.

## 6. Handling rules applied

- **The molecule sorting rule.** Every human study is labelled with the molecule actually
  administered. A trial of full-length thymosin beta-4, or of a formulated investigational
  product such as RGN-259 or NL005, is never presented as TB-500 evidence. This is the
  single most important rule in this Guide.
- Preclinical findings carry the species or model in the same sentence as the finding. No
  mechanism sentence appears without its model attached.
- Reported effects are written as "has been studied for", "reported in", or "investigated
  as". No outcome is described as guaranteed.
- Safety is never described as established. Where human safety data is absent, the Guide
  says it is absent.
- A registered but ongoing trial with no posted results is treated as evidence that human
  study has begun, and as evidence of nothing else.
- Statements resting on general background knowledge rather than a retrieved source are
  labelled inline as unverified and requiring a human source check.

## 7. Remaining for a human reviewer

These items could not be resolved in this session and must be closed before publication.

1. **All FDA status, of every kind.** Every fda.gov URL attempted returned HTTP 404. That
   means approval status, 503A and 503B compounding category, the significant-safety-risks
   list, and enforcement content are all unverified here. A reviewer must check fda.gov
   directly. No FDA claim may be published on the basis of this record alone.
2. **The FDA warning letter to GenoGenix LLC** (reference 718739, dated 2026-01-20)
   concerning Thymosin Beta-4 appeared in search results and would be directly relevant
   regulatory evidence. The page could not be retrieved, so its content is recorded nowhere
   in this Guide as a finding. A reviewer should retrieve it.
3. **The current WADA Prohibited List text.** Prohibited status was verified only through
   USADA's 2018 summary and through peer-reviewed doping-control literature. The 2026 list
   wording and subsection numbering were not read. The practical statement (TB-500 is named
   and prohibited at all times) is safe to make. The exact section citation is not.
4. **The FDA substance registry record** for TB-500 on precision.fda.gov, for UNII and
   substance class, which returned empty content.
5. **The Vanhee 2015 illegal-peptide panel composition.** Only the abstract was available.
   It does not enumerate which 25 peptides were covered, and does not report per-sample
   mislabelling rates. It is therefore unknown whether TB-500 or thymosin beta-4 was in the
   panel. No mislabelling percentage may be attached to TB-500 from this paper.
6. **The widely repeated grey-market mislabelling figure** (approximately 30 percent of
   samples mislabelled, misdosed or contaminated) appeared only in commercial sources. The
   underlying analysis was not located. It is excluded from this Guide and must not be added
   without a retrieved primary source.
7. **Primary preclinical studies behind the 2026 narrative review.** The review's summary
   statement about angiogenesis and tissue repair in preclinical models rests on studies
   that were not individually retrieved. Those claims are attributed to the review, not to
   primary work.
8. **Full-length thymosin beta-4 acute myocardial infarction programs** (several
   registrations were seen in the registry query, and the NL005 program). Their results were
   not examined. They would not be TB-500 evidence in any case, but a reviewer may want them
   on file for the molecule-confusion section.
9. **Non-US and non-anti-doping jurisdictions.** No European, UK, Australian, Canadian or
   Japanese regulator was checked. The Guide therefore makes no claim about any of them.
10. **Oncologic risk from the proposed pro-angiogenic mechanism.** No retrieved source
    evaluated this question for TB-500 in either direction. It is recorded as an open
    question, not as a finding, and must not be resolved from background reasoning.
