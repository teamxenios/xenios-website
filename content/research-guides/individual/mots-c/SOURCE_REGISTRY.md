---
title: "MOTS-c Source Registry"
type: research-guide-source-registry
compound: MOTS-c
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# MOTS-c Source Registry

Every source used in the MOTS-c Research Guide, with its retrieval status. Source ids in
this table are the ids referenced by CLAIM_TABLE.md, CONTRADICTIONS.md and
REGULATORY_STATUS.md.

"VERIFIED 2026-07-19" means the document was retrieved directly at the URL shown, on that
date. "UNVERIFIED" means the item rests on another source's description of it, on background
knowledge, or on a retrieval that failed, and requires a human source check before
publication.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## Part 1. Sources retrieved directly

| ID | Title | Kind | URL | Retrieval status | What it supports |
| --- | --- | --- | --- | --- | --- |
| S01 | USADA, What is the MOTS-c peptide? | National anti-doping organisation guidance. Secondary to both the WADA Prohibited List and to FDA. | https://www.usada.org/spirit-of-sport/what-is-mots-c-peptide/ | VERIFIED 2026-07-19 | The anti-doping classification under metabolic modulators, activators of AMP-activated protein kinase. The statement that no therapeutic use exemption is available. The statement that MOTS-c is not FDA approved for human use. The statement that FDA prohibits compounding pharmacies from making medications containing MOTS-c. The statement that it is unknown under what conditions, if any, use is safe, because no clinical trials have been completed. The statement that no long-term safety data exist. The list of reported adverse effects. |
| S02 | ClinicalTrials.gov NCT07505745. A Phase 2a, Randomized, Double-blind, Placebo-controlled Study to Evaluate the Efficacy, Safety, and Pharmacodynamics of MOTS-c (a Mitochondrial-Derived Peptide) in Adults With Prediabetes and Overweight/Obesity. Sponsor Hudson Biotech. | Trial registry record, retrieved through API v2 | https://clinicaltrials.gov/api/v2/studies/NCT07505745 | VERIFIED 2026-07-19 | That one interventional MOTS-c trial is registered and listed as RECRUITING, estimated enrollment 120, start date February 2026, with NO results posted. Supports the description of MOTS-c as a mitochondrial-derived peptide. Supports nothing about efficacy or safety. |
| S03 | ClinicalTrials.gov NCT03998514. Phase 1a/1b randomized, double-blind, placebo-controlled trial of CB4211, a MOTS-c ANALOG, in healthy non-obese subjects and subjects with nonalcoholic fatty liver disease. Sponsor CohBar, Inc. Status Completed, verified May 2021. | Trial registry record, retrieved through API v2 query | https://clinicaltrials.gov/api/v2/studies?query.term=CB4211&format=json | VERIFIED 2026-07-19 | That a Phase 1a/1b trial of a MOTS-c analog ran, enrolled 88 participants across four sites in California and Texas, completed, and has NO results posted. It supports no finding about CB4211's effect or tolerability, and no finding about MOTS-c at all. |
| S04 | ClinicalTrials.gov NCT04027712. Observational cohort with two-year follow-up in patients with coronary artery disease and type 2 diabetes, estimated 120 patients, sponsor University of Athens. Overall status UNKNOWN, last known status active, not recruiting. | Trial registry record, retrieved through API v2 | https://clinicaltrials.gov/api/v2/studies/NCT04027712 | VERIFIED 2026-07-19 | That an observational study designed to test MOTS-c as a prognostic biomarker exists, has no posted results, and carries a stale registry status. It supports no outcome and nothing about administration. |
| S05 | Circulating MOTS-c levels are decreased in obese male children and adolescents and associated with insulin resistance (Pediatric Diabetes, 2018). PMID 29691953. | Peer-reviewed human observational case-control study. NOT interventional. | https://pubmed.ncbi.nlm.nih.gov/29691953/ | VERIFIED 2026-07-19 | That in 97 participants in Hubei Province, China (40 obese children and adolescents, 57 controls), circulating MOTS-c was significantly lower in obese male children and adolescents than in controls, and was negatively correlated with markers of insulin resistance and obesity in the male cohort. MOTS-c was measured, not administered. |
| S06 | MOTS-C levels in individuals with and without obesity and its association with inflammation, insulin resistance and endothelial dysfunction (Archives of Endocrinology and Metabolism, 2025). PMID 41004666, PMCID PMC12468430. | Peer-reviewed human observational cross-sectional case-control study with prospective enrollment. NOT interventional. | https://pmc.ncbi.nlm.nih.gov/articles/PMC12468430/ | VERIFIED 2026-07-19 | That in 85 adults (48 with BMI at or above 30, 37 with BMI between 18.5 and 24.9), serum MOTS-c showed a significant POSITIVE correlation with HOMA-IR, and levels did not differ significantly between the obesity and normal-weight groups. That age and insulin resistance independently predicted MOTS-c levels. That the authors state MOTS-c measurement methods are unstandardised across the literature. MOTS-c was measured, not administered. |
| S07 | MOTS-c: A promising mitochondrial-derived peptide for therapeutic exploitation (Frontiers in Endocrinology, 2023). PMCID PMC9905433. | Peer-reviewed narrative review, synthesising preclinical work | https://pmc.ncbi.nlm.nih.gov/articles/PMC9905433/ | VERIFIED 2026-07-19 | The proposed mechanism as reported in rodent and cell-culture systems, including AMPK-dependent nuclear translocation under metabolic stress and the described activation of the AMPK pathway with inhibition of the MAP kinase and c-Fos pathway. Reported rodent findings on skeletal muscle glucose metabolism, prevention of high-fat-diet-induced obesity, and anti-inflammatory effects in formalin pain testing. The reviewing authors' own statement that no effective method of applying MOTS-c in the clinic has been developed. |
| S08 | ClinicalTrials.gov API control query using a non-existent identifier (NCT07505999) | Methodological control check | https://clinicaltrials.gov/api/v2/studies/NCT07505999 | VERIFIED 2026-07-19 | That the registry retrieval layer returns HTTP 404 for an identifier that does not exist, and therefore did not fabricate the records at S02, S03 and S04. This row supports no health claim. It supports confidence in the three registry citations. |

## Part 2. Attempted and failed retrievals

These are recorded because a failed retrieval is a finding. Nothing in this section may be
cited as support for anything.

| ID | Item | Attempted URL or target | Retrieval status | Consequence |
| --- | --- | --- | --- | --- |
| F01 | FDA 503A bulk drug substances category listings | fda.gov compounding category pages | UNVERIFIED. Returned HTTP 404 on attempt, 2026-07-19 | FDA's category classification for MOTS-c is not established by this Guide. No claim about it appears. |
| F02 | FDA media document relating to bulk drug substances | fda.gov media document | UNVERIFIED. Returned HTTP 404 on attempt, 2026-07-19 | No FDA primary source was obtained for this compound. |
| F03 | FDA warning letters naming MOTS-c | Not retrieved | UNVERIFIED. Not confirmed to exist or not to exist | The Guide makes no claim about FDA enforcement specific to MOTS-c. |
| F04 | Human-readable ClinicalTrials.gov study page for NCT07505745 | https://clinicaltrials.gov/study/NCT07505745 | UNVERIFIED. Returns a JavaScript shell to an automated fetcher | The record rests on the v2 API (S02) plus the control test (S08). A human should open the page in a browser before publication. |
| F05 | Systematic reviews and meta-analyses of MOTS-c | PubMed systematic sweep | UNVERIFIED. Not run. Session search budget exhausted | No systematic review or meta-analysis was retrieved. The Guide does not claim none exists. |
| F06 | WADA Prohibited List primary document | Not retrieved | UNVERIFIED | The anti-doping classification is carried through S01 only, and is labelled as such in REGULATORY_STATUS.md. |

## Part 3. Unverified items, and claims that circulate but are not supported here

These are named so that a reviewer and an editor can recognise them if they resurface. None
of them may be used as support for any claim in the Guide.

| ID | Item | Status | Note |
| --- | --- | --- | --- |
| UV01 | Every FDA-specific statement in this Guide | UNVERIFIED as to primary source. Verified only as USADA's reported statement (S01) | This includes the non-approval statement and the compounding statement. Both are reported here through an anti-doping organisation, not read from an FDA document. Requires human verification against fda.gov. |
| UV02 | The claim that CB4211 was found safe and well tolerated | UNVERIFIED | Traces to sponsor communications, not to posted trial results. S03 shows the registry carries no posted results. This claim is prohibited in the Guide. |
| UV03 | Claims about a July 2026 FDA advisory review of MOTS-c and its removal from a 503A category list | UNVERIFIED. Appeared only in vendor and marketing material | Excluded entirely from REGULATORY_STATUS.md. Must not be repeated without primary sourcing. |
| UV04 | Claims about FDA-stated impurity, active ingredient characterisation and immunogenicity concerns specific to MOTS-c | UNVERIFIED. Appear on secondary and vendor pages. FDA pages returned 404 (F01, F02) | Not carried into the Guide. Immunogenicity risk in humans is listed in the Guide as an unknown, not as an FDA finding. |
| UV05 | That MOTS-c is a 16-amino-acid peptide, and that related mitochondrial-derived peptides include humanin and the SHLP family | [UNVERIFIED - background knowledge, requires human source check] | The description of MOTS-c as a mitochondrial-derived peptide is supported by S02 and S07. The specific amino acid count and the named sibling peptides were not confirmed against a retrieved source and are marked accordingly wherever they appear. |
| UV06 | Sponsor status of CohBar, Inc. | [UNVERIFIED - background knowledge, requires human source check] | The registry record (S03) establishes CohBar as sponsor. Any statement about the company's subsequent corporate status was not verified against a retrieved source and does not appear in member-facing text. |
| UV07 | Any statement about the regulatory status of MOTS-c outside the United States | UNVERIFIED. Nothing retrieved | No non-US regulator was consulted. Silence is recorded as silence. |
| UV08 | Any analytical, purity or counterfeiting data on MOTS-c sold through unregulated channels | UNVERIFIED. Nothing retrieved | The Guide makes only the structural point about absence of regulatory assurance, with no quantitative market claim. |

## Part 4. Source types excluded by policy

Vendor, retailer, compounding pharmacy, telehealth and clinic pages are not admissible as
evidence in this Guide and carry no source id. They appeared heavily in general web search
for this compound and were the principal source of the unverified claims listed in Part 3.

Sponsor press communications, podcasts, influencer content and forum anecdote are likewise
not admissible as evidence. The single narrow exception is that an official body's own
aggregation of reported adverse effects (S01) is admitted as a low-grade risk signal,
because a statement that restrains use may be published at low grade while a statement that
promotes use may not.
