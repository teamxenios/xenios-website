---
title: DSIP Claim Table
type: research-guide-claim-table
compound: dsip
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# DSIP Claim Table

One row per discrete claim. Grades apply to individual claims, never to the compound as a
whole. Source ids refer to SOURCE_REGISTRY.md.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## The headline finding

The age of the literature is the finding. Every human sleep study located dates from 1981 to
1992. There has been no modern human replication in roughly three and a half decades, and a
direct query of the ClinicalTrials.gov API returned zero registered DSIP trials of any kind
(S08, S09). Underneath the clinical weakness sits a deeper problem: no DSIP gene, precursor, or
receptor has ever been identified in any species, so the molecule's status as a genuine
endogenous signal was never established (S05).

Unlike a compound with no human data at all, DSIP does have three small human studies. That is
why some rows below reach grade C. It is important to read what those rows say. The one
frequently cited positive result came from an open, uncontrolled, unblinded trial of seven
people. When the question was put to double-blind control, both controlled studies concluded
against clinical benefit, in the authors' own words.

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

No claim in this table is graded A or B. Nothing about DSIP is established or supported in
humans. Grade C rows here mostly carry negative or null findings, because that is what the
controlled human studies produced.

## Section 1. Human evidence

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| DSIP-H-01 | Every human sleep study of DSIP that could be located was published between 1981 and 1992. There has been no modern human replication in roughly three and a half decades. | C | S01, S02, S03, S04 | Statement about the literature | Yes | This is the single most important line in the Guide and it should lead. A line of inquiry that generated active human study in the 1980s and then generated none for three decades is best read as tried and quietly abandoned, not as a promising idea awaiting rediscovery. |
| DSIP-H-02 | A direct query of the ClinicalTrials.gov registry returned zero registered DSIP trials. A second query on the intervention name returned one record, which is a study of L-carnitine and insulin resistance and involves no DSIP. | C | S08, S09 | Statement about the registry | Yes | Report the correct reading, which is zero. Do not let the single fuzzy text match be counted as a trial. |
| DSIP-H-03 | In a 1987 double-blind crossover study with polysomnographic recording in chronic insomniacs, reductions in nocturnal awakenings, sleep latency, and waking time after sleep onset were reported, and total sleep time and non-REM sleep increased, driven primarily by an increase in stage 2 sleep. The authors concluded that the sleep improvement was of little clinical significance. | C | S01 | Adult male and female middle-aged chronic insomniacs. Sample size not stated in the retrieved abstract | Yes, only with the authors' own negative conclusion in the same passage | No significant differences were detected against either baseline or placebo on the primary comparisons despite some isolated stage-level measures reaching significance. The size of the best-controlled study located is unknown to this record, which is itself a defect a reviewer must close. |
| DSIP-H-04 | In the same 1987 study, slow wave sleep and REM sleep were not modified. | C | S01 | As above | Yes | Give this line prominence. Slow wave sleep is delta sleep, the property the compound is named for, and the best available human measurement did not find it. |
| DSIP-H-05 | In a 1992 double-blind matched-pairs study of 16 chronic insomniac patients, higher sleep efficiency and shorter sleep latency were observed versus placebo, and one measure of subjectively estimated tiredness decreased. No other measure changed, including subjective sleep quality. | C | S02 | 16 chronic insomniac patients. Demographic detail not given in the retrieved abstract | Yes, only with the authors' own conclusion attached | The authors stated the significant effects were weak and in part could be due to an incidental change in the placebo group, and concluded that short-term treatment of chronic insomnia is not likely to be of major therapeutic benefit. Sixteen participants is severely underpowered. Note for a member that subjective sleep quality, arguably the outcome that matters most to a person with insomnia, was unchanged. |
| DSIP-H-06 | In a 1984 open trial with no control group, no blinding, and no placebo, sleep was reported as normalised in all but one of seven patients with severe insomnia over follow-up periods of three to seven months, with reported improvement in daytime mood and performance. | C | S03 | 7 adult and elderly patients with severe insomnia | Yes, only with its design stated in the same sentence | This is the most frequently cited positive DSIP result and it is methodologically the weakest of the three. A design of this type cannot separate a drug effect from placebo response, regression to the mean, or investigator expectancy. The paper also flags complications in patients with a long-standing history of drug dependence. Never cite this result without naming the design. |
| DSIP-H-07 | A further early human sleep study exists, indexed as PMID 7028502, and it was not examined for this Guide. | G | S04 | Not retrieved | Yes, as a stated gap only | The fetch returned a reCAPTCHA rather than the record. No author, journal, population, or result may be asserted. Report it as an open gap so a member knows the human evidence section is incomplete by exactly one study. |
| DSIP-H-08 | Whether DSIP improves sleep in people in any clinically meaningful way. | G | S01, S02, S03 | Humans | Yes, as a statement that this is unresolved and that the controlled evidence points against it | The overall grade for any claim of human benefit. See CONTRADICTIONS.md entry C-01. Do not present the disagreement between the open trial and the controlled trials as a live scientific standoff. |
| DSIP-H-09 | No systematic review or meta-analysis of DSIP and sleep was located. Only narrative reviews from 1984 and 2006 exist. | C | S05, S06 | Statement about the literature | Yes | Add the honest note that with three small heterogeneous trials a meta-analysis would not be meaningful in any case. |

## Section 2. Identity and characterisation

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| DSIP-I-01 | No DSIP gene, precursor peptide, or receptor has ever been identified in any species. A 2006 review in the Journal of Neurochemistry treats this as the central unresolved problem and notes that the link between DSIP and sleep has never been further characterised, in part because the DSIP gene was never isolated. | D | S05 | Not applicable, basic biology | Yes | This is an unusual and important weakness at the level of basic identity, not merely at the level of clinical evidence. It belongs high in the Guide, not in a footnote. |
| DSIP-I-02 | DSIP is a nonapeptide, meaning a chain of nine amino acids, with the sequence Trp-Ala-Gly-Gly-Asp-Ala-Ser-Gly-Glu, first described in 1974 from the cerebral venous blood of rabbits during induced sleep. In regulatory contexts it is also referred to as emideltide. | G | S14 | Not applicable, chemical identity | Yes, with the verification flag carried | [UNVERIFIED - background knowledge, requires human source check] The sequence, the discovery year, and the regulatory name came from tertiary background used for orientation, not from a primary chemical or regulatory source. Confirm before publication. |
| DSIP-I-03 | Because no gene or receptor has been identified and there is no approved reference product in any jurisdiction, the synthetic peptide sold and studied under this name cannot be confirmed to correspond to a genuine endogenous human signalling molecule. | D | S05 | Not applicable | Yes | The honest description is a hypothesised factor whose endogenous status was never confirmed, not a known human sleep hormone. See CONTRADICTIONS.md entry C-03. |
| DSIP-I-04 | A 2006 note records that BLAST searching, a standard method for comparing a sequence against known sequences, aligned the DSIP sequence with a hypothetical bacterial protein, raising a question about the peptide's presumed mammalian origin. | D | S05 | Not applicable | Yes, with the word "raises a question" retained | Do not overstate this. It is a question raised in a review, not a demonstration of bacterial origin. |
| DSIP-I-05 | The 2006 review proposes that a DSIP-like peptide, rather than DSIP itself, may account for the effects reported in the literature. | D | S05 | Not applicable | Yes | Central to reading the whole evidence base. If the active thing may not be the thing being sold, every downstream claim weakens further. |

## Section 3. Proposed mechanism

Every claim in this section is proposed. None has been confirmed in a living human being, and
the compound's own name asserts a mechanism the best human measurement did not find.

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| DSIP-M-01 | The historical proposal is that DSIP acts as an endogenous sleep-promoting factor modulating sleep and wake regulation, with the original animal work reporting induction of spindle and delta EEG activity. | D | S06 | Animals | Yes, with "proposed" and the animal origin in the same sentence | Never write this as characterised pharmacology. No receptor has ever been identified, so there is no established target for it to act on. |
| DSIP-M-02 | A 1984 review frames DSIP as a multifunctional neuroregulatory peptide affecting electrophysiological activity, brain neurotransmitter levels, circadian and locomotor patterns, and hormonal levels in animal models, rather than acting as a sedative. | D | S06 | Rabbits, rats, mice, cats, across the models cited in the review | Yes, with the species named | Useful framing. It undercuts the simple story that this is a sleep drug. |
| DSIP-M-03 | In mice with chemically induced insomnia, a 2024 study reported normalisation of serotonin, melatonin, dopamine, and glutamate levels by an engineered DSIP fusion peptide. | D | S07 | Male Kun-Ming mice | Yes, only with both "in mice" and "an engineered fusion peptide" in the same sentence | The tested article was not DSIP. Do not let this row be read as a mechanism for the compound members encounter. |
| DSIP-M-04 | A 2006 review reports that DSIP itself did not demonstrate clear effects in animal work while certain structural analogues did show sleep-promoting activity in animal models. | D | S05 | Animals | Yes | This directly weakens every mechanism claim. It also blocks the substitution of analogue results for DSIP results. |
| DSIP-M-05 | The human controlled data do not support the delta-sleep mechanism embedded in the compound's own name, because slow wave sleep was not modified in the 1987 double-blind study. | C | S01 | Humans | Yes | Marketing material that leans on delta sleep as a mechanism is leaning on the name, not on the human data. Make that sentence explicit. |
| DSIP-M-06 | Any confident statement of how DSIP works in a person. | G | None | Humans | No | The mechanism is hypothesised, not established. Do not publish a confident mechanism narrative in any form. |

## Section 4. Preclinical findings

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| DSIP-P-01 | In a 2024 study of 48 male Kun-Ming mice of approximately eight weeks of age with insomnia induced by p-chlorophenylalanine, an engineered DSIP fusion peptide designed to cross the blood-brain barrier and secreted from the yeast Pichia pastoris was reported to reduce wakefulness time, decrease anxiety-like and depressive-like behaviours, and improve hippocampal tissue morphology. | D | S07 | Mice | Yes, only with the mouse model and the fusion-construct caveat travelling with it | This is the only recent primary research located and it cannot be presented as modern validation of DSIP for human sleep. |
| DSIP-P-02 | In that same mouse study, the engineered fusion peptide outperformed plain DSIP. | D | S07 | Mice | Yes | Read this carefully and state it plainly. It is an implicit finding that unmodified DSIP performed less well in that model, so the newest research points away from the compound, not towards it. |
| DSIP-P-03 | A 1984 review reported delta-sleep induction in rabbits, rats, and mice, with a more pronounced REM effect in cats. | D | S06 | Rabbits, rats, mice, cats | Yes, with the species named | The differing response in cats indicates the effect is not consistent across species, which is a caution and not a supporting detail. Present it as such. |
| DSIP-P-04 | The same 1984 review describes a non-monotonic response in animal models, meaning the response did not increase steadily with either the amount given or the timing of administration. | D | S06 | Animals | Yes, phrased with no quantities | A non-monotonic response is a signal that the underlying effect was unstable. Write it without reproducing any amount, timing, or schedule from the source. |
| DSIP-P-05 | Effects on neurotransmitter levels, circadian and locomotor patterns, and hormonal levels were reported in animal models. | D | S06 | Animals | Yes, with the species framing | Breadth of reported effect is not the same as strength of effect. Do not let this read as a rich mechanism. |

## Section 5. Safety signals

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| DSIP-S-01 | Human safety data are essentially absent. No study located was designed or powered as a safety study, none had long-term follow-up, and combined human exposure across the entire located literature is in the order of a few dozen people. | C | S01, S02, S03, S08 | Humans | Yes | Must appear before any other safety line. Absence of reported harm in a literature this small is not evidence of safety. A literature of a few dozen people could not detect an uncommon harm even if one existed. |
| DSIP-S-02 | Immunogenicity, meaning whether the body mounts an immune response against the substance, has not been assessed. Reporting on the FDA's 2026 advisory committee review indicates FDA cited insufficient human safety data including unassessed immunogenicity risk across the peptides under review. | G | S11, S12 | Humans | Yes, only with the verification flag stated in the text | [UNVERIFIED - FDA primary documents returned HTTP 404 this session. Requires human confirmation against the FDA source before publication.] Do not attribute this wording to FDA as its own words until a human has read the FDA document. |
| DSIP-S-03 | Because no molecular target has ever been identified, downstream and off-target effects in a person cannot be predicted from the existing literature. | D | S05 | Humans | Yes | Follows directly from DSIP-I-01. Frame as an open question, never as a predicted harm and never as a reassurance. |
| DSIP-S-04 | Vendor and marketing claims that DSIP has no dependency potential, no withdrawal, no organ toxicity, and no identified lethal amount in animal models. | PROHIBITED | S15 | Marketing claim | No | See DSIP-X-02. These are grade E or G market claims, not findings. None was traceable to a retrieved primary study. Claims of this shape are precisely what a small, old literature cannot support. |
| DSIP-S-05 | There is no pharmacopoeial standard against which material sold as DSIP can be verified for identity, purity, or content, because no gene or receptor has been identified and there is no approved reference product in any jurisdiction. | D | S05 | Not applicable, supply and standards | Yes | Reporting on the FDA review indicates FDA cited that the substances under consideration are not well characterised. That reported FDA element is unverified and carries the same flag as DSIP-S-02. |
| DSIP-S-06 | No study testing material sold as DSIP for identity, purity, sterility, or endotoxin content was located, and no adverse event reporting database was searched. | G | None located | Not applicable | Yes | State both as gaps. Neither is a clean bill of health. Nobody appears to have checked, and this research session did not check the reporting databases either. |
| DSIP-S-07 | The 1984 open trial noted complications in patients with a long-standing history of drug dependence. | C | S03 | 7 patients in an open uncontrolled trial | Yes, with the study design named | This is the only participant-level complication note located in any human study. Report it plainly. Do not extrapolate it into a characterised risk, and do not let its existence imply that other risks were ruled out. |

## Section 6. Unknowns

Presented to members as an explicit list rather than left as silence.

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| DSIP-U-01 | Whether DSIP is a genuine endogenous mammalian peptide at all. No gene, receptor, or precursor has been identified in over fifty years. | D | S05 | Not applicable | Yes | |
| DSIP-U-02 | Whether any of the reported human sleep effects would survive a modern, adequately powered, blinded trial. This has never been tested. | C | S01, S02, S08 | Humans | Yes | |
| DSIP-U-03 | The human safety profile over any duration. No located study was designed as a safety study and none had long-term follow-up. | C | S01, S02, S03 | Humans | Yes | Phrase without reference to amounts or duration of use. |
| DSIP-U-04 | Immunogenicity in humans. Flagged as an unassessed risk in the regulatory context and not characterised in any retrieved study. | G | S11, S12 | Humans | Yes, with the verification flag | |
| DSIP-U-05 | Human pharmacokinetics and stability. Reviews note rapid degradation, and how much administered peptide reaches the central nervous system is not established. | D | S05, S06 | Humans | Yes | Do not name a route as instruction. Naming that no human data exists for any route is permitted. |
| DSIP-U-06 | Whether the 2024 mouse fusion-peptide findings have any bearing on unmodified DSIP in humans. The fusion construct was specifically engineered to cross the blood-brain barrier, which implies unmodified DSIP does so poorly. | D | S07 | Mice to humans | Yes | Attach to DSIP-P-01 and DSIP-P-02 wherever they appear. |
| DSIP-U-07 | Whether material sold outside regulated channels contains what it claims, in the absence of any approved reference product or pharmacopoeial standard. | D | S05 | Not applicable | Yes | |
| DSIP-U-08 | The content of PMID 7028502, an early human sleep study that could not be retrieved. | G | S04 | Not retrieved | Yes, as a gap | |
| DSIP-U-09 | Interactions with any medicine or supplement. No interaction data was located in any retrieved source. | G | None located | Humans | Yes | Unstudied is not the same as absent. |
| DSIP-U-10 | Behaviour in specific populations, including pregnancy, breastfeeding, children, older adults, people with psychiatric or neurological conditions, and people taking sedative, hypnotic, or central nervous system medication. | G | None located | Those populations | Yes | |
| DSIP-U-11 | Whether DSIP is specifically addressed by any anti-doping authority. This could not be confirmed. Athletes subject to testing should consult their own anti-doping authority. | G | S13 | Tested athletes | Yes, with the referral | The Prohibited List could not be read directly. Do not state or imply a status. See REGULATORY_STATUS.md. |
| DSIP-U-12 | The verified outcome of the July 2026 FDA advisory committee consideration of emideltide, because the FDA primary documents could not be retrieved. | G | S11, S12 | Not applicable | Yes, with the verification flag | |

## Section 7. PROHIBITED claims

These may not appear on any member-facing surface, in any form, hedged or otherwise.

| Claim ID | Prohibited claim | Why it is prohibited | Reviewer notes |
| --- | --- | --- | --- |
| DSIP-X-01 | Any statement that DSIP improves sleep, deepens sleep, induces delta sleep, or treats insomnia in people. | The two double-blind controlled studies concluded against clinical benefit in their authors' own words (S01, S02), and the human data specifically did not find a change in slow wave sleep (S01). | Use "was studied in", "was reported in a 1984 open trial", or "investigated as". Never a bare outcome verb. |
| DSIP-X-02 | Any statement that DSIP is safe, well tolerated, non-addictive, free of withdrawal, free of organ toxicity, or free of an identified lethal amount. | No human safety study exists. Combined human exposure across the whole literature is in the order of a few dozen people (S01, S02, S03). These claims trace to commercial pages (S15) and describe a level of characterisation that this literature could not produce. | Includes softened forms such as "generally considered safe" and "no reported side effects". |
| DSIP-X-03 | Any presentation of the 1984 open trial result as evidence of efficacy, or any presentation of the disagreement between it and the controlled trials as "mixed evidence" implying a live scientific dispute. | Position A is an open, uncontrolled, unblinded trial of seven people with subjective endpoints. Position B is two double-blind controlled studies. This is not an evidential standoff (S01, S02, S03). See CONTRADICTIONS.md entry C-01. | When a striking open-label result fails to survive blinding and placebo control, the standard inference is placebo response and expectancy rather than drug effect. Say so. |
| DSIP-X-04 | Any use of "delta sleep" as an established mechanism, or any implication that the compound's name describes a demonstrated human effect. | The best-controlled human measurement found slow wave sleep unmodified (S01). The name asserts a mechanism the human data did not find. | This is the most elegant correction available for this compound and it should be made explicitly rather than left implied. |
| DSIP-X-05 | Any description of DSIP as a known, natural, or endogenous human sleep hormone. | No gene, precursor, or receptor has been identified in any species in over fifty years (S05). Immunoassay detection of DSIP-like material is much weaker evidence than gene or receptor identification, because antibodies can cross-react with unrelated molecules. | The permitted description is a hypothesised factor whose endogenous status was never confirmed. |
| DSIP-X-06 | Any presentation of the 2024 Frontiers in Pharmacology mouse study as modern validation of DSIP for human sleep. | It is a mouse study, of an engineered fusion peptide, not of DSIP itself, and in it the engineered construct outperformed plain DSIP (S07). | If anything it points the other way. Every citation of it must name the species and the fusion construct in the same sentence. |
| DSIP-X-07 | Any presentation of results for structural analogues as though they were DSIP results. | The 2006 review reports that certain analogues showed sleep-promoting activity while DSIP itself did not show clear effects (S05). | Substituting analogue evidence is a factual error, not a simplification. |
| DSIP-X-08 | Any use of "will", "proven to", "restores", "cures", "eliminates", "reverses", or "guarantees" in connection with DSIP. | Guaranteed outcome language. Nothing about this compound is proven in people. | Applies to headings and metadata as well as body text. |
| DSIP-X-09 | Any statement of the FDA position on emideltide presented as verified. | All four FDA primary URLs failed with HTTP 404 in this session (S11, S12). Every FDA-derived statement rests on search-index snippets and secondary trade reporting. | Publish only with the verification flag visible, or not at all. A reviewer must confirm against FDA primary documents first. |
| DSIP-X-10 | Any statement of DSIP's status on the WADA Prohibited List presented as a retrieved WADA ruling. | The Prohibited List PDF returned empty content (S13). The S0 reasoning is an inference from a category definition combined with DSIP's unapproved status, not a WADA statement about DSIP. | Direct athletes to their own anti-doping authority. |
| DSIP-X-11 | Any citation of, or content from, PMID 7028502. | It was never retrieved. The fetch returned a reCAPTCHA interstitial (S04). | Its existence may be reported as a gap. Nothing inside it may be asserted. |
| DSIP-X-12 | Any dose, amount, concentration, frequency, timing, cycle, titration, reconstitution instruction, injection technique, or route of administration. | Category rule for all Xenios Research Guides. | Where a reader would expect this, write: Dosing and administration information is intentionally excluded from Xenios Research Guides. The non-monotonic response finding at DSIP-P-04 must be written with no quantities. |
| DSIP-X-13 | Any framing of DSIP as "research use only" that implies human benefit, and any guidance on where or how to obtain it. | The research-use framing is prohibited as a device. Acquisition guidance is out of scope for a Guide. | Applies to captions, footnotes, and links as well as body text. |
| DSIP-X-14 | Publication of the sequence, the 1974 discovery date, or the regulatory name emideltide as verified facts. | These came from tertiary background used for orientation only (S14). | [UNVERIFIED - background knowledge, requires human source check] They may appear only while carrying that flag, or after a human confirms them against a primary source. |

## Reviewer sign-off checklist

1. Every preclinical sentence names its species or model in the same sentence as the finding.
2. Every sentence citing the 2024 study names both the mouse model and the engineered fusion
   construct.
3. No sentence contains a dose, route, schedule, amount, or preparation detail.
4. Every human study citation carries its design and, where known, its sample size.
5. The 1984 open trial is never cited without its design named in the same sentence.
6. Every regulatory sentence carries a jurisdiction, a date, and a source URL, and every
   FDA-derived sentence carries its unverified flag.
7. Every claim graded G or marked [UNVERIFIED] has either been closed by a human check or removed.
8. No citation appears that is not present in SOURCE_REGISTRY.md, and nothing from S04 appears
   at all.
