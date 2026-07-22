---
title: Content Validation Report
type: validation-evidence
status: draft
owner: Samuel Boadu
last_reviewed: 2026-07-20
base_sha: 87150f488c68576c6fec5f49a4957f3d122eca01
---

# Content Validation Report

Machine scans plus human adjudication of every scan hit. Run against the four content
trees on branch `claude/research-product-guide-content-now`.

## 1. Inventory

| Tree | Present | Target | Status |
|---|---|---|---|
| `docs/research-content/` | 8 | 7 + this report | complete |
| `content/research-products/` (records) | 15 + README | 15 | complete |
| `content/research-products/supplement-candidates/` | 5 | up to 50 records | complete |
| `content/research-goals/` | 11 + 2 companions + README | 11 | complete |
| `content/research-guides/member-faq/` | 13 | 13 | complete |
| `content/research-guides/individual/` | 114 files, 14 of 20 folders | 20 x 9 = 180 | **partial** |
| `content/research-guides/blends/` | 0 | 6 x 9 = 54 | **not started** |

Total markdown in scope: 170 files, approximately 3.07 MB.

### Guide packet detail

Complete, all nine files present (11):
bpc-157, cjc-1295, ghk-cu, gonadorelin, ipamorelin, kpv, ll-37, pt-141, tb-500,
tesamorelin, thymosin-alpha-1.

Incomplete, do not treat as ready (3):
mots-c (4 of 9), nad-plus (7 of 9), slu-pp-332 (4 of 9).

Not started (6):
dihexa, dsip, epithalon, selank, semax, ss-31.

Blend packets not started (6):
bpc-157-tb-500, bpc-157-tb-500-ghk-cu, klow, thymosin-alpha-1-kpv-ll-37,
cjc-1295-ipamorelin, semax-selank-dsip.

These stopped on a platform session limit, not on a content decision. Web-verified
research records for 13 compounds were salvaged from the interrupted run and are
available so the remainder can be drafted without repeating the research.

## 2. Content rule scans

| Scan | Raw hits | Real violations | Verdict |
|---|---|---|---|
| Dosing (amount + unit) | 1 | 0 | PASS |
| Route / administration language | 58 | 0 | PASS |
| Guaranteed outcomes | 110 | 0 | PASS |
| Blanket safety claims | 87 | 0 | PASS |
| Authorization overreach | 27 | 0 | PASS |
| Acquisition guidance | 7 | 0 | PASS |
| Em dashes | 0 | 0 | PASS |
| Orphan citations | 0 | 0 | PASS |
| Files with citations lacking verification vocabulary | 0 | 0 | PASS |

### Why the raw hit counts are high and the violation counts are zero

A naive regex cannot distinguish an assertion from a prohibition. This content
deliberately quotes forbidden phrasing in order to forbid it, so the prohibited-claims
tables and editorial checklists are dense with exactly the strings a scanner looks for.

Every hit was read in context. Representative adjudications:

- `"Any guarantee of faster recovery, a return-to-training timeline, or a healing window"`
  is a row in a prohibited-claims list, not a claim.
- `"Nothing in this record states or implies that xenios is authorized to resell"`
  is an explicit denial of authorization.
- `"Xenios does not state that any of these categories is safe for you specifically"`
  is a refusal to make a safety claim.
- `"This must never be compressed into well tolerated or safe"`
  is a reviewer instruction guarding against a future violation.

Two hits required genuine adjudication rather than pattern matching:

1. **`individual/tesamorelin/GUIDE_DRAFT.md` line 174**, containing `50 mg/dL`.
   Not dosing. `mg/dL` is a laboratory concentration unit reporting a triglyceride
   outcome from the pivotal trial. A dose would be expressed as an amount of the drug
   administered. The surrounding text states population (412 HIV-infected adults on
   antiretroviral therapy) and limitations in the same block. Retained as correct.

2. **`individual/ll-37/GUIDE_DRAFT.md` line 687**, containing the phrase
   `"is safe and effective"`. This is the verbatim title of a real 2014 paper
   (PMID 25041740), reproduced in a reference list. The draft annotates it in place:
   the title states the authors' conclusion, which was not confirmed by reference 1,
   the larger 2021 trial whose primary endpoint was missed. `SOURCE_REGISTRY.md`
   carries the same source as S2, marked VERIFIED, noted as superseded by S1 on the
   primary endpoint. Retained as correct, and as the intended handling pattern for a
   favorable-sounding title that later evidence did not support.

## 3. Citation integrity

The strongest constraint in this build was that a fabricated citation in health content
is worse than a missing one, because a human reviewer may trust it.

- Every research agent was restricted to sources it actually retrieved in-session.
- Guessing or reconstructing a PMID, NCT number, DOI, author, year, journal, or URL
  was prohibited outright.
- Unverifiable material was routed to gaps registers rather than into drafts as fact.
- Lines resting on general background knowledge are labelled
  `[UNVERIFIED - background knowledge, requires human source check]`.

**Automated cross-check:** every NCT number and PMID appearing in a `GUIDE_DRAFT.md`
was checked against that packet's `SOURCE_REGISTRY.md`. Orphan citations: **0**.

This is a structural check, not proof of correctness. It proves nothing was cited that
the packet does not also register. It does **not** prove the underlying source says what
the draft claims. Independent human verification of every citation remains a required
gate before publication.

## 4. Honest evidence outcomes preserved

Agents were told an empty evidence table is a success, not a failure. That held:

- **KPV** returned zero human studies. Its Guide leads with the statement that this is
  not thin or mixed data but absent data, documents the zero-result ClinicalTrials.gov
  and PubMed queries with dates, and grades 27 claims D (preclinical) and 6 G
  (unverified). It declines to report an FDA reclassification outcome asserted by
  vendor sites because it could not be verified.
- Preclinical findings carry their species or model in the same sentence throughout.
- Safety sections state that nothing is known rather than that a compound is safe.

## 5. What this report does not establish

- No citation has been independently verified by a human.
- No regulatory statement has been re-verified by counsel.
- No claim grade has been confirmed by a scientific reviewer.
- No supplier fact has been confirmed. Composition, ratio, concentration, shelf life,
  storage, COA, purity, sterility, price, and inventory remain NOT CONFIRMED throughout.
- Nothing here is approved for publication. Every file sits at workflow state `draft`.
