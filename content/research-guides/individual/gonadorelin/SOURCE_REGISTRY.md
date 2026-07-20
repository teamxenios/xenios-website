---
title: Gonadorelin Source Registry
type: research-guide-source-registry
compound: gonadorelin
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# Gonadorelin Source Registry

Every source underlying this Guide, with retrieval status and what it supports.

Date handling. This package is stamped to the workflow review date of 2026-07-19. The research record carries a retrieval date of 2026-07-20 on every retrieved source, and that is the date shown in the retrieval column below because it is the date the retrieval actually occurred. A reviewer should reconcile the two stamps before publication.

Anything not retrieved directly at a recorded URL is marked UNVERIFIED and may not support a member-facing claim.

## Retrieved sources

| ID | Title | Kind | URL | Retrieval status | Verification | Supports |
| --- | --- | --- | --- | --- | --- | --- |
| S-01 | Drugs@FDA (openFDA API), FACTREL NDA018123 and LUTREPULSE KIT NDA019687 application records | FDA primary regulatory data | https://api.fda.gov/drug/drugsfda.json?search=products.brand_name:%22LUTREPULSE%22+OR+products.brand_name:%22FACTREL%22&limit=20 | Retrieved in full | VERIFIED 2026-07-20 | C-01, C-03, C-16 |
| S-02 | FDA, Bulk Drug Substances Nominated for Use in Compounding Under Section 503A of the FD&C Act, updated May 14, 2026 | FDA primary list document (PDF, full text extracted and searched) | https://www.fda.gov/media/94155/download | Retrieved in full, all three categories searched | VERIFIED 2026-07-20 | C-05, C-06, C-19, C-20 |
| S-03 | FDA, Bulk Drug Substances Nominated for Use in Compounding Under Section 503B of the FD&C Act, updated March 21, 2025 | FDA primary list document (PDF, full text extracted and searched) | https://www.fda.gov/media/94164/download | Retrieved in full, gonadorelin acetate located in Category 1 | VERIFIED 2026-07-20 | C-04 |
| S-04 | DailyMed, FACTREL (gonadorelin hydrochloride injection), Zoetis Inc., NADA 139-237, for use in cattle only | FDA regulated product label (veterinary) | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=1451663c-b85a-4b45-8b27-6d572d0032f9 | Retrieved | VERIFIED 2026-07-20 | C-07, C-17 |
| S-05 | WADA, The Prohibited List, section S2.2.1 Testosterone-Stimulating Peptides in Males | Anti-doping regulatory standard (live HTML page) | https://www.wada-ama.org/en/prohibited-list | Retrieved as HTML. The PDF version could not be retrieved and the list year could not be confirmed from the markup | VERIFIED 2026-07-20 for the S2.2.1 entry. List year UNVERIFIED | C-08 |
| S-06 | Effect and safety of pulsatile GnRH therapy for male congenital hypogonadotropic hypogonadism, Zhonghua Nan Ke Xue 2024 May;30(5):404-409, PMID 39210488 | PubMed indexed human retrospective observational study | https://pubmed.ncbi.nlm.nih.gov/39210488/ | English abstract retrieved. Full text not reviewed, article published in Chinese | VERIFIED 2026-07-20 (abstract only) | C-09, C-10, C-11, C-25, P-06 |
| S-07 | Anaphylaxis to gonadorelin acetate in a girl with central precocious puberty, J Pediatr Endocrinol Metab 2015 Nov 1;28(11-12):1387-9, PMID 26197466 | PubMed indexed human case report (safety) | https://pubmed.ncbi.nlm.nih.gov/26197466/ | Retrieved | VERIFIED 2026-07-20 | C-12 |
| S-08 | Clinical Management of Congenital Hypogonadotropic Hypogonadism, Endocr Rev 2019 Apr 1;40(2):669-710, PMID 30698671 | PubMed indexed narrative review | https://pubmed.ncbi.nlm.nih.gov/30698671/ | Retrieved | VERIFIED 2026-07-20 | Background context only. Supports no member-facing claim in this package |
| S-09 | GnRH in the Treatment of Hypogonadotropic Hypogonadism, Curr Pharm Des 2021;27(24):2754-2756, PMID 33238870 | PubMed indexed short review | https://pubmed.ncbi.nlm.nih.gov/33238870/ | Retrieved | VERIFIED 2026-07-20 | Background context only. Supports no member-facing claim in this package |
| S-10 | Effect of different gonadorelin (GnRH) products used for the first or resynchronized timed artificial insemination on pregnancy rates in postpartum dairy cows, Theriogenology 2015 Sep 1;84(4):504-8, PMID 25979657 | PubMed indexed veterinary field trial in cattle. Not human evidence | https://pubmed.ncbi.nlm.nih.gov/25979657/ | Retrieved | VERIFIED 2026-07-20 | C-18 |
| S-11 | openFDA adverse event (FAERS) query on generic name gonadorelin, returned NOT_FOUND | FDA post-market surveillance database, negative result | https://api.fda.gov/drug/event.json?search=patient.drug.openfda.generic_name:%22gonadorelin%22&limit=1 | Retrieved, zero records | VERIFIED 2026-07-20 | C-13 |
| S-12 | PubMed search, gonadorelin[tiab] AND (testosterone therapy[tiab] OR TRT[tiab] OR fertility preservation[tiab]), zero records returned | PubMed search, negative result | https://pubmed.ncbi.nlm.nih.gov/?term=gonadorelin%5Btiab%5D+AND+%28testosterone+therapy%5Btiab%5D+OR+TRT%5Btiab%5D+OR+fertility+preservation%5Btiab%5D%29 | Retrieved, zero records | VERIFIED 2026-07-20 | C-14, P-01, P-02, P-03 |
| S-13 | ClinicalTrials.gov API v2 intervention query for gonadorelin, no studies returned with gonadorelin as an intervention | Trial registry query, negative result | https://clinicaltrials.gov/api/v2/studies?query.intr=gonadorelin&pageSize=40 | Retrieved, no matching interventions. Only GnRH analogue trials returned | VERIFIED 2026-07-20 | C-15 |
| S-14 | FDA Warning Letter, Gram Peptides, 721806, 03/31/2026 | FDA enforcement record, negative result | https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/gram-peptides-721806-03312026 | Retrieved in full, does not mention gonadorelin | VERIFIED 2026-07-20 | C-21 |
| S-15 | FDA Warning Letter, USApeptide.com, 696885, 02/26/2025 | FDA enforcement record, negative result | https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/usapeptidecom-696885-02262025 | Retrieved in full, does not mention gonadorelin | VERIFIED 2026-07-20 | C-21 |
| S-16 | PubMed search, gonadorelin[tiab] AND (purity[tiab] OR counterfeit[tiab] OR content[tiab] OR quality[tiab]) | PubMed search, negative for the intended target | https://pubmed.ncbi.nlm.nih.gov/?term=gonadorelin%5Btiab%5D+AND+%28purity%5Btiab%5D+OR+counterfeit%5Btiab%5D+OR+content%5Btiab%5D+OR+quality%5Btiab%5D%29 | Retrieved, 25 records, none of the top ranked results were gonadorelin product quality analyses | VERIFIED 2026-07-20 | C-22 |

## Non-retrieved and disqualified material

| ID | Description | Kind | URL | Retrieval status | Verification | Status in this Guide |
| --- | --- | --- | --- | --- | --- | --- |
| X-01 | Secondary industry and vendor-adjacent pages (a compounding industry academy blog and a telehealth blog surfaced in search) asserting that gonadorelin acetate is on the FDA 503A Category 1 list | Secondary commercial or trade commentary | No URL recorded. Deliberately not captured as a citable source | Seen in search results only | UNVERIFIED | Disqualified as evidence. Recorded in CONTRADICTIONS.md as a claim contradicted by primary FDA documents |
| X-02 | A search result summary asserting that GnRH is on FDA Category 2 while gonadorelin remains permissible for compounding | Secondary search result summary | No URL recorded | Seen in search results only | UNVERIFIED | Disqualified as evidence. Contradicted by S-02 |
| X-03 | Compounding pharmacy and peptide vendor product pages surfaced in search | Vendor and retailer marketing | No URL recorded | Seen in search results only, deliberately not used | UNVERIFIED | Disqualified as evidence by policy. Vendor claims are not evidence |
| X-04 | Two possible gonadorelin trial registrations surfaced by web search, one described as a seven day GnRH study in hypogonadal men and one described as a Lutrepulse hypogonadotropic hypogonadism entry seen on a third party trial mirror site | Trial registry records | Could not be retrieved from clinicaltrials.gov. Study page fetches returned navigation content only | Not retrieved | UNVERIFIED | No NCT identifier recorded anywhere in this package. Do not add unless a human retrieves the records from clinicaltrials.gov directly |
| X-05 | Archived FDA approved human prescribing information for FACTREL NDA018123 and LUTREPULSE KIT NDA019687 | FDA primary human labels | Not located. Both predate routinely posted PDFs in Drugs@FDA and the DailyMed Factrel record resolves to the cattle label | Not retrieved | UNVERIFIED | Gap. The historical human warnings and adverse reaction profile must not be characterised until a reviewer obtains these |
| X-06 | WADA Prohibited List official PDF | Anti-doping regulatory standard | https://www.wada-ama.org/en/prohibited-list | Direct PDF request returned an empty response, likely bot mitigation | Not retrieved | UNVERIFIED | Gap. The list year in force must be confirmed by a reviewer |
| X-07 | Standard endocrinology background distinguishing gonadorelin, the native short acting GnRH sequence, from long acting GnRH agonist analogues and from GnRH antagonists | Background knowledge | None | Not retrieved | UNVERIFIED, background knowledge, requires human source check | Bears on C-02 and C-26. May appear in the Guide only with that label attached, or must be replaced with a retrieved source |
| X-08 | Non US regulatory records (European Union, United Kingdom, Australia, Canada, Japan) | National and regional regulators | None | Not searched | UNVERIFIED | Not searched. The Guide makes no claim about these jurisdictions |
| X-09 | State pharmacy board actions, DEA scheduling status, FDA import alerts | US secondary regulatory records | None | Not searched | UNVERIFIED | Not searched |
