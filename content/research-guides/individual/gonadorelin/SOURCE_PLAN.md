---
title: Gonadorelin Source Plan
type: research-guide-source-plan
compound: gonadorelin
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# Gonadorelin Source Plan

This document records how the evidence base for the Gonadorelin Research Guide was assembled, what was deliberately excluded, and what a human reviewer still needs to search before publication.

A note on dates. This plan is stamped to the workflow review date of 2026-07-19. The underlying research record carries a retrieval date of 2026-07-20 on every source. Both dates appear in this package as recorded. A reviewer should reconcile the two stamps before publication and should treat 2026-07-20 as the date the retrievals actually occurred.

## Objective

Establish what is actually known about gonadorelin from primary regulatory records and indexed human literature, separate that from what is asserted by secondary and commercial sources, and grade every resulting claim conservatively. An honest conclusion that human evidence is absent for a given use is an acceptable and expected outcome.

## Databases and registries consulted

| Database or registry | What it was used for | Outcome |
| --- | --- | --- |
| Drugs@FDA via the openFDA API | US human approval status and marketing status | Two historical human applications found, both discontinued |
| FDA bulk drug substances list, section 503A | Whether gonadorelin is nominated for pharmacy compounding | Not present in any of the three categories |
| FDA bulk drug substances list, section 503B | Whether gonadorelin is listed for outsourcing facility compounding | Gonadorelin acetate found in Category 1 |
| DailyMed | Current product labelling under the Factrel brand name | Resolves to an actively marketed cattle product |
| WADA Prohibited List | Anti-doping status | Named explicitly under S2.2.1 |
| PubMed | Human clinical evidence, safety reports, product quality analyses | One human cohort study, one human case report, one veterinary field trial |
| ClinicalTrials.gov API v2 | Registered trials using gonadorelin as an intervention | No studies returned with gonadorelin as the intervention |
| openFDA adverse event database (FAERS) | US post-market adverse event signal | No records returned under the generic name |
| FDA warning letters | Enforcement activity naming gonadorelin | Two recent peptide-related letters retrieved in full, neither mentions gonadorelin |

## Queries run

Regulatory and product queries:

- Drugs@FDA brand name query for LUTREPULSE and FACTREL.
- Full text extraction and search of the FDA 503A bulk substances document updated May 14, 2026, across Category 1 (Under Evaluation), Category 2 (Significant Safety Risks), and Category 3 (Nominated Without Adequate Support).
- Full text extraction and search of the FDA 503B bulk substances document updated March 21, 2025.
- DailyMed lookup for the Factrel brand name.
- WADA Prohibited List, live page, section S2.

Literature queries:

- PubMed, gonadorelin in title or abstract combined with testosterone therapy, TRT, or fertility preservation. Zero records returned. This negative result is central to the evidence verdict.
- PubMed, gonadorelin in title or abstract combined with purity, counterfeit, content, or quality. Twenty five records returned, none of which were product quality analyses of gonadorelin on inspection of the top ranked results.
- PubMed, gonadorelin in title, filtered to systematic reviews. Zero results.
- PubMed, gonadorelin in title, filtered to clinical trial publication type. Four records, examined individually and found to be one cattle field trial, one 1987 pediatric cryptorchidism study without an English abstract, and two 1985 to 1986 papers that concern GnRH agonist analogues rather than gonadorelin itself.
- ClinicalTrials.gov API v2 intervention field query for gonadorelin.
- openFDA adverse event query on the gonadorelin generic name.

## Inclusion criteria

A source was eligible to support a member-facing claim only if all of the following held.

1. It was retrieved directly this session at a recorded URL.
2. It is a primary regulatory record, a primary product label, an anti-doping regulatory standard, or a PubMed indexed study or case report.
3. The population, species, and study design are identifiable from the retrieved text.
4. For any finding, the species and the design can be stated in the same sentence as the finding itself.

## Exclusion criteria

A source was excluded, or admitted only as background rather than as evidence, if any of the following held.

1. It is a vendor, retailer, compounding pharmacy marketing page, telehealth marketing page, or peptide seller page. These are disqualified as evidence entirely. Several such pages appeared in search results and were deliberately not used.
2. It is a secondary blog or industry commentary asserting a regulatory fact that a primary FDA document contradicts. Such sources are recorded only in the contradictions file, as claims to be corrected, never as support.
3. It could not be retrieved at source. Two possible gonadorelin trial registrations were surfaced by web search but could not be retrieved from ClinicalTrials.gov directly, so no NCT identifier was recorded anywhere in this package. Identifiers that cannot be retrieved at source are omitted rather than reconstructed.
4. It is a narrative review used to characterise a specific numeric finding. Two reviews were retrieved and are retained as background context only, not as primary evidence.
5. It concerns GnRH agonist analogues or GnRH antagonists rather than gonadorelin itself. These are separate molecules and separate pharmacologic classes, and their literature is not admissible as gonadorelin evidence.

## Source types explicitly disqualified as evidence

- Vendor, reseller, and marketplace product pages.
- Compounding pharmacy and telehealth promotional content.
- Peptide forum, coach, and influencer content.
- Manufacturer certificates of analysis presented without independent verification.
- Any page that uses a research use only framing to suggest human benefit. That framing is prohibited in this Guide regardless of source.

## What could not be retrieved

- The archived FDA approved human prescribing information for Factrel (NDA018123) and Lutrepulse Kit (NDA019687). Both predate routinely posted PDFs in Drugs@FDA, and the DailyMed Factrel record resolves to the cattle label. The historical human contraindications, warnings, and adverse reaction language therefore could not be sourced and must not be characterised without a reviewer obtaining that document.
- The WADA Prohibited List PDF. Direct PDF requests returned an empty response, likely bot mitigation. The S2.2.1 entry was taken from the live HTML page instead, and the list year could not be confirmed from the retrieved markup.
- Any ClinicalTrials.gov study record for gonadorelin. Study page fetches returned navigation content only.

## Remaining for a human reviewer

1. Retrieve the archived human labels for NDA018123 and NDA019687 and confirm the historical human warnings and adverse reaction profile before the Guide says anything about them.
2. Confirm the year of the WADA Prohibited List currently in force, and confirm the S2.2.1 wording against the official PDF.
3. Resolve the 503A compounding question with regulatory counsel. The Guide must not assert 503A status in either direction until this is settled. See CONTRADICTIONS.md.
4. Attempt direct retrieval of the two possible gonadorelin trial registrations surfaced by web search. Add NCT identifiers only if retrieved from clinicaltrials.gov itself.
5. Search state pharmacy board actions, DEA scheduling status, and FDA import alerts. None were searched this session.
6. Search non US regulators. No European, United Kingdom, Australian, Canadian, or Japanese regulatory records were retrieved this session, so the Guide currently makes no claim about any jurisdiction other than the United States and the World Anti-Doping Agency.
7. Consider a full text review of the single human cohort study, which is published in Chinese and was assessed from its English abstract only.

Dosing and administration information is intentionally excluded from Xenios Research Guides.
