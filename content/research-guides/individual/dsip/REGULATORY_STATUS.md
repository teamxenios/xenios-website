---
title: DSIP Regulatory Status
type: research-guide-regulatory-status
compound: dsip
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# DSIP Regulatory Status

**Status checked on 2026-07-21. This page must be re-verified before publication and re-checked on
any subsequent update.** Regulatory positions change, and most of this page currently rests on
sources that were not successfully retrieved.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## Standing principles for this page

1. Approval, authorisation, or registration in one jurisdiction is not approval in another. A
   position recorded here for the United States says nothing about any other country.
2. Every statement below carries a jurisdiction, a date checked, and a source URL. A statement
   without all three does not belong on this page.
3. Where a status could not be confirmed by reading the primary document, that is stated explicitly
   rather than filled in by inference. Where an inference is drawn, it is labelled as an inference.
4. An advisory committee recommendation is advisory. It is not a final agency determination.

## Integrity note, read before using this page

**This is the weakest part of the DSIP record and it must not be published as it stands.**

Four separate FDA URLs were attempted during research and all failed: the July 2026 Pharmacy
Compounding Advisory Committee calendar page, the FDA 503A bulk substances page, the briefing
document media download, and a Federal Register public-inspection PDF. All returned HTTP 404 or
unreadable binary content. Every FDA-derived statement below therefore rests on search-index
snippets and secondary trade reporting, and every one is marked **verified=false**.

The WADA Prohibited List PDF returned empty content, so DSIP's anti-doping status was not confirmed
from WADA directly and the category reasoning here is an inference rather than a retrieved ruling.

No regulator database for the European Union, the United Kingdom, Canada, or Australia was queried
at all.

A human reviewer must open the relevant regulator pages directly and confirm each statement before
publication.

## United States

### US-01. Approval status

**Jurisdiction:** United States, Food and Drug Administration.
**Statement:** DSIP has no FDA approval for any indication.
**Date checked:** 2026-07-21.
**Source:** https://www.fda.gov/advisory-committees/advisory-committee-calendar/july-23-24-2026-meeting-pharmacy-compounding-advisory-committee-07232026
**Verification:** **verified=false.** No FDA primary document was successfully retrieved this
session. The statement rests on search-index snippets and secondary trade reporting.

### US-02. 503A Bulks List consideration, July 2026

**Jurisdiction:** United States, Food and Drug Administration.
**Statement:** Emideltide, the regulatory name for DSIP in free base and acetate forms, was
scheduled for discussion at the FDA Pharmacy Compounding Advisory Committee meeting on July 23 to
24, 2026, regarding possible inclusion on the 503A Bulks List for compounding. Reporting on the FDA
briefing materials indicates FDA proposed that emideltide **not** be added to the 503A Bulks List,
citing that available studies were small, uncontrolled, or contradictory.
**Date checked:** 2026-07-21.
**Source:** https://www.fda.gov/advisory-committees/advisory-committee-calendar/july-23-24-2026-meeting-pharmacy-compounding-advisory-committee-07232026
**Verification:** **verified=false.** Repeated WebFetch attempts against the FDA advisory committee
calendar page, the FDA 503A bulk substances page, and the FDA briefing document media URL all
returned HTTP 404 in this session. The substance of this statement rests on search-index snippets
and secondary trade reporting, not on a successfully retrieved FDA primary document. A human
reviewer must confirm this against the FDA primary source before publication.
**Note:** an advisory committee recommendation is advisory and is not a final agency determination.
**Handling rule:** this statement may appear in member-facing content only while carrying its
unverified flag visibly, or after a human has confirmed it against FDA primary documents. It must
never be presented as a settled regulatory fact in its current state.

### US-03. Reported FDA safety and characterisation concerns

**Jurisdiction:** United States, Food and Drug Administration.
**Statement:** Reporting on the FDA's 2026 advisory committee review indicates FDA cited
insufficient human safety data including unassessed immunogenicity risk across the peptides under
review, and that the substances under consideration are not well characterised.
**Date checked:** 2026-07-21.
**Source:** https://www.fda.gov/media/193343/download
**Verification:** **verified=false.** The FDA briefing document could not be retrieved, returning
HTTP 404 or unreadable binary. Nothing here is attributed to FDA as its own words.
**Handling rule:** do not quote or attribute this to FDA until a human has read the FDA document.

### US-04. Clinical trial registration

**Jurisdiction:** United States, ClinicalTrials.gov.
**Statement:** A direct query of the ClinicalTrials.gov API v2 for the term DSIP returned a total
count of zero. A second query on the intervention "delta sleep-inducing peptide" returned a total
count of one, and that single record was NCT05251207, a study of L-carnitine supplementation and
insulin resistance, which involves no DSIP and is an irrelevant fuzzy text match. The correct
reading is that there are no registered DSIP trials at all, ongoing, completed, or terminated.
**Date checked:** 2026-07-21.
**Sources:**
https://clinicaltrials.gov/api/v2/studies?query.term=DSIP&countTotal=true&pageSize=20
https://clinicaltrials.gov/api/v2/studies?query.intr=delta+sleep-inducing+peptide&countTotal=true&pageSize=20
**Verification:** **verified=true.** Primary registry query, retrieved and read. This is the only
fully verified regulatory or registry statement on this page.

## Anti-doping

### AD-01. World Anti-Doping Agency

**Jurisdiction:** World Anti-Doping Agency, international.
**Statement:** DSIP is not named individually anywhere on the WADA Prohibited List that could be
confirmed in this session. WADA category S0, Non-Approved Substances, covers any pharmacological
substance not addressed by other sections of the List and not approved by any governmental
regulatory health authority for human therapeutic use, including drugs under pre-clinical or
clinical development and discontinued drugs. Because DSIP holds no such approval in any
jurisdiction identified, an S0 classification is the logically expected status.
**Date checked:** 2026-07-21.
**Source:** https://www.wada-ama.org/en/prohibited-list
**Verification:** **verified=false.** The direct fetch of the 2026 Prohibited List PDF returned
empty content, so the S0 definition here comes from search-index retrieval of WADA pages rather
than from a fetched primary document, and DSIP's specific status was not confirmed by WADA directly.
**Handling rule:** this is an inference from a category definition combined with an unapproved
status. It is **not** a retrieved WADA ruling about DSIP and must never be published as one.
**Athletes in tested sport must confirm with their own anti-doping authority.**

## Other jurisdictions

### OJ-01. European Union, United Kingdom, Canada, Australia

**Jurisdiction:** European Union, United Kingdom, Canada, Australia.
**Statement:** No evidence of marketing authorisation for DSIP as a medicine was found in any of
these jurisdictions.
**Date checked:** 2026-07-21.
**Source:** none. No regulator URL was retrieved for any of these jurisdictions.
**Verification:** **verified=false.** This is an absence-of-evidence finding from search rather than
a confirmed retrieval from each regulator's database, and no regulator page for these jurisdictions
was fetched in this session.
[UNVERIFIED - background knowledge, requires human source check]
**Handling rule:** state as not checked. Never as permitted, and never as confirmed absent.

### OJ-02. All other jurisdictions

No regulatory position was retrieved for any jurisdiction beyond those listed above. No national
regulator outside the United States was consulted in this research session, and no trial registry
outside ClinicalTrials.gov was searched.

The absence of an entry here means the question was not investigated. It does not mean the compound
is unregulated, permitted, or approved anywhere.

## Summary of verification state

| ID | Jurisdiction | Verified | What is missing |
|---|---|---|---|
| US-01 | United States, FDA | **false** | FDA primary document, four URLs returned HTTP 404 |
| US-02 | United States, FDA | **false** | FDA calendar page, 503A bulks page, and briefing document all HTTP 404 |
| US-03 | United States, FDA | **false** | FDA briefing document could not be retrieved |
| US-04 | United States, ClinicalTrials.gov | **true** | Nothing. Primary registry query retrieved and read |
| AD-01 | WADA, international | **false** | Prohibited List PDF returned empty content. S0 status is an inference |
| OJ-01 | EU, UK, Canada, Australia | **false** | No regulator database queried at all |

One of six statements on this page is verified. That ratio must be corrected before publication.

## Re-verification checklist for the reviewer

1. Open the FDA advisory committee calendar page and the 503A bulk substances pages directly in a
   browser and confirm US-01 and US-02.
2. Retrieve and read the FDA briefing document for the July 2026 meeting, and confirm or remove
   US-03. Do not attribute anything to FDA that has not been read from an FDA document.
3. Confirm what actually happened at the July 23 to 24, 2026 meeting by reading the record, and
   remember that a committee recommendation is not a final agency determination.
4. Read the current WADA Prohibited List directly and determine whether DSIP or emideltide is named.
   Either upgrade AD-01 to a retrieved finding or keep it explicitly labelled as an inference.
5. Query at least one regulator database outside the United States, so that OJ-01 becomes a finding
   rather than a gap.
6. Confirm the regulatory name emideltide and the free base and acetate forms against a primary
   regulatory source.
7. Update the dated header and the `last_reviewed` field together. A stale date on this page is
   itself a defect.
