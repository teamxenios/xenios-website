---
title: Epithalon Regulatory Status
type: research-guide-regulatory-status
compound: epithalon
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# Epithalon Regulatory Status

**Status checked on 2026-07-21. This page must be re-verified before publication and re-checked on
any subsequent update.** Regulatory positions change, and one item on this page concerns a meeting
that had not taken place at the time of checking.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## Integrity note, read before using this page

**Two of the three authorities on this page could not be read at all.**

- **Every fda.gov retrieval returned HTTP 404 to the retrieval tool.** That includes the advisory
  committee meeting calendar page, the 503A bulk drug substances page, and two briefing PDFs at
  fda.gov/media/193343/download and fda.gov/media/193342/download. **FDA's own wording was never
  read this session.** Every FDA entry below is recorded verified=false.
- **wada-ama.org returned no usable page content.** No World Anti-Doping Agency primary document
  was retrieved. **No anti-doping status is recorded for this compound anywhere in this folder.**

Only the ClinicalTrials.gov entry rests on a primary source that was actually read.

**A human reviewer must open the FDA and WADA pages in a browser and confirm or correct each
statement before publication. Do not publish the FDA or WADA content on this page as it stands.**

## Standing principles for this page

1. Approval, authorisation, or registration in one jurisdiction is not approval in another. A
   position recorded here for the United States says nothing about any other country, and no
   inference across borders should be drawn from it.
2. Every statement below carries a jurisdiction, a date checked, and a source URL. A statement
   without all three does not belong on this page.
3. Where a status could not be confirmed by reading the primary document, that is stated
   explicitly rather than filled in by inference.
4. **Vendor, retailer, supplement-marketing, and SEO pages are never regulatory evidence**, no
   matter how confidently they state a classification. This rule is the reason the anti-doping
   section below records no status.
5. An advisory committee recommendation is advisory. It is not a final agency determination.

## United States

### US-01. Approval status

**Jurisdiction:** United States, Food and Drug Administration.
**Statement:** Epithalon and Epitalon are not FDA-approved drugs. No approval was found in any
retrieved source.
**Date checked:** 2026-07-21.
**Source:** https://www.fda.gov/advisory-committees/advisory-committee-calendar/july-23-24-2026-meeting-pharmacy-compounding-advisory-committee-07232026
**Verification: verified=false.** The FDA page supporting the surrounding process detail could not
be retrieved. The unapproved status is consistent with everything else retrieved, including the
absence of any registered trial, but it was not confirmed against an FDA page this session.

### US-02. Pharmacy Compounding Advisory Committee review, 23 to 24 July 2026

**Jurisdiction:** United States, Food and Drug Administration.
**Statement:** As of the retrieval date, a US FDA Pharmacy Compounding Advisory Committee meeting
was scheduled for 23 to 24 July 2026 to consider several peptides, including Epitalon, for the
503A Bulks List. Search-result summaries indicate FDA proposed **not** adding them, citing poor
characterization, little or no human effectiveness evidence for the proposed routes, and
insufficient human safety data including unassessed immunogenicity.
**Date checked:** 2026-07-21.
**Source:** https://www.fda.gov/advisory-committees/advisory-committee-calendar/july-23-24-2026-meeting-pharmacy-compounding-advisory-committee-07232026
**Verification: verified=false. VERIFICATION FAILED.** Every direct fetch of fda.gov returned HTTP
404 to the retrieval tool: the meeting calendar page, the 503A bulk drug substances page, and both
briefing PDFs. FDA's own wording could not be read this session. **Nothing in the statement above
is attributed to FDA as its words, and none of it may be published as FDA's position until a human
reads the primary FDA page.**
**Handling rule:** describe the review as pending and assert no outcome. The scheduled meeting
dates fall after this record's check date of 2026-07-21, so no outcome exists here. When the record
becomes available, read it directly rather than a summary of it, and remember that a committee
recommendation is advisory rather than final.

### US-03. Clinical trial registration

**Jurisdiction:** United States, ClinicalTrials.gov registry.
**Statement:** No registered studies. A direct API query for the term "epitalon" returned an empty
result set, and a separate direct query for the term "epithalon" also returned an empty result set.
**Both spellings were checked deliberately**, because the same authors use them interchangeably and
a single-spelling search under-retrieves. This is a registry-coverage finding: no study under
either name is registered in this registry.
**Date checked:** 2026-07-21.
**Sources:**
https://clinicaltrials.gov/api/v2/studies?query.term=epitalon&pageSize=20
https://clinicaltrials.gov/api/v2/studies?query.term=epithalon&pageSize=20
**Verification: verified=true.** Primary registry queries, retrieved and read. The result sets were
genuinely empty rather than absent, which is corroborated by the retrieval-integrity control noted
below.

**Retrieval-integrity note supporting US-03.** A deliberately fabricated identifier,
PMID 99999999, was requested during the same session and returned HTTP 404 Not Found
(https://pubmed.ncbi.nlm.nih.gov/99999999/). A retrieval path that invents plausible records would
not have failed. That is what allows the two empty registry results to be reported as findings
rather than as failures.

## Anti-doping

### AD-01. World Anti-Doping Agency

**Jurisdiction:** World Anti-Doping Agency, international.
**Statement: NOT ESTABLISHED IN THIS SESSION. NO STATUS IS RECORDED.** Searches returned only
vendor, supplement-marketing, and SEO pages asserting an S0 (non-approved substances)
classification. **No WADA primary document was retrieved**, and a fetch of wada-ama.org returned no
usable page content. Because those asserting sources are commercial, and commercial pages are never
scientific or regulatory evidence, **no WADA status is recorded for this compound.**
**Date checked:** 2026-07-21.
**Source:** https://www.wada-ama.org/en/prohibited-list
**Verification: verified=false.** The primary document was not read.
**Handling rule:** the Guide and the FAQ state no anti-doping status. A human must check the
current WADA Prohibited List directly before any competitive-sport statement is published. Athletes
subject to testing are directed to their own anti-doping authority. **Do not publish an inference
as a finding, and do not treat the absence of a statement here as permission.**

## Other jurisdictions

No regulatory statement was retrieved for the European Union, the United Kingdom, Canada,
Australia, Japan, Russia, or any other jurisdiction. No national regulator outside the United
States was consulted in this research session, and no trial registry outside ClinicalTrials.gov was
searched.

Russia is the most material omission, since the compound was developed there and the entire
literature originates there. Neither a Russian regulatory position nor the Russian national trial
registry was checked.

The absence of an entry here means the question was not investigated. It does not mean the compound
is unregulated, permitted, or approved anywhere. Approval or registration in one jurisdiction is
not approval in another, and the reverse also holds: an unconfirmed status elsewhere may not be
inferred from the United States entries above.

## Summary of verification state

| Entry | Jurisdiction | Verified | Publishable as it stands |
|---|---|---|---|
| US-01 approval status | United States, FDA | **false** | No |
| US-02 advisory committee review | United States, FDA | **false** | No |
| US-03 trial registration | United States, ClinicalTrials.gov | **true** | Yes |
| AD-01 anti-doping | WADA, international | **false** | No status is stated, so there is nothing to publish |
| Other jurisdictions | All others | Not checked | Publishable only as "not checked" |

## Re-verification checklist for the reviewer

1. Open the FDA advisory committee meeting page, the 503A bulk drug substances page, and both
   briefing documents directly in a browser and confirm or correct US-01 and US-02. Every fetch
   failed with HTTP 404 this session.
2. Confirm what actually happened at the 23 to 24 July 2026 meeting by reading the primary record,
   and remember that a committee recommendation is not a final agency determination.
3. Read the current WADA Prohibited List directly and determine whether this compound is named
   under any of its spellings. Until then, no status may be published.
4. Re-run both ClinicalTrials.gov queries, under both spellings, and record the date.
5. Search at least one trial registry and one regulator outside the United States, the Russian
   national registry first, so that the "other jurisdictions" section becomes a finding rather than
   a gap.
6. Update the dated header and the `last_reviewed` field together. A stale date on this page is
   itself a defect.
