---
title: Semax Source Registry
type: research-guide-source-registry
compound: semax
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# Semax Source Registry

Every source consulted for the Semax Guide, with its retrieval status. Sources marked
UNVERIFIED were not successfully read and cannot carry a claim on their own. Sources marked
NOT RETRIEVED were attempted and failed, which is a declared gap rather than a finding.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## Verification key

- **VERIFIED 2026-07-21**: retrieved and read in this research session at the URL shown.
- **VERIFIED, LISTING ONLY 2026-07-21**: the record appeared in a retrieved results listing, but
  the individual record was not fetched. Title only. Species and methods unconfirmed.
- **UNVERIFIED**: content not read, or read only through a tertiary or secondary intermediary.
- **NOT RETRIEVED**: the fetch was attempted and failed. Existence may be known, content is not.
- **NON-EVIDENCE**: disqualified as a source of fact by the exclusion rules in SOURCE_PLAN.md.

## Registry

| ID | Title | Kind | URL | Retrieval status | Supports |
| --- | --- | --- | --- | --- | --- |
| S01 | Effects of Semax on the Default Mode Network of the Brain (Bull Exp Biol Med, 2018), PMID 30225715 | Human study, PubMed abstract | https://pubmed.ncbi.nlm.nih.gov/30225715/ | VERIFIED 2026-07-21 | A small placebo-comparison neuroimaging study in 24 healthy adults, 14 receiving Semax and 10 placebo, reporting a greater volume of the rostral subcomponent of the default mode network in the Semax group. Imaging outcome only. Supports no clinical, cognitive, or symptom claim. Its randomization status is unconfirmed. |
| S02 | Functional Connectomic Approach to Studying Selank and Semax Effects (Dokl Biol Sci, 2020), PMID 32342318 | Human study, PubMed abstract | https://pubmed.ncbi.nlm.nih.gov/32342318/ | VERIFIED 2026-07-21 | Reported between-group differences in functional connectivity between the right amygdala and right temporal cortex, fusiform gyrus, and parahippocampal regions in 52 healthy adults, identified via post hoc analysis. Exploratory imaging only. |
| S03 | Semax in prevention of disease progress and development of exacerbations in patients with cerebrovascular insufficiency (Zh Nevrol Psikhiatr Im S S Korsakova, 2005, Russian), PMID 15792140 | Human study, PubMed abstract | https://pubmed.ncbi.nlm.nih.gov/15792140/ | VERIFIED 2026-07-21 (English abstract only) | Reported clinical improvement, stabilization of disease progression, a reduced reported risk of stroke and transient ischemic attacks, and good tolerability in 187 patients. Also the single tolerability statement in the entire retrieved human record. Design not stated as randomized, placebo-controlled, or blinded. |
| S04 | The efficacy of semax in the treatment of patients at different stages of ischemic stroke (Zh Nevrol Psikhiatr Im S S Korsakova, 2018, Russian), PMID 29798983 | Human study, PubMed abstract | https://pubmed.ncbi.nlm.nih.gov/29798983/ | VERIFIED 2026-07-21 (English abstract only) | A non-randomized comparison of a Semax-treated group with an untreated group in 110 adults after ischemic stroke, reporting faster improvement and better final outcome where Semax coincided with high BDNF levels, and an independent benefit of early rehabilitation. |
| S05 | PubMed search results for Semax, approximately 230 records | Literature search, primary database | https://pubmed.ncbi.nlm.nih.gov/?term=Semax&size=100 | VERIFIED 2026-07-21 | The shape of the literature. Of the first 20 records reviewed, roughly 19 were preclinical or narrative review and one was a human clinical study. Also the source for the preclinical themes named in the Guide, which are described as themes visible in titles and never as findings. |
| S06 | PubMed search for Semax restricted to review and systematic-review publication types, 14 records, none a systematic review or meta-analysis | Literature search, primary database | https://pubmed.ncbi.nlm.nih.gov/?term=Semax+AND+%28review%5Bpt%5D+OR+systematic%5Bsb%5D%29 | VERIFIED 2026-07-21 | The absence of any systematic review or meta-analysis of Semax. The records returned were narrative reviews mentioning Semax alongside other peptides. |
| S07 | ClinicalTrials.gov API v2 query for Semax, returning zero registered studies | Trial registry, primary | https://clinicaltrials.gov/api/v2/studies?query.term=Semax&pageSize=50 | VERIFIED 2026-07-21 | The absence of any Semax study registered in this registry, and therefore the absence of pre-specified endpoints and analysis plans against which the published reports could be checked. |
| S08 | Federal Register full text, Pharmacy Compounding Advisory Committee; Notice of Meeting; Bulk Drug Substances Nominated for Inclusion on the Section 503A Bulk Drug Substances List, Docket FDA-2025-N-6895, published 2026-04-16 | Primary regulatory document | https://www.federalregister.gov/documents/full_text/text/2026/04/16/2026-07361.txt | VERIFIED 2026-07-21 | The only verified United States regulatory facts in this folder: that "Semax (free base)" and "Semax acetate" appear on the list of substances nominated for possible inclusion on the section 503A Bulk Drug Substances List, that the nominated uses listed are cerebral ischemia, migraine, and trigeminal neuralgia, and that the advisory committee meeting was scheduled for July 23 to 24, 2026. |
| S09 | Federal Register API metadata for document 2026-07361 | Primary regulatory metadata | https://www.federalregister.gov/api/v1/documents/2026-07361.json | VERIFIED 2026-07-21 | Publication date and document identity for S08. |
| S10 | Semax (Wikipedia) | Tertiary reference, low weight | https://en.wikipedia.org/wiki/Semax | VERIFIED 2026-07-21, but tertiary | Used only for: the 1991 first description in the scientific literature; the claim of registration in the Russian Federation and appearance on the Russian List of Vital and Essential Drugs approved 2011-12-07; the statement that Semax has not been evaluated, approved, or marketed in most other countries; the United States status "not FDA approved, unscheduled"; and the statement that Semax is widely sold by online vendors as a purported nootropic. Every one of these is reported-but-not-primary-verified. |
| S11 | Adversarial retrieval control: fabricated PMID 99999999999 returned HTTP 404 Not Found | Methodological control | https://pubmed.ncbi.nlm.nih.gov/99999999999/ | VERIFIED 2026-07-21 | That the retrieval path used in this session is real. A fabricated identifier failed while genuine identifiers returned full records, so the citations in this folder reflect actual retrieval rather than reconstruction. |
| S12 | Semax binds specifically and increases BDNF protein levels, PMID 16635254 | Preclinical, PubMed results listing | https://pubmed.ncbi.nlm.nih.gov/16635254/ | VERIFIED, LISTING ONLY 2026-07-21 | Nothing on its own. Title recorded. Species, tissue, and effect size unconfirmed because the abstract was not fetched. May not carry a stated finding in the Guide. |
| S13 | Semax activates dopaminergic and serotoninergic brain systems, PMID 16362768 | Preclinical, PubMed results listing | https://pubmed.ncbi.nlm.nih.gov/16362768/ | VERIFIED, LISTING ONLY 2026-07-21 | Nothing on its own. Title recorded. Species and methods unconfirmed. |
| S14 | Semax regulates immune response genes during ischemic brain injury, PMID 28255762 | Preclinical, PubMed results listing | https://pubmed.ncbi.nlm.nih.gov/28255762/ | VERIFIED, LISTING ONLY 2026-07-21 | Nothing on its own. Title recorded. Species and methods unconfirmed, though such models are typically rodent. |
| S15 | WADA Prohibited List landing page | Anti-doping regulator, primary | https://www.wada-ama.org/en/prohibited-list | NOT RETRIEVED 2026-07-21 | Nothing. The fetch returned no usable content. Neither the presence nor the absence of Semax on the List was established. No anti-doping status for Semax appears anywhere in this folder as a result. |
| S16 | European Medicines Agency medicines search endpoint | Regulator, primary | https://www.ema.europa.eu | NOT RETRIEVED 2026-07-21 (HTTP 401) | Nothing. The absence of an EU marketing authorisation is a weak negative resting on S10, not on the regulator. |
| S17 | Drugs@FDA approved-products query for Semax | Regulator, primary | https://www.accessdata.fda.gov/scripts/cder/daf/ | NOT RETRIEVED 2026-07-21 (HTTP 404) | Nothing. A failed retrieval, not a confirmed empty result. The Guide does not treat this 404 as proof of anything. |
| S18 | Russian State Register of Medicines record for Semax | Regulator, primary | https://grls.rosminzdrav.ru | NOT RETRIEVED 2026-07-21 | Nothing. The Russian registration claim rests on S10 plus a search-engine summary. No certificate number was obtained and no Russian regulator page was read. |
| S19 | FDA 503A bulk drug substances landing page, the July 2026 Pharmacy Compounding Advisory Committee meeting page, and the 2026 meeting-materials page | Regulator, primary | https://www.fda.gov | NOT RETRIEVED 2026-07-21 (HTTP 404 on all three) | Nothing. Every 503A fact in this folder therefore comes from the Federal Register notice at S08, which was retrieved successfully. |
| S20 | Peptide retailer, compounding-adjacent marketing, and peptide-encyclopedia pages encountered across every search query | Vendor and marketing pages | No URL recorded | NON-EVIDENCE | Nothing. Recorded only to document that the information environment for this compound is dominated by sellers, that several such pages assert specific regulatory and anti-doping positions, and that several publish dosing protocols. No fact in this folder rests on any of them, and no dosing information from any of them has been reproduced anywhere. |

## Sources that were sought and not obtained

These are gaps, not sources. They are listed so that a reviewer can close them.

| Item | Why it matters | Outcome this session |
| --- | --- | --- |
| Full texts of PMID 29798983 and PMID 15792140 | Randomization procedure, blinding, adverse-event tables, and analysis plans are the difference between a citable clinical result and an abstract-level impression | Not obtained. Both are published in Russian and only English abstracts were readable. No risk-of-bias assessment was possible. |
| Full text of PMID 30225715 | Would resolve whether the study was genuinely randomized | Not obtained. The Guide describes it only as a placebo-comparison imaging study. |
| Russian State Register of Medicines entry | Would establish the certificate number, the approved indications as the Russian regulator wrote them, the first registration date, and current status | Not fetched. |
| EMA medicines database and UK MHRA | Would convert a weak negative into a checked one | EMA endpoint returned HTTP 401. MHRA not queried. |
| WADA Prohibited List | Would allow an anti-doping statement of any kind | Fetch returned no usable content. No status is stated. |
| FDA 503A pages, advisory committee meeting page, meeting materials, and Drugs@FDA | Would let every United States statement rest on the agency's own pages | All returned HTTP 404. The Federal Register notice was retrieved instead and is the primary source used. |
| Individually fetched abstracts for PMID 16635254, PMID 16362768, PMID 28255762 | Species and methods must be named before any preclinical finding may be written | Not fetched. All three are barred from carrying a stated finding. |
| A primary source for the claim that Semax was developed at a named Russian institute | Basic provenance | Not located. Appeared only in search-engine summaries and vendor pages. [UNVERIFIED - background knowledge, requires human source check] |
| Any independent replication of any Semax human finding by an unaffiliated group outside Russia | This is the central weakness of the evidence base | None found. |
| Any analytical study testing material sold as Semax | Would allow a product-quality statement | None located. |
| EU Clinical Trials Register, ISRCTN, WHO ICTRP, Russian national registry | Completeness of the trial search | Not searched. A Russian registry search should be prioritised. |
