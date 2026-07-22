---
title: Dihexa Source Plan
type: research-guide-source-plan
compound: dihexa
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# Dihexa Source Plan

This document records how the evidence base for the Dihexa Guide was assembled, what was
deliberately excluded, and what a human reviewer still has to do before anything in this folder
is published.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## 1. Objective of the search

Establish, for dihexa specifically and not for the wider angiotensin IV literature and not for
the separate clinical candidate fosgonimeton, four things:

1. Whether any human evidence of any study design exists.
2. What the preclinical record actually shows, with the species or model attached to every finding.
3. What the proposed mechanism is, and whether that mechanism itself generates a safety concern.
4. What the current regulatory position is, with jurisdictions, dates, and source URLs.

The search was designed so that an empty human evidence table would be a valid and reportable
result rather than a failure to be filled with substitutes. For this compound the most likely
substitute was obvious in advance: the clinical trial programme of a different, related molecule.
Guarding against that substitution was a primary design goal of the search.

## 2. Databases and registries consulted

| Resource | What was queried | Outcome |
| --- | --- | --- |
| ClinicalTrials.gov API v2 | Term "Dihexa", with countTotal enabled. | totalCount 0. No registered interventional or observational study exists in the registry. |
| ClinicalTrials.gov API v2 | Term "fosgonimeton", to characterise the separate clinical candidate that is routinely confused with dihexa. | Five registered studies returned with their NCT identifiers, phases, and statuses. |
| ClinicalTrials.gov API v2 | ADVERSARIAL CONTROL. A deliberately fake record identifier, NCT99999999. | HTTP 404 Not Found, confirming the retrieval path does not silently invent records. |
| ClinicalTrials.gov API v2 | ADVERSARIAL CONTROL. A positive control query on "semaglutide". | totalCount 744 with real NCT identifiers, confirming the same retrieval path returns records when records exist. |
| PubMed, via NCBI E-utilities esearch | Term "dihexa". | 18 records, none of a clinical trial publication type. |
| PubMed, via NCBI E-utilities esearch | "dihexa" restricted to the clinical trial or randomized controlled trial publication types. | Zero records. |
| PubMed and PMC | The foundational mechanistic and behavioural paper, PMID 25187433. | Retrieved and read. |
| PubMed | PMID 38489193, a 2024 rat study reporting a negative result. | Retrieved and read. Deliberately sought, because a negative result is the finding most likely to be missing from secondary coverage. |
| PubMed | PMID 29733881, a systematic review of experimental angiotensin IV and cognition studies. | Retrieved and read. Confirmed to contain no human studies. |
| PubMed | PMID 22530990 and PMID 33123991, two oncology reviews of HGF and c-Met signalling. | Retrieved and read. These establish the basis of the central safety concern. |
| ALZFORUM therapeutics database | The fosgonimeton entry, for the relationship to dihexa and the trial outcomes. | Retrieved and read. |
| Alzheimer's Drug Discovery Foundation, Cognitive Vitality | The dihexa report PDF. | PDF retrieved but not machine-parsed in this environment. Content known only through a model-generated summary. Paraphrase only. No wording from it may be quoted. |
| FDA (fda.gov) | The 503A bulk drug substances compounding page, sought because secondary pages assert a category placement for dihexa. | NOT RETRIEVED. Two attempts returned HTTP 404 to the fetch tool. No FDA-sourced statement about dihexa was obtained. |
| WADA | The current Prohibited List. | NOT RETRIEVED. The official page returned empty content and two mirror PDFs returned HTTP 403 and unparseable binary. |

Registries that were NOT searched: the EU Clinical Trials Register, ISRCTN, the WHO ICTRP, and
the Japanese and Chinese national registries. See section 6.

## 3. Inclusion criteria

A source was admitted to the registry if all of the following held.

1. It was retrieved in this research session at a recorded URL. Nothing was admitted from memory.
2. It addresses dihexa itself, or it is explicitly labelled as addressing something adjacent (the
   HGF and c-Met pathway in cancer, the wider angiotensin IV literature, the separate compound
   fosgonimeton) and is used only for that adjacent purpose.
3. Its species or model is identifiable, so that a preclinical finding can never be written
   without the model in the same sentence.
4. For regulatory statements, a jurisdiction, a date checked, and a URL are all available.

## 4. Exclusion criteria

A source or a claim was excluded if any of the following held.

1. **Vendor, research-chemical retailer, and consumer peptide pages are disqualified as evidence.**
   They surfaced prominently in every search performed. They may be cited only to document where an
   unverifiable claim originated, and such an entry is marked as non-evidence in the registry. No
   number, mechanism, or safety statement enters the Guide on the authority of a page that sells
   the compound.
2. Content-marketing and SEO pages presenting confidently worded accounts of dihexa "clinical
   trials", "FDA category status", or "WADA status". Several appeared in this session's results.
   None is admissible.
3. Search-engine answer summaries used as a substitute for the underlying document.
4. Any statistic or comparative figure without a retrieved primary source. This specifically covers
   a widely repeated potency multiplier comparing dihexa to brain-derived neurotrophic factor,
   whose primary source was not opened this session. It is excluded by name in the claim table so
   that it cannot re-enter later.
5. Evidence about compounds that are not dihexa, when presented as if it were dihexa evidence. This
   applies above all to fosgonimeton, also known as ATH-1017 and formerly NDX-1017, which is a
   distinct clinical candidate with registered human trials. Its results are excluded from dihexa
   claims entirely and are recorded only as a contrast.
6. Any dose, route, schedule, or preparation detail appearing in an admitted source. These are not
   reproduced anywhere in the Guide.

## 5. Grading approach

Claims are graded individually, never the compound as a whole. The default grade is D (preclinical)
or G (unverified). A grade of C or better requires a specific retrieved human study of dihexa, and
none exists, so no claim in this folder is graded A, B, or C. Claims that could mislead a member
regardless of hedging are marked PROHIBITED and listed separately.

## 6. Verification of the null result

An empty human evidence table is a strong claim, and it was tested rather than assumed. The
retrieval path was checked adversarially in both directions in the same session and against the
same API.

- A deliberately fake record identifier, NCT99999999, returned HTTP 404 rather than a fabricated
  record. The tool does not invent records.
- A positive control query on semaglutide returned totalCount 744 with real identifiers. The tool
  does return records when records exist.

Between those two controls, the zero result for dihexa reflects genuine absence in the registry
rather than a broken query or a silent failure. A reviewer re-running this check should re-run both
controls alongside it.

## 7. What remains for a human reviewer

These are open items, not minor tidying. Each one should be closed before publication.

1. **Open the FDA compounding pages directly in a browser.** Both attempted fetches returned HTTP
   404. No FDA statement about dihexa appears anywhere in this folder, and none may be added until
   a human reads the source. Secondary pages asserting a 503A Category 2 placement for dihexa were
   seen and are deliberately not repeated here.
2. **Read the current WADA Prohibited List directly** and determine whether dihexa is named. The
   folder currently states only that this could not be confirmed. The S0 non-approved substances
   characterisation circulating on aggregator pages is unconfirmed and is not published as fact.
   Athletes should be directed to their own anti-doping authority rather than to any inference.
3. **Open the Alzheimer's Drug Discovery Foundation Cognitive Vitality PDF** and confirm its
   wording. It was retrieved but could not be parsed to text in this environment, so its content is
   known only through a model summary. Nothing from it may be published as a quotation.
4. **Retrieve and read the primary source** for dihexa's reported HGF binding affinity figure and
   for the circulating potency comparison against brain-derived neurotrophic factor. Neither was
   opened this session. The comparison must not be published even after verification unless it is
   framed as an in-vitro assay comparison in a non-human system.
5. **Search for systematic toxicology or carcinogenicity studies of dihexa in any species.** None
   was located this session, but its absence was not affirmatively confirmed. Given that the
   central safety concern is oncologic, this is the highest-value open search in the list.
6. **Confirm the reported CAS registry number** against an authoritative chemical registry. It
   appeared only on vendor pages and its digits are deliberately not reproduced in this folder.
7. **Read the remaining PubMed records.** Eighteen records were returned for the term dihexa and
   only the load-bearing ones were read individually. None is of a clinical trial publication type,
   so this is unlikely to change the central finding, but it should be closed for completeness.
8. **Search the additional trial registries** listed at the end of section 2, so that the zero
   result is global rather than United States centred.
9. **Re-read the ALZFORUM fosgonimeton entry** and confirm the trial outcomes recorded in this
   folder, since the fosgonimeton contrast is the single most load-bearing corrective in the Guide.
