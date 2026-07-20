---
title: SLU-PP-332 Source Plan
type: source-plan
compound: SLU-PP-332
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# Source Plan: SLU-PP-332

This document records how the evidence base for the SLU-PP-332 Guide was assembled on 2026-07-19,
what was deliberately excluded, and what a human reviewer still needs to search before publication.

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

## 7. Retrieval failures and known gaps

These are recorded honestly rather than papered over.

1. WADA's own Prohibited List could not be retrieved. Both the landing page and a direct attempt at
   the current list document returned empty content. WADA status is therefore logged as UNVERIFIED
   and the specific classification circulating on vendor sites is not repeated as fact anywhere.
2. Direct PubMed abstract fetches for two records (PMID 37739806 and PMID 41421047) were blocked by a
   reCAPTCHA challenge. Content for these came from search result summaries plus the publisher abstract
   pages, which is recorded against those entries in SOURCE_REGISTRY.md.
3. Full text of the Circulation heart failure paper (PMID 37961903) was not retrieved. Findings come
   from a search result summary of the publisher abstract page.
4. No FDA document naming SLU-PP-332 was found. This is a negative finding from targeted searching,
   not a positive FDA statement about the compound.
5. No independent third-party analytical testing of marketed product (identity, purity, contamination)
   was located. All quality observations are therefore inferential from the market structure, not measured.
6. Non-US regulators (EMA, MHRA, TGA, Health Canada) were not searched.
7. No systematic review or meta-analysis exists to retrieve. The literature is too young and too small.

## 8. What remains for a human reviewer to search

Before publication, a human reviewer should attempt the following, in this order:

1. Retrieve WADA's current Prohibited List directly and record the exact status of SLU-PP-332, including
   whether it appears by name, by class, or not at all. Until this is done the Guide must continue to say
   the classification is unconfirmed and direct the reader to their own anti-doping authority.
2. Retrieve the two CAPTCHA-blocked PubMed records and the Circulation full text directly, and confirm
   that the findings summarized here match the primary text.
3. Search EMA, MHRA, TGA, and Health Canada for any statement naming SLU-PP-332.
4. Re-run the ClinicalTrials.gov query and the PubMed search to confirm that the human evidence table
   is still empty at the date of publication.
5. Search for any independent analytical survey of marketed product sold under this name.
6. Confirm that no dosing, amount, or route information has entered any member-facing surface at any
   point in the editorial chain.

## 9. Re-verification requirement

Every retrieval in this plan is dated 2026-07-19. Regulatory status, anti-doping status, and the
existence of registered trials can all change. This plan and all sibling files must be re-verified
before the Guide is published or refreshed.
