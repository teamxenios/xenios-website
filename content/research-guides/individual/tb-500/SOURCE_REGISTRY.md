---
title: "TB-500 Source Registry"
type: research-guide-source-registry
compound: TB-500
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# TB-500 Source Registry

Every source used in the TB-500 Research Guide, with its retrieval status. Source ids in
this table are the ids referenced by CLAIM_TABLE.md, CONTRADICTIONS.md and
REGULATORY_STATUS.md.

"VERIFIED 2026-07-19" means the document was retrieved directly at the URL shown, on that
date. "UNVERIFIED" means the item rests on background knowledge, or on a source that could
not be retrieved, and requires a human source check.

The **Molecule** column is specific to this compound and must not be dropped. It records
which molecule the source actually concerns. Sources marked "full-length thymosin beta-4"
are not TB-500 evidence.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## Primary sources, retrieved directly

| ID | Title | Kind | Molecule | URL | Retrieval status | Supports |
| --- | --- | --- | --- | --- | --- | --- |
| S01 | Ho et al. Doping control analysis of TB-500, a synthetic version of an active region of thymosin beta-4, in equine urine and plasma by liquid chromatography-mass spectrometry. J Chromatogr A, 2012. PMID 23084823. | PubMed primary study (analytical and doping control, equine) | TB-500 (Ac-LKKTETQ) | https://pubmed.ncbi.nlm.nih.gov/23084823/ | VERIFIED 2026-07-19 | Chemical identity of TB-500 as a synthetic N-terminally acetylated peptide corresponding to residues 17-23 of thymosin beta-4. Description of that segment as the actin-binding active site of the parent protein. Detectability of TB-500 and metabolites in equine urine and plasma. Presence of a non-natural synthesis impurity in equine plasma after administration of a TB-500-containing product. The observation that marketed products claim to contain either the acetylated fragment or the full-length protein. |
| S02 | Rahaman et al. Simultaneous quantification of TB-500 and its metabolites in in-vitro experiments and rats by UHPLC-Q-Exactive orbitrap MS/MS and their screening by wound healing activities in-vitro. J Chromatogr B, 2024. PMID 38382158. | PubMed primary preclinical study (rat in vivo, human serum and in-vitro enzyme systems, fibroblast cell culture) | TB-500 (Ac-LKKTETQ) and its metabolites | https://pubmed.ncbi.nlm.nih.gov/38382158/ | VERIFIED 2026-07-19 | Metabolite profile in rats (Ac-LK highest at 0-6 hours, Ac-LKK detectable up to 72 hours). The finding that in fibroblast wound-healing assays the metabolite Ac-LKKTE showed activity while the parent TB-500 compound did not, and the authors' conclusion that reported wound-healing activity may belong to the metabolite rather than the parent. |
| S03 | Mayfield et al. Injectable Peptide Therapy: A Primer for Orthopaedic and Sports Medicine Physicians. Am J Sports Med, 2026. PMID 41476424. | PubMed narrative review (secondary) | Both, discussed together | https://pubmed.ncbi.nlm.nih.gov/41476424/ | VERIFIED 2026-07-19 | The statement that thymosin beta-4 and its derivative TB-500 promoted angiogenesis and tissue repair in preclinical models. The statement that human orthopaedic data are lacking. The statement that both remain banned substances in sport. Underlying primary studies were not retrieved, so preclinical claims sourced here are attributed to the review, not to primary work. |
| S04 | Sosne, Dunn, Kim. Thymosin beta-4 significantly improves signs and symptoms of severe dry eye in a phase 2 randomized trial. Cornea, 2015. PMID 25826322. | PubMed human Phase 2 RCT | **Full-length thymosin beta-4. NOT TB-500.** | https://pubmed.ncbi.nlm.nih.gov/25826322/ | VERIFIED 2026-07-19 | Reported improvement versus placebo in ocular discomfort and total corneal fluorescein staining at day 56 in nine patients with severe dry eye, using an ophthalmic solution. Used in this Guide only to describe the parent protein's research record and to mark the boundary that must not be crossed. |
| S05 | Sosne, Kleinman, Springs, Gross, Sung, Kang. RGN-259 (Thymosin beta-4) Ophthalmic Solution Promotes Healing and Improves Comfort in Neurotrophic Keratopathy Patients in a Randomized, Placebo-Controlled, Double-Masked Phase III Clinical Trial. Int J Mol Sci, 2022. PMID 36613994, PMCID PMC9820614. Trial NCT02600429. | PMC human Phase 3 RCT, terminated early | **Full-length thymosin beta-4, formulated as RGN-259. NOT TB-500.** | https://pmc.ncbi.nlm.nih.gov/articles/PMC9820614/ | VERIFIED 2026-07-19 | Corneal healing results at day 29 (not significant) and day 43 (significant) in 18 subjects with stage 2-3 neurotrophic keratopathy. Adverse event count across both arms. Authors' own limitations, including early termination, baseline imbalance, and subjective discomfort assessment. Used only to describe the parent product's record. |
| S06 | Guarnera, De Rosa, Camerini. Thymosin beta-4 and venous ulcers: clinical remarks on a European prospective, randomized study on safety, tolerability, and enhancement on healing. Ann N Y Acad Sci, 2007. PMID 17495250. | PubMed human trial methods and in-progress report | **Full-length thymosin beta-4, topical. NOT TB-500.** | https://pubmed.ncbi.nlm.nih.gov/17495250/ | VERIFIED 2026-07-19 | That this record describes methodology for an in-progress study with 21 of a planned 72 patients enrolled at publication, and reports no efficacy or safety outcome data. Used to correct the frequent secondhand citation of this paper as a demonstration of accelerated wound healing. |
| S07 | Vanhee et al. Analysis of illegal peptide biopharmaceuticals frequently encountered by controlling agencies. Talanta, 2015. PMID 26003685. | PubMed primary study (grey-market product quality) | Panel composition unknown, see UV02 | https://pubmed.ncbi.nlm.nih.gov/26003685/ | VERIFIED 2026-07-19 | That screening methods were developed covering 25 peptides already seized in Europe or identified in underground forums, and that counterfeit and illegal peptide substances are described as implying severe health threats. **Limit: the retrieved abstract does not state whether TB-500 or thymosin beta-4 was in the panel, and reports no per-sample mislabelling rate.** No percentage may be attached to TB-500 from this source. |
| S08 | ClinicalTrials.gov API v2, full query for the term "thymosin beta 4". Eighteen registered studies returned. | Trial registry query result (primary) | Mixed, sorted by molecule | https://clinicaltrials.gov/api/v2/studies?query.term=thymosin+beta+4 | VERIFIED 2026-07-19 | The completeness of the registry search, and the finding that exactly one of the returned registrations studies the TB-500 fragment. Existence of investigational full-length thymosin beta-4 programs (RGN-259 ophthalmic, NL005 recombinant injectable). |
| S09 | NCT07487363. Phase 1/2 randomized, double-blind, placebo-controlled, sequential escalating-cohort study of TB-500 (Thymosin Beta 4 17-23 Fragment). Sponsor Hudson Biotech. Recruiting. Start 2026-02-05, first posted 2026-03-23. No results posted. | Trial registry record (primary). The only registered human study of the TB-500 fragment. | TB-500 (Ac-LKKTETQ) | https://clinicaltrials.gov/api/v2/studies/NCT07487363 | VERIFIED 2026-07-19 | The official title naming the 17-23 fragment, corroborating identity. The estimated enrolment of 80 adults with stable atherosclerotic cardiovascular disease and endothelial dysfunction. That primary outcomes are adverse-event incidence, that is, safety endpoints rather than efficacy. **That no results exist.** This record supports no efficacy or safety finding of any kind. |
| S10 | USADA. 2018 Prohibited List: Summary of Major Changes. States that thymosin-B4 and its derivatives, for example TB-500, were added as examples of prohibited growth factors under S2.3. | National anti-doping organisation document | TB-500 named explicitly, alongside the parent | https://www.usada.org/athlete-advisory/2018-prohibited-list-summary-of-major-changes/ | VERIFIED 2026-07-19 | That TB-500 is explicitly named on the WADA Prohibited List as a prohibited growth factor, in the S2 class, prohibited at all times. See UV01 for what this source does not establish about the current 2026 list. |
| S11 | Federal Register API, document 2026-07361, Pharmacy Compounding Advisory Committee, Notice of Meeting, published 2026-04-16. | US government regulatory notice | Not informative on this compound | https://www.federalregister.gov/api/v1/documents/2026-07361.json | VERIFIED 2026-07-19 as retrieved, but the abstract names no substances | Only that the notice exists. It does not name thymosin beta-4, TB-500, or any other substance, so it supports no compounding-status claim. Recorded to document that the check was attempted. |

## Sources attempted and not retrieved

These could not be read. Nothing in this Guide rests on them. They are listed so a human
reviewer knows exactly what is missing and does not assume it was covered.

| ID | Item | Attempted URL or target | Status |
| --- | --- | --- | --- |
| F01 | FDA 503A bulk drug substances list | fda.gov | NOT RETRIEVED. HTTP 404 to the fetcher. |
| F02 | FDA list of bulk drug substances that may present significant safety risks (Category 2) | fda.gov | NOT RETRIEVED. HTTP 404. |
| F03 | FDA warning letter to GenoGenix LLC, reference 718739, dated 2026-01-20, concerning Thymosin Beta-4 | fda.gov | NOT RETRIEVED. HTTP 404. Appeared in search results only. Its content is recorded nowhere in this Guide as a finding. |
| F04 | FDA July 2026 Pharmacy Compounding Advisory Committee meeting page | fda.gov | NOT RETRIEVED. HTTP 404. |
| F05 | FDA bulk substances nomination page | fda.gov | NOT RETRIEVED. HTTP 404. |
| F06 | WADA Prohibited List landing page, the 2026 list PDF, and a TB-500 metabolism research page | wada-ama.org | NOT RETRIEVED. Empty page content on three attempts. |
| F07 | FDA GSRS substance record for TB-500 (UNII, substance class) | precision.fda.gov | NOT RETRIEVED. Empty content. |
| F08 | Federal Register document page for the April 2026 PCAC meeting notice, for the agenda substance list | federalregister.gov document page | NOT RETRIEVED. 302 redirect to an unblock interstitial. Only the API abstract was obtained (S11). |
| F09 | Primary preclinical studies underlying the angiogenesis and tissue-repair summary in S03 | Not individually identified in the retrieved review record | NOT RETRIEVED. Claims from S03 are attributed to the review only. |
| F10 | Primary reports for full-length thymosin beta-4 acute myocardial infarction programs seen in the registry query | ClinicalTrials.gov registrations only | NOT RETRIEVED beyond registry entries. Would not be TB-500 evidence in any case. |

## Unverified lines requiring a human source check

| ID | Statement | Status |
| --- | --- | --- |
| UV01 | The exact 2026 WADA Prohibited List subsection number and wording for thymosin beta-4 derivatives. | UNVERIFIED. S10 verifies the 2018 addition under S2.3 growth factors. WADA's own pages returned empty content (F06), so the current numbering was not read. The practical statement (named, prohibited at all times) is supported. The precise 2026 citation is not. |
| UV02 | Whether TB-500 or thymosin beta-4 was among the 25 peptides in the S07 panel, and what fraction of samples were mislabelled. | UNVERIFIED. Only the abstract was available and it enumerates neither. Do not attach any mislabelling rate to TB-500 from S07. |
| UV03 | The frequently repeated claim that roughly 30 percent of grey-market peptide samples are mislabelled, misdosed or contaminated. | UNVERIFIED and EXCLUDED. Appeared only in commercial and vendor-adjacent sources during the session. No primary analysis was retrieved. Must not appear in the Guide. |
| UV04 | Any FDA claim: approval status, 503A or 503B compounding category, Category 2 placement, removal in 2026, or a July 2026 advisory committee agenda item. | UNVERIFIED. All fda.gov retrieval failed (F01 to F05). Conflicting vendor claims exist in both directions. See CONTRADICTIONS.md. No FDA claim may be published from this record. |
| UV05 | Whether any oncologic or other long-term risk attaches to sustained pro-angiogenic signalling from this compound. [UNVERIFIED - background knowledge, requires human source check] | UNVERIFIED. A pro-angiogenic mechanism is proposed for this compound class, which raises an obvious theoretical question. No retrieved source this session evaluated that question for TB-500 in either direction. Recorded as an open question, never as a finding, and never as reassurance. |
| UV06 | Human pharmacokinetics of TB-500. | UNVERIFIED. Only rat in-vivo and human-serum in-vitro metabolism data were retrieved (S02). No human pharmacokinetic data exists in this record. |

## Source types disqualified as evidence

Vendor, retailer, marketplace, compounding pharmacy and peptide industry pages were not
used to support any claim in this Guide, including their certificates of analysis and their
summaries of the literature. Forum, social media, affiliate and podcast content was not
used. Search engine summaries and AI-generated overviews were not used.

Several such pages were encountered during the session, and they conflict with each other
on regulatory status and cite full-length thymosin beta-4 trials as though they were TB-500
trials. Those conflicts are recorded in CONTRADICTIONS.md as claims to be corrected, and
carry no evidentiary weight here.
