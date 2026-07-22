---
title: "CJC-1295 Source Registry"
type: source-registry
compound: cjc-1295
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# Source Registry: CJC-1295

Every source used in this Guide, with its retrieval status. Retrieval date for all entries
is 2026-07-19. Sources marked UNVERIFIED were either not retrieved at their primary
location or were retrieved only as a secondary or tertiary account. Nothing in this
registry was reconstructed from memory. No identifier appears here that was not seen in a
retrieved page this session.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## Legend

- **VERIFIED 2026-07-19**: the URL was fetched this session and the content it supports was
  read in that fetch.
- **UNVERIFIED**: the claim it supports could not be confirmed at a primary source this
  session, or the source itself is tertiary. Requires a human check before any member-facing
  use.
- **Variant**: which molecule the source speaks to. DAC is CJC-1295 with the albumin-binding
  drug affinity complex. No-DAC is modified GRF(1-29). This column exists because the two are
  routinely conflated and the distinction changes what a source can support.

## A. Human studies

| ID | Title and citation | Kind | Variant | URL | Status | What it supports |
|---|---|---|---|---|---|---|
| S1 | Prolonged stimulation of growth hormone (GH) and insulin-like growth factor I secretion by CJC-1295, a long-acting analog of GH-releasing hormone, in healthy adults. Teichman SL, Neale A, Lawrence B, Gagnon C, Castaigne JP, Frohman LA. J Clin Endocrinol Metab. 2006 Mar;91(3):799-805. PMID 16352683. DOI 10.1210/jc.2005-1536 | Phase 1 randomized placebo-controlled double-blind ascending dose trials, two sites, 28 and 49 days. Abstract retrieved, full text not obtained | DAC | https://pubmed.ncbi.nlm.nih.gov/16352683/ | VERIFIED 2026-07-19 | The principal human pharmacology finding: dose dependent rise in mean plasma GH and IGF-I, and the estimated half-life range of 5.8 to 8.1 days. Supports no clinical outcome claim |
| S2 | Pulsatile secretion of growth hormone (GH) persists during continuous stimulation by CJC-1295, a long-acting GH-releasing hormone analog. Ionescu M, Frohman LA. J Clin Endocrinol Metab. 2006;91(12):4792-7. PMID 17018654. DOI 10.1210/jc.2006-1702 | Double-blinded clinical trial, overnight blood sampling before and one week after a single administration. Abstract retrieved | DAC | https://pubmed.ncbi.nlm.nih.gov/17018654/ | VERIFIED 2026-07-19 | That GH pulsatility was preserved alongside the rise in basal GH, mean GH and IGF-I, in healthy men aged 20 to 40. Mechanistic only |
| S3 | Activation of the GH/IGF-1 axis by CJC-1295, a long-acting GHRH analog, results in serum protein profile changes in normal adult subjects. Sackmann-Sala L, Ding J, Frohman LA, Kopchick JJ. Growth Horm IGF Res. 2009 Dec;19(6):471-7. PMID 19386527. DOI 10.1016/j.ghir.2009.03.001 | Exploratory proteomic substudy in 11 healthy young adult males. Abstract retrieved | DAC | https://pubmed.ncbi.nlm.nih.gov/19386527/ | VERIFIED 2026-07-19 | That serum protein spot intensities changed after administration. Hypothesis generating only. The authors state the link of these proteins to GH and IGF-I biological activity remains to be clarified |
| S4 | A Multicenter, Randomized, Placebo-Controlled, Double-Blind, Phase 2 Study to Evaluate the Efficacy and Safety of CJC 1295 Administered for 12 Weeks in HIV Infected Patients With HIV Associated Visceral Obesity. Sponsor ConjuChem. NCT00267527. Status Terminated. Enrollment 120. hasResults false | Trial registry record. No results posted | DAC | https://clinicaltrials.gov/api/v2/studies/NCT00267527 | VERIFIED 2026-07-19 | Registration and termination only. Supports an evidence gap, never an efficacy or safety conclusion. The registry record gives no reason for termination |

## B. Completeness checks

| ID | Title | Kind | URL | Status | What it supports |
|---|---|---|---|---|---|
| S5 | ClinicalTrials.gov API query for all registered studies of CJC-1295 | Registry search, page size 50 | https://clinicaltrials.gov/api/v2/studies?query.term=CJC-1295&fields=NCTId,BriefTitle,OverallStatus,StudyType,Phase,Condition,InterventionName,StartDate,CompletionDate,LeadSponsorName&pageSize=50 | VERIFIED 2026-07-19 | That exactly one registered study of CJC-1295 exists in the registry, S4 |
| S9 | PubMed search results for "CJC-1295", 32 records, with titles, authors, journals, years and PMIDs | Literature search result list | https://pubmed.ncbi.nlm.nih.gov/?term=CJC-1295&sort=date&size=50 | VERIFIED 2026-07-19 | That only three human studies of CJC-1295 exist in the indexed literature (S1, S2, S3). Also the bibliographic existence of the preclinical records S14, S15 and S16 |

## C. Review and analytical literature

| ID | Title and citation | Kind | Variant | URL | Status | What it supports |
|---|---|---|---|---|---|---|
| S6 | The emerging landscape of performance-enhancing peptides modulating GH-IGF1 axis: bridging the gap between clinical evidence and patient self-administration. Dominikowski A, Rekos Z, Olejarz M, et al. Front Endocrinol. 2026;17:1822475. DOI 10.3389/fendo.2026.1822475. PMID 42395176 | Peer-reviewed narrative review, open access full text retrieved | Both | https://www.frontiersin.org/journals/endocrinology/articles/10.3389/fendo.2026.1822475/full | VERIFIED 2026-07-19 | The central DAC versus no-DAC evidence distinction, the statement that the no-DAC variant is uncharacterised in the peer-reviewed human literature with no controlled clinical studies in humans, the absence of long term safety data for either variant, the mechanism based oncologic concern with no established clinical carcinogenic signal, and quality control uncertainty in unregulated supply. Narrative review, which is a lower evidence grade than a systematic review |
| S7 | Qualitative identification of growth hormone-releasing hormones in human plasma by means of immunoaffinity purification and LC-HRMS/MS. Knoop A, Thomas A, Fichant E, Delahaut P, Schanzer W, Thevis M. Anal Bioanal Chem. 2016. PMID 26879649. PMCID PMC4830873 | Peer-reviewed analytical and anti-doping paper, full text retrieved | DAC named | https://pmc.ncbi.nlm.nih.gov/articles/PMC4830873/ | VERIFIED 2026-07-19 | That GHRH analogues including CJC-1295 and CJC-1293 are prohibited in sport at all times, referencing the 2015 WADA Prohibited List. Also documentation of a GHRH black market and illicit synthesis of analogue peptide hormones |
| S8 | Identification of CJC-1295, a growth-hormone-releasing peptide, in an unknown pharmaceutical preparation. Henninge J, Pepaj M, Hullstein I, Hemmersbach P. Drug Test Anal. 2010;2(11-12):647-50. PMID 21204297. DOI 10.1002/dta.233 | Peer-reviewed forensic identification study. Abstract retrieved | Not distinguished in abstract | https://pubmed.ncbi.nlm.nih.gov/21204297/ | VERIFIED 2026-07-19 | That CJC-1295 was identified by mass spectrometry in an unlabeled illicit preparation of unknown origin submitted by Norwegian police and customs authorities. Direct documentation that this compound circulates unlabeled. Published 2010, so 16 years old |

## D. Preclinical records

These support animal and in vitro statements only. They never support a human claim. Their
bibliographic details were read in the retrieved PubMed result list (S9); their full
abstracts were not separately retrieved.

| ID | Record | Model | URL | Status | What it supports |
|---|---|---|---|---|---|
| S14 | Jetté L, et al. Endocrinology. 2005. PMID 15817669 | Rat, anterior pituitary GRF receptor | https://pubmed.ncbi.nlm.nih.gov/?term=CJC-1295&sort=date&size=50 | VERIFIED 2026-07-19 (bibliographic record and stated finding read in the result list) | That human GRF(1-29) albumin bioconjugates activate the GRF receptor on the anterior pituitary in rats, and that this work identified CJC-1295 as a long lasting GRF analog. This is the originating characterization of the albumin bioconjugate (DAC) design |
| S15 | Alba M, et al. Am J Physiol Endocrinol Metab. 2006. PMID 16822960 | GHRH knockout mouse | https://pubmed.ncbi.nlm.nih.gov/?term=CJC-1295&sort=date&size=50 | VERIFIED 2026-07-19 (bibliographic record and stated finding read in the result list) | That repeated administration normalized growth in the GHRH knockout mouse. A genetically GHRH deficient animal is not a model of a healthy adult human |
| S16 | Timms M, et al. Drug Test Anal. 2019. PMID 30938069 and PMID 30489688 | Horse, equine plasma | https://pubmed.ncbi.nlm.nih.gov/?term=CJC-1295&sort=date&size=50 | VERIFIED 2026-07-19 (bibliographic records and stated findings read in the result list) | Development of LC-MS/MS and immuno-PCR methods to confirm and screen for CJC-1295 in equine plasma. Detection methodology only. Listed to document that veterinary misuse prompted assay development, not as efficacy or safety evidence |

## E. Regulatory sources

| ID | Document | Jurisdiction | URL | Status | What it supports |
|---|---|---|---|---|---|
| S10 | Pharmacy Compounding Advisory Committee; Notice of Meeting; Establishment of a Public Docket; Request for Comments. Federal Register Vol. 89, No. 207, October 25 2024. Docket FDA-2024-N-4777. Meeting December 4 2024 | United States | https://www.govinfo.gov/content/pkg/FR-2024-10-25/html/2024-24828.htm | VERIFIED 2026-07-19 | That five CJC-1295 forms were being considered for inclusion on the section 503A bulk drug substances list. The notice states consideration only. It does not state FDA's recommendation and it does not report an outcome |
| S11 | Federal Register notice, January 7 2025, docket FDA-2015-D-3517, FDA final guidance on compounding using bulk drug substances under section 503A | United States | https://www.govinfo.gov/content/pkg/FR-2025-01-07/html/2024-31546.htm | VERIFIED 2026-07-19 | That the Category 1, 2 and 3 categorization ends for substances nominated on or after that guidance's publication date. The notice does not mention CJC-1295 or peptides by name, so it does not by itself establish this compound's status |
| S12 | Federal Register notice, April 16 2026, docket FDA-2025-N-6895, announcing the July 23 to 24 2026 Pharmacy Compounding Advisory Committee meeting and its substance list | United States | https://www.govinfo.gov/content/pkg/FR-2026-04-16/html/2026-07361.htm | VERIFIED 2026-07-19 | That the listed peptide substances include BPC-157, KPV, TB-500, MOTS-C, DSIP, Semax and Epitalon, and that CJC-1295 is not among them. Refutes the vendor claim that CJC-1295 is pending July 2026 advisory committee review |

## F. Unverified and tertiary

| ID | Source | Kind | URL | Status | Why it is here |
|---|---|---|---|---|---|
| S13 | CJC-1295 (Wikipedia) | Tertiary encyclopedia | https://en.wikipedia.org/wiki/CJC-1295 | UNVERIFIED. Retrieved 2026-07-19, content not independently confirmed | Traces one widely repeated account, that development was discontinued following a trial subject's death, with the attending physician attributing it to pre-existing coronary artery disease unrelated to treatment. No primary source for this was retrieved. It is consistent with, but not established by, the verified fact that S4 is terminated with no posted results and no stated reason. Supports nothing. Flagged for human verification |
| S6-secondary | The statement within S6 that FDA listed CJC-1295 on Category 2 of the bulk drug substances list due to vasodilatatory reactions and tachycardia reports | Secondary claim inside a peer-reviewed review | https://www.frontiersin.org/journals/endocrinology/articles/10.3389/fendo.2026.1822475/full | UNVERIFIED at primary source | The underlying FDA document could not be retrieved this session because fda.gov returned HTTP 404 to every fetch attempt. Neither the listing nor the stated safety rationale is independently confirmed here, and its currency is unknown. Must not appear in member-facing copy until a human confirms it at fda.gov |

## G. Sources that could not be retrieved

Recorded so a reviewer does not repeat the attempt blindly, and so absence of a document is
never mistaken for absence of a fact.

| Target | Attempted for | Result |
|---|---|---|
| fda.gov, multiple URLs including the advisory committee briefing document, the bulk drug substances list pages, the December 4 2024 meeting page, the meeting transcript, and a compounding warning letter | FDA's stated proposal on each CJC-1295 form, the committee vote, current list status, any safety communication | HTTP 404 to every automated fetch attempt. The single largest gap in this record |
| downloads.regulations.gov, docket FDA-2024-N-4777 | Public comments and attachments | HTTP 403. Note that several attachments appear to be nominator or industry submissions, which would grade as advocacy rather than evidence in any case |
| wada-ama.org current Prohibited List | Current year section number and exact wording for GHRH analogues | JavaScript rendered, no parseable content. Status confirmed instead through S7 |
| federalregister.gov article pages | The three Federal Register notices | Redirected to an anti-bot interstitial. Worked around successfully via govinfo.gov (S10, S11, S12), so this gap is closed |
| PubMed abstracts for seven 2026 narrative reviews identified in the S9 result list: Villegas Meza (JBJS Rev, PMID 42160466), Renke (Int J Mol Sci, PMID 42123471), Mavrych (Front Aging, PMID 42021992), Mendias and Awan (Sports Med, PMID 41966639), Coutinho (J Sports Med Phys Fitness, PMID 41880199), Rahman (JAAOS Glob Res Rev, PMID 41490200), Mayfield (Am J Sports Med, PMID 41476424) | Recent review content, possibly safety or product quality relevant | PubMed began returning reCAPTCHA challenges partway through the session. Existence, titles, authors, journals, years and PMIDs are verified from S9. Content is not. Worth a human pass |
| Full texts of S1, S2 and S3 | Exact enrollment numbers, sex breakdown, adverse event tables, dropout data | Not obtained. Abstracts only |
| A systematic review or meta-analysis specific to CJC-1295 | Higher grade synthesis | None found. The 2026 sources identified are narrative reviews |
| Any independent product testing or purity analysis of currently marketed products sold under this name | Product identity and purity | None found. S8 is the closest available and is 16 years old |
| A peer-reviewed or regulatory source for the amino acid substitution positions of modified GRF(1-29) | Chemical identity of the no-DAC variant | Not obtained. Those positions appeared only in vendor material this session and are excluded from the verified record. [UNVERIFIED - background knowledge, requires human source check] |
| Any non-United States regulator (EMA, MHRA, TGA, Health Canada) | Regulatory status outside the United States | Not searched this session. The Guide has no basis to state anything about these jurisdictions |
