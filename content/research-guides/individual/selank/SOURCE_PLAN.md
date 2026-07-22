---
title: Selank Source Plan
type: research-guide-source-plan
compound: selank
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# Selank Source Plan

This document records how the evidence base for the Selank Guide was assembled, what was
deliberately excluded, and what a human reviewer still has to do before anything in this folder
is published.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## 1. Objective of the search

Selank differs from most compounds in this series in one important way. Genuine human trial
evidence exists, so an empty human evidence table would be wrong here and would itself be a
failure of accuracy. The search was therefore designed to answer four questions:

1. What human studies exist, how large they are, and who ran them.
2. Whether any of that human work is independent of the group that developed the compound.
3. What the preclinical record shows, with the species or model attached to every finding.
4. What the current regulatory position is, in every jurisdiction that could be reached, with dates.

Question 2 turned out to be the binding one. Question 4 produced the single most consequential
finding in this folder, and it contradicts what almost every commercial page says.

## 2. Databases and registries consulted

| Resource | What was queried | Outcome |
| --- | --- | --- |
| PubMed, via NCBI E-utilities esearch | Selank together with anxiety. | 29 records returned. |
| PubMed, via NCBI E-utilities esearch | Selank restricted to trial and review publication types. | 6 records returned, of which 3 are unrelated false positives from term mapping. Only 3 genuine Selank trial records exist in that filter. |
| PubMed, via NCBI E-utilities efetch | Full abstracts for the four human records (PMID 18454096, 25176261, 26356395, 18577961). | Retrieved and read. Abstracts only. No full texts, all four are in Russian. |
| PubMed, via NCBI E-utilities esummary and efetch | Five preclinical records (PMID 28280289, 27878720, 36322304, 31243679, 28293190). | Retrieved. |
| ClinicalTrials.gov API v2 | query.intr=selank, and separately query.term=selank. | Total counts of 2 and 10 respectively. Every returned record was an unrelated false positive from fuzzy matching. Zero registered Selank trials. |
| Russian pharmaceutical trade press (Vademec) | The January 2026 Ministry of Health deregistration action. | Retrieved and read. Names Semax and Selank from Peptogen among cancelled registrations, and selank among substances excluded from the State Register of Medicines. |
| Russian healthcare trade press (VShOUZ) | The same action, independently. | Retrieved and read. Corroborates the same named detail and the same stated reason. |
| Peptogen (manufacturer) | The Selank product page. | Retrieved. Lists indications but publishes no registration certificate number and no registration date. Recorded as a grade E manufacturer source. |
| Russian State Register of Medicines (GRLS) | A registration certificate number and date for Selank. | Not obtained. grls.minzdrav.gov.ru was not queried successfully and a pharm-portal mirror record returned no readable content. |
| FDA (fda.gov) | Warning letters naming Selank, and the 503A bulk drug substances lists. | Not retrieved. Every direct fetch to www.fda.gov returned HTTP 404 to this retrieval path. Statements rest on search-result summaries only. |
| FDA Global Substance Registration System (precision.fda.gov GSRS) | The SELANK and SELANK DIACETATE substance records. | Records exist and were located, but did not render usable content when fetched. |
| WADA | The current Prohibited List, page and PDF. | Not retrieved. Both the 2026 list PDF and the prohibited-list page returned empty content. Selank was not confirmed to appear by name on any WADA list. |
| PubMed esummary, adversarial control | A fabricated PMID (99999123). | Returned "cannot get document summary" rather than a fabricated record, confirming the retrieval path is real and does not invent sources. |

Registries and regulators NOT searched: the EU Clinical Trials Register, ISRCTN, the WHO ICTRP,
the Russian national trial registry, and any regulator outside Russia and the United States.

## 3. Inclusion criteria

A source was admitted to the registry if all of the following held.

1. It was retrieved in this research session at a recorded URL. Nothing was admitted from memory.
   Where background knowledge was the only available basis, it is flagged
   [UNVERIFIED - background knowledge, requires human source check] and carries no claim.
2. It addresses Selank itself, or it is explicitly labelled as addressing something adjacent and
   is used only for that adjacent purpose.
3. Its species or model is identifiable, so that a preclinical finding can never be written
   without the model in the same sentence.
4. For regulatory statements, a jurisdiction, a date checked, and a URL are all available.

## 4. Exclusion criteria

A source or a claim was excluded if any of the following held.

1. **Vendor, retailer, clinic marketing, and peptide blog pages are disqualified as evidence.**
   They may be cited only to document where an unverifiable claim originated, and such an entry is
   marked as non-evidence in the registry. No number, mechanism, safety statement, or regulatory
   status enters the Guide on the authority of a page that sells the compound. This rule did
   substantial work for Selank, because the sector's central regulatory claim was found to be
   out of date.
2. Search-engine answer summaries used in place of the underlying document. Where a summary was
   the only thing available (the FDA warning letters), the resulting statement is marked
   verified=false and flagged for human verification rather than promoted to fact.
3. Any statistic without a locatable primary source. The circulating claim that Selank trials
   enrolled more than 800 patients traces to vendor pages only, is contradicted by the retrieved
   record, and is prohibited by name in the claim table.
4. Inference presented as a regulator statement. The vendor assertion that Selank falls under
   WADA category S0 is reasoning, not a retrieved WADA finding, and is excluded on that basis.
5. Any dose, route, schedule, cycle, or preparation detail appearing in an admitted source. None
   is reproduced anywhere in this folder.

## 5. Grading approach

Claims are graded individually, never the compound as a whole. The default grade is D
(preclinical) or G (unverified).

Selank is the case where the grade ceiling matters. Three genuine human trials exist, so some
claims can honestly reach C (early human evidence). None reaches B or A, and the reasons are
specific rather than stylistic:

- No placebo-controlled trial was retrieved anywhere in the literature.
- No independent human trial exists. All four human records come from an overlapping Russian
  institutional network that includes the compound's originators.
- Zero trial registrations exist on ClinicalTrials.gov, so pre-specified endpoints cannot be
  checked and selective outcome reporting cannot be excluded.
- No systematic review or meta-analysis exists, so there is no evidence-synthesis layer.
- Only abstracts were retrieved. All four human papers are in Russian and the full texts were
  not read, so randomisation method, blinding, allocation concealment, dropout, effect sizes,
  and adverse events could not be assessed.

Claims that could mislead a member regardless of hedging are marked PROHIBITED and listed
separately.

## 6. What remains for a human reviewer

These are open items, not tidying. Each should be closed before publication.

1. **Confirm the January 2026 Russian deregistration directly against grls.minzdrav.gov.ru.**
   Two independent trade outlets report it and the corroboration is strong, but the state
   registry itself was not read this session. This is the most consequential statement in the
   folder and it deserves a primary check.
2. **Establish whether a prior Russian registration existed, with its certificate number and
   date.** The widely repeated 2009 approval and the brand name Selanc appeared only in vendor
   and blog sources. A registration must have existed in order to be cancelled, but its date and
   number are not verified here.
3. **Determine whether the January 2026 cancellation had any undisclosed safety or quality
   driver.** The reported reason is a request from the registration certificate holders, which
   reads as commercial or administrative. No safety rationale was reported, and the Guide says
   nothing beyond that.
4. **Open the two FDA warning letters directly** (Tailor Made Compounding LLC, 2020, and
   Advanced Nutriceuticals LLC dba The Guyer Institute, 2021) and read the verbatim text. Every
   FDA statement in this folder currently rests on search-result summaries because all direct
   fetches to www.fda.gov failed.
5. **Read the FDA 503A bulk drug substances lists directly** and confirm the reported position
   that Selank and Semax were not nominated for inclusion.
6. **Read the current WADA Prohibited List directly.** Nothing in this folder asserts an
   anti-doping status in either direction. Note that the S0 category does not name substances
   individually, so the absence of the word Selank from the list would not settle the question.
7. **Confirm the amino acid sequence and the tuftsin-derivation claim from a primary chemical
   source.** The FDA GSRS records for SELANK and SELANK DIACETATE exist but did not render.
8. **Obtain the four Russian full texts** and extract adverse events, dropouts, randomisation
   method, blinding, and effect sizes. Everything in the human evidence section currently rests
   on abstracts.
9. **Search the trial registries not covered here**, including the Russian national registry, in
   case the Russian trials were registered somewhere other than ClinicalTrials.gov.
10. **Check at least one regulator outside Russia and the United States**, so that the other
    jurisdictions section becomes a finding rather than a gap.
