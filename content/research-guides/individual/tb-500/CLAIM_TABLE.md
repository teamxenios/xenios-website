---
title: "TB-500 Claim Table"
type: research-guide-claim-table
compound: TB-500
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# TB-500 Claim Table

One row per discrete claim. Claim text is written as it would appear to a member. Source
ids refer to SOURCE_REGISTRY.md.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## Evidence grades used

| Grade | Meaning |
| --- | --- |
| A | Established |
| B | Supported human evidence |
| C | Early human evidence |
| D | Preclinical (animal or cell systems) |
| E | Manufacturer or supplier reported |
| F | Traditional or historical |
| G | Unverified |
| PROHIBITED | May not appear on any member-facing surface |

Grades apply to individual claims, never to the compound as a whole. Grades A and B appear
in this table only for identity, absence-of-evidence, and regulatory facts. **No claim about
what TB-500 does in a human body grades above D anywhere in this table.** That is the honest
result of the search, not a gap in it.

## 1. Identity claims

| ID | Claim as it would appear to a member | Grade | Sources | Applies to | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| C01 | TB-500 is a synthetic, N-terminally acetylated peptide of seven amino acids (Ac-LKKTETQ), corresponding to residues 17 to 23 of the protein thymosin beta-4. | A | S01, S09 | Chemical identity | Allowed | Confirmed in two independent retrieved records: the analytical description in S01, and the official title of the only registered human study in S09. This is a chemistry claim, not an effect claim. |
| C02 | TB-500 is not the same molecule as thymosin beta-4. Thymosin beta-4 is the full-length, naturally occurring protein of 43 amino acids. TB-500 is a short synthetic fragment of it. | A | S01, S09 | Chemical identity | Allowed, and should be stated early and prominently | This is the most important line in the Guide. Most published human research attaches to the full-length protein, not to the fragment. Every downstream claim depends on the reader holding this distinction. |
| C03 | RGN-259 and NL005 are investigational pharmaceutical products formulated from full-length thymosin beta-4 (RGN-259 as an ophthalmic solution, NL005 as a recombinant human thymosin beta-4 injectable). They are not the same thing as a product sold as TB-500. | A | S05, S08 | Product identity | Allowed | Needed so that members encountering trial results for these products do not read them as TB-500 results. |
| C04 | Product naming in this category is ambiguous. Because sources and sellers use "TB-500" and "thymosin beta-4" interchangeably, a product name alone does not tell a reader which molecule is claimed to be present. | A | S01 | Market naming practice | Allowed | S01 records that products claim to contain either a synthetic acetylated fragment or the full protein. The two have different evidence bases. Do not extend this into any claim about what any specific product contains. |
| C05 | TB-500 is commonly confused with thymosin alpha-1, a separate thymic peptide with its own distinct history, and is frequently marketed alongside BPC-157, a different peptide. | G | None retrieved | Naming confusion | Allowed only as a naming caution, with no claim about either other compound | [UNVERIFIED - background knowledge, requires human source check] No retrieved source this session documents these confusions. Keep as a navigational note or drop it. Do not describe thymosin alpha-1 or BPC-157 in this Guide. |

## 2. Mechanism claims

| ID | Claim as it would appear to a member | Grade | Sources | Applies to | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| C06 | The LKKTETQ segment has been described in the analytical literature as the actin-binding active site of the parent protein thymosin beta-4, associated with cell migration and wound healing. | D | S01 | Proposed mechanism, described for the parent protein | Allowed, with the parent-protein framing kept in the sentence | This is a description of the parent protein's active site, not a demonstration that the synthetic fragment does this in a human. Never write this as a bare mechanism sentence. |
| C07 | Thymosin beta-4 and TB-500 have been reported to promote angiogenesis and tissue repair in preclinical models, according to a 2026 narrative review that also states human orthopaedic data are lacking. | D | S03 | Preclinical models, species not specified in the retrieved record | Allowed only if the words "in preclinical models" and the missing-human-data statement travel with it | Secondary summary, not primary work. The underlying studies were not retrieved (F09). The review's own caveat must never be separated from its finding. |
| C08 | In one 2024 study, the parent TB-500 compound showed no wound-healing activity in cultured fibroblasts, while its metabolite Ac-LKKTE did. The authors concluded that previously reported wound-healing activity may belong to the metabolite rather than to TB-500 itself. | D | S02 | Cultured human fibroblasts, in vitro | Allowed, and should be included | This directly undercuts the simplest version of the TB-500 story and should be surfaced rather than smoothed over. It is a single in-vitro result inside an analytical-chemistry paper, so it must not be overstated either. See CONTRADICTIONS.md. |
| C09 | In rats, TB-500 was metabolised rapidly, with Ac-LK the highest-concentration metabolite in the first hours and Ac-LKK still detectable at 72 hours. | D | S02 | Rats, in vivo | Allowed, with the species in the sentence | Metabolism data only. It supports nothing about effect. Its practical relevance is detection window, see C17. |
| C10 | How TB-500 behaves in the human body is unknown. No human pharmacokinetic data was located. | G | S02, and the absence of any retrieved human record | Humans | Allowed | Only rat in-vivo and human-serum in-vitro data exist in this record (UV06). Stating the absence is correct and is the honest answer. |

## 3. Human evidence claims

| ID | Claim as it would appear to a member | Grade | Sources | Applies to | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| C11 | There is no completed human trial of TB-500. A full search of ClinicalTrials.gov returned exactly one registered human study of the TB-500 fragment, and it is still recruiting with no results posted. | A | S08, S09 | Humans | Allowed, and is the headline finding | A documented absence, established by a complete registry query rather than by failure to find something. An honest empty evidence table is the correct outcome here. |
| C12 | The single registered TB-500 study is a Phase 1/2 safety study in adults with stable atherosclerotic cardiovascular disease and endothelial dysfunction, whose primary endpoints are counts of adverse events. It began in 2026 and has posted no results. | A | S09 | Approximately 80 planned adult participants, cardiovascular population | Allowed | Correct use of this record is as proof that human study of TB-500 has only just begun. It must never be cited as though it showed anything, including safety. |
| C13 | The 2026 sports medicine review states plainly that human orthopaedic data for these peptides are lacking. | A | S03 | Humans, orthopaedic and musculoskeletal use | Allowed | Independent peer-reviewed confirmation of the absence, useful because members most often encounter TB-500 in a musculoskeletal recovery context. |
| C14 | Full-length thymosin beta-4, given as an eye drop, has been studied in a Phase 2 trial in nine patients with severe dry eye, which reported improvement versus placebo in discomfort and corneal staining at day 56. This studied a different molecule from TB-500, by a different route, for an eye condition. | C | S04 | Nine patients with severe dry eye, topical ocular route, full-length thymosin beta-4 | Allowed **only** with the different-molecule sentence attached in the same paragraph | Nine patients across two sites. This is early human evidence for the parent protein and for an ocular indication. It is not evidence about TB-500, and not evidence about tissue repair, athletic recovery, or any musculoskeletal purpose. Presenting it as TB-500 evidence is a category error, see PROHIBITED P02. |
| C15 | RGN-259, an ophthalmic solution of full-length thymosin beta-4, was studied in a Phase 3 trial in 18 subjects with neurotrophic keratopathy that was terminated early. The difference in complete corneal healing was not statistically significant at the day 29 primary timepoint and reached significance at day 43. This studied a different molecule from TB-500, by a different route, for a rare eye condition. | C | S05 | 18 subjects with stage 2-3 neurotrophic keratopathy, topical ocular route, full-length thymosin beta-4 | Allowed **only** with the different-molecule sentence attached, and only if the failed primary timepoint is reported alongside the day 43 result | Terminated early. Total sample 18. The authors note the placebo group was older with larger lesions, and that discomfort assessment was subjective. Reporting only the day 43 significance would misrepresent the trial. |
| C16 | A 2007 European study of topical full-length thymosin beta-4 in venous ulcers is frequently cited as evidence of accelerated healing. The retrieved record describes methodology for a study still in progress, with 21 of a planned 72 patients enrolled, and reports no efficacy or safety outcomes. | A | S06 | 21 enrolled patients at publication, venous stasis ulcers, topical, full-length thymosin beta-4 | Allowed, as a correction | Grade A applies to the claim that this paper reports no outcome data, which is a verified bibliographic fact. No effect claim of any grade may be drawn from it. |

## 4. Safety claims

| ID | Claim as it would appear to a member | Grade | Sources | Applies to | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| C17 | There is no human safety data for TB-500. Safety in humans is unknown, not merely unproven. | A | S08, S09 | Humans | Allowed, and should be stated directly | The first registered human safety study is running now with primary endpoints that are adverse-event counts. That a first safety study is only now under way is itself direct evidence that no established human safety profile exists. |
| C18 | Tolerability findings from thymosin beta-4 eye-drop trials do not transfer to TB-500. They concern a different molecule, given to the eye surface, in very small samples. | A | S04, S05 | Cross-molecule extrapolation | Allowed | The RGN-259 trial reported 16 adverse events across both arms with one treatment-related, in 18 subjects. Samples this small could not have detected uncommon harms in any case. This row exists to block the extrapolation, not to report reassurance. |
| C19 | Whether any long-term risk attaches to sustained pro-angiogenic signalling from this compound has not been assessed. | G | None retrieved | Open question | Allowed **only** as an explicitly open question, never as reassurance and never as an alarm | [UNVERIFIED - background knowledge, requires human source check] A pro-angiogenic mechanism is proposed for this class, which raises an obvious question about tumour vascularisation. No retrieved source evaluated it in either direction. See UV05. Do not resolve this from reasoning. |
| C20 | For anyone competing under anti-doping rules, the sanction risk is concrete and documented, not theoretical. | A | S10, S01, S02 | Athletes under anti-doping jurisdiction | Allowed | TB-500 is named on the Prohibited List (S10), and validated detection methods exist, with a metabolite reported detectable in rats up to 72 hours (S02) and methods established in equine matrices (S01). |

## 5. Regulatory claims

Full detail, with jurisdictions and dates, is in REGULATORY_STATUS.md. These rows record
what may and may not be said.

| ID | Claim as it would appear to a member | Grade | Sources | Applies to | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| C21 | TB-500 is named explicitly on the WADA Prohibited List as a prohibited growth factor, and substances in that class are prohibited at all times, in and out of competition. | A | S10 | Athletes under WADA-aligned anti-doping jurisdiction | Allowed | Verified through USADA's summary of the 2018 list changes, which names TB-500 as an example under S2.3. See C22 for the limit on citing a section number. |
| C22 | The exact 2026 Prohibited List subsection and wording were not verified. | A | S10, F06 | Citation precision | Allowed as a footnote, and required before any section number is printed | WADA's own pages returned empty content this session. Print the practical statement, not the section citation, until a human reads the current list. See UV01. |
| C23 | No approved TB-500 product was located in any jurisdiction checked. The only registered human study is an ongoing Phase 1/2 trial with no results, which is inconsistent with approved status. | G | S08, S09 | Marketing approval | Allowed **only** in this hedged form, naming the limit | Grade G, not A, because every fda.gov retrieval failed (F01 to F05). The inference from the registry is reasonable but it is an inference. Do not write "TB-500 is not FDA approved" as a verified regulatory fact from this record. A human must check fda.gov. |
| C24 | Full-length thymosin beta-4 products remain investigational, with trials completed or ongoing and no approval identified in this search. | G | S05, S08 | Parent-protein products | Allowed in this hedged form | Same limitation as C23. Registry-derived, not regulator-confirmed. |
| C25 | Any statement about FDA compounding status for this substance. | PROHIBITED | None | US compounding | **Not allowed** | See P07. Conflicting vendor claims exist in both directions and no FDA source could be retrieved. Nothing may be said until a human checks fda.gov directly. |

## 6. Product quality and supply claims

| ID | Claim as it would appear to a member | Grade | Sources | Applies to | Member-facing | Reviewer notes |
| --- | --- | --- | --- | --- | --- | --- |
| C26 | Synthesis-derived impurities have been detected in material sold as TB-500. A 2012 analytical study reported a non-natural synthesis impurity detectable in equine plasma after administration of a TB-500-containing product. | D | S01 | Equine administration of a marketed product | Allowed, with the equine context in the sentence | Confirms that marketed material carries synthesis-derived contaminants in at least one documented case. The study did not survey purity across the consumer market, so no market-wide claim follows. |
| C27 | Counterfeit and illegally supplied peptide products are a documented concern in the wider grey market. A 2015 analytical study developed screening for 25 peptides already seized in Europe or identified in underground forums. | G | S07 | The grey peptide market generally, not TB-500 specifically | Allowed **only** as a general market caution, with the specificity limit stated | The retrieved abstract does not say whether TB-500 or thymosin beta-4 was in the panel, and reports no mislabelling rate (UV02). Do not imply this study examined TB-500. |
| C28 | What a vial sold as "TB-500" actually contains, in what purity, is unknown. No market-wide analysis was located. | A | S01, and the absence of any retrieved analysis | Grey-market supply | Allowed | Follows from C04 (naming ambiguity) plus the absence of any retrieved market survey. Stating the unknown is correct. |
| C29 | Any specific figure for the proportion of grey-market peptide samples that are mislabelled, misdosed or contaminated. | PROHIBITED | None | Market quality | **Not allowed** | See P08. The commonly repeated figure appeared only in commercial sources and no primary analysis was retrieved (UV03). |

## 7. PROHIBITED claims

These may never appear on any member-facing surface for this compound, in any wording, in
any format, including headings, summaries, comparison tables, metadata, alt text and search
snippets. This section is the operative part of this document.

| ID | Prohibited claim or framing | Why it is prohibited |
| --- | --- | --- |
| P01 | That TB-500 heals injuries, accelerates recovery, repairs tissue, restores function, or improves any outcome in humans. | No human efficacy evidence exists for TB-500 for any indication (C11, C13). Words such as "will", "proven to", "restores", "cures", "eliminates" and "reverses" are prohibited for this compound in every context. |
| P02 | That human trial evidence supports TB-500, by citing thymosin beta-4 trials (dry eye, neurotrophic keratopathy, venous ulcers, myocardial infarction) as though they were TB-500 trials. | Every one of those studied the full-length 43-amino-acid protein or a formulated investigational product, typically applied to an eye or wound surface (C14, C15, C16). TB-500 is a seven-amino-acid fragment (C02). This is the single most common accuracy failure in this subject area, and the correction is the Guide's main job. |
| P03 | That TB-500 is safe, well tolerated, low risk, or has no known side effects. | No human safety data exists (C17). Tolerability findings from a different molecule given to the eye surface in 18 people do not transfer (C18). Absence of reported harm in a record with no human studies is not evidence of safety. |
| P04 | That TB-500 is "the active fragment" of thymosin beta-4 and therefore inherits its evidence. | The read-across is not merely unproven, it is directly challenged: the parent TB-500 compound showed no activity in cultured fibroblasts while a metabolite did (C08). Mechanism plausibility is not evidence transfer. |
| P05 | Any dosing, amount, concentration, frequency, timing, cycle length, titration, loading, stacking, reconstitution, injection technique, or route quantity. | Excluded from Xenios Research Guides by policy, regardless of source. Where a reader would expect this information, write exactly: "Dosing and administration information is intentionally excluded from Xenios Research Guides." |
| P06 | Any protocol, regimen, schedule, or wording a reader could follow as instructions, and any sourcing, purchasing, importing or acquisition guidance. | No medical advice, no self-treatment framing, no acquisition guidance. |
| P07 | Any claim about FDA 503A or 503B compounding status, Category 2 placement, removal from a list, or an advisory committee agenda item. | Every fda.gov URL returned 404 this session (F01 to F05). Vendor sources assert incompatible positions in both directions (see CONTRADICTIONS.md). Nothing may be stated until a human verifies against fda.gov. |
| P08 | Any specific mislabelling, contamination or purity percentage for grey-market TB-500. | No primary source for any such figure was retrieved (UV03). The one retrieved market-quality study does not report per-sample rates and may not have included this compound (UV02). |
| P09 | Any description of the content of the FDA warning letter to GenoGenix LLC. | The page could not be retrieved (F03). Its existence appeared only in search results. Describing a regulatory enforcement document that was not read is not acceptable. |
| P10 | Any statement that TB-500 does, or does not, carry cancer risk. | Not assessed in either direction by any retrieved source (C19, UV05). Both reassurance and alarm are unsupported here. The only permitted framing is that the question is open. |
| P11 | Any bare mechanism sentence, meaning a statement about actin binding, cell migration, angiogenesis or tissue repair that does not carry its species or model in the same sentence. | Preclinical-to-human leaps are the dominant failure mode in this subject area. "In rodent models" or "in cultured cells" must appear with the finding, every time (C06, C07, C08). |
| P12 | The framing "research use only" used to imply human benefit, or any implication that a legal or supply category says something about efficacy or safety. | Prohibited framing by policy. |
| P13 | That the ongoing Phase 1/2 trial shows, suggests, or supports anything. | It has posted no results (C12). A registration is evidence that a study exists, and nothing more. |
| P14 | That TB-500 is permitted, tolerated or undetectable in sport, or any wording that minimises anti-doping risk. | It is explicitly named as prohibited, at all times, and validated detection methods exist (C20, C21). |
| P15 | Any comparison implying TB-500 works as well as, or better than, an approved treatment for any condition. | There is no human efficacy evidence for TB-500 for any condition (C11). A comparison of this kind cannot be supported at any grade. |

## Summary for reviewers

The evidence position, stated plainly: TB-500 is a synthetic fragment of a better-studied
parent protein, prohibited in sport, with no completed human trial, no human safety profile,
no human pharmacokinetic data, a preclinical story that a 2024 in-vitro result actively
complicates, and a supply chain with documented synthesis impurities and no verified content
assurance. The parent protein's modest clinical record belongs to the parent protein.

Nothing in this table above grade D describes an effect in a human body. That is the finding.
