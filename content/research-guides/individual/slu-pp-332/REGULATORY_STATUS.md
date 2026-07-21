---
title: SLU-PP-332 Regulatory Status
type: research-guide-regulatory-status
compound: slu-pp-332
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# SLU-PP-332 Regulatory Status

**Status checked on 2026-07-21. This page must be re-verified before publication and re-checked
on any subsequent update.** Regulatory positions change, and one item on this page is a
retrieval failure that has now persisted across two consecutive research sessions.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## Standing principles for this page

1. Approval, authorisation, or registration in one jurisdiction is not approval in another. A
   position recorded here for the United States says nothing about any other country, and no
   inference across borders may be drawn from it.
2. Every statement below carries a jurisdiction, a date checked, and a source URL. A statement
   without all three does not belong on this page.
3. Where a status could not be confirmed by reading the primary document, that is stated
   explicitly rather than filled in by inference.
4. **The absence of a retrieved regulator document is not a regulator position.** It is not
   review, not clearance, not evaluation, and not acceptance. This rule is the most load-bearing
   line on the page, because the honest United States finding for this compound is an absence.

## United States

### US-01. Approval status, Food and Drug Administration

**Jurisdiction:** United States, Food and Drug Administration.
**Statement:** No FDA approval for any indication was located, and no FDA warning letter or
safety communication naming SLU-PP-332 was located, by targeted site-restricted search.
**Date checked:** 2026-07-21.
**Source:** https://www.fda.gov/drugs/human-drug-compounding/bulk-drug-substances-used-compounding-under-section-503a-fdc-act
**Verification:** **NOT VERIFIED.** This is the absence of a retrieved document, not an FDA
statement about the compound. The 503A compounding list page itself was not re-fetched on
2026-07-21; the site-restricted search was re-run and found no FDA document naming the compound.
The most reasonable reading is that FDA appears simply not to have addressed SLU-PP-332.
**Handling rule:** this must never be presented as FDA having reviewed, cleared, evaluated, or
found the compound acceptable. See the prohibition at PR-10 in CLAIM_TABLE.md.
**For the reviewer:** open the 503A pages directly in a browser and confirm the negative, then
record the date of that human check.

### US-02. Clinical trial registration, ClinicalTrials.gov

**Jurisdiction:** United States, ClinicalTrials.gov registry.
**Statement:** A direct query of the ClinicalTrials.gov API v2 for SLU-PP-332 returned **zero
registered studies**. There is no registered clinical development program for this compound:
no ongoing trial, no completed trial, no terminated trial, and no posted results.
**Date checked:** 2026-07-21.
**Source:** https://clinicaltrials.gov/api/v2/studies?query.term=SLU-PP-332&pageSize=20
**Verification:** **VERIFIED.** Primary registry query, retrieved directly.
**Why this line carries weight:** it is a positive retrieved result, not an inference from
silence. Its reliability was checked adversarially in the same session. A fabricated compound
identifier returned zero studies, a fabricated PMID returned HTTP 404, and a positive control
query for semaglutide returned real registry records. Together these establish that the zero
result here is a true negative rather than a broken query path.

## Anti-doping

### AD-01. World Anti-Doping Agency

**Jurisdiction:** World Anti-Doping Agency, international.
**Statement:** **UNRESOLVED.** WADA's own Prohibited List landing page and its 2026 Prohibited
List news page both returned empty content on direct fetch on 2026-07-21, exactly as in the
prior session. No WADA document naming SLU-PP-332 was retrieved. A search snippet encountered
during research indicates that the S4 metabolic modulators class covers AMPK activators,
PPAR-delta agonists and Rev-erb-alpha agonists, but that snippet does not name SLU-PP-332 and
did not come from a retrieved WADA page. **No specific classification may be stated as fact.**
**Date checked:** 2026-07-21.
**Source:** https://www.wada-ama.org/en/prohibited-list
**Verification:** **NOT VERIFIED.** Retrieval failed on two consecutive sessions. This is a
persistent retrieval failure, and it is evidence of neither presence nor absence on the List.
**Handling rule:** the Guide states no anti-doping classification for this compound, by name or
by class. An athlete subject to testing must confirm current status directly with WADA or with
their own national anti-doping organisation. Do not publish any inference as a finding. See the
prohibition at PR-09 in CLAIM_TABLE.md.

### AD-02. What is established regardless of listing status

**Jurisdiction:** Not jurisdictional. This is a statement about the analytical literature.
**Statement:** Validated detection methods and metabolite panels for SLU-PP-332 have been
developed for doping-control purposes in two independent peer-reviewed papers, both working in
vitro. A tested athlete therefore faces real competitive exposure regardless of how the
unresolved listing question is eventually answered.
**Date checked:** 2026-07-21.
**Sources:**
https://pubmed.ncbi.nlm.nih.gov/41688415/
https://pmc.ncbi.nlm.nih.gov/articles/PMC12835572/
**Verification:** **VERIFIED.** Both papers retrieved.
**Handling rule:** this is a statement about detection capability, not about listing status. The
two must never be merged into a single sentence that implies a classification has been
confirmed. Note also that the second of these papers works with human liver preparations in
vitro, and its authors explicitly caution that this may not reflect authentic human metabolism.

## Other jurisdictions

### OJ-01. European Medicines Agency, MHRA, TGA, Health Canada

**Jurisdiction:** European Union, United Kingdom, Australia, Canada.
**Statement:** **Not searched.** No regulatory statement was retrieved for any of these
jurisdictions, and none was attempted in this research session.
**Date checked:** 2026-07-21 (recorded as not searched on that date).
**Source:** none.
**Verification:** **NOT VERIFIED.** No statement about any non-US jurisdiction may be made from
this record.

The absence of an entry here means the question was not investigated. It does not mean the
compound is unregulated, permitted, prohibited, or approved anywhere. Approval or registration
in one jurisdiction is not approval in another, and the reverse also holds: nothing about these
jurisdictions may be inferred from the United States position recorded above.

## Summary of the regulatory record

| Item | Jurisdiction | Position | Verified | Date |
|---|---|---|---|---|
| US-01 | United States, FDA | No approval and no warning letter or safety communication located. Absence of a retrieved document, not an FDA position. | NO | 2026-07-21 |
| US-02 | United States, ClinicalTrials.gov | Zero registered studies. No clinical development program. | YES | 2026-07-21 |
| AD-01 | WADA, international | Unresolved. WADA pages returned empty content on two consecutive sessions. No classification may be stated. | NO | 2026-07-21 |
| AD-02 | Not jurisdictional | Validated detection methods exist. Competitive exposure is real regardless of listing status. | YES | 2026-07-21 |
| OJ-01 | EMA, MHRA, TGA, Health Canada | Not searched. No statement permitted. | NO | 2026-07-21 |

Two of the five rows above are verified. Three are not, and each carries its unverified status
into every member-facing sentence that rests on it.

## Re-verification checklist for the reviewer

1. **Obtain the current WADA Prohibited List document directly**, by browser or by any route that
   works, and determine whether SLU-PP-332 appears by name, is captured by a class definition, or
   is absent. This item has now failed twice and is the highest priority on this page.
2. **Open the FDA 503A bulk drug substances pages directly** and confirm the negative finding at
   US-01, recording the date of the human check.
3. **Re-run the ClinicalTrials.gov query** immediately before publication and confirm the human
   evidence table is still correctly empty.
4. **Search at least one regulator outside the United States**, so that OJ-01 becomes a finding
   rather than a gap.
5. **Confirm that no specific anti-doping classification has entered any file** at any point in
   the editorial chain, in any wording.
6. **Update the dated header and the `last_reviewed` field together.** A stale date on this page
   is itself a defect, and this compound's regulatory record is young enough to move.

Xenios does not sell SLU-PP-332, does not supply it, and does not provide guidance on obtaining
it. This page is educational and is not legal advice. "Not approved" is a different question from
"illegal to possess", and the second is a question of local law.
