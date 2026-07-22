---
title: "Semax + Selank + DSIP: Regulatory Status"
type: research-guide-regulatory-status
compound: semax-selank-dsip
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# Semax + Selank + DSIP Regulatory Status

**Status checked on 2026-07-21. This page must be re-verified before publication and re-checked
on any subsequent update.** Regulatory positions change, and one item on this page concerns a
meeting that had not yet taken place at the time of checking.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## Standing principles for this page

1. **Approval, authorisation, or registration in one jurisdiction is not approval in another.**
   A position recorded here for the Russian Federation says nothing whatsoever about the United
   States, and the reverse also holds. No inference may be drawn across borders, and no two
   jurisdictions may be presented close enough together that a reader takes one for the other.
2. **Registration of a single agent is not registration of a blend.** Nothing recorded here
   about Semax alone, or Selank alone, or DSIP alone, is a regulatory statement about the
   three-component product. No regulator anywhere has evaluated the combination.
3. Every statement below carries a jurisdiction, a date checked, and a source. A statement
   without all three does not belong on this page.
4. Where a status could not be confirmed by reading the primary document, that is stated
   explicitly rather than filled in by inference.
5. An advisory committee recommendation is advisory. It is not a final agency determination.

## Integrity note, read before using this page

Across all three component research sessions, **exactly one primary regulatory document was
successfully retrieved**: the Federal Register full text for document 2026-07361. Every other
regulatory retrieval failed.

- Every direct fetch of www.fda.gov returned HTTP 404, including the 503A bulk substances pages,
  the July 2026 advisory committee pages, the briefing document, and Drugs@FDA.
- The EMA medicines search endpoint returned HTTP 401.
- The WADA Prohibited List returned empty content on every attempt, in all three searches.
- The Russian State Register of Medicines was never successfully queried, and a mirror record
  rendered no content.
- The FDA substance registry records for Selank existed but rendered no usable data.

A human reviewer must open each of these directly and confirm every statement before
publication. Statements below are labelled with their verification status individually.

## The combination

### CMB-01. No regulator has evaluated this product

**Jurisdiction:** All jurisdictions checked.
**Statement:** No regulator anywhere was identified as having approved, authorised, registered,
or evaluated the combination of Semax, Selank, and DSIP as a product. There is no regulatory
record of the mixture in any jurisdiction.
**Date checked:** 2026-07-21.
**Source:** Absence across all three research records.
**Verification:** Absence-of-evidence finding. No regulator database was queried for the blend
specifically, because no blend name or product identifier was available to query.
**Handling rule:** No regulatory fact about any single component may be presented as a
regulatory fact about this product. See CLAIM_TABLE.md X-05.

## United States

### US-01. Semax approval status

**Jurisdiction:** United States, Food and Drug Administration.
**Statement:** Semax is not an FDA-approved drug for any indication.
**Date checked:** 2026-07-21.
**Source:** https://www.federalregister.gov/documents/full_text/text/2026/04/16/2026-07361.txt
**Verification:** Supported by the retrieved Federal Register notice, in that FDA's own process
treats Semax as an unapproved bulk substance nominated for compounding eligibility, which is
only coherent if it is unapproved. A direct query of the Drugs@FDA approved-products database
returned HTTP 404, so that is a failed retrieval rather than a confirmed empty result.

### US-02. Semax 503A nomination, the only verified primary regulatory fact in this packet

**Jurisdiction:** United States, Food and Drug Administration.
**Statement:** As of a Federal Register notice published 2026-04-16 (Docket FDA-2025-N-6895),
"Semax (free base)" and "Semax acetate" appear on the list of bulk drug substances **nominated**
for possible inclusion on the section 503A Bulk Drug Substances List, with the nominated uses
listed as cerebral ischemia, migraine, and trigeminal neuralgia. A Pharmacy Compounding Advisory
Committee meeting to discuss these nominations was scheduled for 23 to 24 July 2026.
**Date checked:** 2026-07-21.
**Source:** https://www.federalregister.gov/documents/full_text/text/2026/04/16/2026-07361.txt
**Verification:** **VERIFIED.** Primary regulatory document, full text retrieved and read. This
is the only such document in the packet.
**Critical framing, which must travel with this statement everywhere it appears:** a nomination
for the 503A bulks list is not an approval, not an efficacy finding, and not an endorsement.
The 503A bulks list governs which substances a pharmacist or physician may use in compounding.
It is a compounding-eligibility mechanism, not a drug approval pathway. The nomination was made
by an outside party. As of 2026-07-21 the committee had not met and no outcome exists.

### US-03. Selank approval status

**Jurisdiction:** United States, Food and Drug Administration.
**Statement:** Selank has no FDA approval for any human indication.
**Date checked:** 2026-07-21.
**Source:** https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/tailor-made-compounding-llc-594743-04012020
**Verification:** **UNVERIFIED.** Every direct fetch to www.fda.gov returned HTTP 404. The
underlying research located, via domain-restricted search summaries only, two FDA warning
letters to compounding operations (Tailor Made Compounding LLC, 2020, and Advanced Nutriceuticals
LLC dba The Guyer Institute, 2021) whose summaries indicate Selank was among substances used in
compounded products. The verbatim FDA text was never read. A human must open both letters
before anything from them is published.

### US-04. Selank 503A status is UNRESOLVED

**Jurisdiction:** United States, Food and Drug Administration.
**Statement:** **No statement is made about whether Selank was nominated to the 503A bulk drug
substances list, in either direction.**
**Date checked:** 2026-07-21.
**Sources:** https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/tailor-made-compounding-llc-594743-04012020 and https://www.federalregister.gov/documents/full_text/text/2026/04/16/2026-07361.txt
**Verification:** **UNRESOLVED CONFLICT.** A search summary in the Selank research states that
Selank and Semax were *not* nominated. The retrieved Federal Register full text records that
Semax free base and Semax acetate *were* nominated. For Semax the primary document wins
outright and the search summary is very likely stale. For Selank the question is genuinely open,
because the retrieved notice is quoted in the research record only for its Semax entries.
**Handling rule:** assert nothing about Selank's 503A status. A human must read the Federal
Register notice in full and check the substance list. See CONTRADICTIONS.md C-03.

### US-05. DSIP (emideltide) approval status

**Jurisdiction:** United States, Food and Drug Administration.
**Statement:** DSIP, referred to in regulatory contexts as emideltide, has no FDA approval for
any indication. Emideltide, in free base and acetate forms, was scheduled for discussion at the
Pharmacy Compounding Advisory Committee meeting of 23 to 24 July 2026 regarding possible
inclusion on the 503A bulks list.
**Date checked:** 2026-07-21.
**Source:** https://www.fda.gov/advisory-committees/advisory-committee-calendar/july-23-24-2026-meeting-pharmacy-compounding-advisory-committee-07232026
**Verification:** **UNVERIFIED.** Repeated fetches against the FDA advisory committee calendar
page, the FDA 503A bulk substances page, and the FDA briefing document media URL all returned
HTTP 404. This statement rests on search-index snippets and secondary trade reporting.
**Additional reported detail, NOT publishable as it stands:** secondary reporting indicates FDA
proposed that emideltide **not** be added to the 503A list, citing that available studies were
small, uncontrolled, or contradictory. Because the FDA primary documents could not be read, that
proposal is **not stated as a fact anywhere in this folder** and must be confirmed by a human
against the FDA source before it appears in member-facing content.

### US-06. The advisory committee meeting is PENDING, with no outcome

**Jurisdiction:** United States, Food and Drug Administration.
**Statement:** As of 2026-07-21, the Pharmacy Compounding Advisory Committee meeting concerning
these nominations was scheduled for 23 to 24 July 2026 and had not occurred. **No outcome is
stated here, for any component.**
**Date checked:** 2026-07-21.
**Source:** https://www.federalregister.gov/documents/full_text/text/2026/04/16/2026-07361.txt
**Verification:** VERIFIED as to the scheduled dates, from the retrieved Federal Register text.
**Handling rule:** describe the review as pending. State no result. When the record becomes
available, read it directly rather than a summary of it, and remember that a committee
recommendation is advisory rather than a final agency determination. Re-check immediately
before publication, and re-date this page.

### US-07. Scheduling

**Jurisdiction:** United States, controlled substance scheduling.
**Statement:** A tertiary source records the United States status of Semax as not FDA approved
and unscheduled. No scheduling status was retrieved for Selank or DSIP.
**Date checked:** 2026-07-21.
**Source:** https://en.wikipedia.org/wiki/Semax
**Verification:** **UNVERIFIED.** Not independently confirmed against any DEA source in any of
the three research sessions. Treat as background only, and do not publish a scheduling status
for any component without a primary check.

### US-08. Clinical trial registration

**Jurisdiction:** United States, ClinicalTrials.gov.
**Statement:** Direct queries of the registry API returned zero registered studies for Semax,
zero genuine studies for Selank (two queries returned only unrelated fuzzy text matches), and
zero for DSIP (a query on the full name returned one irrelevant L-carnitine study, NCT05251207).
There is no registered trial of any of the three components, and none of the combination.
**Date checked:** 2026-07-21.
**Sources:**
https://clinicaltrials.gov/api/v2/studies?query.term=Semax&pageSize=50
https://clinicaltrials.gov/api/v2/studies?query.intr=selank&format=json&countTotal=true
https://clinicaltrials.gov/api/v2/studies?query.term=DSIP&countTotal=true&pageSize=20
**Verification:** VERIFIED. Primary registry queries with recorded negative results.
**Why this matters:** without prospective registration there is no protection against selective
outcome reporting or post hoc endpoint selection, which matters acutely for the Semax
connectivity findings that the authors themselves describe as post hoc.

## Russian Federation

**Read this section together with the standing principles above.** Nothing in it has any legal
or scientific standing in the United States or anywhere else, and nothing in it is a regulatory
statement about this three-component product.

### RU-01. Registrations reported CANCELLED in January 2026

**Jurisdiction:** Russian Federation, Ministry of Health.
**Statement:** Two independent Russian pharmaceutical trade outlets report that on 20 to 21
January 2026 the Russian Ministry of Health cancelled the marketing registration of 71 medicinal
products and excluded 14 pharmaceutical substances from the State Register of Medicines. The
nootropic products Semax and Selank from the Russian company Peptogen are named among the
cancelled registrations, and selank is named among the substances excluded from the register.
The reported reason is **not** a safety withdrawal: all entries were removed at the request of
the registration certificate holders and authorized legal entities.
**Date checked:** 2026-07-21.
**Sources:**
https://vademec.ru/news/2026/01/21/minzdrav-otmenil-registratsiyu-71-preparata-i-isklyuchil-iz-grls-14-substantsiy/
https://www.vshouz.ru/news/minzdrav/wcs-20789/
**Verification:** VERIFIED as trade press, from two independent outlets carrying the same named
detail. **Not confirmed at the state register itself**, which could not be retrieved.
**Handling rule:** **the Guide must not describe Semax or Selank as currently approved or
registered medicines in Russia.** The vendor claim that they are appears to be out of date. Do
not speculate about the reason beyond what is reported.

### RU-02. Prior registration particulars are NOT established

**Jurisdiction:** Russian Federation, State Register of Medicines.
**Statement:** The prior existence of a Russian registration for both compounds is strongly
implied by the January 2026 cancellation, since a registration must exist to be cancelled. The
particulars are not established. No registration certificate number, no original registration
date, and no regulator-written indication list was retrieved for either compound. For Semax, a
tertiary source records a place on the Russian List of Vital and Essential Drugs approved
2011-12-07, and a search summary named Peptogen INPC ZAO as the certificate holder. For Selank,
the widely repeated claim of a 2009 approval under a brand name appeared only in vendor and
blog sources, and the manufacturer's own product page lists indications but publishes no
certificate number and no registration date.
**Date checked:** 2026-07-21.
**Sources:** https://en.wikipedia.org/wiki/Semax and https://peptogen.ru/products/
**Verification:** **UNVERIFIED.** The Russian State Register was never successfully queried.
**Handling rule:** describe the prior registration as reported, not as documented, and publish
no certificate number, date, or indication list from a non-regulator source.

### RU-03. What Russian registration would and would not mean

**Jurisdiction:** Cross-jurisdictional principle.
**Statement:** Registration in the Russian Federation, whether current or historical, confers no
legal or scientific standing in any other jurisdiction. It is not approval, clearance,
validation, or evidence anywhere else. Separately, registration of two single agents is not
registration of a three-component blend, and no regulator has registered or evaluated this
combination anywhere.
**Date checked:** 2026-07-21.
**Verification:** A statement about how regulatory systems work rather than a claim about a
compound.
**Handling rule:** this principle must be visible wherever the Russian history is mentioned, and
the Russian and United States positions must never sit close enough together to be read as one
picture. See CLAIM_TABLE.md X-03 and X-05.

## European Union and United Kingdom

### EU-01. No marketing authorisation found, but this is a weak negative

**Jurisdiction:** European Union (EMA), and the United Kingdom (MHRA).
**Statement:** No EMA marketing authorisation was found for Semax, Selank, or DSIP. No evidence
of marketing authorisation for DSIP was found in the United Kingdom either.
**Date checked:** 2026-07-21.
**Source:** https://en.wikipedia.org/wiki/Semax
**Verification:** **UNVERIFIED, and a weak negative.** The EMA search endpoint returned HTTP 401
and could not be read. For Semax the absence rests on a tertiary statement that it has not been
evaluated, approved, or marketed in most other countries. For Selank and DSIP the absence is a
search-level finding rather than a confirmed database retrieval. The UK MHRA was never queried
for any component. All EU and UK status claims surfaced by search came from peptide-vendor
pages and are recorded only as market claims, never as regulatory evidence.
**Handling rule:** state as not confirmed. Absence here means not checked, not permitted.

## Other jurisdictions

No regulatory statement was retrieved for Canada, Australia, Japan, or any other jurisdiction
for any of the three components. For DSIP the underlying research explicitly flags the
non-approval statement covering the European Union, United Kingdom, Canada, and Australia as
background knowledge rather than a confirmed retrieval, and no regulator page for those
jurisdictions was fetched.

**The absence of an entry here means the question was not investigated.** It does not mean any
component is unregulated, permitted, or approved anywhere.

## Anti-doping

### AD-01. World Anti-Doping Agency

**Jurisdiction:** World Anti-Doping Agency, international.
**Statement:** **The anti-doping status of Semax, of Selank, and of DSIP could not be confirmed,
and no status is stated for any of them.** The WADA Prohibited List could not be retrieved in
any of the three component research sessions: the page returned empty content and the 2026 list
PDF returned empty content on separate attempts. None of the three was confirmed to appear by
name on any WADA list.
**Date checked:** 2026-07-21.
**Source:** https://www.wada-ama.org/en/prohibited-list
**Verification:** **UNVERIFIED.** No WADA primary text was read.
**Handling rule:** publish no anti-doping classification for any component. Every classification
circulating on peptide vendor and supplement blogs is a vendor inference reasoning from approval
status, not a WADA statement, and for Semax and Selank the premise of that inference (current
Russian approval) now appears to be false in any case. Note additionally that the non-approved
substances category by its nature does not list substances by name, so absence of a compound's
name from the list would not settle the question either. **Any athlete subject to testing must
be directed to their own anti-doping authority.**

## Re-verification checklist for the reviewer

1. Read Federal Register document 2026-07361 in full and confirm the verbatim substance list,
   specifically checking for Selank and for emideltide alongside the confirmed Semax entries.
2. Open the FDA 503A bulk substances pages, the July 2026 committee pages, and the briefing
   document directly, and confirm US-01, US-03, US-05, and US-06.
3. Open the two FDA warning letters directly before anything from them is published.
4. Confirm the outcome of the 23 to 24 July 2026 meeting by reading the record, remembering that
   a committee recommendation is not a final agency determination. If it has occurred, update
   this page from a primary FDA record. If it has not, continue to state that it is pending.
5. Query grls.minzdrav.gov.ru directly for both Semax and Selank. Confirm the January 2026
   cancellation, and obtain the certificate numbers, original registration dates, effective
   cancellation date, and regulator-written indications.
6. Query the EMA medicines database and the UK MHRA directly for all three components.
7. Read the current WADA Prohibited List directly for all three components.
8. Search at least one regulator outside the United States and Russia, so that the other
   jurisdictions section becomes a finding rather than a gap.
9. Confirm no regulatory record exists for the combination, and record the queries used.
10. Update the dated header and the `last_reviewed` field together. A stale date on this page is
    itself a defect, and the pending advisory committee meeting makes this page specifically
    time-sensitive.
