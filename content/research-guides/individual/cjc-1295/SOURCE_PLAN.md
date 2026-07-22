---
title: "CJC-1295 Source Plan"
type: source-plan
compound: cjc-1295
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# Source Plan: CJC-1295

Search session date: 2026-07-19. This document records how the evidence base for the
CJC-1295 Research Guide was assembled, what was deliberately excluded, and what a human
reviewer still needs to search before publication.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## 1. Scope of the search

The search had to cover two chemically different products that share one street name.

- **CJC-1295 with DAC** (drug affinity complex, the albumin-binding form). This is the
  compound that carries essentially all of the published human data.
- **CJC-1295 without DAC**, more accurately called modified GRF(1-29) or mod GRF 1-29.
  A 2026 peer-reviewed narrative review states this compound is uncharacterised in the
  peer-reviewed human literature and that no controlled clinical studies have directly
  evaluated it in humans.

Any search that does not separate these two returns a misleading picture, because
findings for one get read as findings for the other. Separating them was the primary
design goal of this search, not an afterthought.

## 2. Databases and registries consulted

| Resource | What it was used for | Outcome |
|---|---|---|
| PubMed (pubmed.ncbi.nlm.nih.gov) | Primary literature identification and a completeness check on how many human studies exist | Searched successfully. Result list retrieved. Abstract retrieval degraded partway through the session (see section 6) |
| PubMed Central (pmc.ncbi.nlm.nih.gov) | Open access full text where available | One full text retrieved (anti-doping analytical paper) |
| ClinicalTrials.gov API v2 | Registered trial identification and completeness check | Searched successfully. Exactly one registered study returned |
| Frontiers in Endocrinology (open access) | Recent peer-reviewed narrative review, full text | Full text retrieved |
| govinfo.gov | Primary United States Federal Register notices | Three notices retrieved successfully |
| federalregister.gov | Same notices, alternate route | Redirected to an anti-bot interstitial. Worked around via govinfo.gov, which is an equivalent primary government source |
| fda.gov | FDA meeting materials, advisory committee outcome, bulk drug substances list status | Complete failure. Every URL returned HTTP 404 to automated fetch. This is the largest single gap in the record |
| downloads.regulations.gov | Public docket comments and attachments for docket FDA-2024-N-4777 | HTTP 403. Not retrieved. Most attachments would in any case be nominator or industry advocacy material, which does not grade as evidence |
| wada-ama.org Prohibited List | Current anti-doping status, exact section and wording | JavaScript rendered, no parseable content returned. Prohibition status confirmed instead through a peer-reviewed anti-doping paper |
| Wikipedia | Retrieved only to trace one widely repeated claim about why development stopped | Retrieved and flagged as tertiary and unverified. Not used as scientific evidence |
| General web search | Locating primary sources and identifying what claims circulate commercially | Used for discovery only, never as an evidence source |

## 3. Queries run

- PubMed: `CJC-1295`, sorted by date, page size 50. This returned 32 records and was used
  as the completeness check establishing that only three human studies of CJC-1295 exist
  in the indexed literature.
- ClinicalTrials.gov API v2: `query.term=CJC-1295` with fields for NCT id, title, overall
  status, study type, phase, condition, intervention, dates and lead sponsor, page size 50.
  This returned exactly one study, NCT00267527.
- ClinicalTrials.gov API v2: direct record fetch for NCT00267527.
- Targeted retrieval by identifier for the three human papers and the two originating
  preclinical papers found in the PubMed result list.
- govinfo.gov Federal Register issue lookups for the October 25 2024, January 7 2025 and
  April 16 2026 notices.
- Web searches used for discovery only, aimed at the current United States compounding
  status, the December 2024 Pharmacy Compounding Advisory Committee outcome, and the
  contents of the July 2026 advisory committee agenda.

## 4. Inclusion criteria

A source was admitted to the evidence record only if all of the following held.

1. It was actually retrieved during the 2026-07-19 session at a URL recorded in
   SOURCE_REGISTRY.md. Nothing was cited from memory.
2. It is a peer-reviewed publication, a trial registry record, a primary government
   regulatory notice, or an open access full text of one of those.
3. Its variant attribution is determinable, meaning it is possible to say whether the
   finding applies to the DAC form, the no-DAC form, or neither.
4. For any human claim, the population studied is stated or is retrievable from the
   abstract.

One tertiary source (an encyclopedia entry) was retained in the registry, clearly marked
unverified, solely so a reviewer can trace a claim that circulates widely and decide
whether to confirm or drop it. It supports nothing in the claim table.

## 5. Exclusion criteria and disqualified source types

The following are **disqualified as evidence** for this Guide and were not used to support
any claim, regardless of how confident or specific their wording was.

- **Vendor, retailer, marketplace and supplier pages.** These grade E (supplier reported)
  or G (unverified) by definition. Several encountered this session presented specific
  pharmacokinetic figures for the no-DAC variant while citing human trials conducted on
  the DAC variant as the supporting evidence. That is a misattribution of data across two
  pharmacologically dissimilar compounds, and it is the single most common defect in the
  commercially available material on this subject.
- **Clinic and telehealth marketing pages**, including those written in clinical register.
  Commercial intent disqualifies them as an evidence source irrespective of authorship.
- **Forums, social posts, coaching content and anecdotal reports.**
- **Any page carrying dosing, protocol, cycling, reconstitution or administration content.**
  These were not read for content and nothing from them appears anywhere in this Guide.
- **Any source using "research use only" framing to imply human benefit.** That framing is
  prohibited in this Guide and its presence marks a source as promotional.
- **Secondary summaries of primary regulatory documents**, where the primary document was
  reachable. Where the primary document was not reachable, the gap is recorded as a gap
  rather than filled with a secondary account.

Preclinical work was included but is quarantined. Animal and in vitro findings are always
written with the species or model in the same sentence as the finding, and they never
support a human claim.

## 6. Known retrieval failures in this session

These are limitations of the search, not conclusions about the compound.

1. **fda.gov was completely unfetchable.** Every attempted URL returned HTTP 404 to the
   automated fetch, including the advisory committee briefing document, the bulk drug
   substances list pages, the December 4 2024 meeting page, the meeting transcript, and a
   compounding warning letter search. FDA's actual stated proposal on each CJC-1295 form,
   the committee vote, and the current list status are therefore all unverified.
2. **downloads.regulations.gov returned HTTP 403**, so docket comments and attachments were
   not read.
3. **The WADA Prohibited List page did not render** to the fetcher. Prohibition of GHRH
   analogues at all times is confirmed through a peer-reviewed anti-doping paper, but the
   current year list section number and exact wording are unverified.
4. **PubMed began returning reCAPTCHA challenges partway through the session.** As a result
   the abstracts of several 2026 narrative reviews identified in the result list were not
   retrieved. Their existence, titles, authors, journals, years and PMIDs are verified from
   the retrieved result list. Their content is not.
5. **Full texts of the three human papers were not obtained**, only PubMed abstracts. Exact
   enrollment numbers, adverse event tables and dropout data are therefore unverified.

## 7. What a human reviewer must still search

Ordered by how much it changes the Guide.

1. **Open fda.gov directly in a browser.** Confirm what FDA proposed for each of the five
   CJC-1295 forms considered at the December 4 2024 Pharmacy Compounding Advisory Committee
   meeting, what the committee voted, and what the current 503A bulk drug substances list
   status is as of the publication date. No current United States compounding status may be
   stated in the Guide until this is done. Vendor accounts of this are mutually inconsistent
   and at least one adjacent vendor claim is verifiably false.
2. **Confirm or drop the reported Phase II trial subject death.** This appears in a tertiary
   source only. It must not be published as fact and must not be published as debunked.
   Check the sponsor record, FDA correspondence, and contemporaneous reporting.
3. **Confirm the reported vasodilatory reaction and tachycardia rationale** attributed to an
   FDA listing. The primary document was not retrievable this session.
4. **Download the current year WADA Prohibited List PDF** and record the exact section and
   wording covering GHRH analogues.
5. **Retrieve the seven 2026 narrative review abstracts** listed as unread in the gaps
   section of SOURCE_REGISTRY.md. Several are in sports medicine and orthopaedic journals
   and may carry relevant safety or product quality material.
6. **Obtain full texts of the three human papers** to recover exact enrollment, sex
   breakdown, adverse event tables and dropouts.
7. **Search for any independent product testing or purity analysis** of currently marketed
   products sold under this name. The closest available item in this record is a forensic
   identification of a seized preparation published in 2010.
8. **Search for a peer-reviewed or regulatory source for the amino acid substitution
   positions** of modified GRF(1-29). Those positions appeared only in vendor material this
   session and are excluded from the verified record.
   [UNVERIFIED - background knowledge, requires human source check]
9. **Search non-United States regulators**, including EMA, MHRA, TGA and Health Canada. No
   non-United States regulatory position was searched or retrieved this session, so the
   Guide currently has no basis to say anything about any jurisdiction other than the
   United States and the World Anti-Doping Agency.

## 8. Honest statement of what this search found

The search was successful in the sense that it established the shape of the evidence
clearly. Only three human studies of this compound exist in the indexed literature, all
published between 2006 and 2009, all in healthy volunteers, all from one investigator
group, and all studying the DAC form. The only registered trial in a patient population was
terminated with no results posted. Half of what is sold under this name, the no-DAC variant,
has no controlled human studies at all. An empty or near-empty human outcomes table is the
correct result here, not a failure of searching.
