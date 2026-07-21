---
title: DSIP Source Registry
type: research-guide-source-registry
compound: dsip
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# DSIP Source Registry

Every source consulted for the DSIP Guide, with its retrieval status. Sources marked
UNVERIFIED were not successfully read and cannot carry a claim on their own. Sources marked
NON-EVIDENCE are recorded only to document where an unusable claim originated.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## Verification key

- **VERIFIED 2026-07-21**: retrieved and read in this research session at the URL shown. For the
  human studies this means the abstract was read. No full text was obtained for any study.
- **UNVERIFIED**: the fetch failed, was blocked, or returned unparseable or empty content.
  Existence may be known from a search index, but the content was not read.
- **NON-EVIDENCE**: disqualified as a source of fact by the exclusion rules in SOURCE_PLAN.md.
- **CONTROL**: a methodological check on the retrieval path itself, not a source about DSIP.

## Registry

| ID | Title | Kind | URL | Retrieval status | Supports |
| --- | --- | --- | --- | --- | --- |
| S01 | Study of delta sleep-inducing peptide efficacy in improving sleep on short-term administration to chronic insomniacs (Monti JM, Debellis J, Alterwain P, Pellejero T, Monti D. Int J Clin Pharmacol Res, 1987. PMID 3583493) | Human trial, double-blind crossover with polysomnography | https://pubmed.ncbi.nlm.nih.gov/3583493/ | VERIFIED 2026-07-21 (abstract only) | The best-controlled human sleep finding located. Reported reductions in nocturnal awakenings, sleep latency, and waking after sleep onset, increased total sleep and non-REM sleep driven by stage 2, and slow wave sleep and REM sleep NOT modified. The authors' own conclusion that the improvement is of little clinical significance. Sample size not stated in the abstract. |
| S02 | Effects of Delta Sleep-Inducing Peptide on Sleep of Chronic Insomniac Patients: A Double-Blind Study (Bes F, Hofman W, Schuur J, Van Boxtel C. Neuropsychobiology 1992;26(4):193. DOI 10.1159/000118919) | Human trial, double-blind matched-pairs parallel groups, n=16 | https://karger.com/nps/article/26/4/193/231036/Effects-of-Delta-Sleep-Inducing-Peptide-on-Sleep | VERIFIED 2026-07-21 (abstract only) | Higher sleep efficiency, shorter sleep latency, and one reduced measure of subjectively estimated tiredness versus placebo, with no other measure changed and subjective sleep quality unchanged. The authors' own statement that the effects were weak, could in part be due to an incidental change in the placebo group, and that short-term treatment is not likely to be of major therapeutic benefit. |
| S03 | A clinical trial with DSIP (Kaeser HE. European Neurology, 1984. PMID 6391926) | Human trial, open, uncontrolled, unblinded, n=7 | https://pubmed.ncbi.nlm.nih.gov/6391926/ | VERIFIED 2026-07-21 (abstract only) | The most frequently cited positive DSIP result and the methodologically weakest. Sleep reported as normalised in all but one of seven patients with severe insomnia over follow-up of three to seven months, with reported improvement in daytime mood and performance. Also the note of complications in patients with a long-standing history of drug dependence. |
| S04 | The influence of synthetic DSIP (delta-sleep-inducing-peptide) on disturbed human sleep (PMID 7028502, appearing in search results as a human sleep study from approximately 1981) | Human study, NOT RETRIEVED | https://pubmed.ncbi.nlm.nih.gov/7028502/ | UNVERIFIED | Nothing. The fetch returned a reCAPTCHA interstitial rather than the record, so no author, journal, sample size, or result is asserted. Listed only to document that a further early human study exists and remains unexamined. No claim in this folder may rest on it. |
| S05 | Delta sleep-inducing peptide (DSIP): a still unresolved riddle (Kovalzon VM, Strekalova TV. J Neurochem, 2006. PMID 16539679) | Critical narrative review | https://pubmed.ncbi.nlm.nih.gov/16539679/ | VERIFIED 2026-07-21 | The central identity problem. No DSIP gene, precursor, or receptor has been isolated. The review's statement that the sleep-factor hypothesis is extremely poorly documented and still weak, that natural occurrence and biological activity remain obscure, that certain structural analogues showed sleep-promoting activity in animal models while DSIP itself did not show clear effects, and the proposal that a DSIP-like peptide rather than DSIP may account for reported results. Also the 2006 note that BLAST searching aligned the sequence with a hypothetical bacterial protein. |
| S06 | Delta-sleep-inducing peptide (DSIP): a review (Graf MV, Kastin AJ. Neurosci Biobehav Rev, 1984. PMID 6145137) | Narrative review, preclinical, multi-species | https://pubmed.ncbi.nlm.nih.gov/6145137/ | VERIFIED 2026-07-21 | Reported delta-sleep induction in rabbits, rats, and mice, with a more pronounced REM effect in cats, indicating an inconsistent cross-species response. A non-monotonic response curve in animal models. Effects on neurotransmitter levels, circadian and locomotor patterns, and hormonal levels in animal models. The framing of DSIP as a multifunctional neuroregulatory peptide rather than a specific sleep agent. |
| S07 | Pichia pastoris secreted peptides crossing the blood-brain barrier and DSIP fusion peptide efficacy in PCPA-induced insomnia mouse models (Mu X, Qu L, Yin L, Wang L, Liu X, Liu D. Front Pharmacol, 2024. DOI 10.3389/fphar.2024.1439536) | Primary preclinical study, mice | https://www.frontiersin.org/journals/pharmacology/articles/10.3389/fphar.2024.1439536/full | VERIFIED 2026-07-21 | The only recent primary research located. In 48 male Kun-Ming mice of approximately eight weeks of age with insomnia induced by p-chlorophenylalanine, an engineered DSIP fusion peptide reduced wakefulness time, normalised serotonin, melatonin, dopamine, and glutamate levels, decreased anxiety-like and depressive-like behaviours, and improved hippocampal tissue morphology. Also the finding that the fusion construct outperformed plain DSIP in that model. |
| S08 | ClinicalTrials.gov API v2 query, term "DSIP", returning totalCount 0 | Trial registry, primary | https://clinicaltrials.gov/api/v2/studies?query.term=DSIP&countTotal=true&pageSize=20 | VERIFIED 2026-07-21 | The absence of any registered clinical trial of DSIP, ongoing, completed, or terminated. |
| S09 | ClinicalTrials.gov API v2 query, intervention "delta sleep-inducing peptide", returning totalCount 1 | Trial registry, primary | https://clinicaltrials.gov/api/v2/studies?query.intr=delta+sleep-inducing+peptide&countTotal=true&pageSize=20 | VERIFIED 2026-07-21 | That the single returned record, NCT05251207, is a study of L-carnitine supplementation and insulin resistance, an irrelevant fuzzy text match involving no DSIP. Supports the reading that there are no registered DSIP trials at all. |
| S10 | Adversarial retrieval control: fabricated identifier PMID 99999999999 | Methodological control | https://pubmed.ncbi.nlm.nih.gov/99999999999/ | CONTROL, VERIFIED 2026-07-21 | That the retrieval path used in this session was real. The fabricated record returned HTTP 404 Not Found while genuine records queried in the same batch returned full content, so a nonexistent record fails rather than being confabulated into existence. Supports no claim about DSIP. |
| S11 | FDA Pharmacy Compounding Advisory Committee meeting, July 23 to 24, 2026 | Regulatory, primary, NOT RETRIEVED | https://www.fda.gov/advisory-committees/advisory-committee-calendar/july-23-24-2026-meeting-pharmacy-compounding-advisory-committee-07232026 | UNVERIFIED | Nothing on its own. Repeated fetches returned HTTP 404. The statements that emideltide, the regulatory name for DSIP in free base and acetate forms, was scheduled for discussion regarding possible inclusion on the 503A Bulks List, and that FDA proposed it NOT be added citing small, uncontrolled, or contradictory studies, rest on search-index snippets and secondary trade reporting. Every one is marked verified=false and requires human confirmation. |
| S12 | FDA briefing document media download for the July 2026 meeting | Regulatory, primary, NOT RETRIEVED | https://www.fda.gov/media/193343/download | UNVERIFIED | Nothing. Returned HTTP 404 or unreadable binary. The immunogenicity concern reported for the peptides under review is attributed to secondary reporting of this document and not to FDA as its own words. |
| S13 | WADA Prohibited List landing page | Anti-doping regulator, primary, partially retrieved | https://www.wada-ama.org/en/prohibited-list | UNVERIFIED | The wording of category S0, Non-Approved Substances, obtained from search-index retrieval of WADA pages rather than from reading the List. DSIP is not named individually anywhere on the List that could be confirmed in this session, and no WADA statement about DSIP was retrieved. |
| S14 | Delta-sleep-inducing peptide, Wikipedia | Tertiary background, NOT evidence | https://en.wikipedia.org/wiki/Delta-sleep-inducing_peptide | NON-EVIDENCE (used for orientation only) | Discovery-year and sequence orientation only. Used to know what to look for, never as the authority for a published fact. Every orientation detail taken from it is flagged [UNVERIFIED - background knowledge, requires human source check]. |
| S15 | Retailer, telehealth-marketing, clinic, and peptide-blog pages surfaced in search | Commercial marketing pages | (multiple, not individually recorded) | NON-EVIDENCE | Nothing. Recorded to document the origin of confident claims of an absence of dependency, withdrawal, or organ toxicity, and of an absence of any identified lethal amount in animal models. These are grade E or G market claims to be rebutted, never findings. Their volume is itself a finding worth stating in the Guide. |

## Sources that were sought and not obtained

These are gaps, not sources. They are listed so a reviewer can close them.

| Item | Why it matters | Outcome this session |
| --- | --- | --- |
| FDA advisory committee calendar page, 503A bulk substances page, briefing document, Federal Register public-inspection PDF | Would allow every regulatory statement to rest on the regulator rather than on search snippets and trade reporting | Four separate URLs, all failed with HTTP 404 or unreadable binary |
| The 2026 WADA Prohibited List PDF | Would establish whether DSIP or emideltide is named, rather than inferred into a category | Fetch returned empty content |
| PMID 7028502, an early human sleep study | One of the small number of human DSIP studies that exist. Its content could change the shape of the human evidence section | Fetch returned a reCAPTCHA interstitial. Never read |
| The sample size of the Monti 1987 crossover study | It is the best-controlled human study located and its size is unknown to this record | Not stated in the retrieved abstract |
| Full texts of S01, S02, and S03 | Would allow a risk-of-bias assessment beyond what an abstract supports | Not obtained. All three human entries rest on abstracts |
| A systematic review or meta-analysis of DSIP and sleep | Would be the highest-quality evidence tier if one existed | None located. Only narrative reviews from 1984 and 2006. With three small heterogeneous trials a meta-analysis would not be meaningful in any case |
| A primary chemical or regulatory source for the sequence, the 1974 isolation, and the name emideltide | Basic identity confirmation | Not located. Orientation came from tertiary background (S14) |
| Regulator databases for the European Union, the United Kingdom, Canada, and Australia | Would turn an absence-of-evidence note into a finding | Not queried |
| An adverse event reporting database such as FAERS | Would test whether any harm signal has been reported in practice | Not searched |
| EU Clinical Trials Register, ISRCTN, WHO ICTRP, Japanese and Chinese registries | Completeness of the trial search | Not searched |
