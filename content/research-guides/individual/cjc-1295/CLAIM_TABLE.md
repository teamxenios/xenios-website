---
title: "CJC-1295 Claim Table"
type: claim-table
compound: cjc-1295
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# Claim Table: CJC-1295

The evidence spine of this Guide. One row per discrete claim. Every claim is graded on its
own merit, never by the reputation of the compound as a whole. Source ids refer to
SOURCE_REGISTRY.md.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## Grade key

| Grade | Meaning |
|---|---|
| A | Established |
| B | Supported human evidence |
| C | Early human evidence |
| D | Preclinical |
| E | Manufacturer or supplier reported |
| F | Traditional or historical |
| G | Unverified |
| PROHIBITED | May not appear on any member-facing surface |

Default grade is D or G unless a specific retrieved human study supports better. Most rows
here grade C, D or G. That is the honest result for this compound.

## The variant rule that governs this whole table

Two chemically different products are sold under the name CJC-1295. The DAC form (drug
affinity complex, albumin binding) carries essentially all of the human data. The no-DAC
form, more accurately called modified GRF(1-29), has no controlled human studies at all
(S6). **A grade earned by the DAC form does not transfer to the no-DAC form.** Every row
below states which variant it applies to. Any member-facing surface that drops the variant
label converts a C grade claim into a G grade claim without changing a word.

---

## 1. Identity and classification

| ID | Claim as a member would read it | Grade | Sources | Population or model | Member-facing | Reviewer notes |
|---|---|---|---|---|---|---|
| ID-01 | CJC-1295 is a synthetic analog of the first 29 amino acids of growth hormone-releasing hormone, developed by ConjuChem Biotechnologies. | A | S1, S6, S14 | Not applicable, chemical identity | Allowed | Consistent across the primary trial report, the 2026 review and the originating preclinical paper |
| ID-02 | It is classified as a growth hormone-releasing hormone receptor agonist, meaning it acts on the pituitary rather than supplying growth hormone directly. | A | S1, S6, S14 | Not applicable, mechanism class | Allowed | Class statement only. Says nothing about effect or benefit |
| ID-03 | Two chemically different products are sold under the name CJC-1295: the DAC form, which binds circulating albumin, and the no-DAC form, also called modified GRF(1-29). | A | S6 | Not applicable | Allowed. Should be the first thing a member reads | The single most important point in this Guide. The 2026 review is explicit on the distinction |
| ID-04 | The published human data on CJC-1295 is data on the DAC form. | A | S1, S2, S3, S6, S9 | Healthy adults | Allowed | Confirmed by the completeness check S9 in addition to the individual papers |
| ID-05 | A 2026 peer-reviewed review states the no-DAC form is uncharacterised in the peer-reviewed human literature, and that no controlled clinical studies have directly evaluated it in humans. | B | S6 | Humans, the absence of a literature | Allowed. Attribute to the review by name | Graded B rather than A because it rests on one narrative review, though it is consistent with the independent completeness checks S5 and S9 |
| ID-06 | A purchaser cannot tell from the common product name alone which of the two molecules a product contains. | B | S6 | Not applicable, market observation | Allowed | Supported by the review's account of the naming and by the interchangeable naming observed across commercial pages this session |
| ID-07 | Related but chemically distinct compounds a reader may confuse this with include sermorelin, tesamorelin, CJC-1293, and the ghrelin mimetic class such as ipamorelin, GHRP-2, GHRP-6 and MK-677, which act on a different receptor. | B | S6, S7 | Not applicable | Allowed | S7 names CJC-1293 alongside CJC-1295 as GHRH analogues. Keep this as an orientation note, not a comparison of merits |
| ID-08 | The specific amino acid substitution positions of modified GRF(1-29). | G | None retrieved | Not applicable | **Not allowed** until sourced | [UNVERIFIED - background knowledge, requires human source check] These positions appeared only in vendor marketing this session. Omit rather than guess |

## 2. Human pharmacology, DAC form only

Every row in this section applies to the DAC form and to healthy adult volunteers. None of
it applies to the no-DAC form. None of it is an outcome.

| ID | Claim as a member would read it | Grade | Sources | Population | Member-facing | Reviewer notes |
|---|---|---|---|---|---|---|
| PH-01 | In two Phase 1 trials in healthy adults aged 21 to 61, the DAC form was associated with dose dependent increases in mean plasma growth hormone and IGF-I. | C | S1 | Healthy adults, 21 to 61 | Allowed with the population and the DAC label in the same sentence | Phase 1, weeks in duration, industry sponsored, exact enrollment not stated in the retrieved abstract. Hormone levels, not outcomes |
| PH-02 | In the same trials, the estimated half-life was reported as 5.8 to 8.1 days. | C | S1 | Healthy adults, 21 to 61 | Allowed only with an explicit DAC label | This is the figure most often misattributed to the no-DAC product. Never print it without the variant label. It is a pharmacokinetic parameter, not a schedule, and must not be presented alongside any timing or frequency framing |
| PH-03 | In healthy men aged 20 to 40, growth hormone secretion increased after a single administration of the DAC form while the frequency and magnitude of secretory pulses were unaltered. | C | S2 | Healthy men, 20 to 40 | Allowed with population and variant | Very small, single administration, one week of observation, same investigator group as S1. Mechanistic physiology, not an outcome |
| PH-04 | The authors of that study concluded long-acting GHRH preparations may have clinical utility in people with intact pituitary growth hormone secretory capacity. | C | S2 | Healthy men, 20 to 40 | Allowed only as an attributed author conclusion, never as a finding | Attribute explicitly. This is a hypothesis stated by investigators in 2006, and no subsequent trial confirmed it in a patient population |
| PH-05 | In 11 healthy young adult males, serum protein profiles changed after a single administration of the DAC form. | C | S3 | 11 healthy young adult males | Allowed, and only alongside the authors' own caution | Exploratory biomarker discovery. The authors state the molecular mechanisms linking these proteins to GH and IGF-I biological activity remain to be clarified. Do not name individual protein spots on a member surface, it implies more meaning than exists |
| PH-06 | Raising growth hormone and IGF-1 with this compound has not been shown to produce any clinical benefit. | B | S1, S2, S3, S4, S5, S9 | Healthy adults, and one terminated patient trial | Allowed. This belongs next to every PH row | An absence claim, well supported here because the completeness checks establish the full extent of the literature. No retrieved human study measured body composition, strength, sleep, recovery, injury healing, cognition or any longevity endpoint |

## 3. Human pharmacology, no-DAC form

| ID | Claim as a member would read it | Grade | Sources | Population | Member-facing | Reviewer notes |
|---|---|---|---|---|---|---|
| ND-01 | There are no controlled human studies of the no-DAC form (modified GRF(1-29)). Its pharmacokinetics, safety and effects in humans are unknown. | B | S6, S5, S9 | Humans, the absence of a literature | Allowed. This is the honest headline for this variant | An honest empty evidence table. Present it plainly rather than softening it |
| ND-02 | Any half-life or duration figure quoted for the no-DAC form. | G | None retrieved | Not applicable | **Not allowed** | Short half-life figures for this variant appeared only in vendor marketing this session and were not confirmed by any peer-reviewed or regulatory source retrieved |
| ND-03 | Any safety reassurance for the no-DAC form derived from the DAC trials. | PROHIBITED | Not applicable | Not applicable | **Never allowed** | See the PROHIBITED section, row P-05. This is a misattribution across two pharmacologically dissimilar compounds and is itself a safety issue, not a labeling nicety (S6) |

## 4. Clinical trial record

| ID | Claim as a member would read it | Grade | Sources | Population | Member-facing | Reviewer notes |
|---|---|---|---|---|---|---|
| TR-01 | Exactly one clinical trial of CJC-1295 is registered on ClinicalTrials.gov: a Phase 2 study of 120 participants with HIV-associated visceral obesity, sponsored by ConjuChem, which is listed as Terminated with no results posted. | A | S4, S5 | HIV-infected patients with HIV-associated visceral obesity | Allowed | Registry facts only. The record gives no reason for termination |
| TR-02 | Because no results were posted, that trial supports no conclusion about efficacy or safety in any direction. | A | S4 | Same | Allowed | State this explicitly wherever TR-01 appears, or a reader will read termination as a verdict |
| TR-03 | The only registration in a patient population rather than healthy volunteers produced nothing public. | A | S4, S5 | Same | Allowed | The cleanest way to convey the shape of the evidence gap |
| TR-04 | Development did not continue and no approved product exists. | B | S4, S6, and the absence of any approval found under S10 to S12 | Not applicable | Allowed, phrased as no approved product was identified | Frame as a search result, not an exhaustive global claim. No non-United States regulator was searched this session |

## 5. Preclinical

Species or model appears inside every claim sentence. None of these rows may be restated as
a human finding, and none may be used to imply a human effect.

| ID | Claim as a member would read it | Grade | Sources | Model | Member-facing | Reviewer notes |
|---|---|---|---|---|---|---|
| PC-01 | In rats, human GRF(1-29) albumin bioconjugates activated the growth hormone-releasing factor receptor on the anterior pituitary, and this work identified CJC-1295 as a long lasting analog. | D | S14 | Rat | Allowed only with "in rats" in the same sentence | The originating characterization of the DAC design. Bibliographic details and stated finding read in the PubMed result list, full abstract not separately retrieved |
| PC-02 | In a mouse genetically lacking growth hormone-releasing hormone, repeated administration normalized growth. | D | S15 | GHRH knockout mouse | Allowed only with the model named, and only with the caveat below | A genetically deficient animal is not a model of a healthy adult human. Never present this as evidence of a growth or body composition effect in people |
| PC-03 | Analytical methods were developed to detect CJC-1295 in equine plasma. | D | S16 | Horse | Allowed, framed as detection methodology | Detection papers only. They establish that veterinary misuse prompted assay development. They say nothing about efficacy or safety |

## 6. Safety

No general safety characterisation of this compound is supportable. The rows below are the
only safety statements this record permits.

| ID | Claim as a member would read it | Grade | Sources | Population | Member-facing | Reviewer notes |
|---|---|---|---|---|---|---|
| SF-01 | No long-term safety data exist for either variant. The longest human exposure identified was a 49-day Phase 1 trial. | B | S6, S1 | Humans | Allowed. This is the most important safety line in the Guide | Independently consistent with what was retrieved directly: the longest trial found ran 49 days and the only Phase 2 trial was terminated with no results |
| SF-02 | There is no post-marketing safety surveillance, because there is no approved product. | B | S4, S6 | Not applicable | Allowed | Follows from TR-04. Keep it adjacent to SF-01 |
| SF-03 | Sustained growth hormone and IGF-1 signalling raises a theoretical oncologic question. The 2026 review that raises it states explicitly that there is no established clinical carcinogenic signal. | C | S6 | Humans, mechanism based | Allowed only if both halves appear together | Mechanism based concern, not an observed harm. Presenting either half alone misleads, in one direction or the other. Neither reassurance nor alarm is supported |
| SF-04 | Glucose intolerance and fluid retention are described as theoretically plausible through somatotropic activation, but the same review states they lack direct peer-reviewed documentation specifically for CJC-1295 products. | C | S6 | Humans, mechanism based | Allowed only with the "not directly documented" clause | Recorded here precisely so the Guide does not overstate these as observed effects |
| SF-05 | Reported vasodilatory reactions and tachycardia. | G | S6-secondary | Unclear | **Not allowed** until confirmed at primary source | Attributed by the 2026 review to an FDA listing rationale. The underlying FDA document could not be retrieved this session. Secondhand until a human opens fda.gov |
| SF-06 | A reported death of a trial subject during Phase II development. | G | S13 | Unknown | **Not allowed** in any member-facing copy | Tertiary encyclopedia source only. Not confirmed by any primary source. Consistent with, but not established by, the verified fact that the Phase 2 trial is terminated with no posted results and no stated reason. Must not be published as fact and must not be published as debunked. Flagged for human verification |
| SF-07 | Whether the response diminishes with continued use (tachyphylaxis). | G | None retrieved | Not applicable | **Not allowed** | Not addressed in any human study retrieved. Record as an unknown, not as a reassurance |
| SF-08 | Effects in women. | G | S1, S2, S3 | Not established | **Not allowed** as any effect claim | The two mechanistic studies enrolled men only. The Phase 1 report enrolled adults 21 to 61 without a sex breakdown in the retrieved abstract. State only that sex specific effects are unknown |

## 7. Product quality and identity

| ID | Claim as a member would read it | Grade | Sources | Scope | Member-facing | Reviewer notes |
|---|---|---|---|---|---|---|
| QL-01 | CJC-1295 has been identified by mass spectrometry in an unlabeled illicit preparation of unknown origin submitted by Norwegian police and customs authorities. | B | S8 | One seized preparation, published 2010 | Allowed, with the year stated | Direct documentation that this compound circulates unlabeled. It is 16 years old, so do not present it as a current market survey |
| QL-02 | The peer-reviewed anti-doping literature documents a growing black market in growth hormone-releasing hormones and illicit synthesis of analogue peptide hormones, citing identification of CJC-1295 in confiscated products. | B | S7 | Market level | Allowed | Analytical literature, not a market study |
| QL-03 | A 2026 review describes real-world use as complicated by quality control uncertainty and compositional variability characteristic of unregulated peptide supply chains, and notes this is especially acute for agents lacking any human validation. | B | S6 | Market level | Allowed | Applies with particular force to the no-DAC variant |
| QL-04 | The name ambiguity is itself an identity defect: a product labelled CJC-1295 may be either molecule. | B | S6 | Market level | Allowed | Pairs with ID-03 and ID-06. This is a quality problem, not just a naming problem |
| QL-05 | No independent testing or purity analysis of currently marketed products sold under this name was found. | B | Absence, see SOURCE_REGISTRY section G | Market level | Allowed, phrased as none was found | Frame as a search result. S8 is the closest available item and is from 2010 |
| QL-06 | Commercial pages present specific pharmacokinetic figures for the no-DAC variant while citing the DAC form human trials as their evidence base. | E, treated as G for evidentiary purposes | Observed on commercial pages this session, S6 for the underlying distinction | Market level | Allowed as a caution to the reader, never as a factual figure | Grade E is a supplier report, which is never evidence. Here it is also a misattribution of data from a different molecule |

## 8. Regulatory and sport

Full statements, with jurisdiction, date and URL, are in REGULATORY_STATUS.md. These rows
govern whether a regulatory statement may appear at all.

| ID | Claim as a member would read it | Grade | Sources | Jurisdiction | Member-facing | Reviewer notes |
|---|---|---|---|---|---|---|
| RG-01 | No FDA-approved drug product containing CJC-1295 in any form was identified. | B | S4, S6 | United States | Allowed, phrased as not identified | Absence claim from the searches performed, not an exhaustive global statement |
| RG-02 | Five CJC-1295 forms were listed as being considered for inclusion on the section 503A bulk drug substances list at the December 4 2024 Pharmacy Compounding Advisory Committee meeting. | A | S10 | United States | Allowed, with the word "considered" preserved exactly | The Federal Register notice states consideration only. It does not state FDA's recommendation. The outcome of that meeting could not be verified this session |
| RG-03 | The current United States compounding status of CJC-1295. | G | Not retrievable this session | United States | **Not allowed** | Every fda.gov URL returned HTTP 404 this session. Vendor accounts are mutually inconsistent. Do not state a current status until a human opens fda.gov directly |
| RG-04 | CJC-1295 is not listed in the Federal Register notice announcing the July 23 to 24 2026 Pharmacy Compounding Advisory Committee meeting. | A | S12 | United States | Allowed | Primary government source. Directly refutes the vendor claim that CJC-1295 is pending that review |
| RG-05 | An FDA final guidance announced January 7 2025 ends categorization of bulk drug substances into Categories 1, 2 or 3 for substances nominated on or after that guidance's publication date. That notice does not mention CJC-1295 or peptides by name. | A | S11 | United States | Allowed, with the second sentence attached | Without the second sentence this becomes an inference about this compound that the document does not support. Readers encountering Category 2 language should treat it as possibly describing a superseded framework |
| RG-06 | Growth hormone-releasing hormone analogues including CJC-1295 are prohibited in sport at all times, not in-competition only. | B | S7 | World Anti-Doping Agency | Allowed | Confirmed from a peer-reviewed anti-doping paper referencing the 2015 Prohibited List. The current year section number and wording were not verified this session, so do not cite a section number |
| RG-07 | Regulatory status outside the United States. | G | Not searched | Other jurisdictions | **Not allowed** | No non-United States regulator was searched or retrieved this session. The Guide has no basis to say anything here |

## 9. Honest unknowns worth stating on the member surface

Naming an unknown is a claim, and these are supportable claims. Each grades B as an absence
claim because the completeness checks (S5, S9) establish the extent of the literature.

| ID | Statement | Grade | Sources | Member-facing |
|---|---|---|---|---|
| UK-01 | Whether raising growth hormone and IGF-1 this way produces any clinical benefit in healthy adults is unknown. No retrieved human study measured body composition, strength, sleep, recovery, injury healing, cognition or any longevity endpoint. | B | S1, S2, S3, S5, S9 | Allowed |
| UK-02 | Everything about the no-DAC form in humans is unknown, including pharmacokinetics, safety and effect. | B | S6, S5, S9 | Allowed |
| UK-03 | Long-term safety of either variant is unknown. | B | S6, S1 | Allowed |
| UK-04 | Whether sustained IGF-1 elevation by this mechanism carries real oncologic risk in humans is unknown. Neither reassurance nor alarm is supported by data. | C | S6 | Allowed |
| UK-05 | Effects on glucose metabolism and insulin sensitivity in humans taking this compound are not directly documented. | C | S6 | Allowed |
| UK-06 | Why the Phase 2 trial was terminated, and what its 120 participants experienced, is not public. | A | S4 | Allowed |
| UK-07 | Whether the response diminishes with continued use is not addressed in any retrieved human study. | B | S5, S9 | Allowed |
| UK-08 | What is actually in any given product sold under this name, including which molecule it contains and at what purity, is unknown. | B | S6, S8, S7 | Allowed |
| UK-09 | The current definitive FDA compounding status is unknown as of this review. | B | S10, S11, and the retrieval failure recorded in SOURCE_REGISTRY section G | Allowed, phrased as unresolved pending human verification |
| UK-10 | Effects in women are unknown. | B | S1, S2, S3 | Allowed |

---

## PROHIBITED CLAIMS

These may never appear on any member-facing surface for this compound, in any wording, in
any medium, including summaries, comparison tables, search snippets, metadata, alt text and
social copy. This section is the most important part of this table. A claim listed here is
prohibited even if a source appears to support it, because the prohibition reflects either
an absence of evidence, a category error, or a content safety rule that outranks the
evidence.

| ID | Prohibited claim or framing | Why it is prohibited |
|---|---|---|
| P-01 | Any dose, amount, concentration, volume, frequency, timing, cycle length, titration, loading, stacking, reconstitution, injection technique or route of administration. | Content safety rule, absolute. Where a reader would expect this, the Guide states: Dosing and administration information is intentionally excluded from Xenios Research Guides. |
| P-02 | Any protocol, regimen, schedule or step-by-step direction a reader could follow. | Content safety rule, absolute. Guides describe evidence, they never instruct |
| P-03 | Any statement that this compound builds muscle, reduces body fat, improves body composition, increases strength, improves sleep, speeds recovery, heals injury, improves skin, slows ageing, extends lifespan or improves cognition. | No retrieved human study measured any of these. Every human study found measured hormone levels or serum proteins only |
| P-04 | Any guaranteed or deterministic outcome wording: will, proven to, restores, cures, eliminates, reverses, optimizes, corrects. | Content safety rule. Permitted constructions are has been studied for, reported in, investigated as, associated with in a named population |
| P-05 | Applying any DAC form finding, including the half-life range, the growth hormone and IGF-I results, or any tolerability language, to a product sold without DAC. | These are two pharmacologically dissimilar molecules. The 2026 review states the no-DAC form has no controlled human studies. Transferring findings across them is the defining error in the commercial material on this subject, and the review treats the misattribution as a safety issue rather than a labeling one |
| P-06 | Describing this compound as safe, well tolerated, side effect free, or having a favourable safety profile, as a general statement. | No long-term safety data exist for either variant and the longest human exposure identified was 49 days. The tolerability language in the Phase 1 report belongs to that trial, that variant and that population, and cannot be generalized |
| P-07 | Stating or implying that the theoretical oncologic concern has been ruled out, or conversely that this compound causes cancer. | The 2026 review flags a mechanism based concern and states explicitly there is no established clinical carcinogenic signal. Both directions overstate the record |
| P-08 | Stating that a trial subject died during development, or stating that this account has been disproven. | Tertiary source only, no primary confirmation retrieved. It can be neither asserted nor dismissed. Flagged for human verification |
| P-09 | Stating vasodilatory reactions and tachycardia as documented adverse effects. | Secondhand from a review attributing them to an FDA rationale. The primary FDA document could not be retrieved this session |
| P-10 | Any statement of the current United States compounding or bulk drug substances list status. | Unverifiable this session. Every fda.gov URL returned HTTP 404, vendor accounts give mutually inconsistent dates, and the categorization framework itself changed in January 2025. Prohibited until a human opens fda.gov directly |
| P-11 | Claiming CJC-1295 is pending or scheduled for the July 2026 Pharmacy Compounding Advisory Committee review. | Verifiably contradicted by the Federal Register notice announcing that meeting, which does not list it |
| P-12 | Any regulatory or legal status for a jurisdiction outside the United States, or any implication that a United States status applies elsewhere. | No non-United States regulator was searched. Approval or registration in one jurisdiction is never approval in another |
| P-13 | Any bare mechanism sentence describing receptor activation, pituitary stimulation or growth normalization without naming the species or model in the same sentence, where the finding is animal or in vitro. | The most common failure mode in this subject area. A rodent or knockout mouse finding written as a bare mechanism reads to a member as a human fact |
| P-14 | Using research use only, for research purposes, or not for human consumption as a device to imply human benefit or to signal that use is expected. | Prohibited framing. It is a legal disclaimer, not a benefit claim, and using it as one is misleading |
| P-15 | Any sourcing, purchasing, vendor selection, supplier quality, importation or acquisition guidance. | Content safety rule, absolute |
| P-16 | Any medical advice, diagnostic framing, self-treatment framing, or suggestion that a member discuss starting this compound with anyone. | Content safety rule, absolute |
| P-17 | Presenting the terminated Phase 2 trial as evidence of either danger or ineffectiveness. | No results were posted and no reason for termination is given in the registry record. It supports an evidence gap and nothing else |
| P-18 | Citing the specific amino acid substitution positions of modified GRF(1-29). | Appeared only in vendor material this session. Excluded from the verified record. [UNVERIFIED - background knowledge, requires human source check] |
| P-19 | Quoting a half-life or duration figure for the no-DAC form. | No peer-reviewed or regulatory source for any such figure was retrieved. The figures in circulation come from marketing material |
| P-20 | Copying, closely paraphrasing, or restructuring wording from any competitor, retailer, clinic or manufacturer page. | Editorial rule, absolute. All wording in this Guide is original |

## Reviewer sign-off checklist

Before this Guide reaches a member-facing surface, a human reviewer must confirm:

1. No row graded G or PROHIBITED has leaked into published copy.
2. Every DAC form claim carries the variant label in the same sentence.
3. Every preclinical claim names the species or model in the same sentence.
4. No dose, amount, frequency, route or protocol appears anywhere.
5. Every regulatory statement carries jurisdiction, date and source URL.
6. Items 1 to 3 of the human review queue in SOURCE_PLAN.md section 7 are resolved, in
   particular the direct fda.gov check.
