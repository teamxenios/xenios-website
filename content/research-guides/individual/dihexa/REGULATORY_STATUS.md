---
title: Dihexa Regulatory Status
type: research-guide-regulatory-status
compound: dihexa
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# Dihexa Regulatory Status

**Status checked on 2026-07-21. This page must be re-verified before publication and re-checked on
any subsequent update.** Regulatory positions change, and two of the three checks on this page failed
to retrieve their source.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## Standing principles for this page

1. Approval, authorisation, or registration in one jurisdiction is not approval in another. A position
   recorded here for one jurisdiction says nothing about any other, and no inference across borders
   should be drawn from it.
2. Every statement below carries a jurisdiction, a date checked, and a source URL. A statement without
   all three does not belong on this page.
3. Where a status could not be confirmed by reading the primary document, that is stated explicitly
   rather than filled in by inference.
4. **A failed retrieval is a gap, never a finding.** It is also never a licence to repeat what
   secondary pages say the unreachable document contains.

## Integrity note, read before using this page

This is the weakest part of the dihexa record and the reader deserves to know it up front.

Only one of the three checks below was successfully retrieved: the ClinicalTrials.gov registry query.
The FDA check returned HTTP 404 on both attempts. The WADA check returned empty content from the
official page and HTTP 403 and unparseable binary from two mirror PDFs.

Both failures matter because confidently worded secondary pages exist for exactly these two questions.
Search engines and content aggregators return pages asserting dihexa's FDA category status and its
WADA status, hosted on peptide-vendor and search-optimised content domains. Those pages are not
sourced to the regulator and are treated as unreliable throughout this folder.

**Consequently this folder states no FDA position and no anti-doping status for dihexa.** A human
reviewer must open the relevant regulator pages in a browser and confirm each item before publication.

## Global registry

### REG-01. Clinical trial registration

**Jurisdiction:** United States and global, ClinicalTrials.gov registry.
**Statement:** A ClinicalTrials.gov API v2 query for the term "Dihexa" returned totalCount 0. No
registered interventional or observational study of dihexa exists in the registry. **This is a
registry-absence finding, not an approval statement.**
**Date checked:** 2026-07-21.
**Source:** https://clinicaltrials.gov/api/v2/studies?query.term=Dihexa&countTotal=true&pageSize=10&fields=NCTId,BriefTitle,OverallStatus
**Verification:** VERIFIED. Primary registry query, retrieved and read.
**Validation of the null:** the retrieval path was tested adversarially in the same session. A
deliberately fake identifier, NCT99999999, returned HTTP 404
(https://clinicaltrials.gov/api/v2/studies/NCT99999999), and a positive control query on semaglutide
returned totalCount 744 with real identifiers
(https://clinicaltrials.gov/api/v2/studies?query.term=semaglutide&fields=NCTId,BriefTitle&pageSize=3&countTotal=true).
The zero therefore reflects genuine absence rather than a broken query.
**Handling rule:** state the zero as a registry finding. Do not convert it into an approval or a
legality statement in any jurisdiction.

### REG-02. The registered trials belong to a different compound

**Jurisdiction:** United States and global, ClinicalTrials.gov registry.
**Statement:** A query for "fosgonimeton" returned five registered studies: NCT04488419 (Phase 2/3,
completed), NCT04491006 (Phase 2, completed), NCT04886063 (Phase 2/3, terminated), NCT04831281 (Phase
2, Parkinson's disease dementia and Lewy body dementia, terminated), and NCT05511558 (Phase 1 ADME,
completed). Fosgonimeton, also known as ATH-1017 and formerly NDX-1017, is a distinct clinical
candidate developed by Athira Pharma, formerly M3 Biotechnology, which had commercialised dihexa.
ALZFORUM describes it only as one that may be related to dihexa and does not assert chemical identity.
Per ALZFORUM, the ACT-AD Phase 2 trial failed its primary endpoint and the LIFT-AD Phase 2/3 trial
failed both its primary and key secondary endpoints.
**Date checked:** 2026-07-21.
**Sources:**
https://clinicaltrials.gov/api/v2/studies?query.term=fosgonimeton&countTotal=true&pageSize=10&fields=NCTId,BriefTitle,OverallStatus,Phase
https://www.alzforum.org/therapeutics/fosgonimeton
**Verification:** VERIFIED. Registry query and curated database entry, both retrieved and read.
**Why this is on a regulatory page:** a member checking dihexa's regulatory standing will encounter
these registrations and may reasonably conclude that dihexa has a clinical programme. It does not.
This entry exists so that the distinction is recorded in the same place the question is asked.
**Handling rule:** never transfer a fosgonimeton registration, phase, status, or outcome to dihexa.

## United States

### US-01. FDA position

**Jurisdiction:** United States, Food and Drug Administration.
**Statement:** **NOT VERIFIED THIS SESSION.** Secondary and vendor-adjacent web pages claim dihexa was
placed on, and later affected by changes to, the FDA 503A bulk drug substances Category 2 list. Two
attempts to retrieve the relevant FDA.gov compounding page returned HTTP 404 to the fetch tool, so no
FDA-sourced statement about dihexa could be confirmed.
**Date checked:** 2026-07-21.
**Source (not successfully retrieved):** https://www.fda.gov/drugs/human-drug-compounding/bulk-drug-substances-used-compounding-under-section-503a-fdc-act
**Verification:** UNVERIFIED. Two fetch attempts, both HTTP 404.
**Handling rule:** **do not publish any FDA claim about dihexa until a human retrieves the FDA source
directly.** This includes any statement about a bulk drug substances category placement, in either
direction. The absence of a retrievable FDA page is not evidence that no FDA position exists, and it is
not evidence that one does.

### US-02. Approval status

**Jurisdiction:** United States, Food and Drug Administration.
**Statement:** Dihexa is an investigational research compound. No marketing approval in any
jurisdiction was identified during this research. Note the precise scope of that sentence: it records
what was identified, not a verified global negative, because US-01 could not be retrieved.
**Date checked:** 2026-07-21.
**Sources:** https://clinicaltrials.gov/api/v2/studies?query.term=Dihexa&countTotal=true&pageSize=10&fields=NCTId,BriefTitle,OverallStatus
and the failed retrieval at US-01.
**Verification:** PARTIAL. Supported by the registry absence and by the absence of any approval in any
retrieved source, but not confirmed against a regulator page.
**Handling rule:** phrase as "no marketing approval was identified", never as "unapproved everywhere".

## Anti-doping

### AD-01. World Anti-Doping Agency

**Jurisdiction:** World Anti-Doping Agency, international.
**Statement:** **NOT VERIFIED THIS SESSION.** Dihexa is not known to be named explicitly on the WADA
Prohibited List. Aggregator pages assert that it falls under the S0 non-approved-substances catch-all
because it lacks regulatory approval for human therapeutic use. Attempts to retrieve the official WADA
list failed: the wada-ama.org page returned empty content, and two mirror PDFs returned HTTP 403 and
unparseable binary. The S0 characterisation is therefore **UNCONFIRMED** and must be checked by a
human against the current WADA Prohibited List before publication.
**Date checked:** 2026-07-21.
**Source (not successfully retrieved):** https://www.wada-ama.org/en/prohibited-list
**Verification:** UNVERIFIED. Official page empty, mirror PDFs HTTP 403 and unparseable.
**Handling rule:** the Guide and the FAQ state **no** anti-doping status for dihexa. The S0 inference
is not published as a finding. Athletes subject to testing are directed to their own anti-doping
authority, which is the correct destination regardless of what the List turns out to say.

## Other jurisdictions

No regulatory statement was retrieved for the European Union, the United Kingdom, Canada, Australia,
Japan, or any other jurisdiction. No national regulator outside the United States was consulted during
this research, and no trial registry outside ClinicalTrials.gov was searched.

The absence of an entry here means the question was not investigated. It does not mean the compound is
unregulated, permitted, or approved anywhere. Approval or registration in one jurisdiction is not
approval in another, and the reverse also holds.

## Summary of verification state

| Item | Jurisdiction | Date checked | State |
|---|---|---|---|
| REG-01 Trial registration, zero studies | ClinicalTrials.gov | 2026-07-21 | VERIFIED |
| REG-02 Fosgonimeton registrations are a different compound | ClinicalTrials.gov and ALZFORUM | 2026-07-21 | VERIFIED |
| US-01 FDA position | United States | 2026-07-21 | **UNVERIFIED, HTTP 404 on two attempts** |
| US-02 Approval status | United States and general | 2026-07-21 | PARTIAL, inferred from absence |
| AD-01 Anti-doping status | WADA, international | 2026-07-21 | **UNVERIFIED, source unretrievable** |
| Other jurisdictions | EU, UK, Canada, Australia, Japan, others | 2026-07-21 | NOT CHECKED |

## Re-verification checklist for the reviewer

1. Open the FDA 503A and 503B bulk drug substances pages directly in a browser and establish whether
   any FDA position on dihexa exists. Until this is done, US-01 stays unverified and no FDA claim is
   published.
2. Read the current WADA Prohibited List directly and determine whether dihexa is named, and whether
   the S0 characterisation is correct. Until this is done, AD-01 stays unverified and no anti-doping
   status is published.
3. Re-run the ClinicalTrials.gov query for dihexa **together with both adversarial controls**, and
   record the date. A bare zero without controls is not sufficient verification of a null result.
4. Re-check the fosgonimeton registrations and the ALZFORUM outcomes, since the fosgonimeton
   distinction is the most load-bearing corrective in the whole folder.
5. Search at least one regulator outside the United States, so that the "other jurisdictions" section
   becomes a finding rather than a gap.
6. Update the dated header and the `last_reviewed` field together. A stale date on this page is itself
   a defect.
</content>
