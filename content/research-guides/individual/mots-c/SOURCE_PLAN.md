---
title: "MOTS-c Source Plan"
type: research-guide-source-plan
compound: MOTS-c
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# MOTS-c Source Plan

This document records how the evidence base for the MOTS-c Research Guide was assembled,
what was deliberately excluded, and what a human reviewer must still search before this
Guide is published.

All retrieval described here was performed on 2026-07-19. Every regulatory statement in
this Guide carries its own date and source URL and must be re-verified before publication.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## 1. Objective

Establish, from directly retrieved sources, what is actually known about MOTS-c in humans,
what is known only in animal or cell systems, what is unknown, and what its regulatory
status is by jurisdiction.

A second objective was specific to this compound. MOTS-c occurs naturally in the human body
and is measurable in blood, so most of the human literature measures the peptide people
already have rather than testing a peptide that was given to them. The search was therefore
designed to separate two questions that vendor material routinely merges:

1. What is the association between naturally occurring circulating MOTS-c and a health state?
2. What happens when MOTS-c is administered to a person?

The search produced answers to the first question that conflict with each other, and no
completed answer at all to the second.

A third objective was to keep MOTS-c distinct from CB4211, a modified MOTS-c analog studied
in a Phase 1 trial. These are different molecules. Vendor and marketing pages frequently
blur the two and present analog trial activity as evidence for MOTS-c.

## 2. Databases and registries consulted

| Source type | Consulted | Notes |
| --- | --- | --- |
| ClinicalTrials.gov | Yes | API v2, three registrations retrieved plus one deliberate control query against a non-existent identifier. The registry was queried directly because general web search on this topic returned mostly vendor and marketing blogs. |
| PubMed | Yes, partially | Two human observational studies retrieved and confirmed. A systematic sweep for systematic reviews and meta-analyses was NOT completed. See section 7. |
| PubMed Central (PMC) | Yes | Full text of one 2023 narrative review and one 2025 human observational study retrieved. |
| USADA (national anti-doping organisation) | Yes | Retrieved directly. This is the source of the anti-doping classification and, second hand, of every FDA statement in this Guide. |
| WADA Prohibited List (primary document) | No | Only USADA's description of the relevant section was retrieved. Logged as a gap. |
| FDA primary sources | Attempted, FAILED | The 503A bulk drug substances category pages and an FDA media document were attempted and returned HTTP 404 on every attempt. No FDA primary source was retrieved. Logged as the most significant gap in this file. |
| FDA warning letters | No | No warning letter specific to MOTS-c was retrieved or confirmed. |
| Drugs@FDA | No | Not searched directly. The no-approved-product finding rests on USADA's statement, which is second hand. |
| EU Clinical Trials Register, EudraCT, ISRCTN, ANZCTR, Chinese trial registry | No | Not searched. Logged as a gap. |
| Cochrane, Embase | No | Not searched. Logged as a gap. |
| Vendor, retailer, clinic and compounding pharmacy pages | Encountered, disqualified | Appeared heavily in general web search. Not used as evidence for any claim. See section 5. |

## 3. Queries run

The exact API endpoints below were retrieved and are reproduced verbatim because they are
reproducible by a reviewer.

| Query | Purpose | Result |
| --- | --- | --- |
| `https://clinicaltrials.gov/api/v2/studies/NCT07505745` | Confirm whether any interventional MOTS-c trial exists | Returned a Phase 2a MOTS-c trial, sponsor Hudson Biotech, status RECRUITING, no results posted |
| `https://clinicaltrials.gov/api/v2/studies?query.term=CB4211&format=json` | Establish what the analog trial record actually contains | Returned NCT03998514, Phase 1a/1b, Completed, no results posted |
| `https://clinicaltrials.gov/api/v2/studies/NCT04027712` | Check a registration described as a MOTS-c cardiovascular study | Returned an observational cohort, status UNKNOWN, no results posted |
| `https://clinicaltrials.gov/api/v2/studies/NCT07505999` | Adversarial control. A deliberately non-existent identifier, run to test whether the retrieval layer would fabricate a plausible record | Correctly returned HTTP 404, confirming retrieved registry records were not fabricated |

Literature and regulatory retrieval targeted the specific documents listed in
SOURCE_REGISTRY.md. Verbatim web search strings were not logged for every call, so this
plan records retrieval targets and outcomes rather than reconstructing query text. No query
string is reproduced here that was not actually executed.

The control query in row four is recorded deliberately. Registry identifiers are exactly the
kind of citation that looks authoritative and can be fabricated without a reader noticing.
Running a known-bad identifier and confirming a 404 is the cheapest available check that the
good identifiers are real.

## 4. Inclusion criteria

A source was admitted as evidence only if all of the following held.

1. It was retrieved directly at a URL during the 2026-07-19 session. Nothing was cited from
   memory, from a summary of a source, or from a search result snippet alone.
2. It is one of: a peer-reviewed primary study, a peer-reviewed review clearly labelled as
   such, a trial registry record, or an official body's own published statement.
3. Its population or model is stated, so that a human finding can never be silently mixed
   with a rodent or cell-culture finding.
4. For any claim about what MOTS-c does, the source states whether MOTS-c was administered
   or merely measured. This distinction decides the grade of every human row in
   CLAIM_TABLE.md.

## 5. Exclusion criteria and disqualified source types

The following were treated as inadmissible as evidence for any claim.

**Vendor, retailer, compounding pharmacy, telehealth and clinic pages.** Disqualified
outright. These dominated general web search for this compound. They are commercially
interested in the conclusion, they routinely present the CB4211 analog trial as MOTS-c
evidence, they routinely present rodent findings in language that reads as human fact, and
several carried regulatory claims that could not be verified against any primary source.
A vendor page may be cited in this Guide only as an example of a marketing claim being
corrected, never as support for a claim.

**Podcasts, influencer content, forum reports and anecdote aggregation.** Disqualified as
evidence. Note one deliberate exception in principle: where an official body such as USADA
itself aggregates reported adverse effects, that aggregation is admitted as a risk signal
and is explicitly graded as low, because a risk-restraining statement can be published at
low grade while a promotional statement cannot.

**Sponsor press communications about trial outcomes.** Disqualified. Claims that CB4211 was
found tolerable trace to sponsor communications, not to posted trial results. The registry
record for that trial has no posted results, so no efficacy or tolerability finding is
carried into this Guide from it.

**Secondary claims about regulatory events with no retrievable primary record.** Claims
encountered about a July 2026 FDA advisory review of MOTS-c and a change to a 503A category
listing appeared only in vendor and marketing material. They were not verified and are
excluded entirely from REGULATORY_STATUS.md. They must not be repeated in the Guide without
primary sourcing.

**Anything supporting a claim about administration that rests on a measurement study.** An
observational study that measures a peptide people already produce cannot support a claim
about giving that peptide to someone. Every source that would have been used that way was
excluded from that use, and the point is recorded as the central caveat in CLAIM_TABLE.md.

## 6. Handling of the analog problem

CB4211 is a modified MOTS-c analog developed by CohBar. It is not MOTS-c. Its Phase 1a/1b
registration was retrieved and is recorded in SOURCE_REGISTRY.md as S03, but it is recorded
specifically so that the Guide can state what it is and is not, and so that a reviewer can
see that the registry carries no posted results for it.

No finding from CB4211 is carried across to MOTS-c anywhere in this Guide. Any claim that
does so is listed in the PROHIBITED section of CLAIM_TABLE.md.

## 7. What remains to be searched by a human reviewer

This list is not optional cleanup. Two of these items are material to statements a member
would read.

1. **FDA primary sources. This is the largest gap.** Every FDA-specific statement in this
   Guide is reported second hand through USADA. Direct FDA pages, including 503A bulk drug
   substances category listings and an FDA media document, returned HTTP 404 on every
   attempt during the session. A reviewer must verify against fda.gov directly: whether
   MOTS-c appears on any 503A category list, what FDA has actually stated about compounding
   with it, and whether FDA has published any concern regarding immunogenicity, impurities
   or active ingredient characterisation for this substance. Until that is done, no
   FDA-attributed statement in this Guide should be treated as primary sourced.
2. **A systematic PubMed sweep.** The session's web search budget was exhausted before a
   systematic sweep for systematic reviews, meta-analyses and any further human studies
   could be run. No systematic review or meta-analysis of MOTS-c was retrieved. Absence of
   retrieval is not the same as absence of existence, and this Guide does not claim
   otherwise.
3. **Re-check of NCT07505745.** The Phase 2a MOTS-c trial is new, with a stated start of
   February 2026. Its full record could not be confirmed through the human-readable study
   page, which returns a JavaScript shell to an automated fetcher. Confirmation rests on the
   v2 API plus the 404 control test. A reviewer should re-check its status, its enrollment,
   and whether any results have been posted, immediately before publication.
4. **The WADA Prohibited List primary document.** The anti-doping classification is
   currently sourced only through USADA's description of it. Verify the section text against
   the WADA list itself, and confirm the list year in force at publication.
5. **Non-US regulators.** No statement from any regulator outside the United States was
   retrieved. Nothing is known here about the status of MOTS-c in the United Kingdom, the
   European Union, Canada, Australia or elsewhere. That silence is recorded as silence in
   REGULATORY_STATUS.md, not as permission.
6. **Non-US and non-registry trial databases.** EU CTR, ISRCTN, ANZCTR and the Chinese
   registry were not searched. A trial could exist that this Guide does not know about.
7. **Analytical and market quality surveys.** No analytical survey, purity study, or
   counterfeiting survey of MOTS-c sold through unregulated channels was retrieved. The
   Guide therefore makes no quantitative claim about market material quality, only the
   structural point that unregulated material carries no regulatory assurance of identity,
   purity or sterility.
8. **Assay standardisation.** The literature itself flags that MOTS-c measurement methods
   are unstandardised. A reviewer with domain access should check whether any standardised
   assay or reference method now exists, because this determines whether any published serum
   value is comparable across papers.

## 8. Standing rule for this file

If a claim cannot be traced to a source in SOURCE_REGISTRY.md that was retrieved on
2026-07-19, the claim is dropped and logged as a gap. It is not softened, hedged, or carried
forward with a plausible looking citation. An honest empty row is a correct result.
