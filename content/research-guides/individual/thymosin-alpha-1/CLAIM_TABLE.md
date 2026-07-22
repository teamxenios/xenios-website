---
title: "Thymosin Alpha-1: Claim Table"
type: claim-table
compound: thymosin-alpha-1
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# Claim Table: Thymosin Alpha-1 (Thymalfasin)

This is the controlling artifact for the Guide. A statement may appear on a member-facing
surface only if it appears here, graded, with its supporting source ids, and marked allowed.

Grades are applied to individual claims, never to the compound as a whole. Source ids refer
to SOURCE_REGISTRY.md.

## Grade key

| Grade | Meaning |
| --- | --- |
| A | Established |
| B | Supported human evidence |
| C | Early human evidence |
| D | Preclinical |
| E | Manufacturer or supplier reported |
| F | Traditional or historical |
| G | Unverified |
| PROHIBITED | May not appear on any member-facing surface |

A note on how the negative claims are graded. Several of the strongest entries below are
statements that something was **not** shown. Those carry grade B because they rest on
adequately sized randomised human trials, not because the compound has supported benefits.

## 1. Identity and classification

| ID | Claim as it would appear to a member | Grade | Sources | Population | Member facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| C-01 | Thymosin alpha-1 is a peptide that occurs naturally in humans. Its synthetic pharmaceutical form is called thymalfasin and is marketed under the brand name Zadaxin. | E | S9 | Not population specific | Allowed | Brand and generic naming is drawn from a secondary drug reference reflecting product labeling. The primary label could not be retrieved. |
| C-02 | Thymosin alpha-1 is a 28 amino acid, N terminally acetylated peptide, originally isolated from thymosin fraction 5 of calf thymus. | G | None retrieved | Not population specific | Allowed only with the unverified marker attached | [UNVERIFIED - background knowledge, requires human source check] Structural and provenance detail was not tied to a retrieved primary source this session. |
| C-03 | Thymosin alpha-1 is a different molecule from thymosin beta-4 and TB-500, which are associated with tissue repair rather than immune modulation and carry a different regulatory and anti-doping position. | G | None retrieved | Not population specific | Allowed, and should be stated prominently | [UNVERIFIED - background knowledge, requires human source check] The disambiguation itself is important enough to publish even while unverified, because conflation is a recurring error. State it as a distinction, not as a finding about beta-4. |
| C-04 | Thymosin alpha-1 is described as an immunomodulator, meaning it is investigated for its effect on how the immune system behaves, rather than as a direct antiviral or antimicrobial. | C | S1, S2, S3 | Studied populations were acutely or chronically ill adults | Allowed | Supported indirectly by the framing and endpoints of the retrieved trials. Do not upgrade without a retrieved mechanistic source. |
| C-05 | Material sold as thymosin alpha-1 outside a regulated supply chain is not the same product as the approved pharmaceutical, and carries no assurance of identity or purity. | G | S8 for the category level manufacturing concern | Not population specific | Allowed, and should be stated prominently | No analytical study specific to thymosin alpha-1 identity or purity was retrieved. This is a reasoning claim about supply chain, not an analytical finding. Do not attach a numeric failure rate. |

## 2. Mechanism

| ID | Claim as it would appear to a member | Grade | Sources | Population | Member facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| C-06 | A proposed mechanism involves Toll-like receptor signalling on dendritic cells and monocytes, leading to dendritic cell maturation and effects on T cell differentiation. | G | None retrieved | Proposed, largely inferred from laboratory systems | Allowed only if labelled proposed and unverified | [UNVERIFIED - background knowledge, requires human source check] No primary mechanistic paper was retrieved. This must never be written as a sentence that reads as established human physiology. |
| C-07 | In a phase 3 sepsis trial predecessor, greater improvement in monocyte HLA-DR expression was reported in the treated arm at day 3 and day 7, a marker studied in relation to immune suppression during sepsis. | C | S2 | Adults with severe sepsis, hospitalised, China | Allowed with the dissociation caveat | This is a biomarker outcome, not a clinical outcome. It must never be presented alone. It must appear alongside C-09. |
| C-08 | In a small open label COVID-19 pilot, among patients on low flow oxygen, the treated group had an average of 3.84 times more CD4+ T cells on day 5 than on day 1. | C | S3 | 8 treated patients on low flow oxygen within a 49 patient pilot | Allowed with the dissociation caveat and the subgroup size stated | Very small subgroup within an already small pilot. Must appear alongside C-09 and must never be framed as benefit. |
| C-09 | In both trials where an immune biomarker changed, the clinical outcome did not clearly follow. A measurable immune effect has not been shown to translate into patient benefit. | B | S1, S2, S3 | Hospitalised adults with sepsis or COVID-19 | Allowed, and is mandatory context wherever C-07 or C-08 appears | This is the central honest framing of the compound. Treat it as a required companion sentence, enforced at review. |

## 3. Sepsis

| ID | Claim as it would appear to a member | Grade | Sources | Population | Member facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| C-10 | The largest and best designed trial of thymosin alpha-1 in any indication, a double blind placebo controlled phase 3 trial in 1,089 adults with sepsis, found no difference in 28 day all cause mortality between thymosin alpha-1 and placebo (23.4 percent versus 24.1 percent, hazard ratio 0.99, 95 percent CI 0.77 to 1.27, P equals 0.93). | B | S1 | 1,089 adults aged 18 to 85 with sepsis, 22 centres in China | Allowed, and should lead the evidence section | The point estimate is essentially perfectly null, not merely non significant. This is the single most important claim in the Guide. |
| C-11 | In that trial, no secondary or safety outcomes differed statistically significantly between the groups. | B | S1 | As above | Allowed | Frame as an absence of difference, not as a safety endorsement. |
| C-12 | An earlier, smaller, single blind trial in 361 patients with severe sepsis reported lower 28 day mortality in the treated arm but did not reach statistical significance on its prespecified primary endpoint (26.0 percent versus 35.0 percent, relative risk 0.74, 95 percent CI 0.54 to 1.02, P equals 0.062). Its authors called for a larger double blind trial, that trial was later run, and it was null. | B | S1, S2 | 361 patients with severe sepsis, six hospitals in China | Allowed only when presented together with C-10 | Citing the earlier trial without the later one would materially mislead a member. Enforce as a paired citation at review. |
| C-13 | Subgroup signals in the phase 3 sepsis trial, including by age and diabetes status, did not meet multiple comparison thresholds and are hypothesis generating only. | B | S1 | As C-10 | Allowed | Must never be presented as benefit in any subgroup. |

## 4. COVID-19

| ID | Claim as it would appear to a member | Grade | Sources | Population | Member facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| C-14 | An open label randomised pilot trial in 49 hospitalised patients with COVID-19 related hypoxemia and lymphocytopenia found no significant difference in time to clinical recovery (subdistribution hazard ratio 0.80, 95 percent CI 0.42 to 1.55, p equals 0.52), and no significant differences in mortality, invasive mechanical ventilation, or ICU admission. | C | S3, S4 | 49 hospitalised adults, two Rhode Island hospitals | Allowed | Grade C rather than B because the trial was small, open label, a pilot, and terminated early. |
| C-15 | That pilot trial was terminated early for administrative reasons, specifically slow enrolment and investigator relocation, not because of benefit or harm. | C | S3, S4 | As above | Allowed | Important so that early termination is not misread either way. |
| C-16 | A 2023 systematic review and meta-analysis pooling eight studies reported lower COVID-19 mortality with thymosin alpha-1 (risk ratio 0.59, 95 percent CI 0.37 to 0.93, p equals 0.02), with substantial unexplained heterogeneity (I squared equals 84 percent). The authors stated that randomised trials are still required to verify the finding. | C | S5 | Patients with moderate to critical COVID-19 | Allowed only with all three caveats attached | The three caveats are mandatory: heterogeneity, unconfirmed randomised versus observational composition, and the authors' own call for randomised trials. Without them this figure reads as established benefit. |
| C-17 | A positive pooled estimate drawn largely from non randomised data, sitting alongside a null randomised trial, is a recognised pattern of confounding rather than corroboration. COVID-19 efficacy was not established by adequate randomised evidence. | B | S3, S5 | Hospitalised adults with COVID-19 | Allowed, and is mandatory context wherever C-16 appears | This is an interpretive claim about study design, stated conservatively. It is the honest reading and should be enforced as a companion to C-16. |

## 5. Chronic hepatitis B

| ID | Claim as it would appear to a member | Grade | Sources | Population | Member facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| C-18 | A 2008 meta-analysis of four randomised trials totalling 199 patients with chronic hepatitis B reported higher odds of virological, biochemical, and complete response at six months after treatment for thymosin alpha-1 compared with interferon alpha. | C | S6 | 199 patients with chronic hepatitis B, three of four trials in HBeAg negative patients | Allowed with all caveats attached | Small, dated, active comparator only. Full text and risk of bias were not retrieved. |
| C-19 | That analysis compared thymosin alpha-1 against interferon alpha rather than against placebo, so it does not establish absolute efficacy, and it predates the transformation of chronic hepatitis B management by nucleoside and nucleotide analogues. | C | S6 | As above | Allowed, and is mandatory context wherever C-18 appears | The comparator and the age of the evidence are the whole story here. |
| C-20 | A Cochrane review on thymosin alpha-1 for chronic hepatitis B was registered in 2022, but the record available is a protocol only and contains no pooled results. No effect estimate exists from that source. | B | S7 | Not applicable | Allowed | Included specifically because search engine summaries misrepresented the protocol as a completed review. If a completed review has since appeared, it becomes the best hepatitis B evidence and this row must be revised. |

## 6. Safety

| ID | Claim as it would appear to a member | Grade | Sources | Population | Member facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| C-21 | Product labeling describes thymalfasin as contraindicated in people being deliberately immunosuppressed, including organ transplant recipients, unless the benefits clearly outweigh the risks. | E | S9 | People receiving deliberate immunosuppression, including transplant recipients | Allowed, and should be the most prominent safety statement | This is the most actionable safety signal in the record and follows directly from the proposed mechanism. Source is a secondary drug reference, not the primary label. |
| C-22 | Product labeling describes thymalfasin as contraindicated in people with a history of hypersensitivity to thymosin alpha 1 or any component of the injection. | E | S9 | People with prior hypersensitivity | Allowed | As above, secondary source. |
| C-23 | Labeling derived reports describe adverse experiences as infrequent and mild, primarily local discomfort at the injection site, with rare reports of erythema, transient muscle atrophy, polyarthralgia with hand edema, and rash. | E | S9 | Patients treated in the labeled setting | Allowed only with the manufacturer derived caveat attached | This characterisation is manufacturer associated. It is not independent pharmacovigilance. It must never be rendered as a general statement that the compound is safe or well tolerated. |
| C-24 | Trial level safety data across the retrieved randomised trials did not show significant differences from control, and reported serious adverse events in the COVID-19 pilot were not deemed related to the drug by the investigators. | B | S1, S2, S3 | Hospitalised adults, short course use, supervised settings | Allowed with the duration caveat attached | Absence of a detected difference in short acute trials is not evidence of long term safety. |
| C-25 | All retrieved human safety data come from short course use in acute or monitored medical settings. No retrieved evidence addresses the safety of long term or elective use in healthy adults. | B | S1, S2, S3, and the absence of any retrieved source addressing elective use | Healthy adults, the setting in which unregulated use typically occurs | Allowed, and should sit directly beneath C-23 and C-24 | This is a statement about the retrieved evidence base. Absence of studied harm reflects absence of study. Modulating the immune system in a healthy person is not a low stakes intervention. |
| C-26 | FDA has cited category level risks for injectable compounded peptides including immunogenicity, manufacturing impurities such as bacteria or heavy metals, and sensitivity to temperature and handling that can alter chemical composition. | G | S8 | Compounded injectable peptides as a category | Allowed with the secondary reporting caveat attached | Journalistic reporting of FDA reasoning. The FDA document itself could not be retrieved. |
| C-27 | Dosing and administration information is intentionally excluded from Xenios Research Guides. | Not applicable | Not applicable | Not applicable | Allowed, and required wherever a reader would expect dosing | Use this exact sentence. Do not soften it, do not gesture at ranges, do not describe route. |

## 7. Regulatory

Full detail sits in REGULATORY_STATUS.md. These rows govern member-facing wording only.

| ID | Claim as it would appear to a member | Grade | Sources | Population | Member facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| C-28 | Thymosin alpha-1 has no FDA marketing approval for any indication in the United States. | G | S8, and the absence of any approval assertion in S9 | United States | Allowed only after a human reviewer confirms it against FDA primary sources | Every fda.gov URL returned HTTP 404 in this session. The claim is almost certainly correct and is still marked unverified, because the standard here is source verification, not confidence. |
| C-29 | Thymalfasin is reported to be an approved prescription medicine under the brand name Zadaxin in some countries outside the United States, principally for chronic hepatitis B. | G | S9 | Non United States jurisdictions | Allowed, without any country list or count | No primary regulatory source confirming the approval list was retrieved. Publish the direction, not the number. |
| C-30 | Approval or registration in one jurisdiction is not approval in another. Approval outside the United States does not confer or imply United States approval. | A | Not applicable, this is a statement of how regulatory systems work | Not population specific | Allowed, and should be stated plainly | This is the single most exploited confusion for this compound. |
| C-31 | Orphan drug designation is a development incentive status, not marketing approval. | A | Not applicable, this is a statement of what the designation is | Not population specific | Allowed, and should be stated plainly whenever designation is mentioned | No designation record was retrieved, so no designation number, date, or granting authority may be stated. |
| C-32 | In 2023, FDA placed 19 peptides, including thymosin alpha, into Category 2 of the interim 503A bulks list, meaning substances that raise significant safety risks for compounding. | G | S8 | United States | Allowed with the secondary reporting caveat attached | Rests entirely on journalism. FDA primary documents were unreachable. |
| C-33 | In late 2024 an FDA advisory committee sided with the agency on the position that these peptides were too risky for general dispensing. A committee vote is advisory only and formal restriction requires rulemaking. | G | S8 | United States | Allowed with the secondary reporting caveat attached | Vote counts and formal outcome could not be confirmed. |
| C-34 | The current United States compounding status is unsettled. Independent reporting from April 2026 described a reversal of the 2023 categorisation as anticipated and contested rather than completed. Members should treat any claim of settled availability as unverified until confirmed against FDA primary sources. | G | S8 | United States | Allowed, and must be dated in the copy | This must be re-verified immediately before publication, not earlier. A wrong statement here could directly influence a purchasing decision. |
| C-35 | No anti-doping status claim is made in this Guide. Athletes should check the current WADA Prohibited List directly or consult their anti-doping authority. | Not applicable | None. The WADA Prohibited List could not be retrieved. | Competitive athletes | Allowed, and required on any athlete facing surface | Every source found asserting a status came from a vendor or directory site and was discarded. |

## 8. What is not known

These are published as open questions, not as claims. They belong on the member-facing
surface because the gap between what has been studied and what is marketed is the most
useful thing a member can learn about this compound.

| ID | Open question | Sources bearing on it | Member facing |
| --- | --- | --- | --- |
| U-01 | Whether thymosin alpha-1 has any benefit in healthy adults. Every retrieved human trial studied acutely or chronically ill populations. The evidence base and the consumer use case do not overlap. | S1, S2, S3, S5, S6 | Allowed, and should be stated early and plainly |
| U-02 | Long term safety of repeated or ongoing use. All retrieved safety data come from short course use under medical supervision. | S1, S2, S3, S9 | Allowed |
| U-03 | Whether the observed immune biomarker changes translate into any clinical benefit. In both trials where a biomarker moved, the clinical endpoint did not clearly follow. | S1, S2, S3 | Allowed |
| U-04 | Whether thymosin alpha-1 has value in chronic hepatitis B relative to contemporary standard of care. | S6, S7 | Allowed |
| U-05 | Efficacy in oncology, HIV, COPD, ME/CFS, vaccine response, and post transplant infection. No efficacy evidence for any of these was retrieved. | None | Allowed, stated as absence of retrieved evidence |
| U-06 | Whether unregulated material sold as thymosin alpha-1 is chemically the same substance as the pharmaceutical product. No analytical study specific to this compound was retrieved. | None | Allowed |
| U-07 | Whether modulating the immune system in an immunologically normal person carries risk, for example in relation to autoimmune predisposition. The proposed mechanism raises the question and no retrieved source answers it. | None | Allowed, stated as an unanswered question |
| U-08 | The current, settled United States regulatory and compounding status as of the publication date. | S8 | Allowed, and must be dated |

## 9. PROHIBITED claims

These may never appear on any member-facing surface for this compound, in any wording,
in any format, including headings, meta descriptions, social copy, email, and search
snippets. This section governs over every other section.

| ID | Prohibited claim or framing | Why it is prohibited |
| --- | --- | --- |
| P-01 | Any dosing, amount, concentration, frequency, timing, cycle structure, titration, loading, stacking, reconstitution, injection technique, or route of administration. | Out of scope for Xenios Research Guides without exception. Use the C-27 sentence instead. |
| P-02 | "Boosts your immune system", "strengthens immunity", "optimises immune function", or any immune benefit claim in healthy adults. | No retrieved study addresses healthy adults. This is the dominant marketing claim and it is unsupported by the entire evidence base assembled here. |
| P-03 | "Reduces mortality in sepsis" or any statement of sepsis benefit. | Directly contradicted by the largest, double blind, placebo controlled phase 3 trial, which returned a hazard ratio of 0.99. |
| P-04 | Citing the 2013 sepsis trial without the 2025 phase 3 trial, or presenting the 2013 result as current evidence. | The later confirmatory trial was null. Presenting only the earlier signal would materially mislead a member. |
| P-05 | Any claim of benefit in a sepsis subgroup, including by age or diabetes status. | The subgroup signals did not survive correction for multiple comparisons and are hypothesis generating only. |
| P-06 | "Treats COVID-19", "reduces COVID-19 mortality", or presenting the pooled risk ratio of 0.59 without its heterogeneity, design, and author caveats. | The only randomised trial retrieved was null. A positive pooled estimate from largely non randomised data is a confounding pattern. |
| P-07 | Citing the 100 percent recovery figure in the low flow oxygen treated subgroup of the COVID-19 pilot as evidence of benefit. | It rests on 8 patients, was not statistically significant, and the trial authors flagged post hoc analyses for cautious interpretation. |
| P-08 | "FDA approved", "approved by the FDA", or any wording that implies United States marketing approval. | Thymosin alpha-1 has no FDA marketing approval. |
| P-09 | Presenting orphan drug designation as approval, or listing designations in a way that reads as regulatory endorsement. | Designation is a development incentive, not approval, and no designation record was retrieved. |
| P-10 | "Approved in more than 35 countries" or any specific count of approving jurisdictions. | The figure traces to marketing material. No primary regulatory source was retrieved. |
| P-11 | "Reclassified to Category 1 in February 2026", "legal to compound again", or any statement that United States availability is settled. | Asserted only by commercially interested sources and inconsistent with the only independent reporting retrieved. |
| P-12 | Any statement about WADA Prohibited List status, including that the compound is not on it. | The Prohibited List could not be retrieved. Every source asserting a status was a vendor or directory page. |
| P-13 | "Safe", "well tolerated", "no side effects", "virtually devoid of toxicity", or any general safety endorsement. | Safety data are short course, acute setting, and partly manufacturer derived. There is no long term or healthy adult safety evidence. |
| P-14 | Any purity, potency, or label accuracy failure rate statistic for gray market peptides. | Every figure encountered came from commercially interested testing or vendor pages. |
| P-15 | Presenting any thymosin beta-4 or TB-500 finding, including falsified product findings, as applying to thymosin alpha-1. | They are different molecules with different evidence and different regulatory positions. |
| P-16 | Any anti-aging, longevity, recovery, performance, resilience, cancer, HIV, COPD, or ME/CFS efficacy claim. | No efficacy evidence for any of these was retrieved. |
| P-17 | "Restores immune function", "reverses immune decline", "cures", "eliminates", "proven to", or "will". | Guaranteed outcome language. Not supported by any retrieved evidence and prohibited by house standards. |
| P-18 | Any bare mechanism sentence that reads as established human physiology, for example describing receptor activation as fact. | No primary mechanistic source was retrieved and the mechanism is inferred largely from laboratory systems. |
| P-19 | "Research use only" framing used to imply human benefit while avoiding a direct claim. | Prohibited framing. |
| P-20 | Any sourcing, acquisition, vendor, pharmacy, or purchasing guidance, and any self treatment framing. | Out of scope. Guides describe evidence, they do not direct action. |

## 10. Reviewer checklist before publication

1. Confirm C-28, C-29, C-32, C-33, and C-34 against FDA primary sources, and re-date them.
2. Confirm no prohibited claim from section 9 has entered the draft, including in headings
   and metadata.
3. Confirm every paired claim rule is satisfied: C-07 and C-08 with C-09, C-12 with C-10,
   C-16 with C-17, C-18 with C-19, C-23 and C-24 with C-25.
4. Confirm no dosing or administration content exists anywhere in the Guide.
5. Confirm no source in the Guide is a vendor, retailer, clinic, or directory page.
6. Confirm every unverified line carries its marker and every regulatory line carries a
   jurisdiction, a date, and a source URL.
