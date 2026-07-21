---
title: Dihexa Claim Table
type: research-guide-claim-table
compound: dihexa
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# Dihexa Claim Table

One row per discrete claim. Grades apply to individual claims, never to the compound as a whole.
Source ids refer to SOURCE_REGISTRY.md.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## The headline finding

No human study of dihexa of any design was located. A ClinicalTrials.gov query returned totalCount
0 (S01), and a PubMed search restricted to clinical trial publication types returned zero records
(S06). The human evidence table below is empty, and that empty table is the finding.

That null result was validated adversarially in the same session against the same API. A
deliberately fake identifier returned HTTP 404 (S03), and a positive control query returned 744
real studies (S04). The zero therefore reflects genuine absence, not a broken tool.

Nothing in the preclinical section may be read as applying to a person. In particular, the
registered clinical trials that a member will find when searching belong to fosgonimeton, a
different compound. See section 7.

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

No claim in this table is graded A, B, or C, because no human study of dihexa was retrieved.

## Section 1. Human evidence

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| DIH-H-01 | No human clinical trial of dihexa has been located. A ClinicalTrials.gov query for dihexa returned zero studies, and a PubMed search restricted to clinical trial publication types returned zero records. | D | S01, S06 | Not applicable, this is a statement about the literature | Yes | The single most important line in the Guide. Graded D rather than higher because it describes the state of the evidence base, not a studied effect. Absence of study is not evidence of safety and must never be presented as one. |
| DIH-H-02 | The zero result was tested rather than assumed. A deliberately fake registry identifier returned a not-found error, and a positive control query returned hundreds of real studies, so the absence reflects the registry rather than the search. | D | S03, S04 | Not applicable | Yes | Include this. It is what separates an honest null finding from a lazy one, and a reviewer re-running the check should re-run both controls. |
| DIH-H-03 | There is no human safety profile of any kind for dihexa: no adverse event dataset, no known contraindication set, no drug-interaction data, no long-term exposure data, and no organ-system toxicity characterisation in humans. | D | S01, S06 | Not applicable | Yes | Pair with DIH-H-01 wherever it appears so that a member does not read silence as reassurance. |

Human evidence table: intentionally empty of effect claims. See CONTRADICTIONS.md, entry C-01, for
why content pointing at Athira Pharma's trials as dihexa evidence is not merely unsupported but
wrong on the identity of the compound.

## Section 2. Identity and characterisation

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| DIH-I-01 | Dihexa, also carrying the development code PNB-0408, is a synthetic oligopeptide analog of angiotensin IV, chemically N-hexanoic-Tyr-Ile-(6)-aminohexanoic amide. It was developed by researchers at Washington State University. | D | S07 | Not applicable, chemical identity | Yes | Identity confirmed in the retrieved primary paper. Graded D because the supporting source is a preclinical study rather than a chemical registry entry. |
| DIH-I-02 | Dihexa is an investigational research compound with no marketing approval in any jurisdiction identified in this research. | D | S01, S14, S15 | Not applicable | Yes | State it as what was identified, not as a global negative. Two regulatory checks failed to retrieve, which is recorded separately. |
| DIH-I-03 | PubMed indexes dihexa under the supplementary concept "n-hexanoic-tyr-ile-(6) aminohexanoic amide". | D | S05 | Not applicable | Yes | Useful for a member who wants to run the literature search themselves. |
| DIH-I-04 | Dihexa is a distinct compound from fosgonimeton, also known as ATH-1017 and formerly NDX-1017. Findings and trials belonging to fosgonimeton are not findings about dihexa. | D | S02, S12 | Not applicable | Yes | This line is the most load-bearing corrective in the whole Guide. It must appear prominently and early. ALZFORUM describes fosgonimeton only as one that may be related to dihexa and does not assert chemical identity. |
| DIH-I-05 | Reported chemical registry (CAS) number for dihexa. | G | S16 | Not applicable | No | [UNVERIFIED - vendor-sourced, requires human source check] The number appears on vendor listings only and was not confirmed against a regulatory or authoritative chemical registry. Its digits are deliberately not reproduced anywhere in this folder. Do not publish until a registry entry is read. |
| DIH-I-06 | There is no pharmacopoeial monograph and no approved reference standard for dihexa. | D | S16 | Not applicable | Yes | Follows from its unapproved investigational status. Relevant to quality as much as to identity. |

## Section 3. Proposed mechanism

Every claim in this section is proposed, derives from animal, rat neuronal, and cultured-cell work,
and has not been confirmed in a living human being.

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| DIH-M-01 | Dihexa is reported to bind hepatocyte growth factor (HGF) with high affinity and to potentiate HGF signalling at the c-Met receptor, inducing c-Met phosphorylation in the presence of subthreshold HGF concentrations. Its proposed mechanism therefore runs through the HGF and c-Met system rather than through classical angiotensin receptors. | D | S07 | Cell systems and rat tissue, not people | Yes, only with the preclinical context in the same sentence | Never write this as a bare mechanism sentence. It reads as established human pharmacology if unqualified. |
| DIH-M-02 | In rat hippocampal neurons and rat organotypic slice cultures, dihexa induced spinogenesis and synaptogenesis, meaning the formation of new connection points between nerve cells. | D | S07 | Rat neurons and rat slice cultures | Yes, with the rat context in the same sentence | The finding is real and it is in rat tissue. The species must travel with it every time. |
| DIH-M-03 | The c-Met dependence of the effect was established experimentally: in rat neuronal preparations, the effect was abolished by an HGF antagonist and by short hairpin RNA directed at c-Met. In rats, the procognitive effect was blocked when an HGF antagonist was delivered directly into the brain. | D | S07 | Rat preparations and male Sprague-Dawley rats | Yes, with the species stated | This is genuinely good mechanistic work and should be described as such. It is also the reason the safety concern is mechanistically grounded rather than speculative. |
| DIH-M-04 | Dihexa augmented HGF-dependent cell scattering in Madin-Darby canine kidney cells and induced c-Met phosphorylation in human HEK-293 cells. | D | S07 | Canine kidney cells and human embryonic kidney cells, in a dish | Yes, only with the cell-culture context in the same sentence | Human-derived cells in a dish are still preclinical. HEK-293 is a laboratory cell line, not a person. |
| DIH-M-05 | The mechanism proposed for dihexa is potentiation of a growth-factor pathway, which is the same fact that generates the principal theoretical safety concern. | D | S07, S10, S11 | Not applicable | Yes | Mechanism and risk are the same sentence for this compound. Never present the mechanism section without this link. |
| DIH-M-06 | Reported HGF binding affinity figure for dihexa. | G | None retrieved | Not applicable | No | [UNVERIFIED - primary source not opened this session] The specific affinity figure was not verified against the primary paper. Do not publish a number. |
| DIH-M-07 | Whether dihexa crosses the human blood-brain barrier as reported for rodents. | G | None | Humans | No, state only as an unknown | Do not assert brain penetration in people. It is listed in the unknowns instead. |

## Section 4. Preclinical findings

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| DIH-P-01 | In male Sprague-Dawley rats tested in the Morris water maze, dihexa and its parent compound Nle1-AngIV produced a procognitive effect, and that effect was blocked by an HGF antagonist delivered into the rat brain. | D | S07 | Male Sprague-Dawley rats | Yes, with the rat context in the same sentence | The foundational behavioural result. Describe it as a rat maze result, never as improved memory or cognition in general terms. |
| DIH-P-02 | NEGATIVE RESULT. In male Wistar rats given 3-nitropropionic acid to model Huntington's-disease-like symptoms, the angiotensin IV analog PNB-0408 (dihexa) did not protect against the induced deficits, despite the compound's reported activity in other rodent neurodegeneration models. | D | S08 | Male Wistar rats | Yes, prominently | A negative preclinical result is the finding most likely to be missing from secondary coverage of this compound, so it must be given equal weight to the positive one. Do not bury it below the positive findings. |
| DIH-P-03 | A 2018 systematic review of 32 experimental studies, screened from 450 articles and explicitly limited to non-human models, reported that angiotensin IV showed beneficial effects on passive and conditioned avoidance and object recognition tasks in normal animals, and improved spatial working memory in cognitive-deficit models. The review included no human studies. | D | S09 | Non-human experimental models | Yes, with the explicit statement that this is the surrounding angiotensin IV literature and not dihexa-specific evidence | This is the broader literature that surrounds dihexa, not evidence about dihexa. Any use of it as dihexa efficacy evidence is a category error. Flag it as such wherever it appears. |
| DIH-P-04 | A PubMed search for the term dihexa returned 18 records, none of a clinical trial publication type. | D | S05, S06 | Not applicable | Yes | Present as a map of the literature, not as a body of results. Most of these records were not individually read and no claim rests on them. |
| DIH-P-05 | No systematic toxicology or carcinogenicity study of dihexa in any species was located. | G | None located | Not applicable | Yes, as a gap | Report as a gap, honestly qualified: its absence was not affirmatively confirmed, it was simply not found. Given that the central concern is oncologic, this gap is material. |

## Section 5. Safety signals

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| DIH-S-01 | The primary safety finding for dihexa is that no human safety profile of any kind exists. Nothing about the safety of dihexa in a person can be concluded in either direction. | D | S01, S06 | Humans, by absence | Yes | Must appear before any other safety line. Absence of reported harm reflects absence of study. |
| DIH-S-02 | There is a specific theoretical oncologic concern that follows directly from the proposed mechanism rather than from any observed adverse event. Dihexa's proposed mechanism is potentiation of HGF signalling at c-Met. c-MET is the product of a proto-oncogene, and HGF and Met signalling contributes to oncogenesis and tumour progression, promoting proliferation, angiogenesis, invasion, epithelial-mesenchymal transition, and metastasis across multiple tumour types, to the point that it is an active target for cancer-inhibiting drugs. A compound designed to amplify the pathway that oncology drugs are designed to block carries an inherent theoretical risk that has not been characterised in humans. | D | S07, S10, S11 | Humans, uncharacterised | Yes, prominently and early | This is the central and genuine safety concern for this compound. It is mechanistic reasoning from two peer-reviewed oncology reviews, not speculation, and it must be stated that way: neither dismissed as hypothetical nor overstated as a demonstrated harm. No human carcinogenicity data for dihexa exists, because no human data exists. |
| DIH-S-03 | An independent expert review of dihexa by the Alzheimer's Drug Discovery Foundation describes the evidence base as preclinical, reports no human clinical trials, and flags HGF and c-Met implication in tumour progression and metastasis. | G | S13 | Not applicable | Yes, as paraphrase only, with the parsing caveat stated | [PARAPHRASE ONLY - the PDF was retrieved but could not be parsed to text, so its content is known only through a model summary] No quotation from this document may be published until a human opens it and confirms the wording. Graded G on wording fidelity even though the source itself is reputable. |
| DIH-S-04 | Whether the theoretical HGF and c-Met oncologic risk translates into real risk at exposures a person would encounter is uncharacterised. | D | S10, S11 | Humans | Yes | Frame as an open question. Do not convert it into a predicted harm, and do not let the word "theoretical" be read as "unlikely". |
| DIH-S-05 | Long-term effects of chronic growth-factor pathway potentiation in humans are unstudied. | D | S10, S11 | Humans | Yes | Follows from DIH-S-02. Duration is the axis on which the concern would most plausibly matter. |
| DIH-S-06 | Material sold under the name dihexa has unverified identity, purity, and content. There is no regulatory identity, no pharmacopoeial monograph, and no approved reference standard behind it, and no analytical study testing material sold as dihexa was located. | G | S16, S17 | Not applicable | Yes, as a gap | State it as a gap. It is not a clean bill of health. Nobody appears to have checked. |
| DIH-S-07 | Even the nearest clinical relative of dihexa did not demonstrate efficacy: per ALZFORUM, fosgonimeton's ACT-AD Phase 2 trial failed its primary endpoint and its LIFT-AD Phase 2/3 trial failed both its primary and key secondary endpoints. | D | S12 | Humans, but for a different compound | Yes, explicitly attributed to fosgonimeton and not to dihexa | This weakens rather than supports any borrowed inference about dihexa. It is included precisely because the borrowed inference runs the other way in circulating content. |

## Section 6. Unknowns

Presented to members as an explicit list rather than left as silence. All are graded D or G because
they are statements about what the literature does not contain.

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| DIH-U-01 | Whether dihexa produces any measurable cognitive or neurological effect in a human being is completely unknown. No human data exists. | D | S01, S06 | Humans | Yes | |
| DIH-U-02 | Whether the theoretical HGF and c-Met oncologic risk translates into real risk at human exposures is uncharacterised. | D | S10, S11 | Humans | Yes | The most consequential unknown in the list. Place it high. |
| DIH-U-03 | Human pharmacokinetics, metabolism, half-life, and bioavailability are unknown. No human pharmacokinetic study was found. | D | None located | Humans | Yes | Phrase without reference to amounts and without naming routes as instruction. |
| DIH-U-04 | Whether dihexa crosses the human blood-brain barrier as reported for rodents is unknown. | D | None located | Humans | Yes | The rodent report does not settle the human question. |
| DIH-U-05 | Interactions with any medication are unstudied. This specifically includes acetylcholinesterase inhibitors, which a post-hoc analysis of the related compound fosgonimeton's ACT-AD trial suggested might antagonise its effect. | D | S12 | Humans | Yes, with the fosgonimeton attribution stated in the same sentence | The interaction signal belongs to fosgonimeton, not dihexa. It is listed as a reason to ask the question, never as a dihexa finding. |
| DIH-U-06 | Long-term effects of chronic growth-factor pathway potentiation in humans are unknown. | D | S10, S11 | Humans | Yes | |
| DIH-U-07 | The actual identity, purity, and content of any material sold under the name dihexa is unknown. | G | S16 | Not applicable | Yes | |
| DIH-U-08 | Whether any regulator has issued a compound-specific position on dihexa is unknown. Both the FDA and the WADA checks in this research failed to retrieve an authoritative page. | G | S14, S15 | Not applicable | Yes, with the retrieval failure stated | Do not let a failed retrieval become an implied absence of regulation. See REGULATORY_STATUS.md. |
| DIH-U-09 | Whether any systematic toxicology or carcinogenicity study of dihexa exists in any species is unknown. None was located, and its absence was not affirmatively confirmed. | G | None located | Any species | Yes | |

## Section 7. PROHIBITED claims

These may not appear on any member-facing surface, in any form, hedged or otherwise. This section is
the most important part of the table. Several of these claims are actively circulating and would be
plausible to a reader.

| Claim ID | Prohibited claim | Why it is prohibited | Reviewer notes |
| --- | --- | --- | --- |
| DIH-X-01 | Any statement that dihexa is safe, well tolerated, or free of side effects in humans. | No human safety data of any kind exists (S01, S06). Silence is not a safety record, and the compound's own mechanism generates an uncharacterised theoretical oncologic concern (S10, S11). | Includes softened forms such as "generally considered safe", "well tolerated in practice", and "no reported side effects". |
| DIH-X-02 | Any statement or implication that dihexa has clinical trial support, including by pointing at Athira Pharma's Alzheimer's programme. | Dihexa has zero ClinicalTrials.gov registrations (S01) and zero PubMed records of a clinical trial publication type (S06). The trials belong to fosgonimeton, a distinct compound (S02, S12). | This is the single most likely error a reader or a writer will make with this compound. Check every borrowed citation. See CONTRADICTIONS.md, C-01. |
| DIH-X-03 | Any presentation of fosgonimeton, ATH-1017, or NDX-1017 results as though they were dihexa results, in either direction. | They are different compounds. ALZFORUM describes fosgonimeton only as one that may be related to dihexa and does not assert chemical identity (S12). | Note that borrowing in the flattering direction is doubly misleading here, because the fosgonimeton trials failed their endpoints (S12). |
| DIH-X-04 | The circulating claim that dihexa is "seven orders of magnitude more potent than brain-derived neurotrophic factor", or any restatement of that multiplier. | It is an assay-specific in-vitro relative-potency figure, not a clinical effect size, and its primary source was not retrieved or verified this session. To a lay reader it reads as a claim of superhuman efficacy. | Named here explicitly so it cannot re-enter later. If a human verifies it against the primary paper, it may only ever be framed as an in-vitro assay comparison in a non-human system, and the founder review should decide whether it belongs at all. |
| DIH-X-05 | Any statement that dihexa improves memory, enhances cognition, repairs the brain, promotes neural regeneration, or treats any condition in people. | These convert rat and cultured-cell findings into human outcome claims. No human evidence exists. | Use "was reported in male Sprague-Dawley rats", "in rat hippocampal neurons", or "investigated as". Never a bare outcome verb. |
| DIH-X-06 | Any use of "will", "proven to", "restores", "cures", "eliminates", or "reverses" in connection with dihexa. | Guaranteed outcome language. Nothing about this compound is proven in people. | Applies to marketing copy, headings, and metadata as well as body text. |
| DIH-X-07 | Any FDA statement about dihexa, including any claim about 503A bulk drug substances category placement. | NOT VERIFIED THIS SESSION. Two attempts to retrieve the relevant FDA.gov page returned HTTP 404 (S14). The claim circulates on secondary and vendor-adjacent pages only. | Do not publish any FDA claim about dihexa until a human retrieves the FDA source directly. An unretrievable page is not a licence to repeat what others say it contains. |
| DIH-X-08 | Any WADA or anti-doping status claim about dihexa, including the assertion that it falls under the S0 non-approved substances catch-all. | NOT VERIFIED THIS SESSION. The official list could not be retrieved (S15). Dihexa is not known to be named explicitly on the Prohibited List, and the S0 characterisation comes from aggregator pages. | Direct athletes to their own anti-doping authority. Do not publish the inference as a finding. |
| DIH-X-09 | Any quotation from the Alzheimer's Drug Discovery Foundation Cognitive Vitality report on dihexa. | The PDF was retrieved but could not be parsed to text, so its wording is known only through a model summary (S13). | Paraphrase is permitted with the caveat attached. Verbatim wording is not, until a human opens the document. |
| DIH-X-10 | Any presentation of the 2018 angiotensin IV systematic review as dihexa efficacy evidence. | The review covers the surrounding angiotensin IV literature in non-human models and is not dihexa-specific (S09). It also contained no human studies at all. | Cite it as context for why researchers were interested, never as a result for this compound. |
| DIH-X-11 | Any omission of the negative rat result. | In male Wistar rats, dihexa did not protect against 3-nitropropionic acid induced deficits (S08). Presenting only the positive rodent findings would misstate the preclinical record by selection. | Prohibiting an omission is unusual and deliberate. Selective reporting is the failure mode that most flatters this compound. |
| DIH-X-12 | Any dose, amount, concentration, frequency, timing, cycle, titration, reconstitution instruction, injection technique, or route of administration presented as guidance. | Category rule for all Xenios Research Guides. | Where a reader would expect this, write: Dosing and administration information is intentionally excluded from Xenios Research Guides. Naming a route solely to state that evidence for it is absent is permitted. |
| DIH-X-13 | Any framing of dihexa as "research use only" that implies a human benefit, and any guidance on where or how to obtain it. | The research-use framing is prohibited as a device. Acquisition guidance is out of scope for a Guide. | Applies to captions, footnotes, and links as well as body text. Dihexa is sold widely as a nootropic (S16, S17), which makes this rule load-bearing rather than theoretical. |
| DIH-X-14 | Publication of the reported CAS registry number before an authoritative registry check. | Sourced only from vendor pages this session (S16). | [UNVERIFIED - vendor-sourced] Low-stakes facts still have to be verified, because a wrong identifier undermines trust in everything else on the page. |
| DIH-X-15 | Any claim of product purity, sterility, identity, or quality for any commercial dihexa material. | No analytical study testing material sold as dihexa was located, and there is no pharmacopoeial monograph or approved reference standard against which any claim could be checked. | Vendor certificates are grade E at best and are not independent verification. |

## Reviewer sign-off checklist

1. Every preclinical sentence names its species or model in the same sentence as the finding.
2. No sentence contains a dose, route, schedule, or preparation detail presented as guidance.
3. No sentence states or implies human benefit, human safety, or a regulatory position.
4. Every regulatory sentence carries a jurisdiction, a date, and a source URL, and every unverified
   one is marked unverified.
5. The fosgonimeton distinction is stated explicitly and prominently, and no fosgonimeton result is
   borrowed for dihexa anywhere.
6. The negative rat result is present and is not subordinated to the positive findings.
7. Every claim graded G or marked [UNVERIFIED] or [PARAPHRASE ONLY] has either been closed by a
   human check or removed.
8. No citation appears that is not present in SOURCE_REGISTRY.md.
