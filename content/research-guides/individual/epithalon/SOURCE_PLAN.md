---
title: Epithalon Source Plan
type: research-guide-source-plan
compound: epithalon
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# Epithalon Source Plan

This document records how the evidence base for the Epithalon Guide was assembled, what was
deliberately excluded, and what a human reviewer still has to do before anything in this folder
is published.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## 1. Objective of the search

Establish four things for the synthetic AEDG tetrapeptide specifically, and not for the wider
pineal peptide literature:

1. Whether any controlled human evidence exists, under either spelling of the name.
2. What the preclinical record actually shows, with the species or model attached to every finding.
3. Whether any of the retrieved work is independent of the group that developed the compound.
4. What the current regulatory position is, with jurisdictions, dates, and source URLs.

The search was designed so that an empty or near-empty human evidence table would be a valid and
reportable result rather than a failure to be filled with substitutes. That is close to what
happened. The human evidence table is not empty, but neither of the two items in it can carry the
weight that commercial writing places on them, and one of them is about a different substance.

## 2. The two spellings problem, and how the search handled it

This compound appears in the literature as **Epithalon**, as **Epitalon**, and also as
**Epithalone**. The same authors use the spellings interchangeably. A search on one spelling alone
under-retrieves.

Every registry and database query in this session was therefore run against both principal
spellings, deliberately and separately, and both results are recorded. This is not a stylistic
detail. A reviewer who re-runs only one spelling will get a different and misleadingly narrow
picture.

This record does **not** designate a canonical scientific label. Choosing one is a reviewer
decision, and both spellings must remain searchable on any published surface regardless of which
is chosen for display.

## 3. The identity problem, and how the search handled it

**Epithalon and Epitalon (the synthetic four-amino-acid peptide) are not the same substance as
Epithalamin, also written Epithalamine (a bovine pineal gland extract).** The synthetic peptide
was designed based on the amino acid composition of that extract. Source for the derivation
relationship: Araj et al. 2025, Int J Mol Sci 26(6):2691, PMID 40141333.

Much of the human-outcome literature popularly attributed to Epithalon was in fact conducted with
the Epithalamin extract, and the two are frequently conflated in secondary and commercial writing.
Every retrieved human record was therefore checked for which substance was actually administered,
and one of the two was found to describe the extract rather than the peptide. That finding is
carried explicitly through every file in this folder.

## 4. Databases and registries consulted

| Resource | What was queried | Outcome |
| --- | --- | --- |
| ClinicalTrials.gov API v2 | Term "epitalon" | Empty result set. Zero registered studies. |
| ClinicalTrials.gov API v2 | Term "epithalon", run separately and deliberately | Empty result set. Zero registered studies. |
| PubMed | "epitalon OR epithalon" | 142 records at retrieval. Used as a literature map only, never as evidence weight. |
| PubMed, individual records | PMID 12195242, PMID 14523363, PMID 40908429, PMID 41240216, PMID 32019204 | Retrieved and read at abstract level. |
| PubMed, individual records | PMID 35413689, PMID 40493162, PMID 12459848 | Title-level only. Abstracts, group sizes, controls, and effect sizes not verified. |
| PubMed, individual record | PMID 22451889, a 15-year follow-up peptide geroprotector paper | Blocked by a reCAPTCHA interstitial. Not retrieved and not characterised. |
| PubMed Central | Araj et al. 2025 review, PMC11943447 | Retrieved and read. The single most load-bearing secondary source in this folder. |
| FDA (fda.gov) | Pharmacy Compounding Advisory Committee meeting calendar page, the 503A bulk drug substances page, and two briefing PDFs | **Every fetch returned HTTP 404 to the retrieval tool.** No FDA wording was read this session. |
| WADA (wada-ama.org) | The current Prohibited List | No usable page content returned. No WADA primary document retrieved. |
| Alzheimer's Drug Discovery Foundation | Cognitive Vitality report on Epithalamin and Epithalon | PDF fetched but the text did not extract. Likely the best available independent critical appraisal. Not read. |
| PubMed, adversarial control | Deliberately fabricated identifier PMID 99999999 | Returned HTTP 404 Not Found, as it should. |

Registries that were **not** searched: the EU Clinical Trials Register, ISRCTN, the WHO ICTRP, the
Russian national registry, and the Japanese and Chinese national registries. Given that the
literature originates in Russia, the Russian registry is the most material of these omissions.
See section 8.

## 5. Retrieval integrity control

Because this compound's literature is heavily promoted and heavily summarised second-hand, an
adversarial control was run to confirm that the retrieval path was real rather than reconstructed
from background knowledge.

- A deliberately fabricated identifier, PMID 99999999, was requested. It returned HTTP 404 Not
  Found. A retrieval path that invents plausible records would have returned something.
- Both ClinicalTrials.gov queries returned genuinely empty result sets rather than invented
  registrations.

Every identifier in this folder was returned by an actual retrieval this session. Failed fetches
are marked verified=false rather than filled in from memory, and nothing was reconstructed from
background knowledge.

## 6. Inclusion criteria

A source was admitted to the registry if all of the following held.

1. It was retrieved in this research session at a recorded URL. Nothing was admitted from memory.
2. It addresses the AEDG tetrapeptide itself, or it is explicitly labelled as addressing something
   adjacent (the Epithalamin extract, the wider pineal peptide programme, the regulatory process)
   and is used only for that adjacent purpose.
3. Its species or model is identifiable, so that a preclinical finding can never be written
   without the model in the same sentence.
4. For regulatory statements, a jurisdiction, a date, and a URL are all available.
5. For any human record, the substance actually administered is identifiable.

## 7. Exclusion criteria

A source or a claim was excluded if any of the following held.

1. **Vendor, retailer, clinic marketing, forum, and supplement pages are disqualified as evidence.**
   They surfaced heavily in every search for this compound. They may be recorded only as grade E or
   G market claims, never as scientific or regulatory evidence. No number, mechanism, safety
   statement, or regulatory status enters the Guide on the authority of a page that sells the
   compound. The WADA classification asserted across such pages is excluded for exactly this reason.
2. Search-engine answer summaries used as a substitute for the underlying document. The FDA
   position circulating in such summaries is recorded as unverified and is not stated as fact.
3. Any human outcome attributed to Epithalon or Epitalon where the retrieved record shows the
   Epithalamin extract was administered. Such results are recorded as extract findings and are
   marked as a substance-identity error when presented otherwise.
4. Publication counts presented as evidence weight. The 142-record PubMed total is recorded as a
   literature map, not as depth of clinical evidence.
5. Any dose, route, schedule, cycle, or preparation detail appearing in an admitted source. These
   are not reproduced anywhere in this folder.
6. The circadian and melatonin-metabolite study of 75 women, which is described only inside the
   2025 review. Its primary citation was not retrieved, and its design, controls, and provenance
   are unverified. It is named in the gaps list so that it cannot re-enter unsourced.

## 8. Grading approach

Claims are graded individually, never the compound as a whole. The default grade is D
(preclinical) or G (unverified). A grade of C or better requires a specific retrieved human study
of the tetrapeptide with a design that can support the claim, and no such study was retrieved.
No claim in this folder is graded A or B. Claims that could mislead a member regardless of hedging
are marked PROHIBITED and listed separately in CLAIM_TABLE.md.

## 9. What remains for a human reviewer

These are open items, not minor tidying. Each one should be closed before publication.

1. **Open the FDA pages directly in a browser.** Every fda.gov retrieval in this session returned
   HTTP 404, including the meeting calendar page, the 503A bulk drug substances page, and both
   briefing PDFs at fda.gov/media/193343/download and fda.gov/media/193342/download. Every FDA
   statement in this folder is marked verified=false. **Do not publish any FDA claim from this
   record as it stands.**
2. **Confirm what actually happened at the 23 to 24 July 2026 advisory committee meeting.** That
   date falls after this record's check date of 2026-07-21, so no outcome exists here and none is
   stated. Read the primary record, not a summary of it, and note that a committee recommendation
   is advisory and is not a final agency determination.
3. **Read the current WADA Prohibited List directly.** No WADA primary document was retrieved. The
   only sources asserting a classification were commercial. No anti-doping status is stated
   anywhere in this folder, and none may be added without a primary check.
4. **Read the Correction to the Brunel University London 2025 paper** (PMID 41240216, Biogerontology
   2025;27(1):1, DOI 10.1007/s10522-025-10326-8) in the publisher full text. The PubMed record has
   no abstract, so what was corrected could not be determined. Until that is read, this study must
   not be presented as clean independent confirmation.
5. **Read the Alzheimer's Drug Discovery Foundation Cognitive Vitality report manually.** It was
   fetched but the PDF text did not extract. It is likely the best available independent critical
   appraisal of this compound:
   https://www.alzdiscovery.org/uploads/cognitive_vitality_media/Epithalamin-and-Epithalon-Cognitive-Vitality-For-Researchers.pdf
6. **Retrieve the three title-level preclinical records** (PMID 35413689, PMID 40493162,
   PMID 12459848) and verify their abstracts, models, group sizes, controls, and effect sizes. All
   three are currently marked verified=false.
7. **Retrieve PMID 22451889**, the 15-year follow-up peptide geroprotector paper, which was blocked
   by a reCAPTCHA interstitial this session. Check in particular which substance it studied.
8. **Locate the primary citation for the study of 75 women** on circadian rhythm and melatonin
   metabolites, described only inside the 2025 review. Do not cite it before that is found.
9. **Read the Russian-language primary literature in the original.** This is where the evidence
   base originates, and abstract-level English indexing is not sufficient to appraise it. Full
   appraisal requires someone who can read those primary reports.
10. **Search the additional trial registries** listed at the end of section 4, the Russian registry
    first.
11. **Search for any analytical or third-party purity, identity, or content-verification data for
    marketed material.** None was retrieved. Product identity in the consumer market is currently
    unverifiable from the research literature.
12. **Search for any systematic review or meta-analysis specific to the AEDG tetrapeptide.** None
    was retrieved.
