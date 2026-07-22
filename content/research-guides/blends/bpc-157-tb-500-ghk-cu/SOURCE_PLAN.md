---
title: BPC-157 + TB-500 + GHK-Cu Blend Source Plan
type: research-guide-source-plan
compound: bpc-157-tb-500-ghk-cu
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# BPC-157 + TB-500 + GHK-Cu Blend Source Plan

This document records how the evidence base for this blend Guide was assembled, what was
deliberately excluded, and what a human reviewer still has to do before anything in this
folder is published.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## 1. Objective of the search

A blend Guide has a different objective from an individual-compound Guide. The primary
question is not "what is known about each ingredient" but "what is known about the mixture."
The search was therefore designed around four questions, in this order.

1. **Does any study of this three-component combination exist?** Any design, any species, any
   route. This was the first and most important question.
2. Does any study of any two of the three components administered together exist?
3. What does the evidence for each component separately actually show, with species or model
   attached to every preclinical finding and route attached to every human finding?
4. What is the current regulatory position for each component, with a jurisdiction and a date?

The search was built so that an empty combination evidence table would be a valid and
reportable result rather than a shortfall to be filled with component substitutes. That is the
result it produced.

## 2. The rule this packet is built around

**Evidence for individual ingredients does not establish evidence for the combination.** A
mixture is a distinct pharmacological entity. It has its own absorption and distribution
behaviour, its own interaction profile between the components, and its own set of unknowns
that do not exist for any component on its own. Only a study that administered this
combination can speak to this combination.

No such study was located. That is not weak combination evidence. It is the absence of
combination evidence.

Every step below follows from that rule. In particular, the search deliberately did **not**
treat a strong finding for one component as partial support for the blend, and the claim table
contains no row that aggregates component findings into a mixture claim.

## 3. Databases, registries and regulatory sources consulted

The underlying research record for each component was compiled on 2026-07-19. The resources
below are those the record documents as queried.

| Resource | What was queried | Outcome |
| --- | --- | --- |
| ClinicalTrials.gov API v2 | Registered studies of BPC-157 | Two registrations located. NCT02637284 (Phase 1, 2015, status Unknown, no results posted, no publication located). NCT07437547 (Phase 2 hamstring strain, recruiting, no results, estimated completion 2028). |
| ClinicalTrials.gov API v2 | Registered studies matching "thymosin beta 4" | 18 registrations returned. Exactly one studies the TB-500 fragment: NCT07487363 (Phase 1/2, Hudson Biotech, recruiting, no results posted). The remainder concern full-length thymosin beta-4 or formulated investigational products. |
| ClinicalTrials.gov API v2 | "GHK-Cu" OR "copper tripeptide" | Registrations located including NCT07437586 (Phase 2 topical gel, recruiting, no results) and NCT07706361 (patch effect on endogenous levels, not yet recruiting). No registration of systemically administered GHK-Cu was found. |
| PubMed, via NCBI E-utilities | "BPC 157" restricted to systematic review, randomized controlled trial or clinical trial publication types | ZERO records. Retrieved directly as a negative finding. |
| PubMed, via NCBI E-utilities | GHK-Cu OR glycyl-histidyl-lysine with clinical trial, RCT and systematic review filters | Three records total. |
| PubMed, via NCBI E-utilities | "copper tripeptide" OR "GHK-Cu" sorted by date | 92 publications, overwhelmingly preclinical. |
| PubMed | Primary and review records for each component | Abstracts retrieved and read for the records listed in SOURCE_REGISTRY.md. Several GHK-Cu preclinical records were retrieved at title level only and are marked as such. |
| FDA (fda.gov) | Pharmacy Compounding Advisory Committee briefing document for the meeting of 23 to 24 July 2026, the bulk substances safety-risk list, the meeting page, two enforcement letters | Retrieved successfully for BPC-157. The 68-page briefing document is the single strongest source in this packet. |
| FDA (fda.gov) | Compounding bulks status for thymosin beta-4 / TB-500, and for GHK-Cu | NOT RETRIEVED. Every attempted fda.gov URL returned HTTP 404 to the fetcher during the TB-500 and GHK-Cu sessions. No compounding-status claim for either component is stated in this packet. |
| Federal Register | Document 2026-07361, Pharmacy Compounding Advisory Committee notice of meeting | Retrieved via API. The abstract names no substances, so it is uninformative for all three components. |
| WADA | The current Prohibited List | NOT RETRIEVED for any component. Pages returned empty or unusable content on every attempt. Anti-doping status rests on USADA secondary statements, which are cited as such. |
| USADA | BPC-157 advisory page; 2018 Prohibited List summary of major changes | Both retrieved and read. |
| US Department of Defense, Operation Supplement Safety | BPC-157 consumer guidance, article dated 29 April 2025 | Retrieved and read. |
| Cosmetic Ingredient Review | Safety assessment covering metal salts of tripeptide-1 | NOT RETRIEVED. The PDF returned unparseable streams, the journal page returned HTTP 403, and a PubMed query returned zero results. Its conclusion is not asserted anywhere in this packet as established. |
| ECRI and ISMP | White paper on compounded peptide products, dated 7 May 2026 | Retrieved. Addresses compounded peptide products as a category. Does not name any of the three components. |

## 4. The combination search specifically

This is the part of the plan that distinguishes a blend packet, so it is recorded in detail.

The component research records were searched for any of the following:

- a trial, series, report or preclinical study administering BPC-157, TB-500 and GHK-Cu together
- any registered study of a three-component peptide blend of this composition
- any pharmacokinetic, interaction or compatibility study between any pair of the three
- any safety evaluation of the mixture

**Result: no study of the three-component combination was located, in any registry, in any
index, in any species, by any route.**

Two records document co-administration of two components, and both are worth stating precisely
because neither supports the mixture.

1. **A retrospective chart review of knee pain in 17 people at a single private clinic**, as
   described in FDA's briefing document. FDA records that some subjects received BPC-157
   combined with thymosin beta-4, and states in consequence that effects cannot be attributed
   to BPC-157 alone. Note that this concerns full-length thymosin beta-4 as described, not the
   TB-500 fragment, and it contains no GHK-Cu. Its relevance here is the opposite of
   supportive: it is a documented instance of combination use destroying the ability to
   attribute an outcome to anything.

2. **A FAERS adverse event report** in which a 40-year-old woman developed diffuse
   hyperpigmentation and gingival darkening on a product containing both BPC-157 and TB500,
   with reproducible reaction on rechallenge and resolution on discontinuation. FDA judged the
   reaction likely due to the drug product, and stated that because the product contained two
   peptides it is not possible to assess a relationship to BPC-157 specifically. A second FAERS
   report of injection site reaction was confounded by concurrent thymosin.

So the only retrieved human records involving co-administration of two of these components
consist of one uninterpretable efficacy series and two confounded harm reports, one of which
FDA considered likely product-related. There is nothing that could be read as combination
benefit evidence, and the small amount of combination-adjacent material that does exist points
toward attribution failure and one unresolved harm signal.

## 5. Composition and ratio

The exact composition and ingredient ratio of the Xenios product is **not confirmed**. No
ratio, proportion, or relative content figure appears anywhere in this packet, and none may be
added. This is recorded as the first open supplier question in QUALITY_AND_DOCUMENTATION.md
because it is logically prior to every other question: until the composition is fixed and
verified, there is no defined article to describe, test, or write about.

## 6. Inclusion criteria

A source was admitted to the registry if all of the following held.

1. It was retrieved at a recorded URL in the underlying research sessions. Nothing was admitted
   from memory. No PMID, NCT number, DOI, author, year, journal or URL has been supplied from
   background knowledge anywhere in this packet.
2. It addresses one of the three components directly, or it is explicitly labelled as
   addressing something adjacent (the supply channel, a parent protein, a different peptide)
   and is used only for that adjacent purpose.
3. Its species or model is identifiable for preclinical work, and its route of administration
   is identifiable for human work.
4. For regulatory statements, a jurisdiction, a date and a URL are all available.

## 7. Exclusion criteria

A source or a claim was excluded if any of the following held.

1. **Vendor, retailer, clinic marketing and affiliate pages are disqualified as evidence.** One
   such page is recorded in the registry solely to document where a set of apparently
   non-existent trial statistics originated. No number, mechanism or safety statement enters
   this packet on the authority of a page that sells peptides.
2. Search-engine answer summaries used in place of the underlying document. One such summary
   asserted that a US federal agency had reversed a peptide classification in February 2026;
   the article actually retrieved does not support that, and the assertion is excluded as
   false or unverified.
3. Any statistic without a locatable primary source. A widely repeated figure that roughly 30
   percent of grey-market peptide samples are mislabelled, misdosed or contaminated could not
   be traced to any primary analysis and is excluded by name in the claim table.
4. Specific trial statistics circulating on peptide retail sites for GHK-Cu (a 2022 randomized
   trial in androgenetic alopecia, a 2023 phase II scar trial, and a wrinkle-volume result)
   that could not be located in PubMed or in any registry. They are excluded entirely and are
   recorded only as a warning about the information environment.
5. **Evidence about a different molecule presented as if it were evidence about a component of
   this blend.** This applies most sharply to full-length thymosin beta-4 and to the
   investigational products formulated from it, which are not TB-500. It also applies to plain
   GHK without copper and to other cosmetic copper peptides.
6. **Evidence about a different route presented as if it were evidence about an injected
   blend.** This applies to the entire topical and cosmetic GHK-Cu literature.
7. **Component evidence presented as combination evidence.** This is the exclusion that defines
   the packet.
8. Any dose, route, schedule, preparation or ratio detail appearing in an admitted source.
   These are not reproduced anywhere.

## 8. Grading approach

Claims are graded individually, never the product as a whole, and never the blend as a whole.
The default grade is D (preclinical) or G (unverified). A grade of C or better requires a
specific retrieved human study of the thing being claimed.

No claim about the combination is graded above G, because no study of the combination exists.
Component claims are graded on their own merits and are marked in the table as not transferable
to the blend.

## 9. What remains for a human reviewer

These are open items, not tidying. Each should be closed before publication.

1. **Confirm the product composition and ratio with the supplier, in writing.** Nothing else in
   this packet can be finalised while the article itself is undefined.
2. **Re-run the combination search independently.** A reviewer should personally query the
   registries and indexes for the three-component mixture and confirm the null result, dating
   the confirmation. If the reviewer finds a combination study, this packet requires
   substantial revision rather than an edit.
3. **Check the outcome of the FDA Pharmacy Compounding Advisory Committee meeting of 23 to 24
   July 2026.** As of the date on this file the meeting has not yet occurred. No outcome is
   stated anywhere in this packet. An advisory committee recommendation is in any case advisory
   and is not a final agency determination.
4. **Open fda.gov directly for TB-500 and GHK-Cu compounding status.** Every fda.gov fetch
   failed for both components. This packet therefore makes no compounding-status claim for
   either. Conflicting vendor claims are recorded as unresolved contradictions, not findings.
5. **Read the WADA Prohibited List directly** and confirm the current wording and section for
   each component. Anti-doping status for BPC-157 and TB-500 currently rests on USADA
   statements. GHK-Cu's anti-doping status is entirely unknown here and no status is implied.
6. **Verify the September 2023 date** widely cited for BPC-157's placement in Category 2 of the
   FDA interim compounding policy. FDA's own live page presents the substance under nominated
   but withdrawn rather than in the dated Category 2 table. The date could not be confirmed
   from an FDA source.
7. **Retrieve the meeting abstracts and unpublished human reports for BPC-157.** Four of the
   five human records are known only through FDA's description of them. They are cited in this
   packet as FDA-reported, and no PMID or DOI was constructed for any of them.
8. **Retrieve the Cosmetic Ingredient Review assessment.** Its conclusion is not asserted here.
   Note that even if confirmed, a cosmetic ingredient review speaks to topical cosmetic use and
   cannot be carried across to an injected blend.
9. **Retrieve the abstracts for the GHK-Cu preclinical records held at title level only**
   (rabbit wound, mouse preprint, nematode, zebrafish, mouse silicosis, fibroblast and ex vivo
   skin). No claim in this packet rests on their findings.
10. **Locate the primary papers behind the animal wound-healing figures for GHK-Cu**, which
    were retrieved only through a tertiary encyclopedia summary and are marked unverified.
11. **Search additional trial registries** for all three components and for the combination:
    the EU Clinical Trials Register, ISRCTN, the WHO ICTRP, ANZCTR, and the Japanese and
    Chinese national registries. None was searched.
12. **Reconcile dates.** The underlying research records carry retrieval dates of 2026-07-19.
    This packet is dated 2026-07-21. Regulatory statements in particular must be re-checked and
    re-dated immediately before publication.

---

Dosing and administration information is intentionally excluded from Xenios Research Guides.
This document is educational. It is not medical advice and it is not a supplier endorsement.
Xenios does not sell these compounds.
