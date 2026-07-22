---
title: DSIP Source Plan
type: research-guide-source-plan
compound: dsip
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# DSIP Source Plan

This document records how the evidence base for the DSIP Guide was assembled, what was
deliberately excluded, and what a human reviewer still has to do before anything in this
folder is published.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## 1. Objective of the search

DSIP is unusual, because the interesting question is not only whether it works. It is whether
the compound is what it is said to be. The search was therefore designed around three
questions.

1. What human evidence exists, how old is it, and what did the best-controlled studies
   actually find.
2. Whether the foundational biology, meaning a gene, a precursor peptide, or a receptor, has
   ever been established for this molecule in any species.
3. What the current regulatory position is, with a jurisdiction, a date, and a source URL for
   every statement.

A finding of "old, small, and negative once controlled" was treated as a valid and reportable
result. So was a finding that the basic identity of the molecule remains unresolved. Neither
was to be softened into "mixed evidence".

## 2. Databases and registries consulted

| Resource | What was queried | Outcome |
| --- | --- | --- |
| ClinicalTrials.gov API v2 | Term "DSIP". A second query on the intervention "delta sleep-inducing peptide". | Zero studies for the term DSIP. The intervention query returned a single record, NCT05251207, which is a study of L-carnitine and insulin resistance and involves no DSIP. The correct reading is zero registered DSIP trials. |
| PubMed | The three located human sleep studies, retrieved as individual records. | Two retrieved and read (PMID 3583493, PMID 6391926). A third human study, PMID 7028502, returned a reCAPTCHA interstitial instead of the record and was never read. |
| Karger (publisher site) | The 1992 Neuropsychobiology double-blind study, DOI 10.1159/000118919. | Retrieved and read at abstract level. |
| PubMed | The two narrative reviews that frame the field (PMID 6145137, 1984; PMID 16539679, 2006). | Retrieved and read. |
| Frontiers in Pharmacology | The only recent primary research located, DOI 10.3389/fphar.2024.1439536, a 2024 mouse study of an engineered DSIP fusion peptide. | Retrieved and read. |
| PubMed | A search for a systematic review or meta-analysis of DSIP and sleep. | None located. Only narrative reviews from 1984 and 2006 were found. |
| FDA (fda.gov) | The Pharmacy Compounding Advisory Committee calendar page for the July 23 to 24, 2026 meeting, the 503A bulk substances page, the briefing document media URL, and a Federal Register public-inspection PDF. | Not retrieved. All four returned HTTP 404 or unreadable binary content. |
| WADA | The current Prohibited List. | The PDF fetch returned empty content. The section S0 definition was obtained from search-index retrieval of WADA pages, not from reading the List. |
| PubMed (adversarial control) | A deliberately fabricated identifier, PMID 99999999999. | Returned HTTP 404 Not Found while genuine records in the same batch returned full content. This is recorded as a methodological control, not as evidence about DSIP. |

Registries and databases that were NOT searched: the EU Clinical Trials Register, ISRCTN, the
WHO ICTRP, the Japanese and Chinese national registries, and any adverse event reporting
database such as FAERS. No regulator database for the European Union, the United Kingdom,
Canada, or Australia was directly queried. See section 6.

## 3. Inclusion criteria

A source was admitted to the registry if all of the following held.

1. It was retrieved in this research session at a recorded URL, or its failure to retrieve was
   itself recorded. Nothing was admitted from memory as evidence.
2. It addresses DSIP itself, or it is explicitly labelled as addressing something adjacent (an
   engineered fusion construct, a structural analogue, the regulatory process) and is used only
   for that adjacent purpose.
3. Its species or model is identifiable, so that a preclinical finding can never be written
   without the model in the same sentence.
4. For regulatory statements, a jurisdiction, a date, and a URL are all available, and the
   retrieval status of the primary document is stated.

## 4. Exclusion criteria

A source or a claim was excluded if any of the following held.

1. **Retailer, telehealth-marketing, clinic, and peptide-blog pages are disqualified as
   evidence.** Search results for this compound were dominated by such pages. They may be
   recorded only as grade E or grade G market claims, to document where an unsupported
   assertion originated. No number, mechanism, or safety statement enters the Guide on the
   authority of a page that sells the compound or refers members to someone who does.
2. Any confident safety statement of the shape "no dependency, no withdrawal, no organ
   toxicity, no identified lethal amount". These circulate widely, trace to commercial pages,
   and describe a level of characterisation that a literature of a few dozen people could not
   produce even if the statements happened to be true.
3. Any statistic without a locatable primary source.
4. Findings for structural analogues or for the 2024 engineered fusion construct, when
   presented as if they were findings about DSIP itself.
5. Any dose, route, schedule, amount, timing, or preparation detail appearing in an admitted
   source. The 1984 review describes a non-monotonic response in animal models. That
   observation is reported without reproducing any of the underlying quantities.
6. Content from PMID 7028502, which was never retrieved. It is named in the registry as an
   unexamined study and carries no claim.

## 5. Grading approach

Claims are graded individually, never the compound as a whole. Three small human studies exist,
so unlike a zero-human-evidence compound, some claims in this folder reach grade C, meaning
early human evidence. Grade C here mostly attaches to negative and null findings, because that
is what the controlled human studies produced.

No claim reaches grade A or B. Nothing about DSIP is established or supported in humans. Any
claim of the form "DSIP improves sleep in people" is graded G, because the two double-blind
controlled studies did not support it and their authors said so in their own conclusions.

## 6. What remains for a human reviewer

These are open items, not minor tidying. Each one should be closed before publication.

1. **Confirm every FDA statement against FDA primary documents.** Four separate FDA URLs failed
   in this session. Every FDA-derived statement in this folder is marked verified=false. This is
   the single largest verification debt in the packet.
2. **Confirm the outcome and the substance of the July 23 to 24, 2026 Pharmacy Compounding
   Advisory Committee review of emideltide** from the FDA record itself, not from trade
   reporting or a search summary. Note that an advisory committee recommendation is advisory and
   is not a final agency determination.
3. **Read the current WADA Prohibited List directly** and determine whether DSIP or emideltide is
   named. The S0 reasoning in this folder is an inference from a category definition, not a
   retrieved ruling about DSIP.
4. **Retrieve PMID 7028502.** It is an early human sleep study that was never read this session
   because the fetch returned a reCAPTCHA. Until a human reads it, no content from it may be
   cited, and the human evidence section is incomplete by exactly one study.
5. **Establish the sample size of the Monti 1987 crossover study.** The retrieved abstract did
   not state it. The size of the best-controlled human study is currently unknown to this record.
6. **Obtain full texts for all three human studies.** Every human evidence entry rests on an
   abstract. No risk-of-bias assessment at full-text level has been performed.
7. **Verify the sequence, the 1974 isolation, and the name emideltide** against a primary
   chemical or regulatory source. These orientation details currently rest on tertiary
   background and are flagged accordingly.
8. **Query at least one regulator outside the United States**, so that the statement about the
   European Union, the United Kingdom, Canada, and Australia becomes a finding rather than an
   absence-of-evidence note.
9. **Search an adverse event reporting database** such as FAERS. None was searched.
10. **Search the additional trial registries** listed at the end of section 2.
