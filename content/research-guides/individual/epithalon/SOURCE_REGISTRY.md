---
title: Epithalon Source Registry
type: research-guide-source-registry
compound: epithalon
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# Epithalon Source Registry

Every source consulted for the Epithalon Guide, with its retrieval status. Sources marked
UNVERIFIED were not successfully read and cannot carry a claim on their own. Sources marked
TITLE-LEVEL ONLY had their existence and title returned by a search, but their abstract, models,
controls, and effect sizes were not read.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## Verification key

- **VERIFIED 2026-07-21**: retrieved and read in this research session at the URL shown.
- **TITLE-LEVEL ONLY 2026-07-21**: returned by a search as a title in a result listing. The
  underlying record was not read. Cannot support any effect claim.
- **UNVERIFIED**: the fetch failed, was blocked, or returned content that could not be read.
  Existence may be known from metadata, but the content was not read.
- **NOT RETRIEVED**: the fetch failed outright. Recorded so the gap is visible, not so it can be
  cited.
- **CONTROL**: a retrieval-integrity check, not a source of fact.

## Registry

| ID | Title | Kind | URL | Retrieval status | Supports |
| --- | --- | --- | --- | --- | --- |
| S01 | Overview of Epitalon, Highly Bioactive Pineal Tetrapeptide with Promising Properties. Araj SK, Brzezik J, Madra-Gackowska K, Szeleszczuk L. Int J Mol Sci. 2025;26(6):2691. PMID 40141333. DOI 10.3390/ijms26062691 | Peer-reviewed narrative review | https://pmc.ncbi.nlm.nih.gov/articles/PMC11943447/ | VERIFIED 2026-07-21 | The derivation of the synthetic peptide from the bovine pineal extract Epithalamin. The model inventory across the preclinical literature. The statement that safety information is missing and that genotoxicity and carcinogenicity assessment are needed. The statement that physico-chemical and structural investigation remains quite limited. The secondary description of the retinitis pigmentosa series. The concentrated provenance of the literature. |
| S02 | Epitalon increases telomere length in human cell lines through telomerase upregulation or ALT activity. Al-Dulaimi S, Thomas R, Matta S, Roberts T. Biogerontology. 2025 Sep 4;26(5):178. PMID 40908429. DOI 10.1007/s10522-025-10315-x | Primary in vitro study, human cell lines | https://pubmed.ncbi.nlm.nih.gov/40908429/ | VERIFIED 2026-07-21 | Telomere length extension reported in normal human cells in vitro via hTERT and telomerase upregulation, and telomere lengthening reported in human cancer cell lines in vitro via alternative lengthening of telomeres. The clearest retrieved example of work by a group outside the originating institute. Also the basis for the mechanism-derived oncological concern. **Carries a published Correction, S03, whose content is unknown.** |
| S03 | Correction: Epitalon increases telomere length in human cell lines through telomerase upregulation or ALT activity. Biogerontology. 2025;27(1):1. PMID 41240216. DOI 10.1007/s10522-025-10326-8 | Published correction | https://pubmed.ncbi.nlm.nih.gov/41240216/ | UNVERIFIED (existence confirmed, content not stated in the PubMed record) | Nothing on its own. Recorded because it materially qualifies S02. What was corrected could not be determined and must be read in the publisher full text before S02 is cited as independent confirmation. |
| S04 | AEDG Peptide (Epitalon) Stimulates Gene Expression and Protein Synthesis during Neurogenesis: Possible Epigenetic Mechanism. Khavinson V, Diomede F, Mironova E, Linkova N, Trofimova S, Trubiani O, Caputi S, Sinjari B. Molecules. 2020;25(3):609. PMID 32019204. DOI 10.3390/molecules25030609 | Primary in vitro study, human gingival mesenchymal stem cells | https://pubmed.ncbi.nlm.nih.gov/32019204/ | VERIFIED 2026-07-21 | Increased mRNA expression of neurogenic differentiation markers Nestin, GAP43, beta-Tubulin III, and Doublecortin by 1.6 to 1.8 times in human gingival mesenchymal stem cells in vitro, with a proposed epigenetic mechanism involving peptide interaction with histone proteins. **Not independent:** authorship includes the originating investigator. |
| S05 | Pineal-regulating tetrapeptide epitalon improves eye retina condition in retinitis pigmentosa. Khavinson V, Razumovsky M, Trofimova S, Grigorian R, Razumovskaya A. Neuro Endocrinol Lett. 2002 Aug;23(4):365-8. PMID 12195242 | Primary human clinical report, non-randomized | https://pubmed.ncbi.nlm.nih.gov/12195242/ | VERIFIED 2026-07-21 | The only retrieved human record of the synthetic tetrapeptide itself. A reported positive clinical effect in 90 percent of cases in patients with degenerative retinal lesions. The abstract does not report randomization, blinding, allocation concealment, or control group composition, and does not state the enrolled number. |
| S06 | Peptides of pineal gland and thymus prolong human life. Khavinson VK, Morozov VG. Neuro Endocrinol Lett. 2003;24(3-4):233-40. PMID 14523363 | Primary human observational report on **Epithalamin and Thymalin, not the synthetic tetrapeptide** | https://pubmed.ncbi.nlm.nih.gov/14523363/ | VERIFIED 2026-07-21 | Reported mortality reductions versus controls in 266 elderly and older persons over a 6 to 8 year observation period. **Does not support any Epithalon or Epitalon claim.** Listed only because it is routinely and incorrectly cited as human evidence for the tetrapeptide. |
| S07 | PubMed search: epitalon OR epithalon, 142 records at retrieval | Database search result | https://pubmed.ncbi.nlm.nih.gov/?term=epitalon+OR+epithalon | VERIFIED 2026-07-21 | The size and shape of the literature map only. Dominated by mechanistic, cell-culture, and animal reports plus reviews from the originating network, and includes work on related peptides. **Never presentable as depth of clinical evidence.** |
| S08 | ClinicalTrials.gov API query, term=epitalon, empty result set | Trial registry query, primary | https://clinicaltrials.gov/api/v2/studies?query.term=epitalon&pageSize=20 | VERIFIED 2026-07-21 | The absence of any study registered in this registry under this spelling. |
| S09 | ClinicalTrials.gov API query, term=epithalon, empty result set | Trial registry query, primary | https://clinicaltrials.gov/api/v2/studies?query.term=epithalon&pageSize=20 | VERIFIED 2026-07-21 | The absence of any study registered in this registry under this spelling. Run separately and deliberately so that a single-spelling search could not produce a false negative. |
| S10 | Adversarial retrieval control: deliberately fabricated PMID 99999999, returned HTTP 404 Not Found | Retrieval-integrity control | https://pubmed.ncbi.nlm.nih.gov/99999999/ | CONTROL, VERIFIED 2026-07-21 | Nothing about the compound. Confirms the retrieval path returns genuine failures rather than invented records, which is what makes the two empty registry results credible. |
| S11 | Epitalon protects against post-ovulatory aging-related damage of mouse oocytes in vitro. Yue X et al. Aging (Albany NY), 2022. PMID 35413689 | Primary preclinical study, mouse oocytes in vitro | https://pubmed.ncbi.nlm.nih.gov/35413689/ | TITLE-LEVEL ONLY 2026-07-21 | Nothing beyond the existence of the record and its stated model. Effect sizes, controls, and mechanism are **not** verified. Appears to be from a group separate from the originating institute, which is why it matters, but that too needs confirming. |
| S12 | The tetrapeptide Epitalon enhanced delayed wound healing in an in vitro human retinal pigment epithelium model of diabetic retinopathy. Gatta M et al. Stem Cell Rev Rep, 2025. PMID 40493162 | Primary preclinical study, human retinal pigment epithelium cells in vitro | https://pubmed.ncbi.nlm.nih.gov/40493162/ | TITLE-LEVEL ONLY 2026-07-21 | Nothing beyond the existence of the record and its stated model. **Flagged because a naive search classifies this as a human study when it is cell culture.** |
| S13 | Epithalon decelerates aging and suppresses development of breast adenocarcinomas in transgenic HER-2/neu mice. Anisimov VN et al. Bull Exp Biol Med, 2002. PMID 12459848 | Primary preclinical study, transgenic mice | https://pubmed.ncbi.nlm.nih.gov/12459848/ | TITLE-LEVEL ONLY 2026-07-21 | Nothing beyond the existence of the record and its stated model. Effect sizes, group sizes, and controls are **not** verified. Authorship is from the originating Russian research programme. |
| S14 | FDA Pharmacy Compounding Advisory Committee meeting, 23 to 24 July 2026 | Regulatory primary source | https://www.fda.gov/advisory-committees/advisory-committee-calendar/july-23-24-2026-meeting-pharmacy-compounding-advisory-committee-07232026 | **NOT RETRIEVED 2026-07-21 (HTTP 404 to the retrieval tool)** | Nothing. Every FDA statement in this folder is marked verified=false and must be re-checked against the primary FDA page before publication. The 503A bulk drug substances page and two briefing PDFs at fda.gov/media/193343/download and fda.gov/media/193342/download also returned HTTP 404. |
| S15 | WADA Prohibited List | Anti-doping regulator, primary source | https://www.wada-ama.org/en/prohibited-list | **NOT RETRIEVED 2026-07-21 (no usable page content)** | Nothing. No anti-doping status for this compound is recorded anywhere in this folder. Searches returned only vendor, supplement-marketing, and SEO pages asserting a classification, and those are never scientific or regulatory evidence. |
| S16 | Cognitive Vitality report on Epithalamin and Epithalon, Alzheimer's Drug Discovery Foundation | Independent critical appraisal | https://www.alzdiscovery.org/uploads/cognitive_vitality_media/Epithalamin-and-Epithalon-Cognitive-Vitality-For-Researchers.pdf | UNVERIFIED (PDF fetched, text did not extract) | Nothing yet. Flagged as likely the best available independent critical appraisal of this compound and marked for manual reading before publication. |
| S17 | PMID 22451889, a 15-year follow-up peptide geroprotector paper | Primary human follow-up report, substance not confirmed | https://pubmed.ncbi.nlm.nih.gov/22451889/ | **NOT RETRIEVED 2026-07-21 (blocked by a reCAPTCHA interstitial)** | Nothing. Recorded so the gap is visible. A reviewer must check in particular whether it studied the synthetic tetrapeptide or the extract. |

## Sources that were sought and not obtained

These are gaps, not sources. They are listed so that a reviewer can close them.

| Item | Why it matters | Outcome this session |
| --- | --- | --- |
| FDA meeting calendar page, 503A bulk drug substances page, and the two advisory committee briefing PDFs | Would allow every regulatory statement to rest on the regulator rather than on search summaries | All four fetches returned HTTP 404. No FDA wording was read. |
| The WADA Prohibited List itself | Would settle the anti-doping question for competitive athletes | No usable content returned. Only commercial pages asserted a status, which is not acceptable evidence. |
| The publisher full text of the Correction at PMID 41240216 | Determines whether the strongest apparently independent study stands as published | Not retrieved. The PubMed record carries no abstract. |
| The Alzheimer's Drug Discovery Foundation Cognitive Vitality report | The most likely source of independent critical appraisal | PDF fetched, text did not extract. |
| Abstracts for PMID 35413689, PMID 40493162, PMID 12459848 | Would upgrade three preclinical records from title-level to characterised | Not retrieved. |
| PMID 22451889 | A long follow-up report whose substance identity is unknown | Blocked by a reCAPTCHA interstitial. |
| The primary citation for the study of 75 women on circadian rhythm and melatonin metabolites | It is described only inside the 2025 review, with unverified design, controls, and provenance | Not located. Must not be cited until it is. |
| Russian-language primary literature in the original | This is where the evidence base originates. Abstract-level English indexing is not sufficient to appraise it | Not retrieved or read. Requires someone who can read those primary reports. |
| Any systematic review or meta-analysis specific to the AEDG tetrapeptide | Would provide an appraised synthesis rather than a narrative one | None located. |
| Any analytical or third-party purity, identity, or content-verification data for marketed material | Would allow a product-quality statement of any kind | None located. Product identity in the consumer market is unverifiable from the research literature. |
| EU Clinical Trials Register, ISRCTN, WHO ICTRP, the Russian national registry, and the Japanese and Chinese registries | Completeness of the trial search, the Russian registry most of all given where the literature originates | Not searched. |

## Non-evidence encountered

Retailer, vendor, clinic, and forum pages surfaced heavily in every search for this compound.
None is recorded as a source of fact. They are noted here as a category so that a reviewer
understands the retrieval environment: the commercial signal for this compound substantially
outweighs the scientific one, which is itself a reason for the caution running through this
folder. Any such page may be recorded only as a grade E or G market claim, never as evidence.
