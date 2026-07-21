---
title: SLU-PP-332 Claim Table
type: claim-table
compound: SLU-PP-332
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# Claim Table: SLU-PP-332

Each row is one discrete claim, graded on its own evidence rather than on the compound's reputation.
Source ids refer to SOURCE_REGISTRY.md.

Grades used:

- **A** Established
- **B** Supported human evidence
- **C** Early human evidence
- **D** Preclinical
- **E** Manufacturer or supplier reported
- **F** Traditional or historical
- **G** Unverified
- **PROHIBITED** May not appear on any member-facing surface

No claim in this table carries grade A, B, or C for a physiological effect, because no study retrieved
this session administered SLU-PP-332 to a living human being. Grade A appears only for claims about
chemical identity and about the content of a registry query, which are matters of record rather than
matters of biology.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## 1. Identity and classification

| ID | Claim as it would appear to a member | Grade | Sources | Population it applies to | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| ID-01 | SLU-PP-332 is a synthetic small molecule, not a peptide, despite being sold widely through peptide-branded channels. | A for the substance class, **G for the specific registry values** | S11, S2 | Not population dependent, chemical fact | Allowed | The substance-class correction is not in doubt and should appear early in the Guide, because a buyer who believes they hold a peptide has a wrong model of the substance and of what test would even verify it. **Updated 2026-07-21:** the specific chemical identity values (molecular formula, molar mass, CAS registry number, IUPAC name) were carried from the prior packet's tertiary source and were NOT re-retrieved this session. They are flagged [UNVERIFIED - background knowledge, requires human source check] and must be confirmed against a primary chemical registry before publication. |
| ID-02 | It is described in the research literature as a pan-agonist of the estrogen-related receptors, a family of orphan nuclear receptors. | D | S3, S5 | Cell systems and rodents | Allowed | Pan-agonism across ERRalpha, ERRbeta and ERRgamma, characterized in cell systems. Do not let this sentence stand alone as if it described an effect in a person. |
| ID-03 | The literature refers to it as a chemical probe and as an exercise mimetic. | D | S3, S7 | Research context | Allowed | "Exercise mimetic" is a research label describing a transcriptional program observed in rodents and cells. It is not a claim that the compound substitutes for exercise in a person. Flag any draft copy that uses the term without that qualifier. |
| ID-04 | SLU-PP-332 and SLU-PP-915 are chemically distinct compounds from the same research program, with different pharmacokinetic properties. | D | S9, S6 | Not population dependent | Allowed | Evidence generated for one must never be presented as evidence for the other. This conflation is routine in commercial copy. |
| ID-05 | It is a separate compound from other so-called exercise mimetics with different molecular targets, which carry their own separate evidence and regulatory histories. | G | Background reasoning from S3 and S7 naming the class | Not population dependent | Allowed, with hedging | [UNVERIFIED - background knowledge, requires human source check] The distinctness of these compounds is not in dispute, but this Guide did not retrieve dedicated sources on the comparator compounds, so no comparative statement about them should be made. |

## 2. Human evidence

| ID | Claim as it would appear to a member | Grade | Sources | Population it applies to | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| HU-01 | There is no human evidence for SLU-PP-332 of any kind. No study retrieved administered it to a living person. | A | S1, S2, S4 | Humans | Allowed, and should lead the Guide | This is the central finding and belongs at the top rather than buried. It is a claim about the state of the record, and the record was queried directly. |
| HU-02 | A direct query of the ClinicalTrials.gov registry for this compound returned zero registered studies. | A | S1, S17, S18 | Humans | Allowed | Query dated 2026-07-21. Must be re-run before publication. Reliability was checked adversarially: a fabricated identifier returned zero studies, a fabricated PMID returned HTTP 404, and a positive control query for semaglutide returned real records, so the zero result is a true negative rather than a broken query path. |
| HU-03 | One retrieved study enrolled human participants, but the compound was applied only to muscle cells cultured from their surgical tissue. It was not given to any person. | D | S4 | Ex vivo human cells | Allowed, and important to state explicitly | This is the single most important accuracy point in the record. The study is the most likely to be cited, honestly or otherwise, as human research. It supplies no human safety, tolerability, or efficacy data. |
| HU-04 | There is no established human pharmacokinetic profile, no human tolerability data, and no adverse event dataset. | A | S1, S2, S6 | Humans | Allowed | Absence is documented by the registry query and by the complete publication listing, not asserted. |
| HU-05 | Human metabolism of the compound has been simulated only in liver preparations, and the authors of that work state it may not reflect authentic human metabolism. | D | S6 | Human liver fractions in vitro | Allowed | The authors call for clinical study. This is the field itself acknowledging that human metabolism is unestablished. |

## 3. Proposed mechanism

| ID | Claim as it would appear to a member | Grade | Sources | Population it applies to | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| ME-01 | In cell systems, SLU-PP-332 has been reported to bind and activate all three ERR isoforms, with a reported preference for ERRalpha. | D | S3, S5 | Cultured cells | Allowed | Selectivity between isoforms is described as modest in S5. Keep the cell system in the sentence. |
| ME-02 | ERR activation is proposed to drive a transcriptional program overlapping the one induced by acute aerobic exercise, covering mitochondrial biogenesis, oxidative phosphorylation and fatty acid oxidation. This has been characterized in cultured cells and in rodents. | D | S3, S5 | Cultured cells and rodents | Allowed, only with the model named in the same sentence | This is the sentence most likely to be stripped of its qualifier downstream and turned into a bare mechanism claim. Any draft that states the mechanism without naming cells or rodents in the same sentence must be rejected. |
| ME-03 | In cultured muscle cells, the compound was reported to enhance mitochondrial respiration. | D | S3 | C2C12 muscle cell line and primary myocyte cultures | Allowed | Cell line result. Carries no implication for a person. |
| ME-04 | In mice, the reported response was diminished in animals lacking ERRalpha, which the study authors read as evidence the effect depends on that receptor. | D | S3 | Mice | Allowed | Report the authors' interpretation as their interpretation. |
| ME-05 | Whether ERR agonism produces any comparable effect in a human being is untested. | A | S1, S2 | Humans | Allowed, and should sit directly beneath every mechanism statement | Translation of a rodent transcriptional program to human physiology is an assumption. The Guide should say so plainly. |

## 4. Reported preclinical findings

| ID | Claim as it would appear to a member | Grade | Sources | Population it applies to | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| PC-01 | In mice, the compound was reported to increase the proportion of oxidative muscle fibres and to improve exercise endurance and grip strength. | D | S3 | Mice | Allowed, with species in the same sentence | Foundational characterization paper. Do not paraphrase into a performance claim. |
| PC-02 | In mouse models of obesity and metabolic syndrome, the compound was reported to increase energy expenditure and fatty acid oxidation. | D | S8 | Mice (diet-induced obese and ob/ob genetically obese) | Allowed, with species in the same sentence | **Upgraded 2026-07-21:** S8 was retrieved directly this session, so the prior provisional flag no longer applies. Never present this as a fat loss claim for a person. |
| PC-03 | In a mouse pressure-overload heart failure model, SLU-PP-332 and the chemically distinct SLU-PP-915 were reported to improve cardiac function through enhanced cardiac fatty acid metabolism and mitochondrial function. | D | S10 | Mice, plus neonatal rat ventricular myocytes in vitro | Allowed, with species in the same sentence and BOTH compounds named | **Upgraded 2026-07-21:** the abstract was retrieved directly, so the prior provisional flag no longer applies. Full text is still not retrieved. This finding covers BOTH compounds, which makes it especially prone to being misattributed to SLU-PP-332 alone. Cardiac framing is high risk for misreading, so the species qualifier is mandatory. The abstract surfaced dose figures which were deliberately excluded and must not be reintroduced. |
| PC-07 | In aged mice, a pan-ERR agonist was reported to reverse age-related albuminuria, podocyte loss, mitochondrial dysfunction and inflammatory markers in the kidney. | D | S14 | Aged mice (21 months old) | Allowed, with species in the same sentence | **NEW 2026-07-21.** Present in the PubMed listing but not enumerated in the prior packet's registry. Human kidney tissue sections were examined histologically in the same work, with NO person receiving the compound. That histology must never be allowed to imply human administration. |
| PC-08 | A 2026 systematic review covering experimental studies in animals and cell models concludes that clinical trials are needed to confirm efficacy and safety in humans. | D | S15 | Animal and cell models | Allowed, for its CONCLUSION only | **NEW 2026-07-21.** This is the review literature independently corroborating the central finding. **Handling caution:** its abstract phrases effects such as improved endurance and reduced body fat without always attaching the species in the same clause, which is exactly the framing this Guide prohibits and a plausible upstream source of commercial copy. Do not quote, reproduce, or paraphrase its effect phrasing. Cite the conclusion, nothing else. |
| PC-04 | A structure-activity study reported that the parent compound has poor solubility, only moderate microsomal stability, and modest selectivity between ERR isoforms. | D | S5 | In vitro | Allowed | These are liabilities of the molecule reported by researchers working to improve on it. No numbers are reproduced here by policy. |
| PC-05 | Detection methods and metabolite panels for this compound have been developed for doping-control purposes. | D | S6, S7 | Human liver preparations in vitro, analytical | Allowed | These are analytical papers with no efficacy or safety endpoints. Their existence is evidence that anti-doping science regards the compound as of interest. |
| PC-06 | The published literature states that SLU-PP-332 improves aerobic performance in mice but lacks oral bioavailability, which is given as the reason a chemically distinct successor compound was developed. | D | S9 | Mice | Allowed, and materially relevant to anyone evaluating an oral product | **Upgraded 2026-07-21:** S9 was retrieved directly this session, so the prior provisional flag no longer applies. This directly undercuts the premise of oral products sold under this name. Naming the route here is permitted because the point is that evidence for it is ABSENT, not instruction. |

## 5. Safety

| ID | Claim as it would appear to a member | Grade | Sources | Population it applies to | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| SA-01 | Human safety has not been characterized. There is no dose-finding work, no pharmacokinetic profile, no adverse event dataset, and no exposure duration for which safety has been studied. | A | S1, S2, S6 | Humans | Allowed, and should appear prominently | State as absence of data. Do not soften. |
| SA-02 | Unknown toxicity is not the same as demonstrated safety. | A | S1, S2 | Humans | Allowed | This sentence should appear in the Guide verbatim in substance. It is the correct reading of an empty safety record. |
| SA-03 | The only toxicity screening in the retrieved literature is a narrow cell-based apoptosis assay, which the authors themselves describe as limited preliminary screening rather than a safety evaluation. | D | S5 | Cultured cells | Allowed | An apoptosis screen addresses acute cytotoxicity in a cell line. It says nothing about organ toxicity, endocrine effects, carcinogenicity, reproductive effects, or chronic exposure. |
| SA-04 | The compound acts on a nuclear receptor family expressed across multiple tissues, and the consequences of sustained systemic activation in humans have not been characterized. | D | S5 | Rodents and cells for the receptor biology, humans for the absence | Allowed | [UNVERIFIED - background knowledge, requires human source check] that broad nuclear receptor agonism is a recognized general source of off-target risk. The tissue distribution point is supported by the retrieved cardiac and muscle literature. |
| SA-05 | Carcinogenicity, genotoxicity, and reproductive or developmental toxicity have not been addressed in any retrieved study. | A | S2 | Not studied in any species in the retrieved record | Allowed | Absence across the full publication listing. |
| SA-06 | Interactions with medications, supplements, or medical conditions are unknown. No data was located. | A | S2 | Humans | Allowed | Absence. |
| SA-07 | Validated detection methods now exist, so a tested athlete faces real competitive exposure regardless of unresolved questions about classification. | D | S6, S7 | Tested athletes | Allowed | Detection capability is established even though listing status is not confirmed. Pair with REG-03. |

## 6. Product quality and market

| ID | Claim as it would appear to a member | Grade | Sources | Population it applies to | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| QU-01 | The compound is routinely mislabelled as a peptide in the market, which means buyers may have an incorrect understanding of what the substance is and of what analytical test would verify it. | E | S11 for identity, market observation for the mislabelling | Purchasers | Allowed, framed as market observation | The identity half is grade A via S11. The market half rests on search result summaries of commercial pages, which are not evidence and are labelled as such. |
| QU-02 | Material sold under this name sits outside any pharmaceutical quality system. No pharmacopeial monograph, regulated manufacturer, or approved identity, purity, or potency specification was located. | G | S12 for the regulatory absence, market observation otherwise | Purchasers | Allowed, framed as absence of oversight | Do not state or imply that any specific product is contaminated or substandard. The honest claim is that nothing establishes what is in material sold under this name. |
| QU-03 | Products are sold in oral form under this name even though the primary literature states the parent compound is not orally bioavailable. | D for the literature, E for the market observation | S9, market observation | Purchasers | Allowed | Either such a product does not behave as claimed by that route, or it is not what its label says. Both are quality problems. State the tension, not a conclusion about any named seller. |
| QU-04 | Commercial copy frequently conflates this compound with its chemically distinct successor. | E | S9, market observation | Purchasers | Allowed, framed as market observation | Evidence generated for one compound is routinely presented as if it applied to the other. |
| QU-05 | No independent third-party analytical survey of marketed product was located. | G | Search gap | Purchasers | Allowed, as a stated gap | Record as a gap, not as a finding about product quality in either direction. |

## 7. Regulatory and anti-doping

| ID | Claim as it would appear to a member | Grade | Sources | Population it applies to | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| REG-01 | No FDA approval for any indication was located, and no FDA warning letter or safety communication naming the compound was located. | G, negative search finding | S12 | United States | Allowed, with the negative-finding qualifier | **Updated 2026-07-21:** the finding rests on a re-run site-restricted search. The 503A compounding list page itself was NOT re-fetched this session and the entry is marked NOT VERIFIED. This is an absence of a retrieved document. FDA appears simply not to have addressed the compound. It must never be presented as FDA having reviewed, cleared, or found it acceptable. See REGULATORY_STATUS.md. |
| REG-02 | There is no registered clinical development program for this compound. | A | S1 | United States registry | Allowed | Directly from the registry query. |
| REG-03 | Anti-doping classification could not be confirmed from WADA's own documents, on two consecutive sessions. An athlete should confirm current status directly with WADA or their national anti-doping organization. | G | S13 and S16 failed retrieval, S7 for the cautious peer-reviewed wording | Tested athletes | Allowed, and this is the only permitted formulation | **Updated 2026-07-21.** Both the Prohibited List landing page and the 2026 Prohibited List news page returned empty content. The peer-reviewed paper says only that non-approved substances with performance-enhancing potential can be subject to the WADA Prohibited List, which does not assert current listing of this compound. A search snippet describing the general content of the S4 metabolic modulators class does not name SLU-PP-332 and did not come from a retrieved WADA page, so it establishes nothing here and must not be repeated. |
| REG-04 | Non-US regulators were not searched for this Guide. | G | Search gap | All non-US jurisdictions | Allowed, as a stated gap | EMA, MHRA, TGA and Health Canada were not searched. No statement about those jurisdictions may be made. |

## 8. PROHIBITED claims

These claims must never appear on any member-facing surface for this compound, in any wording, in any
channel, including marketing copy, email, social content, customer service replies, and the Guide itself.
This section is the operative part of this table.

| ID | Prohibited claim or framing | Why it is prohibited |
| --- | --- | --- |
| PR-01 | Any dose, amount, concentration, frequency, timing, cycle length, titration, loading, stacking, reconstitution, injection technique, or route of administration. | Policy, absolute. No human dose exists, and none may be implied. Where a reader expects this information, write: "Dosing and administration information is intentionally excluded from Xenios Research Guides." |
| PR-02 | Any statement that the compound is safe, well tolerated, or free of side effects. | There is no human safety data of any kind. Absence of studied harm is not evidence of safety. |
| PR-03 | Any statement that it burns fat, builds muscle, improves endurance, improves cardiac function, or enhances performance in people. | Every one of these traces to rodent or cell findings. Presenting them as human outcomes is a preclinical-to-human leap and is the primary failure mode in this subject area. |
| PR-04 | Any bare mechanism sentence that omits the species or model, for example a sentence stating that it increases mitochondrial biogenesis or fatty acid oxidation without naming rodents or cultured cells in the same sentence. | Reads as human fact. The model must appear in the same sentence as the finding, without exception. |
| PR-05 | Describing it as exercise in a bottle, a workout replacement, or a substitute for training. | Unsupported, and a direct misreading of a research label applied to a rodent transcriptional program. |
| PR-06 | Calling it a peptide, or presenting it within peptide framing without correction. | Factually wrong. It is a small molecule per S11. |
| PR-07 | Presenting the ex vivo human cell study as human evidence, human research, or a clinical trial of the compound. | The compound was applied only to cultured cells from surgical tissue. No person received it. This is the most likely single point of downstream error. |
| PR-08 | Presenting findings for the successor compound as findings for SLU-PP-332, or the reverse. | Chemically distinct compounds with different pharmacokinetic profiles. |
| PR-09 | Stating a specific WADA Prohibited List classification, including any subsection, as fact. | Not verified. WADA's own list could not be retrieved. The specific classification circulating commercially traces only to non-evidentiary sources. |
| PR-10 | Stating that FDA has reviewed, cleared, evaluated, or found the compound acceptable, or implying anything from the absence of an FDA document. | A negative search finding is not a regulatory position. |
| PR-11 | Any use of "research use only" or "not for human consumption" framing as a device to imply human benefit or to signal that use is intended. | Prohibited framing. It launders an unstudied compound into an implied product. |
| PR-12 | Guaranteed or absolute outcome language: will, proven to, restores, cures, eliminates, reverses, clinically proven, doctor recommended. | Unsupported for every claim about this compound. Use "has been studied for", "reported in", "investigated as", or "associated with in rodent models". |
| PR-13 | Any protocol, regimen, schedule, or set of instructions a reader could follow. | Not permitted. This is educational content, not direction. |
| PR-14 | Any comparison presenting this compound as safer, cleaner, or better than a named alternative compound. | No comparative human data exists for any of these, and none was retrieved for the comparators. |
| PR-15 | Any sourcing, purchasing, vendor selection, quality-testing, or acquisition guidance. | Out of scope and prohibited. |
| PR-16 | Any statement that a specific marketed product is authentic, pure, contaminated, or substandard. | No independent analytical survey of marketed product was located. Nothing supports a claim in either direction. |
| PR-17 | Any medical framing: treating, managing, or preventing a condition, or any suggestion a reader discuss starting it with a clinician as though it were a therapy. | No approved indication, no human data, no clinical role. |
| PR-18 | Quoting, reproducing, or paraphrasing the effect phrasing in the 2026 systematic review's abstract (PMID 42024694), which states effects such as improved endurance and reduced body fat without always attaching the species in the same clause. | Species-stripped framing, and a plausible upstream source of commercial copy that reads as human fact. The review may be cited ONLY for its conclusion that clinical trials are needed to confirm efficacy and safety in humans. |
| PR-19 | Presenting the histological examination of human kidney tissue sections in the aged-mouse study (PMID 37717940) as human administration, human research, or human evidence. | No person received the compound in that work. It is the same failure mode as PR-07, in a second study. |
| PR-20 | Stating the chemical identity values (molecular formula, molar mass, CAS registry number, IUPAC name) as confirmed fact while they carry the unverified flag. | They were carried forward from a prior packet's tertiary source and were not re-retrieved on 2026-07-21. The substance-class correction is unaffected; the specific values are not. |

## 9. Overall editorial position

The honest summary of this table is short. SLU-PP-332 is an early-stage preclinical research chemical
with a genuine rodent and cell-based signal published in credible journals, and with zero human evidence
of any kind. Its evidence base cannot support a claim about what it does in a person, and its safety
cannot be characterized because it has never been studied in one. The Guide should say this first,
plainly, and should treat the identity correction (small molecule, not peptide) and the oral
bioavailability contradiction as the two most practically useful things a member can take away.
