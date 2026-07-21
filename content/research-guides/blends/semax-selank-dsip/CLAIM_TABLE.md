---
title: "Semax + Selank + DSIP: Claim Table"
type: research-guide-claim-table
compound: semax-selank-dsip
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# Semax + Selank + DSIP Claim Table

One row per discrete claim. Grades apply to individual claims, never to the product as a
whole. Source ids refer to SOURCE_REGISTRY.md.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## The rule that governs every row below

**A combination is not the sum of its ingredients, and its ingredients' evidence is not its
evidence.** Put three compounds into one preparation and you have made a fourth thing. It has
its own pharmacology, because the components can change how the body handles each other. It
has its own interaction profile, because the components can act on each other as well as on
the body. And it has its own unknowns, which are not the unknowns of any component taken
alone. Only a study that administered the actual mixture can speak to any of that.

Where no study administered the combination, the correct statement is that **there is no
combination evidence. Not weak evidence. Not preliminary or emerging evidence. None.**

Every row in sections 3 through 9 below is a claim about a single component studied by
itself. No row in those sections is a claim about the product, and no combination of them
becomes one. Reading down the component sections and adding them together is the exact error
this table exists to prevent.

## The second rule, specific to this product

**The composition is not confirmed.** No supplier specification, certificate of analysis, or
manufacturing record was available. This table therefore states no ratio, no proportion, and
no strength for any component, and no row may be added that implies one. What is in the
product, and in what relative amount, is the first open question for the supplier.

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

**No claim about the combination reaches any grade above G**, because no study of the
combination exists. Selank is the only component with genuine human trial records, and its
strongest claims reach C at most, never B, because no placebo-controlled trial of it was
located and its entire human literature comes from one non-independent research network.

## Section 1. The combination, which is the section that matters

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| CX-01 | No study of Semax, Selank, and DSIP administered together has been located. There is no human study of the combination, no animal study, no laboratory study, no trial registration, and no regulatory evaluation of the mixture as a product. | G | X01, X02 | Not applicable, this is a statement about the literature | Yes | **This is the single most important line in the packet and must appear in the first screen of member-facing text.** Graded G rather than higher because it describes the state of the evidence base and because the zero result was established from three supplied research records rather than observed at a live registry. A human must re-run it. |
| CX-02 | Evidence for Semax, Selank, or DSIP studied individually is not evidence about this combination, and cannot be added together to produce any. | G | X01 | Not applicable | Yes | Must travel with CX-01 every time. This is the rule, stated to a member in their own language. |
| CX-03 | No two of the three have been studied together as a mixture either. Nothing tested Semax with Selank, Semax with DSIP, or Selank with DSIP as a co-administered preparation. | G | X02 | Not applicable | Yes | Included so that a reader does not assume partial combination evidence exists as a fallback. |
| CX-04 | One published study examined both Selank and Semax in the same experiment. It compared them as separate agents and distinguished their effects from one another. It did not administer them together, and DSIP was not involved. | D | SX04 | 52 healthy adults | Yes, only with the "not a combination" statement in the same sentence | **The single highest-risk citation in this packet.** A study naming two of the three components reads at a glance like combination evidence. It is not. If a reviewer or writer proposes citing PMID 32342318 in support of the blend, point to this row. See CONTRADICTIONS.md C-01. |
| CX-05 | All three components are reported to act on the central nervous system. The combined neurological and psychiatric interaction profile of the three together is unstudied. | G | SX05, SL05, SL09, DS06 | Humans, unstudied | Yes | **Frame as a specific open risk, never as a reassurance.** Three centrally acting compounds in one preparation is a reason for more caution, not less. The retrieved literature separately describes monoaminergic, opioid-gene, immune, and GABAergic themes for these compounds in animal and cell models, and one animal study of Selank concerns interaction with a benzodiazepine. Nobody has studied what those surfaces do to each other in a person. |
| CX-06 | Because the combination is unstudied, there is no combination safety data, no combination pharmacokinetic data, and no way to attribute any effect or any adverse event to any one component. | G | X01 | Humans | Yes | The attribution point is practical and worth stating plainly. In a mixture, a good outcome and a bad outcome are equally uninterpretable. |

## Section 2. Composition and identity of the product

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| PR-01 | The exact composition and ingredient ratio of this product is not confirmed. No supplier specification, certificate of analysis, or manufacturing record was available for this Guide. | G | None available | Not applicable | Yes | **No ratio, proportion, or strength may be stated or implied anywhere, including in headings, tables, metadata, or any visual treatment.** This is the first open supplier question. |
| PR-02 | A name does not fix an identity. Regulatory filings treat a substance's free base and its acetate salt as separate substances. The retrieved Federal Register notice lists "Semax (free base)" and "Semax acetate" as distinct nominated substances, and the FDA substance registry carries both SELANK and SELANK DIACETATE. A blend label carries several such names at once. | D | SX08, SL19 | Not applicable | Yes | Practical identity risk specific to blends. Note SL19 is UNVERIFIED as to content: the registry records existed but rendered nothing. |
| PR-03 | No pharmacopoeial monograph or official quality specification was located for any of the three components, so there is no standard any material can be held to. | G | None located | Not applicable | Yes | State as a gap. Absence of a standard is not a favourable finding. |

## Section 3. Identity of each component

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| ID-01 | Semax is described as a synthetic heptapeptide, a chain of seven amino acids, described as an analogue of a fragment of adrenocorticotropic hormone extended at one end with three further amino acids. | G | SX13 | Not applicable | Yes, with the tertiary-source caveat | The sequence and the analogue description come from a tertiary source (Wikipedia) in the underlying research. Confirm against a primary chemical registry before publishing the sequence itself. |
| ID-02 | Selank is described as a synthetic heptapeptide derived from tuftsin, a naturally occurring immune peptide. It appears in the FDA substance registry as a recognized discrete substance rather than a vendor coinage. | G | SL19 | Not applicable | Yes, with the caveat | **The commonly cited amino acid sequence and the tuftsin-derivation detail appeared only in vendor and blog sources in the underlying research**, because the registry records rendered no content. Marked unverified and flagged for human check. |
| ID-03 | DSIP is described as a nonapeptide, a chain of nine amino acids, first isolated in 1974 from the cerebral venous blood of rabbits during induced sleep. It is also referred to in regulatory contexts as emideltide. | G | DS05, DS13 | Not applicable | Yes | The regulatory name emideltide matters, because a member searching regulatory records will find it under that name and not under DSIP. |
| ID-04 | No DSIP gene, precursor peptide, or receptor has been identified in any species in the more than fifty years since its isolation. A 2006 peer-reviewed review treats this as the central unresolved problem and notes the link to sleep was never further characterised, in part because the gene was never isolated. | D | DS05 | Not applicable | Yes | **An unusual and important weakness at the level of basic identity, not merely of clinical evidence.** A member should understand that the molecule sold under this name cannot be confirmed to correspond to a genuine endogenous human signalling molecule. |
| ID-05 | Reported chemical registry numbers and molecular weights for the three components. | G | None | Not applicable | **No** | Not confirmed against any primary chemical registry in the underlying research. Do not publish any of them. [UNVERIFIED - background knowledge, requires human source check] |

## Section 4. Human evidence, by component

Every row below concerns one component studied alone. None is evidence about the product.

### Semax

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| H-SX-01 | Four human studies of Semax were located. Two are Russian-language clinical studies in stroke and cerebrovascular insufficiency, and two are small neuroimaging studies in healthy volunteers. None was described as randomized, placebo-controlled, and blinded with the method stated, and no Semax study is registered on ClinicalTrials.gov. | C | SX01, SX02, SX03, SX04, SX07 | 110, 187, 24, and 52 participants | Yes | Graded C for the existence of early human study, not for any effect. Every effect claim below sits lower. |
| H-SX-02 | In a study of 110 adults after ischemic stroke, the authors reported that Semax together with high levels of a growth factor was associated with faster improvement and a better final outcome on functional recovery measures. The study was not randomized, had no placebo, and did not state blinding, and early initiation of rehabilitation independently improved outcomes in the same study. | C | SX01 | 110 adults after ischemic stroke, mean age about 58 | Yes, only with the design limitation in the same sentence | The reported Semax effect cannot be separated from rehabilitation intensity or from baseline differences between groups. Cannot support a causal efficacy claim. |
| H-SX-03 | In a 2005 study of 187 patients with chronic cerebrovascular insufficiency, the authors reported clinical improvement, stabilization of disease progression, and a reduced reported risk of stroke and transient ischemic attacks. The study was not stated to be randomized or placebo-controlled. | C | SX02 | 187 adult and older-adult patients | Yes, only with the limitation attached | **Outcome claims of this magnitude would normally require a randomized, adequately powered, prospectively registered trial. Treat as hypothesis-generating only and never repeat the stroke-risk figure as a finding.** |
| H-SX-04 | In 24 healthy adults, a small placebo-comparison neuroimaging study reported a greater volume of one subcomponent of a resting brain network in the Semax group. This is a brain imaging signal, not a cognitive, functional, or symptom outcome. | C | SX03 | 24 healthy adults, 14 and 10 | Yes, with the "not a clinical outcome" statement attached | Whether this study was randomized is genuinely unresolved. **Do not describe it as a randomized controlled trial.** Safest accurate phrasing: a small placebo-comparison imaging study in healthy volunteers. See CONTRADICTIONS.md C-05. |
| H-SX-05 | In 52 healthy adults, a study of Selank and Semax reported between-group differences in connectivity between certain brain regions, identified by the authors through post hoc analysis. | C | SX04 | 52 healthy adults | Yes, with both the post hoc caveat and the CX-04 "not a combination" statement | Post hoc connectivity findings at this sample size are exploratory and require independent replication. |
| H-SX-06 | No study of Semax with a cognitive endpoint in healthy people was located. The nootropic use the consumer market promotes is precisely where evidence is absent. | G | SX05, SX07 | Healthy adults, by absence | Yes | **Important. The healthy-volunteer studies measured brain connectivity, not cognition, memory, focus, or mood.** |

### Selank

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| H-SL-01 | Three clinical trials of Selank were located, enrolling approximately 192 patients in total, plus one immunological patient study whose sample size was not stated. All are Russian-language publications from 2008 to 2015, three of the four in a single journal, all from an overlapping Russian research network that includes the compound's originators. | C | SL01, SL02, SL03, SL04, SL12 | Approximately 192 patients across three trials | Yes | **Selank is the one component where an empty human evidence table would be dishonest. Real trials exist. They are small and not independent.** |
| H-SL-02 | In 62 adults with generalized anxiety disorder and neurasthenia, the anxiolytic effects of selank and the benzodiazepine medazepam were reported to be similar, with selank additionally reported to have antiasthenic and psychostimulant effects. | C | SL01 | 62 adults | Yes, with the non-independence and no-placebo caveats | The defensible description is "reported similar to medazepam in one 62-patient Russian study by non-independent investigators, with full text unread". Nothing stronger. |
| H-SL-03 | In 60 patients with anxiety disorders, a comparison against the benzodiazepine phenazepam reported pronounced anxiolytic and mild nootropic effects, with the anxiolytic effect reported to persist for about a week after treatment ended. | C | SL02 | 60 patients | Yes, with caveats | Not indexed as a randomized controlled trial. Abstract-only: no numeric outcomes, variance, dropout, or adverse-event data were obtained. |
| H-SL-04 | In 70 patients with anxiety disorders, combining selank with phenazepam was reported to decrease the level of undesirable side effects of phenazepam. This is a question about reducing another drug's side effects, not a demonstration of standalone efficacy. | C | SL03 | 70 patients, 30 and 40 | Yes, only with the "add-on, not standalone" framing in the same sentence | **This trial is routinely misrepresented as evidence of standalone anxiolytic effect. It had no placebo arm and tested an add-on question.** |
| H-SL-05 | No placebo-controlled trial of Selank was located anywhere in the literature. | G | SL01, SL02, SL03, SL12 | Not applicable | Yes | Without a placebo arm the trials cannot separate drug effect from expectancy and from natural resolution of anxiety symptoms. State this plainly. |
| H-SL-06 | Zero Selank trials are registered on ClinicalTrials.gov. Both registry queries returned only unrelated fuzzy text matches. | G | SL10, SL11 | Not applicable | Yes | No pre-registered protocols and no pre-specified endpoints exist, so selective outcome reporting cannot be excluded. |

### DSIP

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| H-DS-01 | Every human sleep study of DSIP that could be located dates from 1981 to 1992. There has been no modern human replication in more than three decades, and zero DSIP trials are registered on ClinicalTrials.gov. | C | DS01, DS02, DS03, DS04, DS08, DS09 | Not applicable | Yes | **The age of the literature is itself the headline finding and should lead the DSIP material.** A line of inquiry that generated human study in the 1980s and then none for thirty years is best read as tried and quietly abandoned, not as awaiting rediscovery. |
| H-DS-02 | In an open, uncontrolled, unblinded study of 7 patients with severe insomnia, sleep was reported as normalized in all but one case over follow-up periods of three to seven months. | C | DS03 | 7 patients | Yes, only with the design stated in the same sentence | **The most cited positive DSIP result and methodologically the weakest.** A design of this type cannot separate drug effect from placebo response, regression to the mean, or investigator expectancy. The paper also flags complications in patients with a long-standing history of drug dependence. |
| H-DS-03 | In a double-blind crossover study in chronic insomniacs with sleep recording, reductions in nocturnal awakenings, sleep latency, and waking after sleep onset were reported, and total sleep and non-REM sleep increased, driven primarily by lighter stage 2 sleep. The authors concluded the improvement was of little clinical significance. | C | DS01 | Chronic insomniacs, sample size not stated in the abstract | Yes | No significant differences were detected against either baseline or placebo on the primary comparisons. **The authors' own conclusion is negative.** |
| H-DS-04 | In a double-blind study of 16 chronic insomniac patients, higher sleep efficiency and shorter sleep latency were observed versus placebo, and one measure of subjective tiredness decreased. Subjective sleep quality, arguably the outcome that matters most to a person with insomnia, was unchanged. | C | DS02 | 16 patients | Yes | The authors stated the significant effects were weak and could in part be due to an incidental change in the placebo group, and concluded short-term treatment is not likely to be of major therapeutic benefit. |
| H-DS-05 | The human controlled data do not support the specific delta sleep claim embedded in the compound's own name. In the double-blind crossover study, slow wave sleep was not modified, and the increase in total sleep came from stage 2 sleep instead. | C | DS01 | Chronic insomniacs | Yes | **Significant and easy to miss. The name asserts a mechanism that the best available human measurement did not find.** Marketing that leans on "delta sleep" is leaning on the name, not on the human data. |
| H-DS-06 | One further early human study exists and has not been examined. Its content is not asserted anywhere in this Guide. | G | DS04 | Unknown | Yes, as a gap only | The record returned a CAPTCHA rather than content. **Do not cite it for anything.** |

## Section 5. Proposed mechanism

Everything in this section is proposed, derives from animal or cultured-cell work, and has
not been confirmed in a living human being. There is no proposed mechanism for the
combination at all, because nobody has studied it.

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| M-01 | There is no mechanism proposed or tested for the three compounds acting together. Any mechanistic account of this product is assembled from three separate component stories, which is presentation rather than evidence. | G | X01 | Not applicable | Yes | Pair with CX-01 wherever mechanism is discussed. |
| M-02 | In animal and cell models, preclinical work on Selank has examined effects on genes involved in GABAergic neurotransmission, the main calming signalling system in the brain. In IMR-32 human neuroblastoma cells studied in a dish, GABA, selank, and olanzapine were reported to affect the expression of those genes. | D | SL09 | Human-derived cells in a dish | Yes, only with the cell-culture context in the same sentence | Human-derived tissue in a dish is still preclinical. Never write this as a bare mechanism sentence. |
| M-03 | Preclinical titles for Semax describe effects on a growth factor, on dopaminergic and serotoninergic systems, on immune response genes, and on opioid receptor gene expression. **The species for these individual records was not confirmed**, so none may be published as a preclinical finding. | G | SX05, SX10, SX11, SX12 | Species unconfirmed | **No** | These records were read from a results listing, not fetched individually. A human must retrieve each and name its species before any of them appears in member-facing text. |
| M-04 | For DSIP, a 2006 peer-reviewed review reports that certain structural analogues showed sleep-promoting activity in animal models while DSIP itself did not demonstrate clear effects, and proposes that a DSIP-like peptide rather than DSIP may account for reported results. | D | DS05 | Animal models | Yes | **The most honest available summary of the DSIP mechanism question, and it points away from the compound.** |
| M-05 | A 1984 narrative review reports delta-sleep induction across rabbits, rats, and mice, with a more pronounced REM effect in cats, so the response was not consistent across species, and describes a non-monotonic activity curve where more was not more. | D | DS06 | Rabbits, rats, mice, cats | Yes, with species named | The review frames DSIP as a multifunctional neuroregulatory peptide rather than a specific sleep agent, which undercuts the single-purpose story. |
| M-06 | No human pharmacokinetic data was located for any of the three components: no absorption, distribution, metabolism, elimination, or half-life data, and no evidence about whether meaningful central nervous system exposure is achieved by any route. | G | None located | Humans | Yes | Naming routes here is permitted because the statement is that evidence is absent. Do not name a route in any other context. |

## Section 6. Preclinical findings, by component

Every finding names its species or model in the same sentence. None establishes an effect in
a person, and none is evidence about the combination.

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| P-01 | In rats under unpredictable chronic mild stress, selank was reported to enhance the anxiety-reducing effect of diazepam, a benzodiazepine. | D | SL05 | Rats | Yes, with "in rats" in the same sentence | **This is simultaneously a preclinical finding and a drug-interaction signal.** Pair it with S-05. |
| P-02 | In DBA/2 mice, selank was reported to inhibit ethanol-induced hyperlocomotion and the manifestation of behavioral sensitization. | D | SL06 | DBA/2 mice | Yes, with the strain named | |
| P-03 | In rats in a morphine withdrawal model, selank was reported to attenuate aversive signs of withdrawal. | D | SL07 | Rats | Yes, with "in rats" | Do not extend into any human statement about dependence, withdrawal, or substance use. |
| P-04 | In rats subjected to chronic foot-shock stress, selank was studied for its effect on liver morphology. The direction of the effect was not retrievable from the record obtained. | D | SL08 | Rats | Yes, only as stated, with no direction implied | **A liver endpoint with an unknown direction is a reason to be careful, not a reason for comfort.** Do not describe it as showing anything. |
| P-05 | In 48 male Kun-Ming strain mice with insomnia induced by a chemical agent, an engineered DSIP fusion peptide reduced wakefulness time, changed several neurotransmitter measures, decreased anxiety-like and depressive-like behaviours, and improved hippocampal tissue appearance. | D | DS07 | Mice | Yes, only with the fusion-construct caveat in the same sentence | **Critical caveat. The tested article was a fusion peptide engineered to cross the blood-brain barrier, not DSIP, and it outperformed plain DSIP in that same model. This result cannot be presented as modern validation of DSIP, and if anything points the other way.** |
| P-06 | The Semax literature is overwhelmingly preclinical. A PubMed search returned approximately 230 records, and of the first 20 reviewed roughly 19 were preclinical or narrative review with one human clinical study. | D | SX05 | Not applicable | Yes | Present as a map of the literature, not as a body of results. **No individual Semax preclinical finding may be published until a human fetches that record and names its species.** |

## Section 7. Safety

Nothing in this section is reassurance. These are open categories.

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| S-01 | There is no safety data for this combination. None exists, because the combination has never been studied. | G | X01 | Humans | Yes | **Must appear before any other safety line.** |
| S-02 | There is no adequate human safety dataset for any of the three components individually either. No adverse-event tables, no long-term follow-up, no pharmacovigilance data, and no regulator safety review was retrieved for any of them. | G | SX02, SL01 to SL04, DS01 to DS03 | Humans | Yes | The one exception is a single tolerability impression from one 2005 uncontrolled Semax study, addressed at S-03. |
| S-03 | The only tolerability statement in the entire retrieved Semax literature is an uncontrolled impression from one 2005 non-randomized study, which described a minor percentage of side effects and good tolerability across age groups. That is an impression from a single uncontrolled study, not a safety characterization. | C | SX02 | 187 patients | Yes, only with the "not a safety characterization" clause attached | **Never quote the tolerability phrase without the rebuttal in the same sentence.** Absence of reported harm in a small uncontrolled literature is not evidence of safety. |
| S-04 | Absence of reported harm in a literature this small reflects absence of study. Combined human exposure across all the retrieved DSIP literature is on the order of a few dozen people, and total healthy-volunteer exposure to Semax is in the dozens. Neither can detect uncommon or delayed harms. | G | DS01, DS02, DS03, SX03, SX04 | Humans | Yes | Say this explicitly. It is the sentence that prevents a member from reading silence as reassurance. |
| S-05 | Interaction with sedative and anxiolytic medication is an open question rather than a characterized profile. One human trial studied selank added to a benzodiazepine, and one rat study examined selank combined with a different benzodiazepine. Nothing outside those small studies characterizes it. | C | SL03, SL05 | 70 patients, and rats | Yes, with populations named | Directly relevant, because a member may already be taking such a medicine. |
| S-06 | The mechanistic breadth described in preclinical titles is an unresolved safety question, not a selling point. A compound reported to touch monoaminergic, opioid-related, immune, and metal-handling pathways in animal and cell models has a correspondingly wide surface for unstudied interactions in people. No human drug-interaction study was retrieved for any component. | D | SX05 | Humans, unstudied | Yes | Frame as an open question, never as a predicted harm and never as a reassurance. |
| S-07 | Immunogenicity, meaning whether the body mounts an immune response against the substance, is uncharacterized for all three components and for the combination. | G | None retrieved | Humans | Yes, as a gap only | Secondary reporting attributed an immunogenicity concern to regulatory briefing material for one component, but the underlying document could not be retrieved, so **nothing may be quoted or attributed to any regulator.** [UNVERIFIED - requires human source check] |
| S-08 | No safety or effect data of any kind was located for pregnancy, breastfeeding, adolescents, older adults, or people with cardiovascular, psychiatric, endocrine, neurological, hepatic, or seizure conditions, for any of the three components or for the combination. | G | None located | Those populations | Yes | The list must be complete wherever it appears. |
| S-09 | Material obtained outside a regulated supply chain has unverified identity, purity, sterility, and content. No independent product-testing study was located for any of the three components, and none for the blend. | G | SX13, SL16 | Not applicable | Yes | State as a gap. Nobody appears to have checked. It is not a clean result. |
| S-10 | Following the reported January 2026 cancellation of the Russian registrations, no current national marketing authorization was identified in any jurisdiction for Semax or Selank, which means no regulator was identified as currently overseeing product identity or quality for either anywhere. | C | SL14, SL15 | Not applicable | Yes | This sharpens S-09 considerably and should sit next to it. |

## Section 8. Quality and documentation

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| Q-01 | Xenios has confirmed no quality documentation item for this product. No supplier has been assessed, no certificate of analysis reviewed, no independent testing commissioned, and no material examined. | G | None | Not applicable | Yes | See QUALITY_AND_DOCUMENTATION.md. Every item there is unmet. |
| Q-02 | A blend requires everything a single compound requires, for each component separately, and then two things more: blend uniformity, and content measured for each component individually rather than as a total. Neither is documented here, nor is the per-component identity and assay underneath them. | G | None | Not applicable | Yes | This is the blend-specific documentation gap and should be named as such. |
| Q-03 | Perfect quality documentation would establish what is in a unit. It would not create combination evidence, which does not exist. | G | X01 | Not applicable | Yes | Include so a member does not read a future certificate of analysis as scientific validation. |

## Section 9. Regulatory

Every row carries a jurisdiction and a date. See REGULATORY_STATUS.md for the full detail.

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| R-01 | No regulator anywhere was identified as having approved, authorised, or evaluated this three-component combination as a product, in any jurisdiction, as of 2026-07-21. | G | X01 | Not applicable | Yes | |
| R-02 | Semax is not an FDA-approved drug (United States, checked 2026-07-21). As of a Federal Register notice published 2026-04-16, Semax free base and Semax acetate appear on the list of bulk drug substances **nominated** for possible inclusion on the section 503A bulks list, with nominated uses of cerebral ischemia, migraine, and trigeminal neuralgia, and an advisory committee meeting was scheduled for 23 to 24 July 2026. | B | SX08 | Not applicable | Yes, only with the nomination framing intact | Graded B because this rests on a successfully retrieved primary regulatory document, the only one in the packet. **A nomination is not an approval, not an efficacy finding, and not an endorsement. The 503A bulks list is a compounding-eligibility mechanism, not a drug approval pathway. As of 2026-07-21 the committee had not met and no outcome exists.** |
| R-03 | Selank has no FDA approval for any human indication (United States, checked 2026-07-21). | G | SL17 | Not applicable | Yes | Every fda.gov fetch returned HTTP 404, so this rests on search summaries. A human must confirm directly. |
| R-04 | DSIP, referred to in regulatory contexts as emideltide, has no FDA approval for any indication (United States, checked 2026-07-21). | G | DS10 | Not applicable | Yes | All four FDA URLs failed. **The reported position that FDA proposed emideltide not be added to the 503A list must not be published until a human confirms it against the FDA primary source.** |
| R-05 | Semax and Selank were reported to be registered medicines in the Russian Federation. **Two independent Russian pharmaceutical trade outlets report that on 20 to 21 January 2026 the Russian Ministry of Health cancelled the registration of the Peptogen Semax and Selank products and excluded selank as a substance from the State Register of Medicines**, at the request of the registration certificate holders rather than for any reported safety reason (Russian Federation, checked 2026-07-21). | C | SL14, SL15 | Not applicable | Yes, only in full | **The Guide must not describe Semax or Selank as currently approved medicines in Russia.** The widely repeated vendor claim that they are appears to be out of date. A human must confirm at the state register itself. |
| R-06 | Registration in the Russian Federation, whether current or historical, confers no legal or scientific standing in any other jurisdiction. | A | SX13, SL14 | Not applicable | Yes | Graded A because it is a statement about how regulatory systems work, not a claim about a compound. **Must never be phrased, abbreviated, or implied as approval anywhere else, and must never appear near a statement about the United States without the separation being explicit.** |
| R-07 | Registration of two single agents is not registration of a three-component blend. No regulator anywhere has registered, approved, or evaluated this combination. | A | X01, SL14 | Not applicable | Yes | **The Russian regulatory history of Semax or Selank, in any tense, may never be presented as support for this product.** |
| R-08 | No European Union or United Kingdom marketing authorisation was found for any of the three components, but this is a weak negative: the EMA search endpoint could not be read and the UK regulator was not queried (checked 2026-07-21). | G | SX13 | Not applicable | Yes, with the weakness stated | Absence here means not checked, not permitted. |
| R-09 | The anti-doping status of all three components could not be confirmed. The WADA Prohibited List could not be retrieved in any of the three component searches. | G | SX14, SL18, DS12 | Tested athletes | Yes, with the referral | **No anti-doping status is stated for any component. Every vendor assertion of a category is a vendor inference, not a WADA statement.** Direct any competing athlete to their own anti-doping authority. |
| R-10 | Zero trials of any of the three components are registered on ClinicalTrials.gov, and none of the combination. | B | SX07, SL10, SL11, DS08, DS09 | Not applicable | Yes | Graded B because these are direct primary registry queries with recorded negative results. |

## Section 10. Unknowns

Presented to a member as an explicit list rather than left as silence.

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| U-01 | Whether this combination does anything at all in a person is unknown. Nothing has ever tested it. | G | X01 | Humans | Yes | |
| U-02 | What the three compounds do to each other in one preparation is unknown: whether they alter each other's behaviour in the body, whether their effects add, cancel, or amplify, and whether the mixture behaves like any of its parts. | G | X01 | Humans | Yes | |
| U-03 | The combined neurological and psychiatric interaction profile of three centrally acting compounds is unstudied. | G | X01 | Humans | Yes | Restates CX-05 in the unknowns list deliberately. |
| U-04 | What is actually in this product, and in what proportion, is unknown to Xenios. | G | None | Not applicable | Yes | |
| U-05 | Whether Semax has any clinically meaningful cognitive, mood, or nootropic effect in healthy people is unknown. The healthy-volunteer studies measured brain connectivity, not cognition or symptoms. | G | SX03, SX04 | Healthy adults | Yes | |
| U-06 | Whether the reported Semax stroke and cerebrovascular benefits would survive randomization, blinding, and placebo control is unknown. No such trial was found. | G | SX01, SX02 | Patients | Yes | |
| U-07 | Whether Selank's reported anxiolytic effect would survive a placebo-controlled trial is unknown. No placebo-controlled trial of Selank was located. | G | SL01 to SL03 | Patients with anxiety disorders | Yes | |
| U-08 | Whether Selank's reported GABAergic and serotonergic mechanism operates in living humans is unknown. The retrieved mechanistic work is in rodents and in a human neuroblastoma cell line, not in people. | G | SL05 to SL09 | Humans | Yes | |
| U-09 | Whether DSIP is a genuine endogenous mammalian peptide at all is unknown. No gene, receptor, or precursor has been identified in over fifty years. | G | DS05 | Not applicable | Yes | |
| U-10 | Whether any reported DSIP sleep effect would survive a modern, adequately powered, blinded trial is unknown. This has never been tested. | G | DS01, DS02, DS03 | Humans | Yes | |
| U-11 | Whether the 2024 mouse work on an engineered DSIP fusion peptide has any bearing on unmodified DSIP in humans is unknown. The fusion construct was specifically engineered to cross the blood-brain barrier, which implies unmodified DSIP does so poorly. | G | DS07 | Mice to humans | Yes | |
| U-12 | Human pharmacokinetics for all three components: absorption, central nervous system exposure, metabolism, and duration. Nothing was retrieved for any of them. | G | None located | Humans | Yes | |
| U-13 | Interactions with any medicine or supplement, for any component and for the combination. No human interaction study was retrieved. | G | None located | Humans | Yes | |
| U-14 | Long-term effects of repeated or prolonged exposure to any component or to the combination, including effects on hormonal axes over time. | G | None located | Humans | Yes | |
| U-15 | The exact Russian registration particulars for Semax and Selank: certificate numbers, original registration dates, approved indications as written by the regulator, and the date the January 2026 cancellation took legal effect. | G | SL14, SL15, SL16 | Not applicable | Yes | Neither the state register nor the manufacturer published these in any retrievable source. |
| U-16 | Whether the January 2026 Russian deregistration was purely commercial or administrative, or had any undisclosed driver. The reported reason is a holder request, and no safety rationale was reported. | G | SL14, SL15 | Not applicable | Yes | **Do not speculate in either direction.** Report the stated reason and the fact that nothing further is known. |
| U-17 | The outcome of the FDA Pharmacy Compounding Advisory Committee meeting of 23 to 24 July 2026, which had not occurred as of 2026-07-21. | G | SX08 | Not applicable | Yes | |
| U-18 | The current WADA classification of any of the three components. | G | SX14, SL18, DS12 | Tested athletes | Yes | |
| U-19 | The identity, purity, and content of material sold as any of these compounds, or as this blend. No independent product-testing data was retrieved. | G | None located | Not applicable | Yes | |

## Section 11. PROHIBITED claims

These may not appear on any member-facing surface, in any form, hedged or otherwise. Several
are actively circulating and would be plausible to a reader.

| Claim ID | Prohibited claim | Why it is prohibited | Reviewer notes |
| --- | --- | --- | --- |
| X-01 | Any statement, implication, or visual treatment suggesting that evidence for Semax, Selank, or DSIP individually supports this combination. | Component evidence is not combination evidence. A combination has its own pharmacology, its own interaction profile, and its own unknowns. No study administered this mixture, so there is no combination evidence at any strength. | **The governing prohibition. Every other row in this section is downstream of it.** Includes softened forms such as "each ingredient is backed by research", "built on studied compounds", or "a synergistic formulation". |
| X-02 | Any citation of PMID 32342318 as evidence for combining Semax and Selank. | That study compared the two as separate agents and distinguished their effects from each other. It did not administer them together, and DSIP was absent from it entirely. | The most likely single citation error in this packet. See CX-04. |
| X-03 | Any statement that Semax or Selank is approved, registered, or authorised in the United States, or any phrasing where a Russian regulatory fact sits close enough to a United States statement to be read across. | Registration in one jurisdiction is not approval in another. Neither compound has FDA approval. **The two jurisdictions must be stated separately and explicitly, never merged into a general impression of legitimacy.** | Includes constructions like "an approved medicine overseas" placed near a discussion of United States status. |
| X-04 | Any statement that Semax or Selank is **currently** an approved or registered prescription medicine in Russia. | Two independent Russian trade outlets report the Peptogen registrations for both were cancelled on 20 to 21 January 2026 and that selank was excluded from the State Register as a substance. The vendor claim of current Russian approval appears to be out of date. | This claim is repeated on essentially every vendor page retrieved. See CONTRADICTIONS.md C-02. |
| X-05 | Any presentation of the Russian regulatory history of Semax or Selank, in any tense, as support for this blend. | Registration of two single agents is not registration of a three-component product. No regulator has evaluated this combination anywhere. | Applies to headings, metadata, captions, and any design element as well as body text. |
| X-06 | Any statement that the FDA is reviewing, considering, or moving toward approving Semax, or any framing of the 503A nomination as momentum. | The retrieved Federal Register notice records only that Semax free base and Semax acetate were **nominated** by an outside party for possible inclusion on a compounding-eligibility list. That is not review of a drug application and not approval. As of 2026-07-21 the committee had not met. | Vendor pages frame this as Semax heading toward legitimacy. The primary source wins decisively. See CONTRADICTIONS.md C-04. |
| X-07 | Any statement of an outcome from the 23 to 24 July 2026 advisory committee meeting, for any component. | As of 2026-07-21 the meeting had not taken place. No outcome exists to report. | Note also that a committee recommendation, when it comes, is advisory and is not a final agency determination. |
| X-08 | Any anti-doping status or WADA category for any of the three components. | The Prohibited List could not be retrieved in any of the three component searches. Every circulating classification is a vendor inference, not a WADA statement. | Direct tested athletes to their own anti-doping authority instead. |
| X-09 | Any statement that this product, or any of its components, is safe, well tolerated, non-habit-forming, free of dependence or withdrawal, or free of side effects. | No adequate human safety dataset exists for any component, and none at all for the combination. The specific circulating claim of zero dependence and zero withdrawal across roughly 192 Selank trial subjects traces to a vendor blog and is supported by no retrieved primary study. | Includes "generally considered safe", "no reported side effects", and "gentle". See SL20 and CONTRADICTIONS.md C-06. |
| X-10 | Any claim that Selank is equivalent to a benzodiazepine, or that it delivers benzodiazepine-like effect without dependence, withdrawal, sedation, or cognitive blunting. | The primary abstracts support only that anxiolytic effects were reported similar to medazepam in one 62-patient study, and that adding selank to phenazepam was reported to reduce that drug's side effects in a 70-patient study. Converting that into a blanket safety and efficacy claim is not a simplification, it is a different claim. | No placebo-controlled trial exists, so the trials cannot separate drug effect from expectancy. |
| X-11 | Any citation of a large Selank evidence base, such as trials enrolling over 800 patients, or a description of Selank as one of the most clinically documented nootropic peptides. | Systematic retrieval identified three genuine clinical trial records totalling approximately 192 patients, plus one immunological study of unstated size. The 800-patient figure is unsupported and is internally inconsistent with other vendor claims. | Note also that a raw PubMed count overstates the base, because three of six records in the filtered trial search are unrelated false positives. |
| X-12 | Any presentation of DSIP as a known human sleep hormone, or of "delta sleep" as its established mechanism. | No DSIP gene, precursor, or receptor has ever been identified. The one double-blind human study that measured it found slow wave sleep was not modified. **The name asserts a mechanism the best human measurement did not find.** | Describe DSIP as a hypothesized factor whose endogenous status was never confirmed. |
| X-13 | Any presentation of the DSIP evidence picture as "mixed", or any framing that implies a live scientific disagreement. | The positive result comes from an open, uncontrolled, unblinded study of 7 people. The negative results come from the two double-blind controlled studies, whose authors concluded little clinical significance and no likely major therapeutic benefit. A striking open-label result that fails under blinding is the classic signature of placebo response. | Neutral "mixed evidence" phrasing would misrepresent the record. See CONTRADICTIONS.md C-07. |
| X-14 | Any citation of the 2024 mouse study as modern validation of DSIP. | The tested article was an engineered fusion peptide built to cross the blood-brain barrier, not DSIP, it was in mice, and it outperformed plain DSIP in the same model. | Always name the construct, the species, and the fact that plain DSIP did worse. |
| X-15 | Any citation of Semax preclinical records PMID 16635254, 16362768, or 28255762 as findings. | They were read from a results listing only. Species, tissue, and effect size are unconfirmed for all three. A preclinical finding without its species named cannot be published under house rules. | May re-enter at grade D only after a human fetches each record and names its model. |
| X-16 | Any citation of DSIP record PMID 7028502 for any content. | The fetch returned a CAPTCHA. No author, journal, sample size, or result is known. | It exists in this packet only as a documented gap. |
| X-17 | Any use of "will", "proven to", "restores", "cures", "eliminates", "reverses", "guarantees", "optimises", or "fixes" in connection with this product or any component. | Guaranteed-outcome language. Nothing here is proven in people, and the combination has never been tested at all. | Applies to headings, metadata, and any marketing surface as well as body text. |
| X-18 | Any dose, amount, concentration, ratio, proportion, frequency, timing, cycle, titration, reconstitution instruction, injection technique, or route of administration, for the product or any component. | Category rule for all Xenios Research Guides. For this product the ratio prohibition is additionally a factual one: the composition is not confirmed. | Where a reader would expect this, write: Dosing and administration information is intentionally excluded from Xenios Research Guides. |
| X-19 | Any statement of the product's composition, ingredient strengths, or ratio as fact. | No supplier specification, certificate of analysis, or manufacturing record was available. | A future certificate of analysis would settle composition. It would not create combination evidence. |
| X-20 | Any acquisition, sourcing, vendor, or supplier guidance, and any "research use only" framing used as a device implying human benefit. | Out of scope for a Guide, and the research-use framing is prohibited as a device. | Applies to captions, footnotes, and links. |
| X-21 | Any implication that Xenios supplies, sources, endorses, or can obtain this product or its components. | Xenios does not sell it. | Must be stated positively in the Guide, the FAQ, and the quality document. |

## Reviewer sign-off checklist for this table

1. The combination rule appears in the first screen of every member-facing surface, phrased
   in that surface's own words rather than copied.
2. No sentence anywhere assembles component evidence into a statement about the product.
3. PMID 32342318 appears nowhere without the explicit statement that it is not a combination
   study.
4. Every preclinical sentence names its species or model in the same sentence as the finding.
5. No sentence contains a dose, amount, ratio, route, schedule, or preparation detail.
6. No Russian regulatory statement sits adjacent to a United States statement in a way that
   could read across.
7. Every regulatory sentence carries a jurisdiction, a date, and a source.
8. Every claim graded G or marked [UNVERIFIED] is either closed by a human check or removed.
9. No citation appears that is not present in SOURCE_REGISTRY.md.
10. The reviewer has independently re-graded a sample of rows rather than accepting the draft
    grades.
</content>
