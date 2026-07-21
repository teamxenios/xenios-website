---
title: Selank Claim Table
type: research-guide-claim-table
compound: selank
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# Selank Claim Table

One row per discrete claim. Grades apply to individual claims, never to the compound as a whole.
Source ids refer to SOURCE_REGISTRY.md.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## The headline findings

There are two, and they pull in different directions.

**First, human evidence genuinely exists.** Three clinical trials were located, enrolling
approximately 192 patients in total (62, 60, and 70), plus one immunological patient study whose
sample size was not stated. Writing an empty human evidence table for Selank would be inaccurate.
But the evidence is small and, more importantly, it is **not independent**. All four human records
come from an overlapping Russian institutional author network that includes the compound's
originators, three of the four appeared in a single Russian journal, none was pre-registered, no
placebo-controlled trial exists, and only abstracts were readable. Independence, not sample size,
is the binding weakness.

**Second, the regulatory claim repeated on essentially every commercial page appears to be false
as of January 2026.** Two independent Russian trade outlets report that the Russian Ministry of
Health cancelled the registration of the Peptogen Semax and Selank products and excluded selank as
a substance from the State Register of Medicines, at the request of the registration certificate
holders. No current marketing authorisation was identified in any jurisdiction. The Guide must not
describe Selank as a currently approved medicine anywhere.

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

Grade C is the ceiling in this table. No claim is graded A or B, for five specific reasons: no
placebo-controlled trial, no independent replication, zero trial registrations, no systematic
review, and abstract-only retrieval of every human paper.

## Section 1. Human evidence

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| SEL-H-00 | Human trials of Selank exist, and they are small and not independent. Three trials totalling approximately 192 patients were located, all published in Russian between 2008 and 2015, all from an overlapping Russian institutional author network that includes the compound's originators. | C | S03, S04, S05, S06 | Adults with anxiety disorders | Yes | This line must precede every other human evidence line. A member who reads only one sentence about the human data should read this one. |
| SEL-H-01 | In a 2008 comparative study of 62 adults with generalised anxiety disorder and neurasthenia, 30 of whom received selank and 32 the benzodiazepine medazepam, the anxiolytic effects of the two were reported to be similar, with selank additionally reported to have antiasthenic and psychostimulant effects. | C | S04 | 62 adults, Russia | Yes, with the non-independence caveat attached | Indexed by PubMed as a randomized controlled trial, but the abstract does not describe randomisation method, blinding, or allocation concealment, and no effect sizes or confidence intervals were retrievable. Authors include Zozulya, Neznamov, and Siuniakov, the Russian network that developed the compound. Never write this as equivalence to benzodiazepines in general. |
| SEL-H-02 | In a 2014 comparative trial of 60 patients with anxiety disorders, selank was compared with the benzodiazepine phenazepam and was reported to show pronounced anxiolytic and mild nootropic effects, with the anxiolytic effect described as lasting for a week after the last administration and a reported positive impact on quality of life. | C | S05 | 60 patients, Russia | Yes, with the non-independence caveat attached | Not indexed as a randomized controlled trial. Medvedev and Tereshchenko group, overlapping with the other human reports. No numeric outcomes, variance, dropout, or adverse-event data were obtained. The duration statement is the study's report, not a demonstrated pharmacological property. |
| SEL-H-03 | In a 2015 randomised trial of 70 patients with anxiety disorders, 30 receiving phenazepam alone and 40 receiving phenazepam plus selank, the combined treatment was reported to decrease the level of undesirable side effects of phenazepam, with a reported positive impact on quality of life. | C | S06 | 70 patients, Russia | Yes, only with the add-on framing stated | Critical framing. This is an add-on and benzodiazepine-sparing question, NOT a demonstration of standalone anxiolytic efficacy, and there was no placebo arm. Citing it as evidence that Selank works on its own misreads the design. |
| SEL-H-04 | In a 2008 study of patients with anxiety-asthenic disorders combining laboratory work with patient observations, selank was reported to have cytokine-regulating effects, and in vitro to suppress interleukin-6 gene expression by peripheral blood cells of patients with depression but not of healthy controls. | C | S07 | Patients with anxiety-asthenic disorders, sample size not stated | Yes, with the sample-size caveat in the same sentence | This is an immunological mechanism study, not an anxiolytic efficacy trial, and it reports no anxiety outcome. The sample size was not stated in the retrieved abstract, so the study cannot be weighted. Myasoedov, credited with originating the compound, is among the authors. |
| SEL-H-05 | There are zero registered Selank trials on ClinicalTrials.gov. A query on selank as an intervention returned two records and a query on selank as a general term returned ten, and every returned record was an unrelated false positive from fuzzy matching. | C | S13, S14 | Not applicable, this is a statement about the registry | Yes | Consequence: the Russian trials were not pre-registered in the international registry, so pre-specified endpoints cannot be checked and selective outcome reporting cannot be excluded. State that consequence, not just the count. |
| SEL-H-06 | No placebo-controlled trial of Selank was retrieved anywhere in the literature. | C | S01, S02, S03 | Not applicable | Yes | This matters specifically for anxiety, where symptoms fluctuate and resolve naturally and where expectancy effects are large. Without a placebo arm the trials cannot separate drug effect from either. |
| SEL-H-07 | No human safety dataset was retrieved. None of the four human records yielded adverse event tables, dropout counts, laboratory monitoring, or long-term follow-up in the abstracts available. | C | S03 | Humans, by absence | Yes | Pair with SEL-S-01 every time. This is an absence of retrieved evidence, not evidence of safety. |
| SEL-H-08 | No human pharmacokinetic study of Selank was retrieved, so whether meaningful systemic or central exposure is achieved in a person is not established. | G | None located | Humans | Yes | Phrase without naming any route as instruction. Naming a route to say evidence is absent for it is permitted, naming one as guidance is not. |
| SEL-H-09 | No systematic review or meta-analysis of Selank was located, so there is no evidence-synthesis layer above the primary studies. | C | S01 | Not applicable | Yes | Worth stating plainly. For most compounds with a real trial base, a review layer exists. Here it does not. |
| SEL-H-10 | A raw PubMed count overstates the Selank evidence base. A filtered search restricted to trial and review publication types returned six records, of which three have nothing to do with Selank. | C | S02 | Not applicable | Yes | The three false positives concern strength training periodisation, lithium augmentation in depression, and anaesthesia and circulating blood volume. Anyone citing the raw count is counting papers that are not about this compound. |

## Section 2. Identity and characterisation

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| SEL-I-01 | Selank is a synthetic peptide developed at the Institute of Molecular Genetics of the Russian Academy of Sciences, and it appears in the FDA Global Substance Registration System as both SELANK and SELANK DIACETATE. | G | S18 context, GSRS records located but not rendered | Not applicable, chemical identity | Yes, with the caveat that the registry records did not render | The GSRS listing is what confirms Selank is a recognised discrete substance rather than a vendor coinage. The records were located but returned no usable content when fetched, so this is graded G pending a human check. The existence of two entries also means the single name Selank does not by itself pin down which material is in a given product. |
| SEL-I-02 | Reported amino acid sequence, and the description of Selank as tuftsin extended at one end with three further residues. | G | None retrieved | Not applicable | No | [UNVERIFIED - background knowledge, requires human source check] The sequence and the tuftsin-derivation description appeared this session only in vendor and blog sources. The FDA GSRS substance records did not render, so nothing is independently verified. Do not publish a sequence until a primary chemical registry entry is read. Note that one retrieved preclinical paper title does describe Selank as a peptide analog of tuftsin (S10), which is corroborating but is a title, not a chemical registry entry. |
| SEL-I-03 | Selank and Semax are distinct compounds. They are made by the same Russian manufacturer and were named together in the same January 2026 regulatory action, which is a shared regulatory fact and not shared evidence. | C | S15, S16 | Not applicable | Yes | Include this. Being named in the same news item is the most likely route by which Semax findings get imported into Selank claims. |

## Section 3. Proposed mechanism

Every claim in this section is proposed. All of the mechanistic work retrieved is in rodents or in
a cultured cell line, and none of it demonstrates that the mechanism operates at clinically
meaningful levels in a living human being. Mechanism is not efficacy.

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| SEL-M-01 | In IMR-32 human neuroblastoma cells studied in the laboratory, GABA, selank, and olanzapine were reported to affect the expression of genes involved in GABAergic neurotransmission. | D | S12 | Cultured human-derived cells, not people | Yes, only with the cell-culture context in the same sentence | Human-derived tissue in a dish is still preclinical. This is a gene-expression finding, not a demonstration of an effect on neurotransmission in a person. Never write it as a bare mechanism sentence. |
| SEL-M-02 | In rats under unpredictable chronic mild stress conditions, selank was reported to enhance the anxiety-reducing effect of diazepam, a medicine that acts on the GABA system. | D | S08 | Rats | Yes, with "in rats" in the same sentence | This is the main animal support for a GABAergic proposal. It is also the reason the benzodiazepine co-administration question in SEL-S-03 exists. |
| SEL-M-03 | A human study of selank measured serum enkephalin activity alongside psychometric outcomes, which is why enkephalin-related involvement is among the proposed mechanisms. | C | S04 | 62 adults, Russia | Yes, phrased as what was measured, not as what was shown | Measuring a marker is not demonstrating a mechanism. The abstract yields no result values for enkephalin activity. |
| SEL-M-04 | A naloxone-blockade study in the retrieved PubMed set is cited as implicating opioid-system involvement in the anxiolytic effect. | G | PMID 17415472, not individually retrieved | Species or model not recorded | No | [UNVERIFIED - requires human source check] The research record names this study but does not record its species or model, and it was not individually retrieved. The house rule that every preclinical finding names its model in the same sentence cannot be satisfied, so this claim is excluded from member-facing text until a human reads the paper. |
| SEL-M-05 | Selank modulates GABAergic and serotonergic pathways. | PROHIBITED as written | See Section 7 | Claimed for humans | No | This is the standard vendor framing and it overstates certainty. It converts rodent and cell-line findings into a settled human mechanism. Permitted framing is that a GABAergic mechanism is proposed, with serotonergic and enkephalin-related involvement also proposed, supported by animal and cell work only. |

## Section 4. Preclinical findings

Every row names its species or model. None of it establishes an effect in a person.

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| SEL-P-01 | In rats under unpredictable chronic mild stress conditions, selank was reported to enhance the anxiety-reducing effect of diazepam. | D | S08 | Rats | Yes, with the species in the same sentence | Note the shape of this result. It is an enhancement of another drug's effect, not a standalone effect. |
| SEL-P-02 | In DBA/2 mice, selank was reported to inhibit ethanol-induced hyperlocomotion and the manifestation of behavioural sensitisation. | D | S09 | DBA/2 mice | Yes, with the strain and species in the same sentence | An alcohol-response model. Do not translate this into any statement about drinking in people. |
| SEL-P-03 | In rats in a morphine withdrawal model, selank was reported to attenuate aversive signs of withdrawal. | D | S10 | Rats | Yes, with the species in the same sentence | Do not present this as relevant to human opioid withdrawal treatment. It is a rat model and no human work of this kind was retrieved. |
| SEL-P-04 | In rats subjected to chronic foot-shock stress, selank was studied for its effect on morphological parameters of the liver. | D | S11 | Rats | Yes, with the species and the no-direction caveat in the same sentence | The direction of effect was NOT retrievable from the title and summary obtained. State that the direction is unknown. Do not describe this as a protective finding or as a harm signal. Either would be invention. |
| SEL-P-05 | The preclinical record for Selank is more substantial than the human record and points at GABAergic mechanisms, and it consists of rat models, DBA/2 mice, and a human neuroblastoma cell line. | D | S08, S09, S10, S11, S12 | Rats, mice, cultured human-derived cells | Yes | This inversion is worth naming for a member. The animal case is stronger than the human case, which is the opposite of what a commercial page implies. |

## Section 5. Safety signals

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| SEL-S-01 | No human safety dataset for Selank was retrieved. This is an absence of retrieved evidence and not evidence of safety. | C | S03 | Humans, by absence | Yes | Must appear before any other safety line. No adverse event tables, no dropout counts, no laboratory monitoring, and no long-term follow-up were present in the abstracts retrieved, and no pharmacovigilance database, FDA adverse event data, or post-marketing surveillance data was located. |
| SEL-S-02 | Selank has been studied alongside benzodiazepines rather than separately from them, which makes co-administration with sedative and hypnotic medicines an open interaction question rather than a characterised profile. | C | S06, S08 | 70 patients in the add-on trial, plus rats | Yes | One of the three human trials studied selank added to phenazepam, and one rat study combined selank with diazepam. Combination with sedative-hypnotics is a recognised interaction context that has not been characterised outside these small studies. |
| SEL-S-03 | Because no human pharmacokinetic data and no long-term human follow-up were retrieved, duration of effect, accumulation, and consequences of sustained use in a person cannot be described. | G | None located | Humans | Yes | Follows from SEL-H-08. Phrase without reference to amounts, frequency, or duration of use. |
| SEL-S-04 | Product-level oversight changed in January 2026. The Russian registration was cancelled and the substance excluded from the State Register of Medicines, so any safety monitoring that existed under that registration no longer applies to material obtained outside a regulated supply chain. | C | S15, S16 | Not applicable | Yes | This is a real and specific consequence of the regulatory finding, and it is the practical reason the regulatory change matters to a reader rather than being trivia. |
| SEL-S-05 | Behaviour in specific populations is unstudied, including pregnancy, breastfeeding, children, older adults, and people with other medical or psychiatric conditions. No data of any kind was located for any of these groups. | G | None located | Those populations | Yes | |
| SEL-S-06 | No study testing material sold as Selank for identity, purity, sterility, or endotoxin content was located. | G | None located | Not applicable | Yes | State it as a gap. Nobody appears to have checked. It is not a clean bill of health. |

## Section 6. Unknowns

Presented to members as an explicit list rather than left as silence.

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| SEL-U-01 | Whether any placebo-controlled trial of Selank has ever been conducted in humans is unknown. None was retrieved. | C | S01, S02, S03 | Humans | Yes | |
| SEL-U-02 | The Russian registration certificate number, the original registration date, and the precise date the January 2026 cancellation took legal effect are not established. Neither the state registry nor the manufacturer published them in the sources readable for this Guide. | G | S15, S16, S17 | Not applicable | Yes | The manufacturer's own product page lists indications but no certificate number and no registration date. |
| SEL-U-03 | Whether the January 2026 Russian deregistration was purely commercial or administrative, or had any undisclosed safety or quality driver, is unknown. The reported reason is a request from the registration certificate holders, and no safety rationale was reported. | C | S15, S16 | Not applicable | Yes | Do not speculate in either direction. Report the stated reason and mark the rest unknown. |
| SEL-U-04 | Whether Selank appears on the WADA Prohibited List, or falls under its non-approved substances category, is not established. | G | S19 | Tested athletes | Yes, with a referral to the athlete's own anti-doping authority | Both WADA fetches returned empty content. Note additionally that the non-approved substances category does not list substances by name, so the absence of the word Selank from the list would not settle the question in either direction. |
| SEL-U-05 | Selank's status on the FDA 503A bulk drug substances lists is not established from primary text. Search summaries indicate it was not nominated for inclusion, but FDA primary documents could not be read. | G | S18 | Not applicable | Yes, only with the retrieval-failure caveat | Every direct fetch to www.fda.gov returned HTTP 404 to this retrieval path. |
| SEL-U-06 | Human pharmacokinetics are uncharacterised, including whether meaningful systemic or central exposure is achieved in a person. | G | None located | Humans | Yes | Do not name routes as guidance. |
| SEL-U-07 | Long-term human safety data beyond short trial durations does not exist in anything retrieved. Trial durations appear short in the abstracts available. | C | S03 | Humans | Yes | |
| SEL-U-08 | Whether the proposed GABAergic and serotonergic mechanism operates in humans is unknown. The retrieved mechanistic work is in rodents and in a human neuroblastoma cell line, not in living people. | D | S08, S12 | Rodents and cultured cells | Yes | |
| SEL-U-09 | The verified amino acid sequence and the tuftsin-derivation claim are not confirmed from a primary chemical source. | G | None retrieved | Not applicable | Yes, as a stated gap | [UNVERIFIED - background knowledge, requires human source check] |
| SEL-U-10 | Adverse event rates, dropout rates, and tolerability data from the three human trials are unknown. They were not present in the retrieved abstracts. | C | S03 | Humans | Yes | Note the irony that a tolerability comparison is in the title of one of the trials while no tolerability numbers were retrievable. |
| SEL-U-11 | Whether Selank is legal to sell or possess in any given jurisdiction was not researched and varies. | G | None | Not applicable | Yes | Not approved is a different question from illegal to possess. Xenios does not give legal advice. |

## Section 7. PROHIBITED claims

These may not appear on any member-facing surface, in any form, hedged or otherwise. Several are
actively circulating and would be plausible to a reader.

| Claim ID | Prohibited claim | Why it is prohibited | Reviewer notes |
| --- | --- | --- | --- |
| SEL-X-01 | Any statement that Selank is currently an approved prescription medicine in Russia, or approved anywhere. | Two independent Russian trade outlets report that the registration of the Peptogen Selank product was cancelled and the substance excluded from the State Register of Medicines in January 2026 (S15, S16). No current marketing authorisation was identified in any jurisdiction. | This exact claim appears on essentially every vendor page retrieved. It is the most common factual error about this compound. The accurate framing is prior registration, cancelled in January 2026 at the holder's request. |
| SEL-X-02 | Any citation of trials enrolling more than 800 patients, or any framing of Selank as one of the most clinically documented nootropic peptides available. | Unsupported by anything retrieved, and internally inconsistent with the same commercial sector, where another vendor page cites roughly 192 subjects, matching the retrieved total. | The retrieved figure is approximately 192 patients across three small trials. That is a small evidence base, not a large one. |
| SEL-X-03 | Any statement that Selank produces benzodiazepine-equivalent calm without sedation, cognitive blunting, dependence, or withdrawal. | This converts one small non-independent comparison plus an absence of reported adverse events into a positive blanket safety and efficacy claim. No placebo-controlled trial exists, and no adverse-event data was retrieved from any of the three trials. | The defensible statement is that anxiolytic effects were reported as similar to medazepam in one 62-patient study by non-independent investigators (S04). Nothing beyond that. |
| SEL-X-04 | The vendor claim of zero cases of dependence or withdrawal and no rebound anxiety, insomnia, or autonomic instability across roughly 192 Russian trial subjects. | No retrieved primary source supports it. It is a grade E market claim (S20). A blanket safety claim of this shape is not supportable from three small abstract-only trials that yielded no adverse-event tables at all. | If a writer or a member reintroduces these, point to this row. The absence of reported harm in an abstract is not a finding of no harm. |
| SEL-X-05 | Any assertion that Selank is, or is not, on the WADA Prohibited List, or that it falls under category S0. | No WADA primary text was read (S19). The vendor S0 reasoning is an inference, and its stated premise, current Russian approval, appears to be false as of January 2026. | State that the status could not be verified and refer athletes to their own anti-doping authority. Do not publish the inference as a finding. |
| SEL-X-06 | Any statement that Selank treats, cures, or resolves anxiety, depression, stress, neurasthenia, or any other condition in people. | Converts small non-independent trial reports into settled outcome claims. No placebo-controlled evidence exists. | Use "was reported in", "was studied in", "was compared with". Never a bare outcome verb. The manufacturer's list of indications (S17) is a grade E manufacturer claim and is not evidence of efficacy. |
| SEL-X-07 | Any use of "will", "proven to", "restores", "cures", "eliminates", "reverses", or "guarantees" in connection with Selank. | Guaranteed outcome language. Nothing about this compound is proven in people. | Applies to headings and metadata as well as body text. |
| SEL-X-08 | Any presentation of Semax findings, or of tuftsin findings, as though they were Selank findings. | They are distinct compounds. Being named in the same regulatory action (S15, S16) is a shared regulatory fact, not shared evidence. | Check every borrowed citation. The shared manufacturer makes this substitution easy to miss. |
| SEL-X-09 | Any confident statement that Selank modulates GABAergic and serotonergic pathways in humans. | All retrieved mechanistic work is in rodents (S08) or in the IMR-32 human neuroblastoma cell line (S12). No study demonstrated the mechanism operates at clinically meaningful levels in a living human. | Describe the mechanism as proposed, preclinical, and unconfirmed in people. |
| SEL-X-10 | Any presentation of the 2015 add-on trial as evidence that Selank works on its own. | That trial compared phenazepam alone with phenazepam plus selank and reported reduced phenazepam side effects (S06). It is a benzodiazepine-sparing result with no placebo arm. | The design must travel with the citation every time. |
| SEL-X-11 | Any directional statement about liver effects drawn from the rat foot-shock study. | The direction of effect was not retrievable from the title and summary obtained (S11). Describing it as protective or as harmful would both be invention. | State that liver morphology was studied in rats and that the direction is not established here. |
| SEL-X-12 | Any dose, amount, concentration, frequency, timing, cycle, titration, loading, stacking, reconstitution instruction, injection technique, or route of administration presented as instruction. | Category rule for all Xenios Research Guides. | Where a reader would expect this, write: Dosing and administration information is intentionally excluded from Xenios Research Guides. Naming a route only to state that evidence is absent for it is permitted. |
| SEL-X-13 | Any framing of Selank as "research use only" that implies human benefit, and any guidance on where or how to obtain it. | The research-use framing is prohibited as a device. Acquisition guidance is out of scope for a Guide. | Applies to captions, footnotes, and links as well as body text. |
| SEL-X-14 | Publication of an amino acid sequence, a tuftsin-derivation statement, or a chemical identifier before a primary chemical registry check. | Sourced only from vendor and blog pages this session. The FDA GSRS records did not render. [UNVERIFIED - background knowledge, requires human source check] | Low-stakes facts still have to be verified. A wrong identifier undermines trust in everything else on the page. |
| SEL-X-15 | Any statement of the 2009 Russian approval date or the brand name Selanc as established fact. | Appeared this session only in vendor and blog sources. No registration certificate number or date was obtainable from the state registry or from the manufacturer. | A prior registration is strongly implied by the January 2026 cancellation, since a registration must exist to be cancelled, but its date and number are not verified here. Say exactly that and no more. |

## Reviewer sign-off checklist

1. Every preclinical sentence names its species or model in the same sentence as the finding.
2. Every human evidence sentence carries the non-independence caveat or sits directly beneath it.
3. No sentence contains a dose, route, schedule, or preparation detail as instruction.
4. No sentence describes Selank as currently approved anywhere.
5. Every regulatory sentence carries a jurisdiction, a date, and a source URL.
6. Every claim graded G or marked [UNVERIFIED] has either been closed by a human check or removed.
7. No citation appears that is not present in SOURCE_REGISTRY.md.
