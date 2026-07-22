---
title: Semax Source Plan
type: research-guide-source-plan
compound: semax
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# Semax Source Plan

This document records how the evidence base for the Semax Guide was assembled, what was
deliberately excluded, and what a human reviewer still has to do before anything in this
folder is published.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## 1. Objective of the search

Semax differs from a compound with no human record at all. Human studies exist. The question
the search was designed to answer was therefore not "is there anything" but three harder
questions:

1. What human evidence exists, of what design, and how much weight can it carry.
2. Whether any of that evidence comes from a group independent of the compound's originators.
3. What the regulatory position actually is in each jurisdiction, separated cleanly so that a
   status in one country is never allowed to imply a status in another.

The search was designed so that "human studies exist but cannot support the claims made for
them" would be a valid and reportable result. That is in fact the result.

## 2. Databases and registries consulted

| Resource | What was queried | Outcome |
| --- | --- | --- |
| ClinicalTrials.gov API v2 | Term "Semax". | **Zero registered studies.** None of the published human literature has a corresponding prospective registration in this registry. |
| PubMed | Term "Semax", results listing of approximately 230 records. | Retrieved. Of the first 20 reviewed, roughly 19 were preclinical or narrative review and one was a human clinical study. |
| PubMed | "Semax" restricted to review and systematic-review publication types. | 14 records returned. **None was a systematic review or meta-analysis.** The items returned were narrative reviews mentioning Semax alongside other peptides. |
| PubMed, individual records | PMID 30225715, PMID 32342318, PMID 15792140, PMID 29798983. | Retrieved and read as abstracts. These four are the entire human evidence base used in this folder. |
| PubMed, results listing only | PMID 16635254, PMID 16362768, PMID 28255762. | Titles recorded from the results listing. Abstracts were **not** individually fetched, so species and methods are unconfirmed for each. |
| Federal Register | Full text of document 2026-07361, published 2026-04-16, Docket FDA-2025-N-6895. | **Retrieved successfully.** This is the primary source for every United States 503A statement in this folder. |
| Federal Register API | Document metadata for 2026-07361. | Retrieved. |
| Drugs@FDA | Approved-products query for Semax. | **HTTP 404.** This is a failed retrieval, not a confirmed empty result, and must be read that way. |
| FDA 503A bulk-substances landing page, the July 2026 advisory committee meeting page, and the 2026 meeting-materials page | Direct fetches. | **HTTP 404** on all three. Not retrieved. |
| European Medicines Agency | Medicines search endpoint. | **HTTP 401.** Could not be read. The absence of an EU authorisation is therefore a weak negative resting on a tertiary source. |
| WADA | The current Prohibited List. | **Fetch returned no usable content.** Neither the presence nor the absence of Semax on the List was established. |
| Russian State Register of Medicines (grls.rosminzdrav.ru) | The registration record for Semax. | **Not fetched.** The Russian registration claim rests on a tertiary source plus a search-engine summary. |
| Wikipedia | The Semax article. | Retrieved. Used only for structure, the 1991 first description, the List of Vital and Essential Drugs claim, the unscheduled statement, and the statement that Semax is not approved or marketed in most other countries. Tertiary, low weight. |
| Adversarial retrieval control | A deliberately fabricated identifier, PMID 99999999999. | Correctly returned **HTTP 404 Not Found**, while genuine PMIDs returned full records. The retrieval path is real and the citations in this folder reflect actual retrieval rather than reconstruction. |

Registries that were NOT searched: the EU Clinical Trials Register, ISRCTN, the WHO ICTRP, and
any Russian national trial registry. Given that the human literature is Russian and predates
widespread registration practice, a Russian registry search is the most likely of these to
change the picture and should be run by a human. See section 6.

## 3. Inclusion criteria

A source was admitted to the registry if all of the following held.

1. It was retrieved in this research session at a recorded URL. Nothing was admitted from memory.
2. It addresses Semax itself, or it is explicitly labelled as addressing something adjacent and
   is used only for that adjacent purpose.
3. For a preclinical finding, the species or model is identifiable. Where it is not, the finding
   is recorded as species-unconfirmed and is barred from the Guide until a human fetches the
   record and names the species.
4. For regulatory statements, a jurisdiction, a date and a URL are all available.

## 4. Exclusion criteria

A source or a claim was excluded if any of the following held.

1. **Vendor, retailer, and peptide-encyclopedia pages are disqualified as evidence.** Search
   results across every query were dominated by them. Several assert specific regulatory,
   anti-doping and safety positions. None is scientific evidence. They may be recorded only as
   grade E or G market claims, and no such page carries a fact in this folder.
2. Search-engine answer summaries used as a substitute for the underlying document. Two specific
   failures of this kind were caught this session: an unsourced attribution of Semax's
   development to a named Russian institute, and a description of the United States advisory
   committee activity as if it were FDA review of a drug application.
3. Any regulatory status asserted by a party that is not the regulator. This rule is what keeps
   the anti-doping section of this folder empty.
4. **Any dose, route, schedule, or preparation detail appearing in any source.** Several vendor
   pages encountered during research publish dosing protocols. No dosing information from any
   source has been reproduced anywhere in this folder, including in research notes.

## 5. Grading approach

Claims are graded individually, never the compound as a whole. The default grade is D
(preclinical) or G (unverified).

Semax differs from a zero-human-evidence compound in that a small number of claims can reach
grade C (early human evidence). None reaches A or B. A grade of C here means only that a
retrieved human study reports the finding, not that the finding is reliable: every C-graded
claim in this folder sits on a study that is non-randomized or unregistered or both, and that
comes from a research group affiliated with the compound's origin. The grade records what kind
of source exists. The reviewer notes record why it is weak.

## 6. What remains for a human reviewer

These are open items, not minor tidying. Each one should be closed before publication.

1. **Read the full texts of the two Russian-language clinical studies** (PMID 29798983 and
   PMID 15792140). Only English abstracts were readable this session. Randomization procedure,
   blinding, adverse-event tables, and statistical analysis plans were never seen, so no
   risk-of-bias assessment was possible. Every claim drawn from those two papers is currently a
   claim drawn from an abstract.
2. **Resolve the randomization status of PMID 30225715.** A fetched summary called it a
   randomized controlled trial; the retrieved abstract does not state a randomization method,
   allocation concealment, or blinding, and the unequal 14 versus 10 allocation is atypical for
   randomized allocation. Until the full text is read, the Guide describes it only as a small
   placebo-comparison imaging study in healthy volunteers.
3. **Retrieve the Russian State Register of Medicines record.** The certificate number, the
   indications as written by the Russian regulator, the date of first registration, and the
   current status were all unretrieved. The registration-certificate holder named in a
   search-engine summary was not confirmed against the register.
4. **Check the EMA medicines database and the UK MHRA directly.** The EMA endpoint returned
   HTTP 401 this session, so the absence of an EU authorisation rests on a tertiary source.
5. **Read the current WADA Prohibited List directly.** The Guide currently carries no
   anti-doping status for Semax, by design, and directs athletes to their own anti-doping
   authority. That gap closes only on a direct reading.
6. **Re-check the FDA position after the Pharmacy Compounding Advisory Committee meeting of
   July 23 to 24, 2026.** As of 2026-07-21 the meeting had not occurred. No outcome exists and
   none is stated anywhere in this folder.
7. **Re-run the Drugs@FDA approved-products query.** The 404 this session was a failed
   retrieval. The Guide states that Semax is not FDA approved on the strength of the Federal
   Register nomination context and the tertiary source, not on the strength of that 404.
8. **Fetch each preclinical record individually and name its species.** PMID 16635254,
   PMID 16362768 and PMID 28255762 were read from a results listing only. None may enter the
   Guide as a stated finding until its species is confirmed.
9. **Confirm the development attribution.** The frequently repeated claim that Semax was
   developed at a named Russian institute appeared only in search-engine summaries and vendor
   pages this session and is marked
   [UNVERIFIED - background knowledge, requires human source check].
10. **Search the additional registries** listed at the end of section 2, with a Russian national
    registry prioritised.
