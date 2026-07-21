---
title: SLU-PP-332 Source Plan
type: source-plan
compound: SLU-PP-332
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# Source Plan: SLU-PP-332

This document records how the evidence base for the SLU-PP-332 Guide was assembled, what was
deliberately excluded, and what a human reviewer still needs to search before publication. The
base was built on 2026-07-19 and re-run and extended on 2026-07-21.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## 1. Objective of the search

Establish, from retrievable primary and regulatory sources only:

1. What SLU-PP-332 actually is, chemically and pharmacologically.
2. Whether any human evidence of any kind exists (safety, tolerability, pharmacokinetics, efficacy).
3. What the preclinical record does and does not show, with the species or model attached to every finding.
4. What regulatory or anti-doping bodies have actually stated, as opposed to what commercial pages assert.
5. Where the product as sold diverges from the compound as studied.

The search was designed to be able to return an empty human evidence table. An honest empty table is a
valid and expected result for a compound at this stage.

## 2. Databases and registries consulted

| Source type | Resource | What it was used for |
| --- | --- | --- |
| Trial registry | ClinicalTrials.gov API v2 | Direct query for any registered study of SLU-PP-332 |
| Literature database | PubMed | Complete listing of indexed publications naming the compound |
| Full text repository | PubMed Central (PMC) | Full text of the papers that were open access |
| Publisher pages | JPET (aspetjournals.org), AHA Journals (ahajournals.org) | Abstracts where PubMed retrieval was blocked |
| Regulator | FDA (fda.gov), including the 503A bulk drug substances compounding list | Any approval, warning letter, safety communication, or compounding listing |
| Anti-doping | WADA (wada-ama.org) Prohibited List | Attempted verification of the prohibited status asserted by vendors |
| Tertiary reference | Wikipedia | Chemical identity only (formula, molar mass, CAS, IUPAC name, patent assignment) |

## 3. Queries run

- ClinicalTrials.gov API v2: `query.term=SLU-PP-332`, page size 20. Result: zero studies.
- PubMed: `SLU-PP-332`. Result: 10 indexed publications, all retrieved as a listing.
- Targeted retrieval of individual PubMed and PMC records for each of the 10 publications.
- fda.gov site search for SLU-PP-332 across approvals, warning letters, safety communications,
  and the 503A bulk drug substances page.
- wada-ama.org retrieval of the Prohibited List landing page and a direct attempt at the current list PDF.
- Web search for the commercial presentation of the compound (product naming, format, claims), used
  strictly to characterize the market, never as evidence for any physiological claim.

## 4. Inclusion criteria

A source was admitted to the evidence base only if all of the following held:

1. It was retrieved during this session, with a working URL recorded.
2. It is a primary study, a trial registry record, a regulator or anti-doping body document, or
   (for chemical identity only) a tertiary reference.
3. The species, model, or system in which the finding was generated is identifiable from the source.
4. It reports something about SLU-PP-332 specifically, not only about the compound class or a
   successor compound, unless the distinction is itself the point being recorded.

## 5. Exclusion criteria

Excluded from the evidence base:

- Vendor, retailer, reseller, and affiliate pages. These are disqualified as evidence for any claim
  about identity, mechanism, effect, safety, quality, or legal status. Where such pages were consulted,
  it was only to document what the market asserts, and those observations are graded E or G and are
  labelled as market characterization rather than evidence.
- Blog posts, forums, social media, podcasts, and influencer content.
- Anything cited from memory rather than retrieved. No PMID, DOI, NCT number, journal name, author,
  or year appears anywhere in this Guide unless it came from a retrieved page in this session.
- Evidence generated for SLU-PP-915 presented as evidence for SLU-PP-332. The two are chemically
  distinct compounds from the same research program and are kept separate throughout.
- All dosing, amount, concentration, frequency, timing, and route specifics, including in vitro
  potency and solubility figures reported in the retrieved papers. These were deliberately not
  transcribed into any file.

## 6. Source grading approach

Claims are graded individually, never at the level of the compound. Because no human administration
study exists, no claim in this Guide can rise above grade D except claims about the absence of human
evidence, the chemical identity of the compound, and the content of retrieved registry queries.
The default for anything else is D or G. See CLAIM_TABLE.md.

## 6a. Retrieval integrity controls, run 2026-07-21

The central finding of this packet is a negative one, and a negative finding is only as good as the
query that produced it. Three controls were run to distinguish "we found nothing" from "there is
nothing".

- A fabricated compound identifier submitted to the ClinicalTrials.gov API returned zero studies,
  establishing the baseline for a nonexistent compound.
- A fabricated PMID returned HTTP 404, confirming that PubMed retrieval does not invent records.
- A positive control query for semaglutide returned real registry records, confirming the query path
  works when records exist.

Together these establish that the zero result for SLU-PP-332 is a true negative rather than a broken
retrieval path. They say nothing about the compound and are never cited as if they did.

## 7. Retrieval failures and known gaps

These are recorded honestly rather than papered over. Status is as of 2026-07-21.

1. **WADA retrieval failed again, for the second consecutive session.** Both the Prohibited List
   landing page and the 2026 Prohibited List news page returned empty content on direct fetch. This
   is a persistent retrieval failure, not evidence of either presence or absence on the List. WADA
   status is logged as UNRESOLVED and no specific classification is repeated as fact anywhere. A
   human reviewer must obtain the current List document directly.
2. **CLOSED on 2026-07-21.** The two previously CAPTCHA-blocked records (PMID 37739806 and
   PMID 41421047) were retrieved directly this session, upgrading them from provisional. Any
   remaining "search result summary" caveat attached to them in a sibling file is stale and should
   be removed.
3. **PARTLY CLOSED on 2026-07-21.** The abstract of the Circulation heart failure paper
   (PMID 37961903) was retrieved directly, upgrading it from provisional. Full text was still not
   retrieved. Note that the abstract surfaced dose figures, which were deliberately excluded from
   this record per content policy and must not be reintroduced at any point in the editorial chain.
4. **The prior packet's source registry did not enumerate two of the ten indexed publications.**
   PMID 37717940 (age-related kidney findings in aged mice) and PMID 42024694 (a 2026 systematic
   review of animal and cell models) were retrieved this session and added. Neither changes the
   central finding, and the review independently corroborates it.
5. **Chemical identity values were carried forward without re-retrieval.** The molecular formula,
   molar mass, CAS registry number and IUPAC name came from the prior packet's Wikipedia entry, which
   was not re-fetched on 2026-07-21. Those specific values are flagged
   [UNVERIFIED - background knowledge, requires human source check]. The substance-class correction
   (synthetic small molecule, not peptide) is not affected.
6. **No FDA document naming SLU-PP-332 was found.** This is a negative finding from targeted
   site-restricted searching, not a positive FDA statement about the compound. The 503A compounding
   list page itself was not re-fetched on 2026-07-21.
7. **No independent third-party analytical survey of marketed product** (identity, purity,
   contamination) was located. All quality observations are therefore statements about the absence of
   oversight, not measurements of any product, and no conclusion about any specific product may be
   drawn in either direction.
8. **Non-US regulators (EMA, MHRA, TGA, Health Canada) were not searched.** No statement about any
   non-US jurisdiction may be made from this record.
9. **No systematic review or meta-analysis of human data exists to retrieve**, because the human
   literature does not exist. The one systematic review retrieved (PMID 42024694) covers animal and
   cell models only.

## 8. What remains for a human reviewer to search

Before publication, a human reviewer should attempt the following, in this order:

1. **Retrieve WADA's current Prohibited List directly**, by any route that works, and record the exact
   status of SLU-PP-332: named, captured by a class definition, or absent. This has now failed twice
   and is the highest-priority open item. Until it is closed the Guide must continue to say the
   classification is unconfirmed and direct the reader to WADA or their own national anti-doping
   organisation.
2. **Confirm the chemical identity values against a primary chemical registry**, or remove them. They
   were carried forward without re-retrieval and currently carry an unverified flag.
3. **Open the FDA 503A pages directly** and confirm the negative finding, recording the date of the
   human check.
4. **Retrieve the Circulation full text** and confirm the cardiac finding matches what is attributed
   to it, remembering that the finding covers SLU-PP-332 and SLU-PP-915 together and that dose figures
   in that paper must not be transcribed.
5. **Search EMA, MHRA, TGA, and Health Canada** for any statement naming SLU-PP-332, so that the
   non-US position becomes a finding rather than a gap.
6. **Re-run the ClinicalTrials.gov query and the PubMed search** to confirm that the human evidence
   table is still correctly empty at the date of publication, and that the listing still contains
   exactly the publications enumerated in SOURCE_REGISTRY.md.
7. **Search again for any independent analytical survey** of marketed product sold under this name.
8. **Confirm that no dosing, amount, concentration, or route-as-instruction information has entered
   any surface** at any point in the editorial chain, including the dose figures that appeared in the
   Circulation abstract and were deliberately excluded.

## 9. Re-verification requirement

Retrievals in this plan are dated 2026-07-21 except where an earlier date is stated explicitly.
Regulatory status, anti-doping status, and the existence of registered trials can all change. This
plan and all sibling files must be re-verified before the Guide is published or refreshed.
