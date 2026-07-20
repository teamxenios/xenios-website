---
title: LL-37 Source Registry
type: research-guide-source-registry
compound: ll-37
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# LL-37 Source Registry

Every source consulted in the 2026-07-19 research session, including the ones that failed to
retrieve. Failed retrievals are listed deliberately, because a failed retrieval is the reason a
claim is missing and a reviewer needs to see that reason.

Verification key:
- VERIFIED 2026-07-19 means the record was actually retrieved and read this session.
- UNVERIFIED means it was surfaced by title or listing only, or the fetch failed, or the source type
  is disqualified. Nothing marked UNVERIFIED may support a member-facing claim.

## Primary evidence sources

| ID | Title | Kind | URL | Retrieval status | What it supports |
| --- | --- | --- | --- | --- | --- |
| S1 | Evaluation of LL-37 in healing of hard-to-heal venous leg ulcers, multicentric prospective randomized placebo-controlled clinical trial (Mahlapuu M, et al., Wound Repair and Regeneration, 2021; PMID 34687253, PMCID PMC9298190, DOI 10.1111/wrr.12977) | Peer-reviewed human RCT, Phase IIb, primary endpoint missed | https://pmc.ncbi.nlm.nih.gov/articles/PMC9298190/ | VERIFIED 2026-07-19 | The largest human trial of LL-37. Trial design, population, the failed primary endpoint (26.5 percent and 24.7 percent active versus 25.3 percent placebo, not statistically significant), the post-hoc large-wound subgroup analysis, and the local tolerability record in that population |
| S2 | Treatment with LL-37 in hard-to-heal venous leg ulcers, randomized placebo-controlled clinical trial (Gronberg A, Mahlapuu M, Stahle M, Whately-Smith C, Rollman O; Wound Repair and Regeneration, 2014; PMID 25041740) | Peer-reviewed human RCT, first-in-man, n=34 | https://pubmed.ncbi.nlm.nih.gov/25041740/ | VERIFIED 2026-07-19 | The early positive healing signal in a small first-in-man study, the non-monotonic response across strengths, and the reported absence of local or systemic safety concerns in that small cohort. Superseded by S1 on the primary endpoint |
| S3 | Efficacy of LL-37 cream in enhancing healing of diabetic foot ulcer, randomized double-blind controlled trial (Archives of Dermatological Research, 2023; PMID 37480520) | Peer-reviewed human RCT, abstract only retrieved | https://pubmed.ncbi.nlm.nih.gov/37480520/ | VERIFIED 2026-07-19 (abstract only) | Greater granulation index with topical LL-37, and the negative findings that inflammatory cytokines and bacterial colonization were not significantly reduced versus placebo. Exact enrollment, randomization detail, and the adverse event section are NOT verified |
| S4 | NCT02225366, Induction of Antitumor Response in Melanoma Patients Using the Antimicrobial Peptide LL37 (M.D. Anderson Cancer Center, Phase 1/2, actual enrollment 4, results posted 2021-12-09) | Trial registry record with posted results | https://clinicaltrials.gov/api/v2/studies/NCT02225366 | VERIFIED 2026-07-19 (enrollment, disposition, summary safety only) | That an intratumoral human study exists, that it enrolled four people over more than five years, that three completed and one withdrew for lack of efficacy, and that adverse events were reported as generally mild with no serious adverse events. Efficacy outcome tables were NOT read |
| S5 | ClinicalTrials.gov API v2 term query for LL-37, 50 study records returned | Trial registry systematic sweep | https://clinicaltrials.gov/api/v2/studies?query.term=LL-37&pageSize=50&fields=NCTId,BriefTitle,OverallStatus,Phase,Condition,InterventionName,EnrollmentCount,LeadSponsorName,HasResults,StartDate,CompletionDate | VERIFIED 2026-07-19 | The size and composition of the interventional evidence base. Establishes that only two of the 50 returned records administer LL-37 as an intervention, the remainder being observational biomarker studies, vitamin D trials, or probiotic trials using LL-37 as a readout |
| S6 | Antimicrobial Peptides of the Cathelicidin Family, Focus on LL-37 and Its Modifications (International Journal of Molecular Sciences, 2025; PMCID PMC12386566) | Peer-reviewed review, preclinical, stability and cytotoxicity | https://pmc.ncbi.nlm.nih.gov/articles/PMC12386566/ | VERIFIED 2026-07-19 | Membrane damage to human erythrocytes, lymphocytes, and fibroblasts in cultured cells at concentrations similar to those required for antimicrobial activity. Proteolytic instability, salt sensitivity, and low stability in biological fluids. Observed elevation of endogenous LL-37 in several inflammatory disease states. The rationale for engineered analogs |
| S7 | Cathelicidin LL-37, a new important molecule in the pathophysiology of systemic lupus erythematosus (Moreno-Angarita A, et al.; Journal of Translational Autoimmunity, 2019; PMCID PMC7388365) | Peer-reviewed review, autoimmunity safety signal | https://pmc.ncbi.nlm.nih.gov/articles/PMC7388365/ | VERIFIED 2026-07-19 | LL-37 complexing with self-DNA and activating plasmacytoid dendritic cells via TLR9 to drive type I interferon. Higher serum LL-37 reported in lupus patients than in healthy individuals. Anti-LL-37 antibodies correlating with anti-DNA antibodies. The review's own acknowledgement that some studies find no association with disease activity |

## Sources surfaced but not usable

| ID | Title | Kind | URL | Retrieval status | Why it is not usable |
| --- | --- | --- | --- | --- | --- |
| S8 | The Human Cathelicidin Antimicrobial Peptide LL-37 Promotes the Growth of the Pulmonary Pathogen Aspergillus fumigatus (PMCID PMC6013660) | Preclinical, title only | https://pmc.ncbi.nlm.nih.gov/articles/PMC6013660/ | UNVERIFIED, surfaced in a search listing only, not retrieved or read | The title asserts a counter-directional finding (LL-37 promoting rather than inhibiting a pathogen). It is logged rather than omitted because if accurate it is directionally important. It must not be stated in the Guide on the strength of a title. A human reviewer must retrieve and read it |
| S9 | NCT04098562, Phase 2 LL-37 study, sponsor Fakultas Kedokteran Universitas Indonesia, listed enrollment 40, status Unknown | Trial registry record, seen within the S5 sweep | Identified via S5 | UNVERIFIED as a linkage | Identified within the registry sweep as the second of only two interventional LL-37 registrations. It is a plausible registration for the diabetic foot ulcer publication S3 (Phase 2, LL-37 cream, diabetic foot ulcer, Indonesia), but the linkage was NOT confirmed and must not be asserted |
| S10 | Oral LL-37 COVID-19 study (medRxiv preprint 2020.05.11.20064584) | Preprint, single-arm exploratory | Surfaced in search listings only | UNVERIFIED, PDF returned HTTP 403, not retrieved | Excluded twice over. It is a preprint and it is single-arm with no control group, so it would be low-grade evidence even if retrieved. Deliberately excluded from the human evidence table rather than included on the strength of a search snippet |

## Regulatory sources and failed regulatory retrievals

| ID | Title | Kind | URL | Retrieval status | What it supports |
| --- | --- | --- | --- | --- | --- |
| S11 | FDA Pharmacy Compounding Advisory Committee landing page | Regulator page | https://www.fda.gov/advisory-committees/pharmacy-compounding-advisory-committee/meeting-pharmacy-compounding-advisory-committee | UNVERIFIED as support for any LL-37 statement | The only FDA-domain result returned by a targeted site search for LL-37. It does not contain an approval record or a substance-specific statement. It is logged as the negative search result it is, not as an affirmative FDA statement about LL-37 |
| S12 | FDA Pharmacy Compounding Advisory Committee 2027 meeting materials page | Regulator page | https://www.fda.gov/advisory-committees/pharmacy-compounding-advisory-committee/2027-meeting-materials-pharmacy-compounding-advisory-committee | UNVERIFIED, fetch failed HTTP 404 on 2026-07-19 | Nothing. Logged as a gap. This is the page that would have confirmed or refuted the reported February 2027 review of cathelicidin LL-37 |
| S13 | Federal Register, Pharmacy Compounding Advisory Committee notice of meeting, bulk drug substances nominated for the Section 503A list | Regulatory notice | https://www.federalregister.gov/documents/2026/04/16/2026-07361/pharmacy-compounding-advisory-committee-notice-of-meeting-establishment-of-a-public-docket-request | UNVERIFIED, 302 redirect to a block page on 2026-07-19 | Nothing. Logged as a gap |
| S14 | WADA Prohibited List | Regulator or authority list | Not retrieved. No WADA-domain page was reached this session | UNVERIFIED, not retrieved | Nothing. No WADA status for LL-37 or cathelicidin is established by this session. Claims that LL-37 is not prohibited appeared only on vendor pages and are not recorded as verified |

## Disqualified source class

Peptide vendor, retailer, affiliate, and testing-service marketing pages were encountered throughout
the search, including for product quality claims and for WADA status. They are not assigned source
IDs and cannot support any claim in this Guide.

They are noted here for one reason only. Specific figures circulating on those pages, including
claims about the proportion of gray-market products with incorrect amino acid sequences, the
proportion falling below a stated purity threshold, discrepancy rates in certificates of analysis,
heavy metal contamination, and a reported federal enforcement action against a vendor, are NOT
independently verified and must not be reproduced in the Guide as fact. Any product quality claim
must be sourced from FDA warning letters, FDA import alerts, or peer-reviewed analytical chemistry
literature.

Separately, a vendor-adjacent page was observed presenting the S1 trial as supportive by quoting its
post-hoc subgroup numbers without disclosing that the trial's prespecified primary endpoint was not
met. This is recorded in CONTRADICTIONS.md as the most important correction in this Guide.

## Registry summary

- Sources retrieved and verified: 7 (S1 to S7).
- Sources surfaced but unusable: 3 (S8 to S10).
- Regulatory retrievals attempted and failed: 3 (S12 to S14, with S11 retrieved but not substantive).
- Human interventional trials of LL-37 identified in a systematic registry sweep: 2 registrations,
  with 3 published human RCT reports retrieved.
- Human trials using a systemic route: none retrieved.
- Human trials enrolling healthy participants: none retrieved.
