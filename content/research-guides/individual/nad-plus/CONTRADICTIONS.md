---
title: "NAD+ Contradictions and Divergences"
type: contradictions
compound: nad-plus
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# Contradictions and Divergences: NAD+ and its precursors (NR, NMN)

Where the sources disagree, where the marketing outruns the evidence, and where an apparent
contradiction turns out to be something else. Source ids refer to SOURCE_REGISTRY.md.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

There are genuine contradictions here, and there are also several apparent contradictions that
resolve once route or population is held constant. Both types are recorded, because mistaking
one for the other is how bad copy gets written.

## 1. A real reversal by the same regulator, on the same question

| | |
|---|---|
| Position A | November 2022: FDA's position was that NMN is not permitted as a dietary ingredient, because it had been authorized for investigation as a drug (the exclusionary clause) |
| Position B | 29 September 2025: FDA issued two letters in response to citizen petitions determining that NMN is not excluded from the dietary supplement definition, applying the race-to-market provision on evidence of supplement marketing as early as 2017 |
| Sources | S7 |
| Type | Genuine reversal, not a misreading |

This is the only outright reversal in the record, and it is by the agency itself. The practical
consequence for the Guide is that every regulatory statement must carry its date. Any content
written between late 2022 and late 2025 states the opposite of the current position, which
means a member who reads older material elsewhere will encounter a flat contradiction and will
not know which is current.

Two further constraints on how this is written. The reversal concerns the legal marketability
of an oral supplement ingredient. It is not an approval, not a safety finding, and not an
efficacy finding. And it has no bearing whatsoever on intravenous or injectable NAD+, which is
governed by the compounding rules and enforcement actions in REGULATORY_STATUS.md.

FDA's own determination letters were not retrieved. Everything above rests on a law firm client
alert, corroborated by trade headlines. See the gap log in SOURCE_PLAN.md.

## 2. "Well tolerated" versus universal moderate-to-severe reactions

| | |
|---|---|
| Position A | A systematic review of randomized trials of oral NAD+ and NADH supplements (489 participants) characterised the supplements as well tolerated, with a low incidence of side effects |
| Position B | A retrospective review of intravenous administration found that all six people who received intravenous NAD+ reported moderate to severe abdominal cramping, diarrhea, nausea, vomiting, increased heart rate, throat pain, congestion, and chest pressure |
| Sources | S3, S5 |
| Type | Not a true contradiction. A route confound, and the central analytic point of this record |

Oral precursors and intravenous intact NAD+ are different exposures. Both statements can be
true at once because they are about different things. The tolerability conclusion belongs only
to the oral literature.

What makes this the most important entry in this file is the direction of the error. The
better-studied route is the one that looks safer, so anyone who borrows the oral safety
language to reassure a member considering an infusion is transferring reassurance in exactly
the direction that is not supported. Marketing that cites oral trial safety next to an
intravenous offer is making an unsupported transfer, whether or not it intends to.

Editorial consequence: PROHIBITED-002 and PROHIBITED-003 in CLAIM_TABLE.md exist to make this
structurally impossible in Xenios copy.

## 3. The biomarker moves and the outcomes do not

| | |
|---|---|
| Position A | Oral NMN reliably raises measurable blood NAD+ levels, in five of eight pooled randomized trials. This is the mechanism the entire consumer category is sold on |
| Position B | The same meta-analysis found no significant benefit on fasting glucose, fasting insulin, HbA1c, HOMA-IR, or lipid profile. A separate meta-analysis found no significant effect of oral NMN on muscle index, grip strength, gait speed, or chair-stand performance |
| Sources | S1, S2 |
| Type | Not a contradiction. Both are correct, and together they are the honest story |

Oral NMN does what it says biochemically, and has not been shown to do what people buy it for.
The meta-analysis authors themselves cautioned that a rise in blood NAD+ may not translate to
cellular activity, which is likely to be tissue-specific.

The gap that matters is a chain with two unproven links: raising a blood marker is not the same
as raising NAD+ inside the tissues of interest, and neither is the same as producing a clinical
benefit. The retrieved meta-analyses repeatedly show the marker moving while the outcomes do
not follow.

The Guide presents the biomarker rise and the null clinical outcomes in the same breath, never
the biomarker alone. That is PROHIBITED-005.

## 4. Oral NR points in two directions at once

| | |
|---|---|
| Position A | Oral NR was associated with a longer 6-minute walk distance in people with peripheral artery disease |
| Position B | In the same review, oral NR was associated with lower physical performance battery scores and a slower 5-time chair stand test in people with mild cognitive impairment |
| Sources | S2, both findings from the same review |
| Type | Internal inconsistency within one small evidence base |

A single review reporting benefit in one population and worse physical performance in another,
across 10 small trials totalling 240 participants, reads as noise rather than as
population-specific targeting. Neither direction is actionable.

The unfavourable direction deserves explicit mention precisely because consumer content tends
to report only the favourable arm. The Guide publishes both rows or neither.

## 5. Marketed indications for intravenous NAD+ versus the retrieved evidence

| | |
|---|---|
| Position A | Intravenous NAD+ is widely marketed by wellness clinics for energy, cognition, addiction recovery, and anti-aging, and is described in the literature as having a broad range of anecdotally reported benefits |
| Position B | The only human intravenous NAD+ studies retrieved were a 2019 pharmacokinetic pilot in 11 healthy men that measured no clinical endpoint at all, and a 2026 retrospective tolerability review of 6 recipients at a commercial clinic |
| Sources | S4, S5 |
| Type | The largest gap between marketing and evidence in this record |

One of the retrieved sources itself notes a paucity of human data interrogating this as a
treatment or health-modifying modality, despite wide availability.

The correct framing for the Guide is that intravenous NAD+ is a commercially popular
intervention whose retrieved human evidence base consists of pharmacokinetics in healthy
volunteers and adverse-event observation in a very small uncontrolled cohort. Efficacy is
untested, not disproven, and the Guide should say untested rather than implying either
direction.

One caveat on this entry. A randomized placebo-controlled pilot in healthy adults exists as a
preprint (S15) and could not be retrieved, returning HTTP 403. It is the highest-priority
outstanding retrieval, and it needs conflict-of-interest scrutiny alongside retrieval, since
the product naming suggests industry sponsorship. This entry may need revision once it is read.

## 6. Where preclinical and human findings diverge: they cannot be compared here

No primary preclinical study was retrieved for this Guide. The preclinical evidence table is
deliberately empty rather than populated from background knowledge, because citing an
unretrieved study risks a fabricated identifier, which is the one unacceptable failure in
health content.

This has a specific consequence for this compound, and it is worth stating rather than
glossing. The sirtuin and NAD-decline aging story that drives the entire consumer category
originates largely in model-organism work. The Guide therefore cannot use even the softened
framing of "shown in animal models", because no such study was retrieved and named. Mechanism
statements in this Guide are labelled as hypothesis, and nothing more.

If a mechanism section grounded in animal work is wanted, that is a separate, targeted
retrieval task with its own source plan and its own species-in-the-sentence discipline.

## 7. Where mechanism plausibility outruns evidence

Two specific points where the story is coherent and the evidence is not there.

First, the two-hour lag. In the 2019 intravenous pilot, plasma NAD+ and its metabolites showed
no change until after the first two hours of infusion, which the authors themselves described
as surprising and inconsistent with simple direct delivery. That observation is consistent with
several explanations and establishes none.

Second, the membrane question. The claim that intact NAD+ cannot efficiently cross intact cell
membranes, and must first be degraded outside the cell before uptake, is widely discussed in
this field, and if true would undercut the rationale for intravenous NAD+ specifically.
[UNVERIFIED - background knowledge, requires human source check] No source establishing this in
humans was retrieved this session, and it must not be stated in the Guide without one. It is
recorded here as an open question, not as a counterargument the Guide is entitled to make.

## 8. Jurisdictional divergence, and one jurisdiction that could not be read

Within the United States alone, the same molecule sits in two different regulatory positions at
the same time, and this is not a contradiction but a consequence of product form. Oral NMN is
treated as a lawful dietary ingredient subject to a notification requirement, while injectable
NAD+ is reported to sit on a compounding safety-risk listing, to be ineligible for outsourcing
facility compounding, and to have drawn warning letters and a Class I recall.

Anyone reading only the first half will conclude that FDA has blessed NAD+. Anyone reading only
the second half will conclude that FDA has condemned it. Both readings are wrong, and the
difference between them is product form.

Outside the United States, no national regulator's position was retrieved for this Guide. WADA's
2026 Prohibited List could not be searched by term. Two non-regulatory pages (a supplement
vendor blog and a testing-laboratory blog) asserted that NAD+ and NMN are absent from the List.
Those assertions conflict with nothing, because they are not evidence of anything. They were
rejected. The honest position is that the sport status is unresolved.

## 9. Vendor claims versus the peer-reviewed literature

| | |
|---|---|
| Vendor-adjacent claim | Circulating market claims assert dramatic supplement quality failures, including that half of tested NMN products contained no NMN. These appeared on retailer and manufacturer marketing pages, including pages selling competing products |
| Peer-reviewed finding | Laboratory testing of 18 NMN supplements found that measured content corresponds poorly to label claim. Three products contained non-detectable NMN, 14 contained less than claimed, and one exceeded its claim |
| Sources | S6 for the peer-reviewed finding. The market claims are recorded but not cited |
| Type | A conflict of magnitude, and a conflict of interest |

The vendor claims point in the same broad direction as the peer-reviewed testing, which is
exactly what makes them tempting to repeat. They are still excluded. A quality claim sourced
from a company selling a competing product imports that company's incentive along with its
number, and the direction of agreement does not neutralise the bias.

S6 is the citable finding. The market claims appear in CLAIM_TABLE.md as NAD-027, graded G, and
are not permitted as a finding.

## What is not in dispute

For completeness, these points drew no conflicting evidence in the retrieved record.

- NAD+ is a coenzyme involved in redox reactions, energy metabolism, DNA repair, calcium
  signaling, and gene expression.
- Oral NMN raises blood NAD+ in most trials that measured it.
- The retrieved human evidence for subcutaneous, intramuscular, and intranasal NAD+ is empty.
  Nothing contradicts that, because there is nothing there to contradict.
