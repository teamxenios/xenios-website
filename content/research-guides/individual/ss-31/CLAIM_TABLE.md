---
title: SS-31 Claim Table
type: research-guide-claim-table
compound: ss-31
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# SS-31 Claim Table

One row per discrete claim. Grades apply to individual claims, never to the compound as a
whole. Source ids refer to SOURCE_REGISTRY.md.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## The headline finding

SS-31 (elamipretide) is not a compound with missing human evidence. It has a large sponsored
clinical programme, and the three most informative controlled results in it are **failures**.
MMPOWER-3, the largest trial at 218 participants, missed both co-primary endpoints and is listed
as Terminated. The randomized crossover phase of TAZPOWER missed both co-primary endpoints.
ReCLAIM-2 missed its primary endpoints. An FDA accelerated approval does exist, and it is real,
but it is narrow, conditional, rests on an intermediate endpoint, and concerns an ultra-rare
genetic disease. For the popular consumer use case, energy and fatigue and performance and
longevity in healthy adults, the human evidence is **absent**, and the one relevant trial is
still recruiting.

Two things follow for the Guide. Lead with the failed endpoints. Never let the approval of a
specific pharmaceutical product lend borrowed credibility to a grey-market research chemical
bought under a different name.

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

Unlike most compounds in this series, some claims here reach A or B. Note carefully which ones:
the best-supported human claims in this table are the **negative** findings and the regulatory
facts. No claim of benefit in healthy adults reaches above G.

## Section 1. Identity and characterisation

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| SS31-I-01 | SS-31 is a synthetic, mitochondria-targeting tetrapeptide (a chain of four amino acids), developed clinically as elamipretide, and sponsored by Stealth BioTherapeutics Inc. | A | S01 | Not applicable, chemical and regulatory identity | Yes | Taken from the FDA-approved US label. Grade A because it is a regulatory identity fact, not an effect claim. |
| SS31-I-02 | The same molecule appears in the literature under several names: SS-31, elamipretide, the earlier development codes MTP-131 and Bendavia, and the US brand name FORZINITY. | A | S01, S02, S08 | Not applicable | Yes | Include this prominently. Multiple names are how the approved drug's credibility gets transferred onto an unapproved research chemical. |
| SS31-I-03 | The FDA-approved product and material sold on the grey market as "SS-31" are not established to be the same material. Only the approved product has been through FDA quality review. | A | S01 | Not applicable | Yes | This is the single most important consumer-protection line in the Guide. It must appear in the one-minute summary, not only in the quality section. |
| SS31-I-04 | The approved product is marketed in the United States as FORZINITY (elamipretide hydrochloride) injection. | A | S01 | Not applicable | Yes | The dosage form is part of the product's legal name. State it as identity. Do not extend it into any administration guidance. |

## Section 2. Proposed mechanism

Every claim in this section is proposed. The FDA-approved label itself frames clinical benefit
as still requiring confirmation.

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| SS31-M-01 | Per the FDA-approved US label, elamipretide acts as a mitochondrial cardiolipin binder that localizes to the inner mitochondrial membrane and improves mitochondrial morphology and function. | B | S01 | Not applicable, label mechanism statement | Yes | Grade B rather than A: this is the label's own Mechanism of Action wording, which is a regulatory description rather than a demonstrated clinical result. Quote the framing, not a stronger version of it. |
| SS31-M-02 | Binding cardiolipin in the inner mitochondrial membrane is proposed to stabilise cristae structure and improve electron transport efficiency and mitochondrial function. | C | S01 | Not applicable | Yes | Explicitly proposed. Grade C reflects that this sits in an approved label but describes a mechanism, not an outcome. |
| SS31-M-03 | The FDA-approved label frames clinical benefit as still requiring confirmation. | A | S01 | Barth syndrome patients | Yes | This sentence must travel with any mechanism description. A plausible mechanism inside an approved label is still not a demonstrated benefit. |

## Section 3. Human evidence

This is the substantive section for this compound, and the reader must not be allowed to skim
past the direction of the results.

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| SS31-H-01 | MMPOWER-3 (NCT03323749), a phase 3 randomized double-blind placebo-controlled trial in 218 people aged 16 to 80 with primary mitochondrial myopathy, **failed both co-primary endpoints** at week 24: change in six-minute walk distance, and total fatigue on the Primary Mitochondrial Myopathy Symptom Assessment. The registry status is Terminated, and the registry records that the double-blind portion did not achieve its primary endpoints. | B | S02 | 218 people with primary mitochondrial myopathy | Yes | This is the largest randomized trial in the programme and it did not work. It leads the human evidence section. Grade B, and note that a well-powered negative RCT is strong evidence, not weak evidence. |
| SS31-H-02 | The reported least-squares mean difference on the six-minute walk test in MMPOWER-3 was -3.2 metres (95% CI -18.7 to 12.3; p = 0.69), numerically favouring placebo and clearly non-significant. | G | S05 | 218 people with primary mitochondrial myopathy | Yes, only with the verification flag attached | [UNVERIFIED - these figures came from secondary reporting. The Neurology full text was not retrievable this session. Requires human verification against the published article before publication.] The direction and non-significance are consistent with the registry record (S02), but the numbers themselves are not verified. |
| SS31-H-03 | The benefit most frequently quoted from MMPOWER-3 comes from a prespecified subgroup (participants with nuclear DNA pathogenic variants) plus a later post-hoc genotype analysis, not from the trial result. | C | S02, S05 | Subgroup within 218 participants | Yes | Subgroup rescue after a missed primary endpoint is hypothesis-generating at best, and is one of the most common sources of false positives in clinical research. Guide text must lead with the failure, never with the subgroup. |
| SS31-H-04 | TAZPOWER (NCT03098797), a randomized double-blind placebo-controlled crossover trial in 12 people with Barth syndrome, **did not meet either co-primary endpoint** in its 28-week blinded phase. The co-primary endpoints were six-minute walk test distance and the Barth Syndrome Symptom Assessment total fatigue score. | B | S03, S04 | 12 people with Barth syndrome | Yes | Note the pattern: the same two endpoint types failed here as in MMPOWER-3. That repetition across two diseases is itself informative. |
| SS31-H-05 | A subsequent 168-week uncontrolled open-label extension of TAZPOWER reported improvement in walking distance, fatigue scores, and cardiac volumes in the 10 participants who continued and the 8 who reached week 168. | C | S04 | 8 to 10 people with Barth syndrome | Yes, only with the uncontrolled caveat in the same sentence | The weakest form of human evidence in this folder. No placebo group, so regression to the mean, learning effects on the walk test, and expectancy cannot be excluded. The authors themselves list small sample size and the absence of a control group as limitations. |
| SS31-H-06 | ReCLAIM-2 (NCT03891875), a phase 2 randomized double-masked placebo-controlled trial in 176 people with dry age-related macular degeneration with geographic atrophy, **did not beat placebo** on its primary endpoints over 48 weeks: low-luminance best-corrected visual acuity change, and geographic atrophy lesion area. | B | S06 | 176 people with geographic atrophy | Yes | Registry-level facts are verified. The primary publication returned HTTP 403, so no numeric secondary result from this trial appears anywhere. |
| SS31-H-07 | After ReCLAIM-2 missed its primary endpoints, secondary and exploratory signals on ellipsoid zone preservation were used by the sponsor to select the primary endpoint for the subsequent phase 3 programme (ReNEW, NCT06373731, and ReGAIN). | C | S06 | Not applicable, programme design | Yes | Endpoint switching after a failed trial is a substantial interpretive weakness: the endpoint that worked was chosen after seeing the data. State this plainly rather than as a neutral programme update. |
| SS31-H-08 | NCT02914665, a phase 2 randomized double-blind placebo-controlled trial in 308 people hospitalized with heart failure, was completed. Its primary outcome measure was change in NT-proBNP, a blood marker, between baseline and day 8 or early discharge. **The result is not known to this review.** | G | S07 | 308 hospitalized heart failure patients | Yes, stated as an unknown | Outcome data were not retrieved. Do not let silence read as either success or failure. Note also that NT-proBNP is a biomarker, not a clinical outcome such as survival, hospitalisation, or symptoms. |
| SS31-H-09 | NCT02245620, a phase 2 randomized double-blind placebo-controlled trial of a single administration of MTP-131 (Bendavia) in 41 elderly people with documented skeletal muscle mitochondrial dysfunction, was completed. Its primary outcome measure was change from baseline in ATPmax, a biochemical measure of maximal ATP synthetic rate. **The result is not known to this review.** | G | S08 | 41 elderly participants | Yes, stated as an unknown | This is the trial closest to the popular anti-aging and mitochondrial-performance framing, which makes its unknown outcome important to state rather than omit. Even a positive ATPmax result would not establish a functional or longevity benefit. |
| SS31-H-10 | No completed randomized trial in a healthy population was retrieved. A phase 2 study of healthy aging and physical function (NCT07275424, investigator-sponsored, planned enrollment 30) was recruiting at the time of retrieval and has **no results**. | B | S09 | Healthy adults, by absence | Yes | This is the line that answers the question most members are actually asking. Grade B because it is a verified statement about the state of the registry. Nothing about efficacy in healthy adults can be claimed from a recruiting trial. |

## Section 4. Preclinical findings

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| SS31-P-01 | In aged female C57BL/6Nia **mice** (26 months old, compared with young mice at 5 months, treated for 8 weeks), SS-31 was reported to reverse the age-related decline in maximum mitochondrial ATP production, improve coupling of oxidative phosphorylation, restore redox homeostasis, and increase treadmill exercise tolerance, without an increase in mitochondrial content. | D | S10 | Mice | Yes, with "in aged mice" in the same sentence | The strongest result in the entire record for the anti-aging framing, and it is a mouse result. It has not been reproduced as a functional benefit in a completed randomized trial in healthy humans. Pair it with SS31-H-10 every time it appears. |
| SS31-P-02 | A separate **mouse** study, as titled, reports that elamipretide improved cardiac and skeletal muscle function during aging **without detectable changes in tissue epigenetic or transcriptomic measures of biological age**. | D | S11 | Mice | Yes, only with the verification flag attached | [UNVERIFIED - the full text was not retrieved. This finding is recorded from the title as listed in a search result and requires human verification.] Flagged deliberately: this finding is convenient to the Guide's position because it undercuts reverses-aging marketing, and a convenient claim must be held to a higher evidentiary standard, not a lower one. |

## Section 5. Safety signals

Every item below comes from the FDA-approved label for a specific pharmaceutical product used
under clinical supervision in a studied disease population. None of it describes what happens
when a healthy adult uses an unapproved research chemical.

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| SS31-S-01 | The most common adverse reactions in the FDA-approved US prescribing information are injection site reactions, including erythema, pain, induration, pruritus, bruising, and urticaria. | A | S01 | Studied disease populations under clinical supervision | Yes | Report as an adverse reaction category from the label. Do not convert into any statement about technique or administration. |
| SS31-S-02 | The label describes hypersensitivity reactions, including serious reactions requiring urgent medical care and permanent discontinuation. Serious hypersensitivity to elamipretide or any excipient is a contraindication. | A | S01 | Studied disease populations | Yes | A contraindication in an approved label is among the strongest safety statements available. State it without softening. |
| SS31-S-03 | The product must not be used in neonates, because of benzyl alcohol. The label describes fatal reactions, metabolic acidosis progressing to neurotoxicity, and gasping syndrome in low-birth-weight and preterm neonates exposed to benzyl-alcohol-containing drugs. | A | S01 | Neonates | Yes | An excipient-driven warning. Use it to make the general point that the formulation, not only the peptide, carries risk, which is directly relevant to unverified grey-market material. |
| SS31-S-04 | Increased eosinophilia was observed with more prolonged exposure, described in the label as resolving after discontinuation. | A | S01 | Studied disease populations | Yes | The label attaches a specific exposure duration to this observation. **That figure is deliberately not reproduced**, because a duration number in a safety line is readily misread as a threshold below which use is fine. Report the signal, not the window. |
| SS31-S-05 | There is **no long-term safety data for use in healthy adults** for performance, fatigue, or longevity purposes. The safety database supporting approval comes from an ultra-rare disease population and from patients with mitochondrial myopathy, heart failure, and macular degeneration, all under clinical supervision. | B | S09, and the absence of any retrieved completed randomized trial in healthy adults | Healthy adults, by absence | Yes | Must appear before or alongside every other safety line, so that a member does not read a real drug label as reassurance about a different use. |
| SS31-S-06 | The safety information above describes a specific FDA-reviewed manufactured product. It does not describe material sold as a research chemical, whose identity, purity, and content are unverified. | A | S01 | Not applicable | Yes | Attach to the safety section as a closing line. An approved label is not a safety profile for a different material. |

## Section 6. Quality and identity

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| SS31-Q-01 | FDA approval covers a specific manufactured product with a defined formulation that has been through quality review. Material sold online as a research chemical has had none of that review, and its identity, purity, and content are unverified. | A | S01 | Not applicable | Yes | The core quality claim. Repeat it wherever the approval is mentioned. |
| SS31-Q-02 | No analytical study testing material sold as grey-market SS-31 for identity or purity was located. | G | None located | Not applicable | Yes | State it as a gap. It is not a clean bill of health. Nobody appears to have checked. |
| SS31-Q-03 | Secondary reporting describes FDA warning letters to online peptide sellers in April 2026 over research-use-only labelling combined with consumer-health marketing, and cites independent laboratory findings that a substantial share of grey-market peptide samples fail identity, purity, or quantity checks. | E | S14 | Not applicable, market claim | Yes, only with attribution as unverified secondary reporting and with no figures | [UNVERIFIED - from law-firm, trade, and press blogs, NOT from a retrieved FDA primary document.] **No specific failure percentage may be published from this source.** Attribute as a market-risk claim, never as an FDA finding. |
| SS31-Q-04 | Because the same molecule appears under several names, the name on a product does not by itself establish what the material is or whether it has been through any review. | A | S01, S02 | Not applicable | Yes | The practical form of SS31-I-02 and SS31-I-03. |

## Section 7. Unknowns

| Claim ID | Claim text as it would appear to a member | Grade | Sources | Population | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| SS31-U-01 | Whether elamipretide produces any functional benefit in healthy adults is unknown. No completed randomized trial in a healthy population was retrieved. | B | S09 | Healthy adults | Yes | The central unknown, and the one that matters most to a member audience. |
| SS31-U-02 | Whether the accelerated-approval surrogate endpoint (knee extensor muscle strength) will be confirmed as clinical benefit in the required confirmatory trial is unknown. A phase 4 Barth trial, NCT07531251, was recruiting. | B | S01 | Barth syndrome patients | Yes | The label itself states that continued approval may be contingent on this. Report the dependency, not a prediction of its outcome. |
| SS31-U-03 | The outcomes of the heart failure trial NCT02914665 and the elderly skeletal muscle trial NCT02245620 are unknown to this review. Registry records were retrieved, results were not. | G | S07, S08 | Those trial populations | Yes | Do not let an unknown outcome be read in either direction. |
| SS31-U-04 | The official WADA classification for elamipretide or SS-31 in 2026 is unknown to this review. | G | S13 | Tested athletes | Yes, with a referral | The Prohibited List page returned empty content. Do not state or imply any status. Direct athletes to the official list and to their national anti-doping organisation. |
| SS31-U-05 | Whether grey-market SS-31 is chemically the same molecule as pharmaceutical elamipretide is unknown. No analytical study on grey-market SS-31 specifically was retrieved. | G | None retrieved | Not applicable | Yes | |
| SS31-U-06 | Long-term safety beyond the studied disease populations, and safety for anyone not under clinical supervision, is unknown. | B | S09, S01 | Healthy adults and unsupervised use | Yes | |
| SS31-U-07 | Whether any oral or topical presentation has any evidence is unknown, and evidence for those routes is ABSENT. All retrieved trials used injected or intravenous administration in clinical settings. | B | S02, S03, S06, S07, S08 | Not applicable | Yes | Routes are named here solely to state that evidence for them is absent, which is the only permitted use. This must not become a comparison of routes or any form of guidance. |

## Section 8. PROHIBITED claims

These may not appear on any member-facing surface, in any form, hedged or otherwise.

| Claim ID | Prohibited claim | Why it is prohibited | Reviewer notes |
| --- | --- | --- | --- |
| SS31-X-01 | Any statement that SS-31 or elamipretide is approved, or supported by evidence, for aging, performance, fatigue, longevity, cognition, energy, recovery, or general mitochondrial support. | The FDA accelerated approval is for improving muscle strength in Barth syndrome in patients meeting the label's criteria. It is not approved for any of these uses (S01). | This is the most likely misreading a member will bring to the Guide. Correct it explicitly rather than leaving it unsaid. |
| SS31-X-02 | Any presentation of the FDA approval as evidence that the compound works, without stating that it is accelerated, conditional, based on an intermediate endpoint, and narrow. | The label states the approval was based on improvement in knee extensor muscle strength, described as an intermediate clinical endpoint and not a demonstrated clinical benefit, and that continued approval may be contingent on verification in confirmatory trials (S01). | The four qualifiers travel together. Dropping any one of them changes what the approval means. |
| SS31-X-03 | Any presentation of the trial programme that leads with the positive signals rather than with the failed primary endpoints. | Three controlled trials missed their primary endpoints (S02, S03, S04, S06). The positive signals come from uncontrolled extensions, a subgroup, a post-hoc analysis, and a surrogate. | This is a structural rule about ordering, not only about wording. Check the sequence of every section and every summary. |
| SS31-X-04 | Any citation of the MMPOWER-3 nuclear DNA subgroup or the post-hoc genotype analysis as a demonstrated benefit. | The trial failed both co-primary endpoints (S02). Subgroup rescue after a missed primary is hypothesis-generating only. | Where it is mentioned, the failure must be stated first and in the same passage. |
| SS31-X-05 | Any use of the ReCLAIM-2 ellipsoid zone signal without stating that the trial missed its primary endpoints and that the endpoint was selected after the data were seen. | Endpoint switching after a failed trial is a substantial interpretive weakness (S06). | |
| SS31-X-06 | Any statement that SS-31 reverses, slows, or measurably changes biological aging. | The aged-mouse result is a mouse result (S10). A separate mouse study, as titled, reports improved muscle function with **no** detectable change in epigenetic or transcriptomic age (S11). | Note that even the source undercutting this claim is itself flagged as requiring verification. Neither direction may be stated as human fact. |
| SS31-X-07 | Any presentation of the aged-mouse exercise tolerance result without "in aged mice" in the same sentence. | Category rule for all Xenios Research Guides, and the highest-risk failure mode for this compound, because the mouse data are genuinely strong while the human functional data are negative or absent. | Check line by line, including headings, the summary, and the FAQ. |
| SS31-X-08 | Any implication that the safety profile in the FDA-approved label describes the safety of grey-market SS-31, or of use by a healthy adult. | The label's safety database comes from studied disease populations under clinical supervision (S01). No long-term safety data exist for healthy adults (S09). | The reverse implication is also prohibited: the label is not evidence that grey-market material is dangerous in some specific characterised way either. It simply does not describe it. |
| SS31-X-09 | Any statement of the WADA status of elamipretide or SS-31, including any claim that it moved off class S0 for 2026 following FDA approval. | The official WADA page returned empty content (S13). The only sources asserting a 2026 status change were peptide-vendor and affiliate blogs, which are grade E or G market claims with a direct commercial interest in an it-is-not-banned conclusion. | Athletes are directed to the official list and to their own national anti-doping organisation. State no status. |
| SS31-X-10 | Any specific grey-market failure percentage, or any attribution of such a figure to FDA. | The figures came from law-firm, trade, and press blogs, not from a retrieved FDA primary document (S14). | The general market-risk point may be made at grade E with attribution. The numbers may not. |
| SS31-X-11 | Any statement of the regulatory history items resting on the sponsor press release (the May 2025 Complete Response Letter, and the Orphan Drug, Fast Track, Priority Review, Rare Pediatric Disease designations and voucher) presented as verified FDA record. | These are sponsor claims. The underlying FDA approval-letter PDF returned HTTP 404 and was not independently verified (S12). | They may be reported, attributed to the sponsor, and flagged. They may not be stated as FDA record. |
| SS31-X-12 | Any dose, amount, concentration, frequency, timing, cycle, titration, loading, stacking, reconstitution instruction, injection technique, or route presented as instruction. | Category rule for all Xenios Research Guides. Note that the FDA-approved label contains full dosing information, and none of it is reproduced anywhere in this folder. | Naming a route solely to state that evidence for it is absent is permitted (SS31-U-07). Nothing further. |
| SS31-X-13 | Any acquisition, sourcing, supplier, or vendor guidance. | Category rule. | Applies to captions, footnotes, and links as well as body text. |
| SS31-X-14 | Any statement that the outcomes of NCT02914665 or NCT02245620 were positive or negative. | Registry records were retrieved. Results were not (S07, S08). | State them as unknown to this review. An unknown is not a hint. |

## Reviewer sign-off checklist

1. Every preclinical sentence names its species or model in the same sentence as the finding.
2. No sentence contains a dose, amount, concentration, schedule, or preparation detail, and no
   route appears except to state that evidence for it is absent.
3. Every mention of the FDA approval carries all four qualifiers: accelerated, conditional,
   intermediate endpoint, narrow indication.
4. The failed primary endpoints appear before any positive signal, in every section and in
   every summary.
5. Every regulatory sentence carries a jurisdiction, a date, and a source URL.
6. Every claim graded G or marked [UNVERIFIED] has either been closed by a human check or
   removed.
7. No numeric result appears that traces only to secondary reporting.
8. No citation appears that is not present in SOURCE_REGISTRY.md.
