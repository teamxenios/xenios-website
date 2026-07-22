---
title: KPV Source Plan
type: research-guide-source-plan
compound: KPV (Lys-Pro-Val)
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# KPV Source Plan

This document records how the evidence base for the KPV Guide was assembled, what was
deliberately excluded, and what a human reviewer still has to do before anything in this
folder is published.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## 1. Objective of the search

Establish, for KPV specifically and not for the wider alpha-melanocyte-stimulating hormone
(alpha-MSH) literature, three things:

1. Whether any human evidence of any study design exists.
2. What the preclinical record actually shows, with the species or model attached to every finding.
3. What the current regulatory position is in the United States, with dates.

The search was designed so that an empty human evidence table would be a valid and reportable
result rather than a failure to be filled with substitutes.

## 2. Databases and registries consulted

| Resource | What was queried | Outcome |
| --- | --- | --- |
| ClinicalTrials.gov API v2 | Term "KPV". A secondary query on "lysine-proline-valine". | Zero studies for KPV. The secondary query returned only unrelated amino-acid studies matched on keyword. |
| PubMed, via NCBI E-utilities esearch | KPV in title or abstract, restricted to the clinical trial publication type. | Zero records. |
| PubMed, via NCBI E-utilities esearch and esummary | KPV together with alpha-MSH. | 17 records. Titles, journals, years and publication types verified. None indexed as a clinical trial. |
| PubMed, via NCBI E-utilities efetch | Full abstracts for six records judged most load-bearing (four primary preclinical, two reviews). | Retrieved and read. |
| PubMed, via NCBI E-utilities efetch | One market-surveillance study on the unregulated online peptide supply channel. | Retrieved and read. It concerns a different peptide and is used only as channel evidence. |
| FDA (fda.gov, cacmap.fda.gov) | 503A bulk drug substances lists, Category 1 and 2 and 3 pages, the Pharmacy Compounding Advisory Committee meeting page. | Not retrieved. Direct fetches returned HTTP 404 and HTTP 403, consistent with bot blocking rather than genuine absence. |
| Federal Register | Document 2026-07361, the Pharmacy Compounding Advisory Committee notice of meeting and public docket. | Title and existence confirmed via search metadata only. Full text blocked by a redirect, and the public-inspection PDF was unparseable. |
| WADA | The current Prohibited List. | PDF could not be parsed on two separate attempts, both returning empty content. Presence or absence of KPV was not confirmed by direct reading. |
| Regulatory trade press (RAPS, BioSpace) | KPV and the peptide compounding review. | Retrieved and read. These are the actual basis for every FDA statement in this Guide. |
| Advocacy public comment (Partnership for Safe Medicines) | Comments to the advisory committee naming the substances under review. | Retrieved and read. Attributed as advocacy, not as a regulator finding. |

Registries that were NOT searched: the EU Clinical Trials Register, ISRCTN, the WHO ICTRP,
and the Japanese and Chinese national registries. See section 6.

## 3. Inclusion criteria

A source was admitted to the registry if all of the following held.

1. It was retrieved in this research session at a recorded URL. Nothing was admitted from memory.
2. It addresses KPV itself, or it is explicitly labelled as addressing something adjacent
   (the supply channel, the parent hormone, a different peptide) and is used only for that
   adjacent purpose.
3. Its species or model is identifiable, so that a preclinical finding can never be written
   without the model in the same sentence.
4. For regulatory statements, a jurisdiction, a date and a URL are all available.

## 4. Exclusion criteria

A source or a claim was excluded if any of the following held.

1. **Vendor, retailer, clinic marketing, and compounding-pharmacy pages are disqualified as
   evidence.** They may be cited only to document where an unverifiable claim originated, and
   such an entry is marked as non-evidence in the registry. No number, mechanism, or safety
   statement enters the Guide on the authority of a page that sells the compound.
2. Substack posts, supplement blogs, and "FDA status tracker" pages maintained by sellers.
3. Search-engine answer summaries used as a substitute for the underlying document. Several
   such summaries asserted a past-tense outcome for a regulatory meeting that had not yet
   occurred, which is exactly the failure mode this rule exists to catch.
4. Any statistic without a locatable primary source. A specific set of widely circulated
   gray-market failure percentages was found to trace only to vendor blogs and is excluded
   by name in the claim table so that it cannot re-enter later.
5. Evidence about compounds that are not KPV, when presented as if it were KPV evidence.
   This applies to KdPT, to the dimer (CKPV)2, to full-length alpha-MSH, and to melanocortin
   receptor agonists. Their results are excluded from KPV claims entirely.
6. Any dose, route, schedule, or preparation detail appearing in an admitted source. These
   are not reproduced anywhere in the Guide.

## 5. Grading approach

Claims are graded individually, never the compound as a whole. The default grade is D
(preclinical) or G (unverified). A grade of C or better requires a specific retrieved human
study, and none exists for this compound, so no claim in this folder is graded A, B, or C.
Claims that could mislead a member regardless of hedging are marked PROHIBITED and listed
separately.

## 6. What remains for a human reviewer

These are open items, not minor tidying. Each one should be closed before publication.

1. **Open the FDA pages directly in a browser.** Every FDA statement in this folder rests on
   secondary trade reporting because fda.gov and its mirror were unreachable in this session.
   Confirm the Category 2 placement, the stated rationale, and the meeting agenda from FDA
   itself.
2. **Retrieve the advisory committee briefing document** once published, and check whether the
   concerns circulating in secondary summaries are actually FDA's words. They are not attributed
   to FDA anywhere in this folder because that could not be confirmed.
3. **Confirm the outcome of the July 2026 advisory committee meeting.** As of the research date
   the meeting had not occurred. No outcome is stated anywhere in this folder. Anyone updating
   this Guide must read the actual record rather than a summary of it.
4. **Read the Federal Register notice in full** to confirm the verbatim list of substances on
   the agenda, which was corroborated only indirectly.
5. **Read the current WADA Prohibited List directly** and determine whether KPV is named. The
   Guide currently states only that this could not be confirmed. Athletes should be directed to
   their own anti-doping authority rather than to any inference made here.
6. **Search a primary source for the intestinal peptide transporter (PepT1) uptake mechanism.**
   It is the single most repeated mechanistic claim in marketing material and no primary paper
   establishing it was retrieved. Suggested starting point is the intestinal peptide-transport
   literature.
7. **Verify the chemical registry number and molecular weight** against a primary chemical
   registry. The figures encountered appeared only on vendor pages and are marked
   [UNVERIFIED - background knowledge, requires human source check].
8. **Retrieve the remaining abstracts.** Eleven of the seventeen PubMed records had titles
   verified but abstracts not individually read. None is indexed as a clinical trial, so this is
   unlikely to change the central finding, but it should be closed for completeness.
9. **Search the additional trial registries** listed at the end of section 2.
10. **Resolve the date stamp.** Sources in this folder are marked VERIFIED 2026-07-19 in line
    with the review date on these files, while the underlying research record carries retrieval
    timestamps of 2026-07-20. A reviewer should reconcile the two before publication so the
    dated header is exact.
