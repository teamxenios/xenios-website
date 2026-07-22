---
title: "Semax + Selank + DSIP: Source Plan"
type: research-guide-source-plan
compound: semax-selank-dsip
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# Semax + Selank + DSIP Source Plan

This document records how the evidence base for this blend Guide was assembled, what was
deliberately excluded, and what a human reviewer must still do before anything in this folder
reaches a member.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## 1. The question this search was built to answer

A blend Guide has one primary question that a single-compound Guide does not:

**Has anyone studied this combination?**

Everything else is secondary. The search was therefore designed in two separate passes, and
the second pass was designed so that a zero result would be a valid, reportable, publishable
finding rather than a hole to be filled with substitutes.

**Pass one, the combination.** Search the supplied evidence base for any study, of any design,
in any species, that administered Semax, Selank, and DSIP together as one preparation.

**Pass two, the components.** Establish separately, for each of the three named compounds,
what human evidence exists, what the preclinical record shows with the species or model
attached to every finding, and what the current regulatory position is by jurisdiction and
by date.

Pass two exists to describe the components honestly. It does not exist to be added together
into a substitute for pass one. Adding component findings together would be the specific
failure this document set is built to prevent.

## 2. Result of pass one, stated before anything else

**No study of the combination was found. Not a human study, not an animal study, not a
laboratory study, not a trial registration, and not a regulatory evaluation of the mixture.**

The search returned exactly one record that could be mistaken for combination evidence, and
it is not combination evidence. A resting-state functional MRI study in 52 healthy adults
(PMID 32342318) examined Selank and Semax and reported effects the authors described as both
general and specific to each peptide. Two compounds examined alongside each other in one
study, with their effects distinguished from one another, is a comparison, not a combination.
DSIP does not appear in it at all. This record is flagged by name in CLAIM_TABLE.md and in
CONTRADICTIONS.md precisely because it is the one item a reader or a writer could
misconstrue.

There is no two-component evidence either. Nothing tested Semax with Selank as a mixture,
nothing tested Semax with DSIP, and nothing tested Selank with DSIP.

## 3. What was searched, and by whom

An important limit on this document set, stated plainly: the primary research for this Guide
was performed in a prior session and supplied to this drafting step as three structured
research records, one per component. This drafting step searched those three records
exhaustively for combination evidence. It did not run fresh database queries of its own.

That distinction matters, so it is recorded as an open item in section 7 rather than buried.
A human reviewer must run a direct combination search against the live databases before
publication, because a zero result asserted from a secondary record is weaker than a zero
result observed at a registry.

The three supplied research records document the following retrievals.

| Resource | What was queried | Outcome |
| --- | --- | --- |
| ClinicalTrials.gov API v2 | Term "Semax" | Zero registered studies. |
| ClinicalTrials.gov API v2 | `query.intr=selank`, and separately `query.term=selank` | Two and ten total records respectively, every one an unrelated fuzzy text match. Zero genuine Selank trials. |
| ClinicalTrials.gov API v2 | Term "DSIP", and separately intervention "delta sleep-inducing peptide" | Zero, and one irrelevant L-carnitine match (NCT05251207). Zero genuine DSIP trials. |
| PubMed, direct search | "Semax" | Approximately 230 records. Of the first 20 reviewed, roughly 19 were preclinical or narrative review and one was a human clinical study. |
| PubMed, restricted to review and systematic-review types | "Semax" | 14 records, none a systematic review or meta-analysis. |
| PubMed, via NCBI E-utilities | Selank with anxiety, and Selank restricted to trial and review publication types | 29 and 6 records respectively. Three of the six were false positives on unrelated subjects. |
| PubMed, via NCBI E-utilities efetch | Full abstracts for the four Selank human records and the five Selank preclinical records | Retrieved and read. |
| PubMed, direct fetch | Semax human records PMID 29798983, 15792140, 30225715, 32342318 | Retrieved and read (English abstracts only; two are Russian-language papers). |
| PubMed, results listing only | Semax preclinical PMID 16635254, 16362768, 28255762 | Titles seen in a results listing. Abstracts not individually fetched. Species not confirmed. |
| PubMed and Karger | DSIP human records PMID 3583493, PMID 6391926, and Bes 1992 at DOI 10.1159/000118919 | Retrieved and read. |
| PubMed | DSIP PMID 7028502, an early human sleep study | **Fetch failed.** Returned a CAPTCHA interstitial. No content retrieved and none asserted. |
| Federal Register | Full text of document 2026-07361, dated 2026-04-16, Docket FDA-2025-N-6895 | **Retrieved and read.** This is the only successfully retrieved primary regulatory document in the whole packet. |
| FDA (fda.gov, precision.fda.gov) | Drugs@FDA, the 503A bulk substances pages, the July 2026 advisory committee pages, the briefing document, GSRS substance records | **Not retrieved.** Every attempt returned HTTP 404 or rendered no usable content. |
| EMA | Medicines search endpoint | **Not retrieved.** Returned HTTP 401. |
| WADA | The current Prohibited List, page and PDF | **Not retrieved.** Returned empty content on every attempt across all three component searches. |
| Russian State Register of Medicines (GRLS) | Registration records for Semax and Selank | **Not retrieved.** Not successfully queried; a mirror record rendered no content. |
| Russian pharmaceutical trade press (Vademecum, VShOUZ) | The January 2026 Ministry of Health deregistration action | Retrieved and read. Two independent outlets carrying the same named detail. |
| Manufacturer page (peptogen.ru) | Selank product listing | Retrieved. Lists indications but publishes no registration certificate number and no registration date. |

Registries not searched anywhere in this work: the EU Clinical Trials Register, ISRCTN, the
WHO ICTRP, the Russian trial registry, and the Japanese and Chinese national registries. A
combination search of those registries has therefore never been run at all.

## 4. Inclusion criteria

A source was admitted if all of the following held.

1. It was retrieved at a recorded URL in the underlying research session. Nothing was
   admitted from memory, and nothing has been added from memory during drafting.
2. It addresses one of the three named compounds, or the combination, or is explicitly
   labelled as adjacent context and used only for that purpose.
3. Its species or model is identifiable, so that no preclinical finding can be written
   without its model in the same sentence. Where a record's species was not confirmed, the
   finding is marked as species-unconfirmed and may not be published.
4. For a regulatory statement, a jurisdiction, a date, and a URL are all present.

## 5. Exclusion criteria

A source or claim was excluded if any of the following held.

1. **Vendor, retailer, clinic-marketing, and peptide-encyclopedia pages are disqualified as
   evidence.** The underlying research notes that these dominated search results for all
   three compounds. They appear in the registry only to document where an unusable claim
   originated, and such entries are marked NON-EVIDENCE.
2. Search-engine answer summaries used in place of the underlying document. Several such
   summaries asserted regulatory positions that the primary record contradicts.
3. Any claim about the combination assembled from component evidence. This is excluded by
   design and by name, not by oversight.
4. **Any dose, amount, concentration, frequency, timing, cycle, titration, reconstitution
   detail, injection technique, or route presented as instruction**, from any admitted
   source. The underlying research explicitly recorded that vendor pages for these compounds
   publish administration protocols. None of that has been reproduced anywhere in this
   folder.
5. Evidence for a compound that is not one of the three named here, presented as if it were.
   This applies particularly to the 2024 mouse study of an engineered DSIP fusion peptide,
   which is a different molecule from DSIP and is labelled as such wherever it appears.
6. Any acquisition or sourcing guidance.

## 6. Grading approach

Claims are graded individually. There is no grade for the product as a whole, and there is
deliberately no composite or summary grade for the blend, because a summary grade would
imply that component evidence aggregates into product evidence.

The default grade is D (preclinical) or G (unverified). A grade of C or better requires a
specific retrieved human study of the thing being claimed. For the combination, no claim
reaches any grade above G, because no study of the combination exists.

Selank is the one component with genuine human trial evidence, so an empty human evidence
table would be wrong for that component and is not presented. That evidence is small,
non-independent, and lacks any placebo-controlled trial, and it is graded and caveated
accordingly. It remains evidence about Selank alone.

## 7. What remains for a human reviewer

These are open items, not tidying. Each should be closed before publication.

1. **Run a direct combination search against live databases.** Query PubMed and
   ClinicalTrials.gov for Semax with Selank, Semax with DSIP, Selank with DSIP, and all
   three together, plus any trade or product name this blend is sold under. Record the
   queries and the zero results with a date. The current zero result is asserted from three
   supplied research records rather than observed at a registry, and that is not good enough
   for publication.
2. **Confirm the product's actual composition with the supplier.** No supplier
   specification, certificate of analysis, or manufacturing record was available. This Guide
   therefore states no ratio, no proportion, and no strength. This is the first open supplier
   question in QUALITY_AND_DOCUMENTATION.md and is a publication blocker in its own right.
3. **Verify the Russian regulatory position directly at grls.minzdrav.gov.ru.** Two
   independent Russian trade outlets report that the Peptogen Semax and Selank registrations
   were cancelled on 20 to 21 January 2026 and that selank was excluded from the State
   Register as a substance. Confirm this at the register itself, and confirm the prior
   registration particulars (certificate number, original date, effective date of
   cancellation) which no retrieved source published.
4. **Open the FDA pages directly.** Every FDA statement in this packet except one rests on
   secondary reporting or search summaries, because every fda.gov fetch failed. The single
   exception is the Federal Register full text for document 2026-07361, which was retrieved
   and read.
5. **Resolve the direct conflict over whether Selank was nominated to the 503A bulks list.**
   A search summary in the Selank research states Selank and Semax were *not* nominated. The
   retrieved Federal Register text states Semax free base and Semax acetate *were* nominated.
   These cannot both be right. See CONTRADICTIONS.md, entry C-03.
6. **Confirm the outcome of the Pharmacy Compounding Advisory Committee meeting of 23 to 24
   July 2026.** As of 2026-07-21 it had not occurred. No outcome is stated anywhere in this
   folder, and none may be added from a summary.
7. **Read the current WADA Prohibited List directly.** It could not be retrieved in any of
   the three component searches. No anti-doping status is stated anywhere in this folder for
   any of the three compounds.
8. **Retrieve DSIP record PMID 7028502**, an early human sleep study that returned a CAPTCHA.
   It is named in this folder only to record that it exists and is unexamined. No content
   from it is asserted.
9. **Retrieve the three Semax preclinical records individually** (PMID 16635254, 16362768,
   28255762) and confirm the species of each. They were read from a results listing only, so
   none may be published as a preclinical finding until its model is named.
10. **Obtain full texts for the Russian-language human studies.** Every Semax and Selank
    human record was read as an English abstract only. Risk-of-bias assessment has not been
    performed on any of them.
11. **Verify the amino acid sequences from a primary chemical registry.** The Selank
    sequence is marked unverified in the underlying research because the FDA GSRS records did
    not render. Confirm all three sequences before any is published.
12. **Search at least one regulator outside the United States and Russia**, so that the other
    jurisdictions section becomes a finding rather than a gap.
