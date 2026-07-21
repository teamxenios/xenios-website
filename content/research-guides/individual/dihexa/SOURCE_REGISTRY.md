---
title: Dihexa Source Registry
type: research-guide-source-registry
compound: dihexa
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# Dihexa Source Registry

Every source consulted for the Dihexa Guide, with its retrieval status. Sources marked UNVERIFIED
were not successfully read and cannot carry a claim on their own. Sources marked NON-EVIDENCE were
retrieved but are disqualified as a source of fact; they exist here only to record where
unusable claims originated.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## Verification key

- **VERIFIED 2026-07-21**: retrieved and read in this research session at the URL shown.
- **PARTIAL 2026-07-21**: retrieved, but the content could not be read directly and is known only
  through a summary. Nothing from it may be quoted.
- **UNVERIFIED**: fetch failed, was blocked, or returned unparseable content. Existence may be
  known from metadata, but the content was not read.
- **CONTROL**: a deliberate test of the retrieval path itself, not a source of subject-matter fact.
- **NON-EVIDENCE**: retrieved, but disqualified by the exclusion rules in SOURCE_PLAN.md.

## Registry

| ID | Title | Kind | URL | Retrieval status | Supports |
| --- | --- | --- | --- | --- | --- |
| S01 | ClinicalTrials.gov API v2 query for the term Dihexa, returning totalCount 0 | Trial registry, primary | https://clinicaltrials.gov/api/v2/studies?query.term=Dihexa&countTotal=true&pageSize=10&fields=NCTId,BriefTitle,OverallStatus | VERIFIED 2026-07-21 | The absence of any registered interventional or observational study of dihexa. A registry-absence finding, not an approval statement. |
| S02 | ClinicalTrials.gov API v2 query for the term fosgonimeton, returning five studies with identifiers, phases, and statuses | Trial registry, primary | https://clinicaltrials.gov/api/v2/studies?query.term=fosgonimeton&countTotal=true&pageSize=10&fields=NCTId,BriefTitle,OverallStatus,Phase | VERIFIED 2026-07-21 | That the registered clinical programme belongs to fosgonimeton and not to dihexa. Used only as a contrast. Supports no dihexa claim of any kind. |
| S03 | Adversarial control. ClinicalTrials.gov record NCT99999999, a deliberately fake identifier, returning HTTP 404 Not Found | Retrieval-path control | https://clinicaltrials.gov/api/v2/studies/NCT99999999 | CONTROL, VERIFIED 2026-07-21 | That the registry retrieval path does not fabricate records. Half of the validation of the zero result at S01. |
| S04 | Adversarial control. ClinicalTrials.gov query for semaglutide, returning totalCount 744 with real NCT identifiers | Retrieval-path control | https://clinicaltrials.gov/api/v2/studies?query.term=semaglutide&fields=NCTId,BriefTitle&pageSize=3&countTotal=true | CONTROL, VERIFIED 2026-07-21 | That the same retrieval path returns records when records exist. The other half of the validation of the zero result at S01. |
| S05 | PubMed E-utilities search for the term dihexa, returning 18 records, none of a clinical trial publication type | Bibliographic database, primary | https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=dihexa&retmax=50&retmode=json | VERIFIED 2026-07-21 | The size and shape of the dihexa literature. Individual findings within most of these records were not read and no claim rests on them. |
| S06 | PubMed E-utilities search for dihexa restricted to the clinical trial or randomized controlled trial publication types, returning zero records | Bibliographic database, primary | https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=dihexa+AND+(clinical+trial%5Bpt%5D+OR+randomized+controlled+trial%5Bpt%5D)&retmode=json | VERIFIED 2026-07-21 | The absence of any published clinical trial of dihexa indexed in PubMed. |
| S07 | Benoist CC, Kawas LH, Zhu M, Tyson KA, Stillmaker L, Appleyard SM, Wright JW, Wayman GA, Harding JW. The procognitive and synaptogenic effects of angiotensin IV-derived peptides are dependent on activation of the hepatocyte growth factor / c-Met system. J Pharmacol Exp Ther. 2014;351(2):390-402. PMID 25187433, PMC4201273, DOI 10.1124/jpet.114.218735 | Primary preclinical study | https://pmc.ncbi.nlm.nih.gov/articles/PMC4201273/ | VERIFIED 2026-07-21 | Every mechanistic claim in the Guide, each tied to its stated model: male Sprague-Dawley rats, dissociated postnatal rat hippocampal neurons, rat organotypic hippocampal slice cultures, human HEK-293 cells, and Madin-Darby canine kidney cells. Also the c-Met dependence, established by antagonist and short hairpin RNA blockade. |
| S08 | Effects of an angiotensin IV analog on 3-nitropropionic acid induced Huntington's disease-like symptoms in rats. J Huntingtons Dis. 2024. PMID 38489193 | Primary preclinical study, negative result | https://pubmed.ncbi.nlm.nih.gov/38489193/ | VERIFIED 2026-07-21 | That in male Wistar rats, PNB-0408 (dihexa) did not protect against deficits induced by 3-nitropropionic acid neurotoxicity. The negative preclinical result. |
| S09 | Cognitive benefits of angiotensin IV and angiotensin-(1-7): a systematic review of experimental studies. Neurosci Biobehav Rev. 2018. PMID 29733881 | Systematic review of non-human studies | https://pubmed.ncbi.nlm.nih.gov/29733881/ | VERIFIED 2026-07-21 | The shape of the surrounding angiotensin IV cognition literature in non-human models, screened from 450 articles to 32 experimental studies, and the fact that the review included no human studies at all. Supports no dihexa-specific efficacy claim. |
| S10 | Cecchi F, Rabe DC, Bottaro DP. Targeting the HGF/Met signaling pathway in cancer therapy. Expert Opin Ther Targets. 2012. PMID 22530990, DOI 10.1517/14728222.2012.680957 | Mechanism and oncology review | https://pubmed.ncbi.nlm.nih.gov/22530990/ | VERIFIED 2026-07-21 | That c-MET is a proto-oncogene product and that HGF and Met signaling contributes to oncogenesis and tumour progression, and is an active target for cancer-inhibiting drugs. The basis of the central theoretical safety concern. |
| S11 | Zambelli A, Biamonti G, Amato A. HGF/c-Met signalling in the tumor microenvironment. Adv Exp Med Biol. 2021. PMID 33123991, DOI 10.1007/978-3-030-47189-7_2 | Mechanism and oncology review | https://pubmed.ncbi.nlm.nih.gov/33123991/ | VERIFIED 2026-07-21 | That HGF and c-Met signalling promotes proliferation, angiogenesis, invasion, epithelial-mesenchymal transition, and metastasis across multiple tumour types. Corroborates S10. |
| S12 | ALZFORUM therapeutics entry for fosgonimeton (ATH-1017), covering its relationship to dihexa and the ACT-AD and LIFT-AD outcomes | Curated therapeutics database | https://www.alzforum.org/therapeutics/fosgonimeton | VERIFIED 2026-07-21 | That fosgonimeton is a distinct clinical candidate described only as one that may be related to dihexa, and that its ACT-AD Phase 2 trial failed its primary endpoint while its LIFT-AD Phase 2/3 trial failed its primary and key secondary endpoints. |
| S13 | Alzheimer's Drug Discovery Foundation, Cognitive Vitality report on dihexa | Expert review | https://www.alzdiscovery.org/uploads/cognitive_vitality_media/Dihexa_1.pdf | PARTIAL 2026-07-21 | Only, and loosely, that an independent expert review describes the dihexa evidence base as preclinical with no human clinical trials, and flags HGF and c-Met implication in tumour progression and metastasis. The PDF could not be parsed to text in this environment, so its content is known only through a model-generated summary. NO WORDING FROM THIS DOCUMENT MAY BE PUBLISHED AS A QUOTATION until a human opens it. |
| S14 | FDA page on bulk drug substances used in compounding under section 503A of the Federal Food, Drug, and Cosmetic Act | Regulatory, primary, not retrieved | https://www.fda.gov/drugs/human-drug-compounding/bulk-drug-substances-used-compounding-under-section-503a-fdc-act | UNVERIFIED | Nothing. Two attempts returned HTTP 404 to the fetch tool. Secondary and vendor-adjacent pages claim a category placement for dihexa under this framework. No FDA claim about dihexa appears anywhere in this folder and none may be added on this basis. |
| S15 | WADA Prohibited List page | Anti-doping regulator, primary, not retrieved | https://www.wada-ama.org/en/prohibited-list | UNVERIFIED | Nothing. The page returned empty content and two mirror PDFs returned HTTP 403 and unparseable binary. Neither the presence nor the absence of dihexa on the List was established, and the S0 characterisation circulating on aggregator pages is unconfirmed. |
| S16 | InvivoChem vendor listing for dihexa (PNB-0408) | Vendor listing | https://www.invivochem.com/dihexa.html | NON-EVIDENCE | Nothing. Grade E or G market claim only. Recorded to document that dihexa is sold by research-chemical and consumer peptide vendors as a nootropic, and as the origin of the unverified CAS registry number. |
| S17 | ThePeptideCatalog article on dihexa side effects | Vendor-adjacent content marketing | https://thepeptidecatalog.com/articles/dihexa-side-effects | NON-EVIDENCE | Nothing. Grade E or G content-marketing page. Recorded only to illustrate the misinformation surface a member will encounter before reaching this Guide. |

## Vendor pages encountered but not admitted

Vendor and consumer peptide pages surfaced prominently in every search performed this session,
including nationwidepeptides.com, invivochem.com, glpbio.com, thepreptide.com,
creative-peptides.com, ordinarypeptides.com, and calcmypeptide.com. None is scientific evidence.
They have no regulatory identity, purity, or content verification behind them, and there is no
pharmacopoeial monograph or approved reference standard for dihexa against which any of them could
be checked. Only S16 and S17 are listed individually above, as representatives of the category.

## Sources that were sought and not obtained

These are gaps, not sources. They are listed so that a reviewer can close them.

| Item | Why it matters | Outcome this session |
| --- | --- | --- |
| FDA 503A and 503B bulk drug substances pages | Would allow any regulatory statement about dihexa to rest on the regulator. Secondary pages assert a category placement. | Two fetches returned HTTP 404. Nothing is stated. |
| WADA Prohibited List, current edition | Would settle whether dihexa is named, and whether the circulating S0 characterisation is correct | Official page empty, mirror PDFs HTTP 403 and unparseable. |
| Machine-readable text of the ADDF Cognitive Vitality dihexa report | Would allow the one independent expert review to be cited with confidence | PDF retrieved, no parser available. Paraphrase only. |
| The primary source for the reported HGF binding affinity figure and for the circulating potency comparison against brain-derived neurotrophic factor | These are the two most repeated numeric claims about dihexa | Not opened. Both excluded from this folder. |
| Any systematic toxicology or carcinogenicity study of dihexa, in any species | The central safety concern for this compound is oncologic, so this is the highest-value missing item | Not located. Its absence was not affirmatively confirmed; it was simply not found. |
| An authoritative chemical registry entry for the reported CAS number | Basic identity confirmation | Not located. The number appears on vendor pages only and its digits are not reproduced in this folder. |
| EU Clinical Trials Register, ISRCTN, WHO ICTRP, Japanese and Chinese registries | Completeness of the trial search beyond the United States | Not searched. |
</content>
