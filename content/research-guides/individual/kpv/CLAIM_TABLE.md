---
title: KPV Claim Table
type: research-guide-claim-table
compound: KPV (Lys-Pro-Val)
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# KPV Claim Table

One row per discrete claim. Grades apply to individual claims, never to the compound as a
whole. Source ids refer to SOURCE_REGISTRY.md.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## The headline finding

No human study of KPV of any design was located. A direct trial registry query returned zero
studies (S01), and a bibliographic search restricted to the clinical trial publication type
returned zero records (S02). The human evidence table below is empty, and that empty table is
the finding. Nothing in the preclinical section may be read as applying to a person.

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

No claim in this table is graded A, B, or C, because no human study was retrieved.

## Section 1. Human evidence

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| KPV-H-01 | No human clinical trial of KPV has been located. A direct query of the ClinicalTrials.gov registry returned zero studies, and a PubMed search restricted to the clinical trial publication type returned zero records. | D | S01, S02 | Not applicable, this is a statement about the literature | Yes | This is the single most important line in the Guide. Graded D rather than higher because it describes the state of the evidence base, not a studied effect. Absence of study is not evidence of safety and must never be presented as one. |
| KPV-H-02 | There is no reported human safety data, no adverse event dataset, no human pharmacokinetic characterisation, and no immunogenicity assessment for KPV. | D | S01, S02, S07 | Not applicable | Yes | The regulator's own stated rationale for restricting KPV, as reported in trade press (S07), was an absence of human exposure data. Pair this line with KPV-H-01 wherever it appears so that a member does not read silence as reassurance. |

Human evidence table: intentionally empty of effect claims. See CONTRADICTIONS.md, entry C-01,
for why marketing statements of human tolerability are not merely unproven but contradicted.

## Section 2. Identity and characterisation

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| KPV-I-01 | KPV is a tripeptide composed of lysine, proline, and valine, described in the peer-reviewed literature as the C-terminal tripeptide of alpha-melanocyte-stimulating hormone (alpha-MSH), written as alpha-MSH(11-13). | D | S05 | Not applicable, chemical identity | Yes | Identity confirmed in two retrieved reviews. Graded D because the supporting sources are reviews of preclinical work rather than a chemical registry entry. |
| KPV-I-02 | Two peer-reviewed reviews describe KPV as lacking the sequence motif required to bind any of the known melanocortin receptors. | D | S05 | Not applicable | Yes | Important framing. It is what separates KPV from melanocortin agonist compounds. |
| KPV-I-03 | KPV is a distinct compound from KdPT, from the dimer written as (CKPV)2, from full-length alpha-MSH, and from melanocortin receptor agonists. Findings reported for those compounds are not findings about KPV. | D | S03, S05 | Not applicable | Yes | This line exists to block a common substitution in marketing material. Include it prominently. |
| KPV-I-04 | Reported chemical registry number and molecular weight. | G | None | Not applicable | No | [UNVERIFIED - background knowledge, requires human source check] These figures appeared only on vendor pages and were not confirmed against a primary chemical registry. Do not publish either figure until a registry entry is read. |

## Section 3. Proposed mechanism

Every claim in this section is proposed, derives from animal or cultured-cell work, and has
not been confirmed in a living human being.

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| KPV-M-01 | In an immortalised human bronchial epithelial cell line studied in the laboratory, KPV was reported to inhibit NF-kappaB signalling and to reduce matrix metalloproteinase-9 activity and interleukin-8 and eotaxin secretion, proposed to act by blocking nuclear import of the p65RelA subunit. | D | S04 | Cultured human-derived cells, not people | Yes, only with the cell-culture context in the same sentence | Human-derived tissue in a dish is still preclinical. Never write this as a bare mechanism sentence. |
| KPV-M-02 | A 2010 peer-reviewed review states that the exact signalling mechanism used by KPV and related peptides is unknown. | D | S05 | Not applicable | Yes | This is the most honest available summary of the mechanism question and should sit alongside any mechanism description. |
| KPV-M-03 | In human keratinocyte cell lines studied in the laboratory, alpha-MSH, KPV, and ACTH were reported to produce intracellular calcium responses without an accompanying rise in cyclic AMP, which the authors read as signalling distinct from the classical melanocortin-1 receptor pathway. | D | S04 | Cultured human-derived cells and hamster ovary cells, not people | Yes, only with the cell-culture context in the same sentence | A signalling characterisation study, not an efficacy study. Do not describe it as showing an effect on skin. |
| KPV-M-04 | KPV is taken up through the intestinal di-peptide and tri-peptide transporter PepT1, which is upregulated in inflamed intestinal tissue. | G | None retrieved | Claimed for intestinal tissue | No | [UNVERIFIED - background knowledge, requires human source check] This is the single most repeated mechanistic claim in marketing material and no primary paper establishing it was retrieved this session. Do not publish it. If a reviewer locates a primary source, it re-enters at grade D at best, since it would be transporter biology, not a human outcome. |

## Section 4. Preclinical findings

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| KPV-P-01 | In two mouse models of inflammatory bowel disease, KPV was reported to be associated with earlier recovery and greater regain of body weight, and in one of the models with histologically reduced inflammatory changes. The reported effects appeared partially independent of melanocortin-1 receptor signalling. | D | S04 | Mice | Yes, with "in mouse models" in the same sentence | This is the most frequently cited animal result behind the gut inflammation rationale. Pair it with KPV-U-07, the note that rodent colitis models have a poor record of predicting human inflammatory bowel disease outcomes. |
| KPV-P-02 | In a mouse model of ulcerative colitis, KPV carried in an engineered hyaluronic-acid-functionalised nanoparticle was reported to be associated with reduced mucosal damage and lower tumour necrosis factor alpha, and to outperform non-targeted formulations. | D | S04 | Mice, plus colonic epithelial cell and macrophage cultures | Yes, only if the delivery caveat travels with it | Critical caveat. The tested article was an engineered targeted delivery system, not unformulated KPV, and the authors attributed the advantage substantially to the targeting vehicle. This result does not transfer to plain KPV and must never be cited as though it did. |
| KPV-P-03 | A 2008 peer-reviewed review reports that anti-inflammatory effects of the parent hormone alpha-MSH were observed across a range of animal models, and positions KPV as a candidate for possible future treatment of inflammatory conditions. | D | S05 | Animals, across the models cited in the review | Yes, with the parent-hormone distinction stated | Note two things for a member. Most of the cited work is on the full hormone, not KPV. And the review's own forward-looking phrasing is itself evidence that nothing had been demonstrated in people at publication. |
| KPV-P-04 | A PubMed search for KPV together with alpha-MSH returned 17 records spanning delivery systems, structural modification, imaging probes, and reviews. None is indexed as a clinical trial. | D | S03 | Not applicable | Yes | Titles verified. Findings in 11 of these records were not individually read and no claim rests on them. Present this as a map of the literature, not as a body of results. |

## Section 5. Safety signals

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| KPV-S-01 | The primary safety finding for KPV is that no human safety data exists. Nothing about the safety of KPV in a person can be concluded in either direction. | D | S01, S02, S07 | Humans, by absence | Yes | Must appear before any other safety line. Absence of reported harm reflects absence of study. |
| KPV-S-02 | The retrieved preclinical work centres on suppression of inflammatory signalling. Inflammation is a normal protective response, so any agent investigated for broadly suppressing it raises unanswered questions about infection risk, symptom masking, and interaction with existing immune or inflammatory conditions. None of these questions has been studied in humans for KPV. | D | S04 | Humans, questions unanswered | Yes | Frame as an open question, never as a predicted harm and never as a reassurance. |
| KPV-S-03 | Because the molecular target is not established, downstream and off-target effects in a person cannot be predicted from the existing literature. | D | S05 | Humans | Yes | Follows directly from KPV-M-02. |
| KPV-S-04 | An uncharacterised peptide administered by injection carries an unassessed immunogenicity risk. | G | None retrieved | Humans | No | Search summaries attributed a concern of this kind to regulatory briefing material, but the underlying document could not be retrieved, so nothing may be quoted or attributed. [UNVERIFIED - requires human source check against the briefing document once published] The general principle is standard regulatory reasoning, but the Guide should not present it as a finding about KPV. |
| KPV-S-05 | Material sold outside a regulated supply chain has unverified identity, purity, sterility, and endotoxin status. A 2024 peer-reviewed market-surveillance study of a different peptide found that every vial purchased from illegal online pharmacies was a probable substandard or falsified product, with measured purity far below the labelled claim and endotoxin detected in every sample. | D | S06 | Not applicable, this is supply-channel evidence | Yes, only with the explicit statement that the study did not test KPV | This is evidence about the channel, not about KPV. Attribute it that way every time. Do not extend it into a numeric claim about KPV vials. |
| KPV-S-06 | No study testing material sold as KPV for identity, purity, sterility, or endotoxin content was located. | G | None located | Not applicable | Yes | State it as a gap. It is not a clean bill of health. Nobody appears to have checked. |

## Section 6. Unknowns

Presented to members as an explicit list rather than left as silence. All are graded D or G
because they are statements about what the literature does not contain.

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| KPV-U-01 | Whether KPV has any effect at all in a living human being is unknown. | D | S01, S02 | Humans | Yes | |
| KPV-U-02 | The human safety profile, adverse event rate, and any dose-limiting effects are uncharacterised. | D | S07 | Humans | Yes | Phrase without reference to amounts. |
| KPV-U-03 | Human absorption, distribution, metabolism, elimination, and half-life are uncharacterised, including whether meaningful systemic exposure is achieved by any route. | D | None located | Humans | Yes | No human pharmacokinetic study was located. Do not name routes. |
| KPV-U-04 | The molecular target and signalling mechanism are described in the peer-reviewed literature as unknown. | D | S05 | Not applicable | Yes | |
| KPV-U-05 | Whether repeated exposure provokes an antibody response is unstudied. | D | None located | Humans | Yes | |
| KPV-U-06 | Behaviour in specific populations is entirely unstudied, including pregnancy, lactation, children, older adults, immunocompromised people, people with autoimmune or inflammatory conditions, and people taking immunomodulating medicines. | D | None located | Those populations | Yes | |
| KPV-U-07 | Whether any of the benefit reported in mouse colitis models would translate to humans is unknown. Rodent colitis models have a long history of failing to predict human inflammatory bowel disease outcomes. | D | S04 | Mice to humans | Yes | Attach to KPV-P-01 wherever that claim appears. |
| KPV-U-08 | Whether unformulated KPV behaves comparably to the engineered targeting nanoparticle used in the 2017 mouse study is unknown. | D | S04 | Mice | Yes | Attach to KPV-P-02. |
| KPV-U-09 | Long-term consequences of sustained suppression of inflammatory signalling in humans, including infection risk and symptom masking, are unstudied for KPV. | D | S04 | Humans | Yes | |
| KPV-U-10 | Interactions with any medicine or supplement are unstudied. No interaction data was located. | D | None located | Humans | Yes | |
| KPV-U-11 | Whether KPV is specifically addressed by any anti-doping authority could not be confirmed. Athletes subject to testing should consult their own anti-doping authority. | G | S10 | Tested athletes | Yes, with the referral | The Prohibited List could not be read directly. Do not state or imply a status. See REGULATORY_STATUS.md. |

## Section 7. PROHIBITED claims

These may not appear on any member-facing surface, in any form, hedged or otherwise. This
section is the most important part of the table. Several of these claims are actively
circulating and would be plausible to a reader.

| Claim ID | Prohibited claim | Why it is prohibited | Reviewer notes |
| --- | --- | --- | --- |
| KPV-X-01 | Any statement that KPV is safe, well tolerated, or free of side effects in humans. | No human safety data exists. The regulator's reported rationale for restricting KPV was an absence of human exposure data (S07). Silence is not a safety record. | Includes softened forms such as "generally considered safe" and "no reported side effects". |
| KPV-X-02 | Any statement that limited clinical data show tolerability or preliminary benefit in humans, in inflammatory bowel disease, in skin conditions, or in anything else. | Contradicted by the record. Zero registered trials (S01), zero records indexed as clinical trials (S02). See CONTRADICTIONS.md entry C-01. | This exact wording circulates on vendor and clinic pages. It is not merely unsupported, it conflicts with the regulator's stated position. |
| KPV-X-03 | Any citation of "more than 50 peer-reviewed publications" or similar volume claims as evidence for KPV. | The figure conflates the whole alpha-MSH literature, including work on the full hormone and on KdPT, with KPV-specific evidence, and conflates preclinical publications with clinical ones. | The verified KPV and alpha-MSH record set is 17 items, none indexed as a clinical trial (S03). |
| KPV-X-04 | Any statement that KPV reduces inflammation, heals the gut, repairs the gut lining, calms skin, or treats any condition in people. | These convert cell-culture and mouse findings into human outcome claims. No human evidence exists. | Use "has been studied in mouse models of", "reported in cultured cells", or "investigated as". Never a bare outcome verb. |
| KPV-X-05 | Any use of "will", "proven to", "restores", "cures", "eliminates", or "reverses" in connection with KPV. | Guaranteed outcome language. Nothing about this compound is proven in people. | Applies to marketing copy, headings, and metadata as well as body text. |
| KPV-X-06 | Any presentation of results for KdPT, for (CKPV)2, for full-length alpha-MSH, or for melanocortin agonist compounds as though they were KPV results. | These are distinct compounds (S03, S05). Substituting their evidence is a factual error, not a simplification. | This substitution is routine in marketing material, so check every borrowed citation. |
| KPV-X-07 | Any claim that KPV acts as a melanocortin receptor agonist, or any inference about KPV drawn from melanotan-type compounds. | The retrieved literature converges the other way. A review states KPV lacks the motif required to bind known melanocortin receptors (S05), and three separate preclinical reports found non-classical or non-melanocortin signalling (S04). | The shared parent hormone invites this error. Address it explicitly rather than leaving it unsaid. |
| KPV-X-08 | Any confident description of the mechanism of action. | The 2010 review states the mechanism is unknown (S05). Confident mechanism copy overstates the science. | Describe mechanism as proposed, preclinical, and unresolved. |
| KPV-X-09 | The circulating gray-market failure statistics: a 30 percent incorrect-sequence rate, a 26 percent heavy-metal rate, a 100 percent residual solvent rate, an audit of 6,285 laboratory reports with a 41.6 percent failure rate, or a claim that regulator testing found up to 40 percent of online or compounded peptides misdosed or adulterated. | Every one of these traces to vendor blogs, Substack posts, or supplement marketing pages (S12). No primary source was locatable for any of them. | Citing them would import fabricated-looking precision into health content. If a member or a writer reintroduces them, point to this row. |
| KPV-X-10 | Any statement of an outcome from the July 2026 Pharmacy Compounding Advisory Committee review. | As of the research date the meeting had not taken place. Contemporaneous trade reporting describes it in the future tense (S07, S08). Past-tense outcome claims found in search summaries could not be verified. | Describe the review as pending. Note also that an advisory committee recommendation is advisory and is not a final agency determination. See CONTRADICTIONS.md entry C-02. |
| KPV-X-11 | Any dose, amount, concentration, frequency, timing, cycle, titration, reconstitution instruction, injection technique, or route of administration. | Category rule for all Xenios Research Guides. | Where a reader would expect this, write: Dosing and administration information is intentionally excluded from Xenios Research Guides. |
| KPV-X-12 | Any framing of KPV as "research use only" that implies a human benefit, and any guidance on where or how to obtain it. | The research-use framing is prohibited as a device. Acquisition guidance is out of scope for a Guide. | Applies to captions, footnotes, and links as well as body text. |
| KPV-X-13 | Any implication that the 2024 supply-channel study tested KPV, or any KPV purity figure derived from it. | That study examined a different peptide (S06). It is evidence about the channel only. | Always name the tested compound and state that KPV was not tested. |
| KPV-X-14 | Publication of the reported chemical registry number or molecular weight before a primary registry check. | Sourced only from vendor pages this session. [UNVERIFIED - background knowledge, requires human source check] | Low-stakes facts still have to be verified, because a wrong identifier undermines trust in everything else on the page. |

## Reviewer sign-off checklist

1. Every preclinical sentence names its species or model in the same sentence as the finding.
2. No sentence contains a dose, route, schedule, or preparation detail.
3. No sentence states or implies human benefit, human safety, or a regulatory outcome.
4. Every regulatory sentence carries a jurisdiction, a date, and a source URL.
5. Every claim graded G or marked [UNVERIFIED] has either been closed by a human check or removed.
6. No citation appears that is not present in SOURCE_REGISTRY.md.
