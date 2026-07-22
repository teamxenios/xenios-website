---
title: CJC-1295 and Ipamorelin Blend Claim Table
type: research-guide-claim-table
compound: cjc-1295-ipamorelin
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# CJC-1295 and Ipamorelin Blend: Claim Table

One row per discrete claim. Grades apply to individual claims, never to a component as a whole and
never to the product as a whole. Source ids refer to SOURCE_REGISTRY.md.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

---

## The rule that governs every row in this table

**A study of one ingredient is not a study of the mixture.** When two active compounds are put in
one vial, what results is a new pharmacological object with its own behaviour, its own interaction
profile, and its own set of things nobody has measured. Evidence collected on CJC-1295 alone belongs
to CJC-1295 alone. Evidence collected on ipamorelin alone belongs to ipamorelin alone. Neither can be
lent to the pair.

Unless a study administered THIS combination, there is no combination evidence. That is not a
statement that the combination evidence is weak, preliminary, or early. It is a statement that the
category is empty.

Both component research records were searched in full for any study of the combination. **None
exists.** Section 1 below is therefore empty of effect claims, and every row in sections 3 and 4 is
marked as belonging to a single component so that no reader and no future editor can assemble them
into something that reads like support for the blend.

---

## The second governing rule: the product composition is not confirmed

**The exact composition and the ingredient ratio of the Xenios product are NOT CONFIRMED.** No row
in this table states a ratio, implies a ratio, or describes one component as present in greater or
lesser proportion than the other. Any such statement added later without a supplier document behind
it is a fabrication. This is the first open supplier question and it is recorded in
QUALITY_AND_DOCUMENTATION.md.

A second composition question sits underneath it. The name "CJC-1295" is used commercially for two
chemically different molecules, and it is not established which one a given blend product contains.
See BLEND-I-03.

---

## Grade key

| Grade | Meaning |
| --- | --- |
| A | Established |
| B | Supported human evidence |
| C | Early human evidence |
| D | Preclinical (animal or cultured cells) |
| E | Manufacturer or supplier reported |
| F | Traditional or historical |
| G | Unverified |
| PROHIBITED | May not appear on any member-facing surface |

No claim in this table is graded A or B. **No claim about the combination is graded above G**, and no
combination claim is member-facing, because there is no study to support any grade above unverified.
A grade of D for a combination claim would falsely imply that preclinical combination work exists.

---

## Section 1. Combination evidence

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| BLEND-C-01 | No study of CJC-1295 combined with ipamorelin was located, in humans or in any animal model, of any design. There is no combination evidence. | G | No source, by absence. Search documented in SOURCE_PLAN.md section 2 | Not applicable, this is a statement about the literature | Yes | The single most important line in this Guide. Graded G rather than D because it describes an absence, and because grading an absence as preclinical would misleadingly suggest animal combination data exists. Absence of study is not evidence of safety, of benefit, or of harm. It is absence. |
| BLEND-C-02 | The pairing of these two compounds is a commercial construct rather than a studied intervention. It is sold together far more than it has been tested together, and in the retrieved record it has not been tested together at all. | G | N05, and the absence documented at BLEND-C-01 | Not applicable | Yes | Say this plainly. A member encountering the blend everywhere online will reasonably assume the pairing came from research. It did not, so far as the retrieved record shows. |
| BLEND-C-03 | Whether the two compounds together produce a larger effect on growth hormone than either alone is unknown. They act at two different receptors, which is the basis of the additive rationale, and that rationale has not been tested for this pair. | G | C06, I07, and the absence at BLEND-C-01 | Humans, unstudied | Yes, only phrased as an open question | **This row is the most likely place for the Guide to go wrong.** The receptor argument is mechanistically coherent and completely untested here. Additivity, synergy, redundancy, and interference are all live possibilities. Never present the rationale as a finding, and never let it appear adjacent to component biomarker results in a way that reads as confirmation. |
| BLEND-C-04 | Whether combining a GHRH-receptor agonist with a ghrelin-receptor agonist changes the safety profile relative to either alone is unstudied. No interaction data for this pair was located. | G | Absence at BLEND-C-01 | Humans, unstudied | Yes | Interaction is not only about efficacy. Two compounds converging on one hormonal axis is exactly the situation where an interaction question is most reasonable and here it is unanswered. |
| BLEND-C-05 | Whether the effects reported for each component separately hold when both are administered is unknown, including whether the growth hormone response pattern reported for either compound alone is preserved. | G | Absence at BLEND-C-01 | Humans, unstudied | Yes | Ionescu 2006 (C02) reported preserved pulsatility for the DAC form alone. Whether that holds in a blend is not known and must never be implied. |

**This table contains no effect claims and that is the finding.** It is not an oversight, a
placeholder, or a section awaiting completion.

---

## Section 2. Identity and composition

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| BLEND-I-01 | A product labelled as CJC-1295 with ipamorelin contains two distinct pharmacologically active compounds acting at two different receptors, not a single ingredient. | D | C06, I07, and the identity section of the ipamorelin record | Not applicable, chemical identity | Yes | Foundational. Some readers assume the hyphenated product name denotes one substance. |
| BLEND-I-02 | The exact composition and ingredient ratio of the Xenios product are not confirmed. | G | None. No supplier document has been reviewed | Not applicable | Yes, stated as an open question | **No ratio may be stated or implied anywhere.** If a supplier document later establishes one, it enters at grade E, supplier reported, and stays there until independent assay confirms it. |
| BLEND-I-03 | The name CJC-1295 is used commercially for two chemically different molecules. One is the albumin-binding form, written CJC-1295 with DAC, where DAC stands for drug affinity complex, a group added to the peptide that binds circulating albumin and greatly extends how long the compound persists. The other has the amino acid substitutions but not that group, and is more accurately called modified GRF(1-29). A purchaser cannot determine which molecule they have from the product name alone. | D | C06, and the quality and identity section of the CJC-1295 record | Not applicable | Yes, prominently | This is the second most important line in the Guide after BLEND-C-01. Every vendor page encountered during component research used the two names interchangeably or as parenthetical synonyms. |
| BLEND-I-04 | Essentially all published human data on CJC-1295 was collected on the albumin-binding DAC form. A 2026 peer-reviewed review states that the form without that group is essentially uncharacterised in the peer-reviewed human literature and that no controlled clinical studies have directly evaluated it in humans. | C for the DAC attribution, G for the no-DAC characterisation | C01, C02, C03, C06 | Healthy adult volunteers for the DAC studies. No population for the other form, because none was studied | Yes | The consequence must travel with the claim every time: pharmacokinetic and safety findings for one form do not transfer to the other. A Guide, a vendor page, or a forum that cites the 2006 human trial next to a no-DAC product is misattributing data across two different molecules. |
| BLEND-I-05 | Ipamorelin is a synthetic five-amino-acid peptide that acts at the growth hormone secretagogue receptor 1a, also called the ghrelin receptor, making it a ghrelin mimetic. It was developed by Novo Nordisk in the late 1990s and characterised in the peer-reviewed literature as the first selective growth hormone secretagogue. | D | I07 | Not applicable, chemical identity | Yes | The selectivity descriptor is from the title and findings of a preclinical study. Do not let the phrase "first selective growth hormone secretagogue" travel without that context. See BLEND-M-03. |
| BLEND-I-06 | CJC-1295 is a synthetic analogue of the first 29 amino acids of growth hormone-releasing hormone and acts at the GHRH receptor. It is a different receptor from the one ipamorelin acts at. | D | C06, and the identity section of the CJC-1295 record | Not applicable | Yes | State the receptor difference as chemistry. Do not follow it with an effect inference. |
| BLEND-I-07 | Compounds each component is commonly confused with. For CJC-1295: sermorelin, tesamorelin, and CJC-1293. For ipamorelin: GHRP-2, GHRP-6, hexarelin, anamorelin, macimorelin, and ibutamoren, also called MK-677, which is not a peptide. Neither component is growth hormone itself, and neither is IGF-1. | D | C06, and the identity sections of both records | Not applicable | Yes | Findings for those compounds are not findings for these. Check every borrowed citation against this row. |
| BLEND-I-08 | Reported chemical registry number for ipamorelin. | G | None | Not applicable | No | [UNVERIFIED - background knowledge, requires human source check] The circulating number was not confirmed against a primary chemical registry during component research and is not reproduced anywhere in this folder. |
| BLEND-I-09 | Reported amino acid substitution positions for modified GRF(1-29). | G | None | Not applicable | No | [UNVERIFIED - background knowledge, requires human source check] These appeared only in vendor marketing during component research and are excluded from this folder by name. |

---

## Section 3. CJC-1295 component evidence

**Every row in this section is about one ingredient studied alone. None of it is evidence about the
blend.**

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| BLEND-A-01 | In two Phase 1 randomised, placebo-controlled, double-blind ascending-dose trials in healthy adults aged 21 to 61, running 28 and 49 days, CJC-1295 with DAC was reported to increase mean plasma growth hormone and mean plasma IGF-I, with an estimated half-life of 5.8 to 8.1 days. The authors concluded it was safe and relatively well tolerated in that setting. | C | C01 | Healthy adults, DAC form only | Yes, only with all four qualifiers in the same passage | The four qualifiers: it is the DAC form only, it measured hormone levels rather than clinical outcomes, it ran weeks rather than months, and it was industry-sponsored with the sponsor's people among the authors. The authors' tolerability conclusion belongs to that short study in that population and may never be generalised into a safety statement about a blend product. Exact enrollment was not stated in the retrieved abstract. |
| BLEND-A-02 | In a double-blinded study of healthy men aged 20 to 40 using overnight blood sampling before and one week after a single administration, CJC-1295 with DAC was reported to increase growth hormone secretion while leaving the frequency and magnitude of secretory pulses unaltered. | C | C02 | Healthy young men, DAC form only | Yes, with the mechanistic framing | Very small, single administration, one week of observation, same investigator group as BLEND-A-01. An endocrine physiology study. Do not present preserved pulsatility as a benefit. |
| BLEND-A-03 | In an exploratory study of 11 healthy young adult males, serum protein spots were reported to change after a single administration of CJC-1295 with DAC. The authors state that the molecular mechanisms linking these proteins to growth hormone and IGF-I biological activity remain to be clarified. | C | C03 | 11 healthy young adult males, DAC form only | Yes, only with the authors' own caveat attached | Biomarker discovery with no clinical endpoint. Hypothesis-generating and of uncertain meaning by the authors' own account. |
| BLEND-A-04 | The only registered clinical trial of CJC-1295, a Phase 2 study of 120 participants with HIV-associated visceral obesity, was terminated and no results have ever been posted. The registry record gives no reason for termination. | D | C04, C05 | Not applicable, this is a registry record | Yes | This is an evidence gap, not evidence. It is also the only registration in a patient population rather than healthy volunteers, so the compound's only test in people with a condition to treat produced nothing public. No efficacy or safety conclusion of any kind may be drawn from it. |
| BLEND-A-05 | No human study of CJC-1295 in either form measured body composition, strength, sleep, recovery, injury healing, cognition, or any longevity endpoint. Every human study located measured hormone levels or serum proteins. | D | C01, C02, C03, C05, C09 | Humans, by absence | Yes | Pair this with BLEND-A-01 wherever that appears. Raising a hormone is a biomarker observation. It is not a demonstrated benefit. |
| BLEND-A-06 | In rats, human GRF(1-29) albumin bioconjugates were reported to activate the GRF receptor on the anterior pituitary, and that work identified CJC-1295 as a long-lasting GRF analogue. | D | C09 | Rats | Yes, with the species in the same sentence | The originating characterisation of the albumin-bioconjugate design. |
| BLEND-A-07 | In a genetically GHRH-deficient knockout mouse, repeated administration of CJC-1295 was reported to normalise growth. | D | C09 | Mice, genetically GHRH-deficient | Yes, with the model in the same sentence | A hormone-deficient animal is not a model of a healthy adult human. State that alongside the finding. |
| BLEND-A-08 | Analytical methods were developed to confirm CJC-1295 in equine plasma and to screen for CJC-1295 and other GHRH analogues, prompted by veterinary and equine misuse. | D | C09 | Horses | Yes, with the purpose stated | Detection methodology papers. They carry no efficacy or safety finding and exist here only to document that misuse prompted assay development. |

---

## Section 4. Ipamorelin component evidence

**Every row in this section is about the other ingredient studied alone. None of it is evidence about
the blend either.**

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| BLEND-B-01 | The only published human efficacy trial of ipamorelin, a Phase 2 proof-of-concept randomised, double-blind, placebo-controlled study in adults undergoing bowel resection, did not meet its primary endpoint. Median time to first tolerated meal was approximately 25 hours with ipamorelin against 33 hours with placebo, which was not statistically significant. No advantage was reported on secondary outcomes either. | C | I04 | Adults undergoing small and large bowel resection, 117 enrolled and 114 analysed | Yes, with the full arc | A negative trial. It is also the only published human efficacy trial of this compound and it studied a gastrointestinal motility endpoint, not any outcome the blend is marketed for. Treatment-emergent adverse events were high in both arms, consistent with a post-surgical population rather than a drug effect. |
| BLEND-B-02 | The largest human trial of ipamorelin, a 320-participant Phase 2 dose-finding study that completed in May 2014, has never posted results and no corresponding publication was located. | D | I02 | 320 participants following bowel resection | Yes | State it as a gap and stop there. Non-publication after a completed trial in a subsequently discontinued programme is more consistent with a null or unfavourable result than a favourable one, but that is an inference and is not established. It must never be cited as evidence that the compound works. |
| BLEND-B-03 | In healthy male subjects, ipamorelin was reported to produce a measurable, transient episodic rise in circulating growth hormone that peaked and then declined, with between-individual variability in the growth hormone response larger than variability in how the body handled the compound. | C | I05 | Healthy male subjects | Yes, with the biomarker framing | A pharmacology study measuring no clinical endpoint of any kind. It establishes that the compound transiently raises a hormone in healthy men. Nothing more. |
| BLEND-B-04 | Ipamorelin development was discontinued. It was taken into Phase 2 by a sponsor for postoperative ileus, not for body composition or aging, the published trial failed, the larger trial went unreported, and no approval exists in any jurisdiction identified. | D | I01, I02, I04 | Not applicable, programme history | Yes | The full arc must travel together. Citing "Phase 2 trials" as reassurance while omitting that the programme was abandoned inverts the meaning of the evidence. See CONTRADICTIONS.md entry X-03. |
| BLEND-B-05 | In primary rat pituitary cells, in anesthetized rats, and in conscious swine, ipamorelin was reported to release growth hormone with potency and efficacy comparable to GHRP-6, without releasing ACTH or cortisol at levels significantly different from those following GHRH stimulation, and no secretagogue tested affected FSH, LH, prolactin, or TSH. | D | I07 | Rat cells, rats, and swine | Yes, only with all three models named in the same sentence | This 1998 animal study is the origin of the entire selectivity claim. It is well conducted and it is preclinical. See BLEND-M-03 and BLEND-X-06. |
| BLEND-B-06 | Four further preclinical records exist for ipamorelin, covering longitudinal bone growth in rats, cisplatin-induced weight loss in ferrets, gastric dysmotility in a rodent model of postoperative ileus, and the hypothalamic-pituitary-testicular axis in a cichlid fish. | D | I08 | Rats, ferrets, rodents, and fish | Yes, as a literature map only | Title level only. Abstracts were not read, so no finding rests on them. The rodent ileus work is worth noting as an illustration of preclinical promise that did not translate: it preceded the human ileus trials, which failed. |
| BLEND-B-07 | No human trial of ipamorelin examining body composition, lean mass, fat loss, strength, recovery, sleep quality, injury healing, skin, or aging was located. | D | I01, I04, I05, I08 | Humans, by absence | Yes | The entire consumer use case is unstudied for this component. Pair with BLEND-A-05, which says the same for the other component. |

---

## Section 5. Proposed mechanism

Everything in this section is proposed. The receptor pharmacology is real and the effect inference
is not.

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| BLEND-M-01 | Both components are growth hormone secretagogues, meaning each is proposed to stimulate the pituitary to release the body's own growth hormone rather than supplying growth hormone directly. They are proposed to do so through two different receptors. | D | C06, I07 | Not applicable | Yes | State this as class chemistry. It is the correct framing and it is also the exact point where a reader will start doing arithmetic on their own. BLEND-C-03 must sit immediately alongside it. |
| BLEND-M-02 | The additive rationale for the pairing, that stimulating two different receptors on the same axis produces a larger or more sustained growth hormone response than either alone, is a hypothesis. It has not been tested for this combination in anything located. | G | Absence at BLEND-C-01 | Humans, unstudied | Yes, only as a named hypothesis | **Never write this as a mechanism the product uses.** Write it as the reason people give for combining them, immediately followed by the fact that nobody has checked. Combining two agents acting on one axis could also produce redundancy, tolerance, or an interaction nobody has characterised. |
| BLEND-M-03 | The selectivity attributed to ipamorelin, that it raises growth hormone without raising cortisol, ACTH, or prolactin, traces to a single 1998 study in rat pituitary cells, anesthetized rats, and conscious swine. No human study located tested selectivity against those hormones. | D | I07 | Rat cells, rats, swine | Yes, with the models named | The consumer claim reports an animal result as though it were a human clinical property. Describe selectivity as a preclinical characteristic not confirmed by an equivalent human study. Whether it holds with repeated rather than single exposure is also unstudied. |
| BLEND-M-04 | The second proposed mechanism for ipamorelin, from the abandoned development programme, was that as a ghrelin mimetic it would stimulate gastrointestinal motility. That hypothesis was tested in humans and the trial did not meet its primary endpoint. | C | I04 | Adults undergoing bowel resection | Yes | Include it. It is the one case where a proposed mechanism for either component was actually put to a human test, and the result was negative. That is informative about how much weight a mechanism argument deserves. |

---

## Section 6. Safety

No safety claim in this section is a reassurance, and none is a prediction of harm. Several describe
concerns that are mechanism-based rather than observed, and each says so.

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| BLEND-S-01 | The primary safety finding for this combination is that no safety data for the combination exists. Nothing about the safety of these two compounds administered together can be concluded in either direction. | G | Absence at BLEND-C-01 | Humans, by absence | Yes | Must appear before any other safety line in any file. A member who reads component tolerability statements without this line first will draw exactly the wrong conclusion. |
| BLEND-S-02 | There is no long-term safety data for either component. For CJC-1295 the longest human exposure identified was a 49-day Phase 1 trial. For ipamorelin every human exposure retrieved was short-term, being a single-administration pharmacology study, an in-hospital post-surgical course, and analytical detection work. | D | C01, C06, I04, I05, I06 | Humans | Yes | A 2026 peer-reviewed review states plainly that no long-term safety data is available for either CJC-1295 form. The component record calls that the single most important safety statement in it. |
| BLEND-S-03 | Sustained stimulation of the growth hormone and IGF-1 axis raises a theoretical question about effects on cell growth. A 2026 peer-reviewed review flags this while stating explicitly that there is no established clinical carcinogenic signal. | D | C06 | Humans, theoretical | Yes, with both halves in the same passage | Mechanism-based concern, not observed harm. Neither alarm nor reassurance is supported. Both halves of the sentence must always travel together. Note that both components stimulate the same axis, which is a reason the question is at least as live for a blend, and that is reasoning rather than data. |
| BLEND-S-04 | Effects on glucose handling and fluid retention are described in a 2026 peer-reviewed review as theoretically plausible through activation of this hormonal axis, while the same review states they lack direct peer-reviewed documentation specifically for CJC-1295 products. | D | C06 | Humans, undocumented | Yes, with the qualifier attached | Recorded precisely so the Guide does not overstate these as observed effects. The ipamorelin record contains a parallel class-level concern that is explicitly flagged as background knowledge, not a retrieved source. See BLEND-S-09. |
| BLEND-S-05 | Injectable peptides carry a recognised risk of immune reactions. According to investigative reporting of the agency's review, the United States Food and Drug Administration cited that concern, ranging from mild rashes to life-threatening anaphylaxis, as part of the basis for restricting ipamorelin in 2023. | D | I12 | Humans, class-level | Yes, attributed as reported | This is a class-level concern about injectable peptides, not an ipamorelin-specific adverse event series. It is secondary reporting because fda.gov was unreachable. Naming the route here is permitted because it identifies the category of risk, not a method. |
| BLEND-S-06 | Investigative reporting states that in the ipamorelin studies the agency examined, subjects experienced adverse events including death, while noting that causation was not definitively proven. | G | I12 | Adults in post-surgical bowel resection trials | Yes, only with the full context in the same passage | **The most easily mishandled row in this table.** The context is mandatory in both directions: those trials enrolled post-surgical bowel resection patients, a population with meaningful baseline mortality independent of any study drug. This is a flag that the agency considered the safety database inadequate. It is not a demonstration that the compound killed anyone. Presenting it without context misleads whichever way it is cut. Secondary source. |
| BLEND-S-07 | According to secondary reporting, the agency concluded that available data were insufficient to resolve known safety concerns for ipamorelin and recommended against its inclusion on the compounding bulks list. The advisory committee agreed and voted against inclusion on October 29, 2024. | D | I12, I13 | Not applicable, regulatory finding | Yes | Insufficient evidence of safety is a distinct finding from evidence of harm. State it as such and do not soften it in either direction. Vote counts were not available. |
| BLEND-S-08 | A reported death of a trial subject during CJC-1295 Phase II development. | G | C13 | Not applicable | No | [UNVERIFIED - tertiary source, requires human source check before any member-facing use] It appears only in an encyclopedia entry, which also reports that the attending physician attributed it to pre-existing coronary artery disease unrelated to treatment. It is consistent with, but not established by, the verified fact that the Phase 2 trial was terminated with no posted results and no stated reason. It may not be published as fact and may not be published as debunked. |
| BLEND-S-09 | General class-level concerns for growth hormone secretagogues regarding glucose metabolism, insulin sensitivity, joint symptoms, and occult malignancy. | G | None retrieved | Humans | No | [UNVERIFIED - background knowledge, requires human source check] No retrieved source documented any of these specifically for ipamorelin. A human reviewer must source this or delete it. Do not publish. |
| BLEND-S-10 | Reported vasodilatory reactions and tachycardia attributed to a regulatory listing rationale for CJC-1295. | G | C06 | Humans | No | [UNVERIFIED at primary source] Reported secondhand by a peer-reviewed review as the rationale for a listing whose underlying document could not be retrieved. Requires primary confirmation before any member-facing use. |
| BLEND-S-11 | Both components are prohibited in sport. GHRH analogues including CJC-1295 are prohibited at all times rather than in competition only, and growth hormone releasing peptides including ipamorelin are on the World Anti-Doping Agency Prohibited List, with ipamorelin metabolites detectable in human urine in doping control. | D | C07, I06 | Tested athletes | Yes, with the referral | Both statements rest on peer-reviewed anti-doping papers referencing the List, not on the List document, which could not be retrieved for either compound. The current section number and verbatim wording are unconfirmed. Direct athletes to their own anti-doping authority and publish no section number. |
| BLEND-S-12 | Applying safety reassurance derived from the CJC-1295 DAC trials to a product containing the form without that group applies findings to a molecule they were never collected on. | D | C06 | Humans | Yes | The component record identifies this misattribution as itself a safety issue rather than a labelling one. Say so. |

---

## Section 7. Quality and supply

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| BLEND-Q-01 | The composition and ingredient ratio of the Xenios product are not confirmed, and no supplier documentation has been reviewed. | G | None | Not applicable | Yes | Duplicate of BLEND-I-02, repeated here because the quality document is where a reviewer will look for it. First open supplier question. |
| BLEND-Q-02 | CJC-1295 has been identified by mass spectrometry in an unlabelled illicit pharmaceutical preparation of unknown origin submitted by police and customs authorities. The product's contents were unknown until analysed. | D | C08 | Not applicable, seized product analysis | Yes, with the date noted | Direct documentation that this compound circulates in unlabelled, unregulated form. The study is 16 years old, so present it as documentation that the problem exists rather than as a current market measurement. |
| BLEND-Q-03 | A 2026 peer-reviewed review states that real-world use of these compounds is complicated by quality-control uncertainty and compositional variability characteristic of unregulated peptide supply chains, and notes this is especially acute for agents lacking any human validation. | D | C06 | Not applicable, supply-channel evidence | Yes | Attribute to the review. Note that the form of CJC-1295 without the albumin-binding group is one of the agents lacking human validation. |
| BLEND-Q-04 | In an analytical quality-control study of commercially obtained synthetic peptides, one of five products examined was found to be a totally different peptide than labelled, and two thirds of the others had insufficient quality by the study's stated purity and impurity criteria. | D | I09 | Not applicable, supply-channel evidence | Yes, only with the explicit statement that neither component was tested | Analogue evidence about the synthetic peptide supply chain generally. **That study tested a different peptide.** Never extend it into a numeric claim about either component or about blend vials. |
| BLEND-Q-05 | Counterfeit and illegal injectable peptide preparations are a recognised enforcement problem in Europe, sufficient that controlling agencies developed a dedicated screening method covering 25 peptides already detected in seized illegal and counterfeit products. | D | I10 | Not applicable, supply-channel evidence | Yes, with the limitation stated | The retrieved abstract did not confirm whether either component was among those 25 peptides. Do not imply that it did. |
| BLEND-Q-06 | No independent analytical study of any marketed product containing both compounds was located, and no published purity or identity survey of consumer products labelled as either component was located. | G | Absence, documented in SOURCE_REGISTRY.md section E | Not applicable | Yes | State it as a gap. Nobody appears to have checked. That is not a clean bill of health. |
| BLEND-Q-07 | A blend raises a quality question a single-ingredient product does not: whether each component is present, identifiable, and quantified separately, and whether the mixture is uniform from vial to vial and within a vial. | G | None. This is a requirement, not a finding | Not applicable | Yes | Frame as the standard a supplier would have to meet. It is unmet. See QUALITY_AND_DOCUMENTATION.md sections A and B. |

---

## Section 8. Regulatory

Every regulatory row carries a jurisdiction, a date, and a source. Full statements are in
REGULATORY_STATUS.md, reviewed 2026-07-21.

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| BLEND-R-01 | Neither component is an approved drug product in the United States, checked 2026-07-19. No approval or marketing authorisation was identified for either compound in any jurisdiction during research. | D | C05, C06, I01 | Not applicable | Yes | No product containing both is approved anywhere either, which follows and should be said explicitly rather than left to inference. |
| BLEND-R-02 | A Federal Register notice announced an advisory committee meeting on December 4, 2024 at which five CJC-1295 forms were being considered for inclusion on the compounding bulk substances list. The notice records that they were being considered and does not state the agency's recommendation. The outcome of that meeting could not be verified. | D | C10 | Not applicable | Yes | Primary government source, verified. State no outcome. Anyone updating this must read the actual record rather than a summary of it. |
| BLEND-R-03 | At an advisory committee meeting on October 29, 2024 the committee voted against adding ipamorelin to the compounding bulk substances list, and the agency had recommended against inclusion. | D | I13 | Not applicable | Yes | Secondary trade association reporting. Vote counts unavailable. An advisory committee recommendation is advisory and is not a final agency determination. |
| BLEND-R-04 | Removal of a substance from the safety-risk category does not authorise compounding. A legal-practice analysis states that removed substances remain unlawful for compounding until their formal addition to the bulks list, which requires completion of formal rulemaking. | D | I14 | Not applicable | Yes | This distinction is widely misread in commercial material and materially misleads readers about legality. Make it explicitly or not at all. |
| BLEND-R-05 | The Federal Register notice announcing the July 23 to 24, 2026 advisory committee meeting lists BPC-157, KPV, TB-500, MOTS-C, DSIP, Semax and Epitalon. Neither CJC-1295 nor ipamorelin appears on that agenda. | D | C12, I14 | Not applicable | Yes | Verified on a primary government source. It refutes vendor claims that either compound is pending review at that meeting. |
| BLEND-R-06 | The current definitive compounding status of CJC-1295 could not be established. Vendor accounts of category removal offer two mutually inconsistent dates, and the agency's own pages were unreachable throughout research. | G | C06, C10, C11, C12 | Not applicable | Yes, stated as unresolved | Do not state a current status. Mutually inconsistent vendor dates are themselves a reason to distrust them. See CONTRADICTIONS.md entry X-01. |
| BLEND-R-07 | A January 2025 final guidance ended the categorisation of bulk drug substances into Categories 1, 2, and 3 for substances nominated on or after its publication date. The notice does not mention either component by name and does not by itself establish either compound's status. | D | C11 | Not applicable | Yes | Readers encountering category language should treat it as possibly describing a superseded framework. State the limitation with the fact. |
| BLEND-R-08 | Reported political pressure on the agency regarding peptide accessibility as of April 2026. | G | I12 | Not applicable | Yes, only as reported context | Reported policy pressure does not by itself change the legal status of anything. Label it as context, never as a status. |

---

## Section 9. Unknowns

All graded G or D because they are statements about what the record does not contain.

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| BLEND-U-01 | Everything about the combination. No study of the pair exists, so its effects, its safety, its interaction profile, and its behaviour over time are all unknown. | G | Absence at BLEND-C-01 | Humans | Yes | |
| BLEND-U-02 | The exact composition and ratio of the Xenios product. | G | None | Not applicable | Yes | First open supplier question. |
| BLEND-U-03 | Which CJC-1295 molecule any given product contains, the albumin-binding form or the form without that group. | G | C06 | Not applicable | Yes | |
| BLEND-U-04 | Whether raising growth hormone and IGF-1 with either compound produces any clinical benefit in healthy adults. No human study of either component measured body composition, strength, sleep, recovery, injury healing, cognition, or any longevity endpoint. | D | C05, C09, I01, I04, I05 | Healthy adults | Yes | |
| BLEND-U-05 | Anything at all about modified GRF(1-29) in humans. A 2026 review states no controlled clinical studies have directly evaluated it. Its pharmacokinetics, safety, and effect in humans are all unknown. | G | C06 | Humans | Yes | |
| BLEND-U-06 | What the 320-participant ipamorelin trial found. It completed in May 2014 and its results have never been posted. | D | I02 | 320 post-surgical participants | Yes | The largest human dataset on that component is effectively missing from the public record. |
| BLEND-U-07 | Why the CJC-1295 Phase 2 trial was terminated and what its 120 participants experienced. | D | C04 | 120 participants | Yes | |
| BLEND-U-08 | Long-term safety of either component, at any duration approaching typical consumer use. | D | C06, I01 | Humans | Yes | |
| BLEND-U-09 | Whether the preclinical selectivity of ipamorelin holds in humans, and whether it holds with repeated rather than single exposure. | D | I07 | Humans | Yes | |
| BLEND-U-10 | Whether tolerance, desensitisation, or diminishing response develops with continued exposure to either component, and whether it would differ for the two together. | D | C06, I07 | Humans | Yes | Not addressed in any human study retrieved for either compound. |
| BLEND-U-11 | Effects on glucose metabolism and insulin sensitivity in humans for either component. | D | C06 | Humans | Yes | Theoretically plausible per a 2026 review, not directly documented for these products. |
| BLEND-U-12 | Safety in anyone with a history of malignancy, given that stimulation of this axis is theoretically relevant to cell growth. | D | C06 | People with that history | Yes | Completely unstudied for either compound. |
| BLEND-U-13 | Effects in women. The two mechanistic human studies of CJC-1295 enrolled men only, the third did not report a sex breakdown in the retrieved abstract, and the ipamorelin human pharmacology study enrolled healthy male subjects. | D | C01, C02, C03, I05 | Women | Yes | |
| BLEND-U-14 | Interactions with any medicine or supplement, for either component or for the pair. No interaction data was located. | G | None located | Humans | Yes | |
| BLEND-U-15 | What is actually in any given product sold under either name, including which molecule and at what purity. | G | C06, C08 | Not applicable | Yes | |
| BLEND-U-16 | The current definitive compounding status of CJC-1295 in the United States. | G | C06, C10, C11 | Not applicable | Yes | |

---

## Section 10. PROHIBITED claims

These may not appear on any member-facing surface, in any form, hedged or otherwise. This section is
the most important part of the table. Several of these are actively circulating and would sound
reasonable to a careful reader.

| Claim ID | Prohibited claim | Why it is prohibited | Reviewer notes |
| --- | --- | --- | --- |
| BLEND-X-01 | Any statement, implication, or layout suggesting that the combination is supported by evidence, including "clinically studied", "evidence-based", "research-backed", "well-studied pairing", or "the most researched blend". | No study of the combination exists. Evidence for the parts is not evidence for the whole, because the whole has its own pharmacology and its own unmeasured interactions. | This includes structural implication. Component evidence placed under a blend heading, or a component citation footnoting a sentence about the blend, violates this row even if every individual word is true. |
| BLEND-X-02 | Any statement that the two components work synergistically, that their effects add, or that the pairing produces a greater or more sustained response than either alone. | Untested for this pair. Synergy, additivity, redundancy, and interference are all possible and none has been measured. | The receptor argument may be described as the stated rationale for combining them. It may never be described as what the product does. |
| BLEND-X-03 | Any statement or implication of a ratio, proportion, or relative amount of the two ingredients. | The composition of the Xenios product is not confirmed and no supplier document has been reviewed. | Includes approximations, ranges, and phrases such as "typically formulated as". If a supplier document later establishes a ratio it enters at grade E and is not stated as fact. |
| BLEND-X-04 | Any presentation of the CJC-1295 with DAC human trial data as evidence about a product containing the form without that group, or the reverse. | These are two different molecules sharing one commercial name. The component record treats this transfer as a safety issue, not a labelling one. | Every vendor page encountered during research did exactly this. Check every CJC-1295 citation for which molecule it studied before it is used. |
| BLEND-X-05 | Any half-life, onset, duration, or pharmacokinetic figure for modified GRF(1-29). | No such figure was confirmed by any peer-reviewed or regulatory source. The figures in circulation appeared only in vendor marketing. | The verified half-life of 5.8 to 8.1 days belongs to the DAC form and must always be labelled as such. |
| BLEND-X-06 | Any statement that ipamorelin is selective in humans, or that it does not raise cortisol or prolactin in people. | The selectivity finding is preclinical, from a 1998 study in rat pituitary cells, anesthetized rats, and swine. No human study located tested it. | The consumer claim reports an animal result as a human clinical property. This is the compound's main selling point and the most repeated error about it. |
| BLEND-X-07 | Any citation of ipamorelin's Phase 1 and Phase 2 history as reassurance, without stating that the published efficacy trial failed its primary endpoint, that the largest trial never reported, that the indication studied was unrelated to consumer use, and that development was discontinued. | Citing the trials while omitting the outcome inverts the meaning of the evidence. | Both halves or neither. The full arc is set out at BLEND-B-04. |
| BLEND-X-08 | Any statement that either component, or the blend, is safe, well tolerated, or free of side effects. | No long-term safety data exists for either component, none at all exists for the combination, and one regulator concluded that available data were insufficient to resolve known safety concerns for one of them. | Includes softened forms such as "generally considered safe", "no reported side effects", and "has a good safety profile". The tolerability language in the 2006 CJC-1295 Phase 1 abstract belongs to that study and may not be generalised. |
| BLEND-X-09 | Any statement that either compound improves body composition, builds muscle, burns fat, improves sleep, speeds recovery, heals injuries, or slows aging in people. | No human trial of either component measured any of these. The entire consumer use case is unstudied for both. | The underlying argument is always "it raises growth hormone, and growth hormone does things". That is a biomarker argument, not evidence of benefit. Name it and reject it. |
| BLEND-X-10 | Any use of "will", "proven to", "restores", "cures", "eliminates", or "reverses" in connection with either component or the blend. | Guaranteed outcome language. Nothing about either compound is proven in people, and nothing at all is known about the pair. | Applies to headings, metadata, captions, and alt text as well as body text. |
| BLEND-X-11 | Any statement of the reported CJC-1295 Phase II trial subject death as established fact, and equally any statement that it has been disproved. | It appears only in a tertiary encyclopedia source and was not confirmed by any primary source. It is consistent with, but not established by, the verified termination of the Phase 2 trial. | Both directions are prohibited. If the account is raised, the correct response is that it is unverified and that a human must check it against a primary record. |
| BLEND-X-12 | Any statement of a current compounding status for CJC-1295, and any statement that either compound is pending review at the July 2026 advisory committee meeting. | The current status is unresolved and the agency's pages were unreachable. The July 2026 agenda is verified on a primary government source and neither compound is on it. | The two vendor removal dates in circulation, September 2024 and April 2026, are mutually inconsistent, which is itself grounds to distrust both. |
| BLEND-X-13 | Any statement that removal from a safety-risk category means a substance is cleared, legal, or approved for compounding. | A legal-practice analysis states that substances remain unlawful for compounding until formal addition to the bulks list. | A widespread and consequential misreading in commercial material. |
| BLEND-X-14 | Any implication that the peptide supply-channel quality studies tested either component, or any purity figure for either compound derived from them. | Those studies tested different peptides. They are evidence about the channel only. | Always name the tested compound and state that neither component was tested. |
| BLEND-X-15 | Any dose, amount, concentration, frequency, timing, cycle, titration, loading, stacking, sequencing, reconstitution instruction, injection technique, or route of administration. | Category rule for all Xenios Research Guides. | Where a reader would expect this, write: Dosing and administration information is intentionally excluded from Xenios Research Guides. Naming a route in order to state that evidence is absent is permitted. |
| BLEND-X-16 | Any acquisition guidance, vendor recommendation, sourcing advice, or "research use only" framing that implies human benefit. | Xenios does not sell these compounds and does not tell anyone how to obtain them. | Applies to links, captions, and footnotes as well as body text. |
| BLEND-X-17 | Publication of the reported ipamorelin registry number, or of the reported amino acid substitution positions for modified GRF(1-29). | Both are background knowledge or vendor-sourced and neither was confirmed against a primary source. | [UNVERIFIED - requires human source check] A wrong identifier undermines confidence in everything else on the page. |
| BLEND-X-18 | Any claim graded G presented to a member as though it were a finding, and any claim about the combination presented at any grade above G. | There is no study of the combination, so no combination claim can rise above unverified. | If a future editor believes a combination claim deserves a higher grade, the only thing that can justify it is a retrieved study of the combination, added to SOURCE_REGISTRY.md first. |

---

## Reviewer sign-off checklist for this table

1. Section 1 contains no effect claims, and its emptiness is presented as the finding.
2. No component finding appears anywhere in a position, heading, or sentence that could be read as
   support for the combination.
3. No ratio, proportion, or relative amount appears anywhere.
4. Every CJC-1295 claim states which molecule it applies to, the albumin-binding form or the form
   without it.
5. Every preclinical claim names its species or model in the same sentence as the finding.
6. No sentence contains a dose, amount, frequency, timing, route, or preparation detail.
7. Every regulatory claim carries a jurisdiction, a date, and a source.
8. Every claim graded G or marked [UNVERIFIED] has been closed by a human check or removed.
9. No citation appears that is absent from SOURCE_REGISTRY.md, and no identifier was added from
   memory.
10. Every source's verified flag matches the component research record it came from.
