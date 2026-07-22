---
title: KLOW Source Plan
type: research-guide-source-plan
compound: klow
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# KLOW Source Plan

This document records how the evidence base for the KLOW Guide was assembled, what was
deliberately excluded, and what a human reviewer must close before anything in this folder
reaches a member.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## 1. The two problems this search had to face

KLOW is a blend. That creates a research problem that does not arise for a single-compound
Guide, and in this case it arrives twice over.

**Problem one: the recipe is not established.** The legacy Xenios catalog entry asserts that
KLOW contains TB-500, BPC-157, GHK-Cu, and KPV at stated strengths. No supplier document,
certificate of analysis, specification sheet, or manufacturing record supporting that entry
was available for this work. The internal content review declined to guess at the
composition, and this Guide follows that decision. Nowhere in this folder is the composition
of KLOW stated as fact, and nowhere is a ratio between components stated or implied. The
composition is treated as the first and largest open supplier question.

**Problem two: even a confirmed recipe would not produce combination evidence.** Evidence
about a single ingredient does not become evidence about a mixture containing it. A mixture
is a distinct pharmacological object. Its components can interact, compete, or alter each
other's stability and disposition, and none of that is predictable from studying the
components apart. Unless a study administered the specific combination, there is no
combination evidence at all. Not thin evidence, not indirect evidence, none.

The search was therefore designed so that two empty tables would be valid, reportable
outcomes rather than gaps to be filled with substitutes: an empty combination evidence table,
and an empty composition confirmation record.

## 2. What was searched, and what was found

The research supplied for this packet consists of four web-verified component research
records: BPC-157, GHK-Cu, KPV, and LL-37. Each of those records documents its own searches of
ClinicalTrials.gov, PubMed via NCBI E-utilities, FDA sources, and regulatory trade reporting.
Those searches are inherited here rather than repeated, and every source that carries a claim
in this folder is listed in SOURCE_REGISTRY.md with its verification status.

### 2a. The combination search, which is the search that matters

Every one of the four supplied research records was read in full and searched for any study,
registration, case report, adverse event record, or regulatory evaluation of the KLOW
combination, or of any multi-component peptide blend resembling it.

| What was looked for | Outcome |
| --- | --- |
| Any human study administering the KLOW combination | None found in any supplied record. |
| Any preclinical study administering the KLOW combination | None found in any supplied record. |
| Any trial registration of the KLOW combination | None found. The registrations present in the supplied records (NCT02637284, NCT07437547, NCT07437586, NCT07706361, NCT02225366) are all single-agent studies. |
| Any regulatory evaluation of the combination as a product | None found. The FDA evaluations present in the records assess individual bulk drug substances, one substance at a time, and treat even a free base and its acetate salt as separate substances. |
| Any pharmacokinetic or interaction study between any two of the named components | None found. |
| Any evidence at all involving more than one of the named components together | Two items only, both confounded, both described in section 2b. |

The correct finding is that there is no combination evidence for KLOW. That empty table is
the central result of this research and is reported as such throughout the folder.

### 2b. The only multi-component observations located, both of which are cautionary

These are the only places in the supplied records where more than one of the named components
appears together in a human observation. Neither supports the combination. Both illustrate why
combinations are harder to interpret, not easier.

1. **A confounded adverse event report.** FDA's July 2026 briefing document describes a FDA
   Adverse Event Reporting System report of a 40-year-old woman who developed diffuse
   hyperpigmentation and gingival darkening while using a product containing both BPC-157 and
   TB-500. FDA recorded that the reaction reproduced identically on rechallenge and resolved on
   discontinuation, judged the event likely related to the drug product, and then stated that
   because the product contained two peptides it was not possible to assess a relationship to
   either one individually. This is the clearest illustration in the entire record of the
   attribution problem a blend creates.
2. **An unattributable chart review.** The same FDA document records that in a retrospective
   chart review of people with knee pain, some subjects received BPC-157 together with
   thymosin beta-4, so no effect could be attributed to BPC-157 alone.

A parallel methodological point sits in the GHK-Cu record. The recent positive human reports
for that component tested multi-ingredient proprietary formulations rather than the component
alone, and the research record states plainly that no effect can be attributed to the copper
peptide in those designs. Combining ingredients does not add their evidence together. It
removes the ability to attribute an effect to any of them.

### 2c. A composition discrepancy found during this work, recorded rather than resolved

The legacy catalog entry names TB-500, BPC-157, GHK-Cu, and KPV. The research records supplied
for this packet cover BPC-157, GHK-Cu, KPV, and LL-37. LL-37 is not among the four names in
the legacy entry, and no research record was supplied for TB-500.

This discrepancy is recorded, not resolved. It is a further reason the composition cannot be
stated. It is listed as an open supplier question in GUIDE_DRAFT.md and in
QUALITY_AND_DOCUMENTATION.md. The LL-37 record is retained in the registry and used only as
context on a compound that may or may not be relevant to this product, clearly labelled as
such and never presented as a KLOW ingredient.

## 3. Inclusion criteria

A source was admitted if all of the following held.

1. It appears in one of the four supplied web-verified research records at a recorded URL.
   Nothing was admitted from memory. No identifier, registration number, digital object
   identifier, author, year, journal, or address was added from any other source.
2. Its subject is identifiable, so that a component finding can never be presented as a
   finding about the blend, and a preclinical finding can never be presented as a human one.
3. Its species or model is stated, so that every preclinical finding can carry its model in
   the same sentence as the finding.
4. For a regulatory statement, a jurisdiction, a date, and a source URL are all available.

## 4. Exclusion criteria

A source or claim was excluded if any of the following held.

1. **It concerns the product's composition and originates from the legacy catalog entry.** The
   catalog entry is recorded in the registry as an unverified internal assertion and carries no
   claim. Composition is stated nowhere in this folder as fact.
2. **It is a vendor, retailer, clinic, or compounding pharmacy page.** These are disqualified as
   evidence. They may be cited only to document where an unverifiable claim originated, and such
   an entry is marked non-evidence.
3. **It is a component finding being used to support a statement about the blend.** This is the
   defining exclusion of a blend Guide and it was applied without exception.
4. It is a search engine answer summary standing in for the underlying document.
5. It is a statistic with no locatable primary source. Several sets of circulating grey-market
   failure percentages named in the KPV, GHK-Cu, and LL-37 records trace only to vendor blogs.
   They are excluded by name in CLAIM_TABLE.md so they cannot re-enter later.
6. It is a dose, route, schedule, strength, ratio, or preparation detail. None is reproduced
   anywhere in this folder, including inside quotations and tables.
7. It concerns a compound that is not one of the named components, presented as though it were.
   This applies in particular to full-length alpha-melanocyte-stimulating hormone, to KdPT, to
   the dimer written as (CKPV)2, and to engineered LL-37 analogs.

## 5. Grading approach

Claims are graded individually. The product as a whole is never graded, because a grade on a
product would be exactly the error this Guide exists to prevent.

The default grade is D, meaning preclinical, or G, meaning unverified. A grade of C or better
requires a specific retrieved human study of the thing being claimed. No claim about the KLOW
combination is graded above G, because no study of the combination exists. Where a supplied
record contains genuine human trial evidence about an individual component, that evidence is
graded on its own merits and labelled unmistakably as being about that component alone.

## 6. What remains for a human reviewer

These are open items, not tidying. Each should be closed before publication.

1. **Obtain the supplier composition document.** This is the first blocker. Until a supplier
   specification, certificate of analysis, and manufacturing record are in hand, the product's
   identity is unknown and the Guide cannot describe what KLOW is.
2. **Resolve the TB-500 and LL-37 discrepancy** between the legacy catalog entry and the
   research records supplied.
3. **Confirm the outcome of the July 23-24, 2026 Pharmacy Compounding Advisory Committee
   meeting.** As of 2026-07-21 it has not occurred. No outcome is stated anywhere in this
   folder. A committee recommendation is in any case advisory and not a final agency
   determination.
4. **Re-verify every FDA statement directly from FDA sources.** The BPC-157 record's FDA facts
   were retrieved directly and are strong. The GHK-Cu and KPV records' FDA facts were not: FDA
   pages returned HTTP 404 and HTTP 403 during that research, so those statements currently rest
   on trade reporting.
5. **Read the current WADA Prohibited List directly.** No component's anti-doping status was
   confirmed by direct reading of the List in any supplied record. Athletes must be directed to
   their own anti-doping authority.
6. **Read the Federal Register notice (document 2026-07361) in full.** It was never retrieved.
7. **Confirm the Cosmetic Ingredient Review conclusion** referenced in the GHK-Cu record. The
   primary document was not retrieved, and in any case a cosmetic ingredient review does not
   transfer to any other product form.
8. **Retrieve the LL-37 record's flagged unread article** (PMCID PMC6013660) before any use. It
   is currently cited nowhere for anything.
9. **Search for combination evidence again before publication**, and record the date and the
   zero result. If a study of this combination appears, the entire evidence structure of this
   Guide changes and this document set returns to the editorial gate.
