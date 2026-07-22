---
title: KPV Source Registry
type: research-guide-source-registry
compound: KPV (Lys-Pro-Val)
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# KPV Source Registry

Every source consulted for the KPV Guide, with its retrieval status. Sources marked
UNVERIFIED were not successfully read in full and cannot carry a claim on their own.
Source S12 is listed as non-evidence and exists only to record where a set of unusable
numbers originated.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## Verification key

- **VERIFIED 2026-07-19**: retrieved and read in this research session at the URL shown.
- **UNVERIFIED**: fetch failed, was blocked, or returned unparseable content. Existence may be
  known from metadata, but the content was not read.
- **NON-EVIDENCE**: retrieved, but disqualified as a source of fact by the exclusion rules in
  SOURCE_PLAN.md.

Note for the reviewer: these entries are stamped 2026-07-19 to match the review date on this
file. The underlying research record carries retrieval timestamps of 2026-07-20. Reconcile
before publication.

## Registry

| ID | Title | Kind | URL | Retrieval status | Supports |
| --- | --- | --- | --- | --- | --- |
| S01 | ClinicalTrials.gov API v2 query for the term KPV, returning zero studies | Trial registry, primary | https://clinicaltrials.gov/api/v2/studies?query.term=KPV&pageSize=50&fields=NCTId,BriefTitle,OverallStatus,InterventionName,Phase | VERIFIED 2026-07-19 | The absence of any registered clinical trial of KPV, ongoing, completed, or terminated. |
| S02 | PubMed E-utilities search, KPV in title or abstract restricted to the clinical trial publication type, returning zero records | Bibliographic database, primary | https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=(KPV[Title/Abstract])+AND+(clinical+trial[Publication+Type])&retmax=40&retmode=json | VERIFIED 2026-07-19 | The absence of any published clinical trial of KPV indexed in PubMed. |
| S03 | PubMed E-utilities summary of 17 KPV and alpha-MSH records, with titles, journals, years, and publication types | Bibliographic database, primary | https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=34547895,29953505,28349696,28143741,22837805,22178636,21222263,18612139,18092346,17934097,16965771,16413580,15946192,15102092,12851308,11073109,10670585&retmode=json | VERIFIED 2026-07-19 (titles only) | The shape and size of the KPV literature map, and the fact that none of the 17 records is indexed as a clinical trial. Titles verified. Individual findings in 11 of these records were not read. |
| S04 | PubMed abstracts for PMID 22837805 (human bronchial epithelial cell line), PMID 28143741 (Mol Ther 2017, nanoparticle colitis study), PMID 18092346 (Inflamm Bowel Dis 2008, murine colitis), PMID 15102092 (J Invest Dermatol 2004, human keratinocyte cell lines) | Primary preclinical literature | https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=22837805,28143741,18092346,15102092&retmode=xml&rettype=abstract | VERIFIED 2026-07-19 | All preclinical findings in the claim table, each tied to its stated model. Also the evidence that KPV is not understood to act through melanocortin receptors. |
| S05 | PubMed abstracts for PMID 18612139 (Endocr Rev 2008 review) and PMID 21222263 (Adv Exp Med Biol 2010 review) | Peer-reviewed narrative review | https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=18612139,21222263&retmode=xml&rettype=abstract | VERIFIED 2026-07-19 | The identity of KPV as the C-terminal tripeptide of alpha-MSH, the statement that it lacks the sequence motif required to bind known melanocortin receptors, the concession that its signaling mechanism is unknown, and the forward-looking framing of KPV as a candidate for possible future treatment. |
| S06 | Multifactor quality and safety analysis of semaglutide products sold by online sellers without a prescription (J Med Internet Res, 2024, PMID 39509151) | Peer-reviewed market surveillance study | https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=39509151&retmode=xml&rettype=abstract | VERIFIED 2026-07-19 | Failure of the unregulated online peptide supply channel. Concerns a different peptide. Does NOT support any statement about KPV product quality. |
| S07 | FDA mulls compounding for peptides previously flagged over safety risks (BioSpace, dated 2026-04-16) | Trade press, secondary regulatory reporting | https://www.biospace.com/fda/fda-mulls-compounding-for-peptides-previously-flagged-over-safety-risks | VERIFIED 2026-07-19 | The Category 2 placement of KPV under the 503A bulk drug substances framework, the reported FDA rationale citing an absence of human exposure data, and the fact that the advisory committee meeting was still upcoming at the time of reporting. |
| S08 | FDA considers adding a dozen peptides to its bulk drug compounding list (RAPS, Regulatory Affairs Professionals Society, dated 2026-04-16) | Professional society regulatory reporting, secondary | https://www.raps.org/resource/fda-considers-adding-a-dozen-peptides-to-its-bulk-drug-compounding-list.html | VERIFIED 2026-07-19 | That KPV-related bulk drug substances, free base and acetate, were scheduled for review at the Pharmacy Compounding Advisory Committee meeting of July 23 to 24, 2026, and that free base and acetate are treated as distinct substances. |
| S09 | Partnership for Safe Medicines comments to the Pharmacy Compounding Advisory Committee, dated 2026-07-01 | Advocacy organisation public comment, secondary | https://www.safemedicines.org/2026/07/psm-pcac-comments.html | VERIFIED 2026-07-19 | An independent third-party characterisation naming KPV among the substances under consideration and asserting an absence of adequate human clinical trials. Must be attributed as advocacy, not as a regulator finding. |
| S10 | WADA Prohibited List landing page | Anti-doping regulator, primary but not successfully retrieved | https://www.wada-ama.org/en/prohibited-list | UNVERIFIED | Nothing on its own. The Prohibited List PDF could not be parsed on two attempts. Neither the presence nor the absence of KPV on the List was confirmed by direct reading. The wording of the non-approved substances section was obtained only from a domain-restricted search summary. |
| S11 | Federal Register document 2026-07361, Pharmacy Compounding Advisory Committee notice of meeting, establishment of a public docket, and request for comments, dated 2026-04-16 | Government notice, primary but not successfully retrieved | https://www.federalregister.gov/documents/2026/04/16/2026-07361/pharmacy-compounding-advisory-committee-notice-of-meeting-establishment-of-a-public-docket-request | UNVERIFIED | The existence and title of the notice, confirmed from search metadata only. The site redirected to an anti-bot interstitial and the public-inspection PDF was unparseable, so the verbatim substance list was never read from the primary notice. |
| S12 | Gray-market peptide quality claims (vendor blog) | Vendor or marketing blog | https://www.glpwinner.com/insights/grey-market-peptide-quality-what-lab-testing-found | NON-EVIDENCE | Nothing. Recorded only to document the origin of a set of circulating failure statistics that could not be traced to any primary source. These figures are named and prohibited in CLAIM_TABLE.md. |

## Sources that were sought and not obtained

These are gaps, not sources. They are listed so that a reviewer can close them.

| Item | Why it matters | Outcome this session |
| --- | --- | --- |
| FDA 503A bulk drug substances category lists and the advisory committee meeting page | Would allow every regulatory statement to rest on the regulator rather than on trade press | Direct fetches returned HTTP 404, and the mirror returned HTTP 403. Consistent with bot blocking. |
| FDA briefing document for the July 2026 advisory committee meeting | Would establish whether concerns circulating in secondary summaries are in fact FDA's stated position | Not retrieved. No such concern is attributed to FDA anywhere in this folder. |
| A primary paper establishing intestinal peptide transporter (PepT1) uptake of KPV | It is the most repeated mechanistic claim in marketing material | Not located. The claim is graded G in the claim table. |
| A primary chemical registry entry for the reported registry number and molecular weight | Basic identity confirmation | Not located. [UNVERIFIED - background knowledge, requires human source check] |
| Any analytical study testing material sold as KPV | Would allow a KPV-specific product quality statement | Not located. No such study appears to exist. |
| EU Clinical Trials Register, ISRCTN, WHO ICTRP, Japanese and Chinese registries | Completeness of the trial search | Not searched. |
