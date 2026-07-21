---
title: SS-31 Source Plan
type: research-guide-source-plan
compound: ss-31
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# SS-31 Source Plan

This document records how the evidence base for the SS-31 (elamipretide) Guide was assembled,
what was deliberately excluded, and what a human reviewer still has to do before anything in
this folder is published.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## 1. Objective of the search

SS-31 is unusual among the compounds in this Guide series. Most of them have no human evidence
at all. This one has a large sponsored clinical programme, an FDA-approved product, and a body
of published trial results. The research objective was therefore not "does any human data
exist" but the harder question underneath it:

1. What did the controlled human trials actually find, as distinct from what the programme is
   summarised as having found.
2. What exactly the FDA approved, on what endpoint, under what pathway, and for whom.
3. Whether anything in the record supports the popular consumer positioning of SS-31 as an
   energy, fatigue, performance, recovery, or longevity compound.
4. Whether the FDA-approved product and the grey-market research chemical sold as "SS-31" are
   the same thing.

The search was designed so that a programme of failed trials sitting underneath a genuine
regulatory approval would be reported as exactly that, rather than being smoothed into a
success story by the existence of the approval.

## 2. Databases and registries consulted

| Resource | What was queried | Outcome |
| --- | --- | --- |
| DailyMed (NIH mirror of FDA labelling) | The US prescribing information for FORZINITY (elamipretide hydrochloride) injection | Retrieved and read in full. This is the single authoritative source for the identity, mechanism wording, indication, approval basis, and adverse reaction profile in this folder. |
| FDA, accessdata.fda.gov | The approval letter and the Integrated Review documents for the Barth syndrome application | NOT retrieved. Direct fetch returned HTTP 404 for both. The agency's own critique of the evidence was therefore never read. |
| ClinicalTrials.gov | Registry records for NCT03323749 (MMPOWER-3), NCT03098797 (TAZPOWER), NCT03891875 (ReCLAIM-2), NCT02914665 (heart failure), NCT02245620 (elderly skeletal muscle), NCT07275424 (healthy aging) | All six retrieved. Design, enrollment, sponsor, population, status, and primary outcome measures confirmed from the registry. |
| ClinicalTrials.gov, results sections | Posted outcome data, queried field by field | NOT done. Posted results may exist for several completed trials. This is a named gap. |
| PubMed | The TAZPOWER 168-week open-label extension (PMID 38602181) | Retrieved and read. |
| PubMed Central | The MMPOWER-3 primary publication (Neurology 2023, PMC10382259) | Bibliographic record only. The full text was not retrievable, so the reported effect sizes rest on secondary reporting. |
| Ophthalmology Science | The ReCLAIM-2 primary publication | NOT retrieved. Returned HTTP 403. Only registry-level facts about that trial are verified. |
| PubMed Central | The aged-mouse study of SS-31 and exercise tolerance (PMC6588449) | Retrieved and read in full. |
| PubMed Central | The mouse study on cardiac and skeletal muscle function versus epigenetic age (PMC12151887) | Bibliographic listing only. The title was seen in a search listing. The full text was not retrieved. |
| WADA | The official Prohibited List | NOT retrieved. The page returned empty content. No anti-doping claim is asserted anywhere in this folder. |
| Sponsor press release (PR Newswire) | The announcement of FDA accelerated approval | Retrieved and read. Treated throughout as a sponsor-interested secondary source, never as a primary regulatory record. |
| Advocacy and trade secondary reporting | Grey-market peptide quality and FDA warning letters to online sellers | Retrieved. Recorded as a grade E market-risk claim only. No figure from it enters any member-facing surface. |

Registries NOT searched: the EU Clinical Trials Register, ISRCTN, the WHO ICTRP, and the
Japanese and Chinese national registries. See section 6.

## 3. Inclusion criteria

A source was admitted to the registry if all of the following held.

1. It was retrieved in this research session at a recorded URL, or its retrieval failure was
   recorded. Nothing was admitted from memory.
2. It addresses elamipretide or SS-31 itself, or it is explicitly labelled as addressing
   something adjacent (the grey-market supply channel) and is used only for that adjacent
   purpose.
3. For preclinical work, the species or model is identifiable, so that a finding can never be
   written without the model in the same sentence.
4. For regulatory statements, a jurisdiction, a date, and a URL are all available.

## 4. Exclusion criteria

A source or a claim was excluded if any of the following held.

1. **Vendor, retailer, affiliate, and peptide-marketing pages are disqualified as evidence.**
   They may be cited only to document where an unverifiable claim originated, and such an entry
   is marked as non-evidence in the registry. This exclusion did real work here: the only
   sources asserting a 2026 change in the WADA classification of elamipretide were
   peptide-vendor and affiliate blogs, which have a direct commercial interest in an
   it-is-not-banned conclusion. That claim is excluded entirely.
2. Sponsor characterisations of the programme's success, where they are not traceable to the
   approved label or to a registry record. The sponsor press release is admitted for the fact
   and date of approval only, and is flagged as sponsor-interested everywhere it is used.
3. Specific grey-market failure percentages circulating in law-firm, trade, and press blogs.
   None traced to a retrieved FDA primary document. They are excluded by name so that they
   cannot re-enter later.
4. Subgroup and post-hoc analyses presented as though they were trial results. They are recorded
   as hypothesis-generating and always attached to the failure of the primary endpoint they
   follow.
5. Any dose, route as instruction, schedule, concentration, or preparation detail appearing in
   an admitted source, including in the FDA-approved label. The label carries full dosing
   information. None of it is reproduced anywhere in this folder.

## 5. Grading approach

Claims are graded individually, never the compound as a whole. Unlike most compounds in this
series, some SS-31 claims do reach grade A or B, because a genuine regulatory approval and
genuine randomized controlled trials exist. Critically, the highest-graded claims in this folder
are **negative findings**: the trials that failed are the best-supported human evidence here.

No claim about a benefit in healthy adults reaches above G, because no completed randomized
trial in a healthy population was retrieved.

## 6. What remains for a human reviewer

These are open items, not minor tidying. Each should be closed before publication.

1. **Retrieve the FDA approval letter and the Integrated Review documents.** Both returned HTTP
   404 on direct fetch. The label was recovered through DailyMed, an authoritative NIH mirror,
   but the review documents contain the agency's own assessment of the evidence, which is
   exactly the material a Guide taking an honest position on a conditional approval should read.
2. **Obtain the full text of the MMPOWER-3 publication in Neurology.** The reported effect size
   on the six-minute walk test, and its confidence interval, came from secondary reporting.
   Every numeric statement about that trial in this folder is flagged and must be checked
   against the published article.
3. **Obtain the full text of the ReCLAIM-2 publication in Ophthalmology Science.** It returned
   HTTP 403. Only registry-level facts are currently verified. No numeric secondary result from
   that trial appears in this folder.
4. **Read the official WADA Prohibited List directly.** The page returned empty content. No
   anti-doping status for elamipretide or SS-31 is asserted anywhere in this folder, and none
   may be added until an official source is read. Athletes must additionally be directed to
   their own national anti-doping organisation.
5. **Query the ClinicalTrials.gov results sections field by field** for the completed trials,
   particularly NCT02914665 (heart failure) and NCT02245620 (elderly skeletal muscle). Posted
   results may exist and would either strengthen or correct this record. Both trials currently
   appear in this folder with their outcomes explicitly unknown.
6. **Verify the regulatory history items** currently resting on the sponsor press release: the
   Complete Response Letter of 15 May 2025, and the Orphan Drug, Fast Track, Priority Review,
   Rare Pediatric Disease designations and voucher. These are sponsor claims, not retrieved FDA
   records.
7. **Retrieve the full text of the mouse study PMC12151887.** Its finding is currently recorded
   from the title as listed in a search result. It matters because it cuts directly against
   reverses-aging marketing, and a claim that convenient to the Guide's own position must be held to
   a higher standard, not a lower one.
8. **Search for a systematic review or meta-analysis of elamipretide.** None was retrieved.
9. **Search the additional trial registries** listed at the end of section 2.
10. **Search for any analytical chemistry study of grey-market SS-31 product identity or
    purity.** None was retrieved. The Guide currently states this as a gap, which is the honest
    position, but the search should be run properly before publication.
11. **Check the status of the confirmatory phase 4 Barth trial NCT07531251**, which the
    accelerated approval depends on. It was recorded as recruiting.
