---
title: LL-37 Source Plan
type: research-guide-source-plan
compound: ll-37
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# LL-37 Source Plan

Compound: LL-37 (human cathelicidin antimicrobial peptide). Also encountered as cathelicidin,
cathelicidin LL-37, hCAP-18/LL-37, CAMP gene product, CAP-18.

Search session date: 2026-07-19. This plan records what was searched, what was accepted, what was
rejected, and what a human reviewer still needs to search before this Guide can be published.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

## 1. The single interpretive problem that shaped the entire search

For most compounds the search problem is scarcity. For LL-37 the search problem is contamination of
the result set. LL-37 is produced naturally in the human body, so the large majority of literature
indexed under the term measures a person's own endogenous LL-37 as a biomarker rather than studying
LL-37 given as an intervention.

Three distinct things share the same search term and had to be separated at the screening stage:

1. Studies that measure endogenous LL-37 in saliva, gingival crevicular fluid, serum, or skin as an
   outcome or biomarker. These are not studies of administering LL-37.
2. Vitamin D trials (cholecalciferol, calcitriol) that use LL-37 as a readout to test whether
   supplementation raises the body's own production. Raising endogenous LL-37 is a different
   intervention from administering LL-37.
3. Engineered analogs and modified derivatives (D-amino acid substitution, cyclization, truncated
   fragments), which exist in the literature precisely because native LL-37 is unstable. Findings on
   analogs do not transfer to native LL-37.

Any search strategy that does not enforce this separation will produce a Guide that overstates the
human evidence base by roughly an order of magnitude. This separation is the primary methodological
decision of this source plan.

## 2. Databases and registries consulted

| Source system | What it was used for | Outcome |
| --- | --- | --- |
| PubMed | Locating peer-reviewed human interventional trials of LL-37 | Three human RCT records retrieved (two full records, one abstract only) |
| PubMed Central (PMC) | Full-text retrieval of trial reports and reviews | Phase IIb trial full record, two reviews retrieved |
| ClinicalTrials.gov API v2 | Systematic sweep to establish the true size of the interventional evidence base | 50 records returned for the term LL-37; only two administer LL-37 as an intervention |
| ClinicalTrials.gov individual record | Posted results for the melanoma trial | Enrollment, disposition, and summary safety retrieved; efficacy tables not read |
| fda.gov (targeted site search) | US approval status and compounding status | No approval record found; the pages needed for compounding status returned HTTP 404 |
| Federal Register | Advisory committee meeting notice | Retrieval failed, 302 redirect to a block page |
| wada-ama.org | Prohibited List status | Not retrievable this session. No WADA status established |
| medRxiv | An oral LL-37 COVID-19 study surfaced in listings | PDF returned HTTP 403, not retrieved, deliberately excluded |

## 3. Queries and query strategy

Queries were run in three passes.

Pass one, evidence-base sizing. A ClinicalTrials.gov API v2 term query for LL-37 returning 50 study
records with fields for NCT id, title, status, phase, condition, intervention name, enrollment,
sponsor, results availability, and dates. This pass existed to answer one question before any claim
was drafted: how many human studies actually give LL-37 to a person. The answer was two.

Pass two, primary literature retrieval. PubMed and PMC searches for LL-37 combined with trial terms
(randomized, placebo-controlled, clinical trial) and with the retrieved indications (venous leg
ulcer, diabetic foot ulcer, melanoma). Each hit was then retrieved directly rather than accepted
from a search snippet.

Pass three, mechanism, safety, and regulatory. PMC searches for cathelicidin reviews covering
stability, cytotoxicity, and autoimmunity. Targeted site searches on fda.gov, a Federal Register
document fetch, and an attempt at the WADA Prohibited List.

## 4. Inclusion criteria

A source was included as evidence only if all of the following held.

- It was actually retrieved this session, not inferred from a search listing or from background
  knowledge.
- It is a peer-reviewed publication, a trial registry record, or a primary regulator page.
- For human evidence, LL-37 itself was administered as an intervention. Studies measuring endogenous
  LL-37 as a biomarker were excluded from the human evidence table by design.
- For preclinical evidence, the species or model system is identifiable and is stated alongside the
  finding.
- The identifier (PMID, PMCID, DOI, or NCT number) came from the retrieved record itself.

## 5. Exclusion criteria

- Vendor, retailer, compounding pharmacy, affiliate, and testing-service marketing pages. These are
  disqualified as evidence outright. They were read only to identify claims circulating in the
  market that the Guide needs to correct, and they are never cited as support.
- Studies measuring a person's own endogenous LL-37 as an outcome. Relevant to biology, not evidence
  that administering LL-37 does anything.
- Vitamin D and probiotic trials using LL-37 as a readout, for the same reason.
- Findings on engineered LL-37 analogs, unless explicitly labeled as being about a modified peptide
  and not about native LL-37.
- Preprints and single-arm uncontrolled studies as support for any efficacy claim. An oral LL-37
  COVID-19 preprint was surfaced and excluded on this basis, and separately could not be retrieved.
- Any source surfaced only by title in a search listing. One preclinical article of potentially
  significant counter-directional importance falls into this category and is logged as a gap rather
  than used.

## 6. Source types that are disqualified as evidence

The following cannot support any claim in this Guide, at any grade above G, regardless of how
confident or specific their wording appears.

- Peptide vendor and retailer product pages.
- Affiliate review sites and peptide comparison or ranking sites.
- Third-party testing services marketing their own testing.
- Vendor-adjacent "evidence" or "research" sites that reproduce trial numbers without their context.
- Any page whose commercial interest is served by the claim it is making.

This exclusion had a concrete cost in this session. Every retrievable source on purity, mislabeling,
and counterfeiting in the peptide market was a vendor or testing-service marketing page. The honest
result is therefore that this Guide carries no verified product quality data, rather than that it
carries vendor figures.

## 7. What the search established

- Genuine human randomized controlled trial evidence for LL-37 exists, which is unusual for this
  category.
- That evidence is entirely topical (chronic wound application) or intratumoral (direct injection
  into a skin tumor). No retrieved human trial used a systemic route.
- No retrieved human trial enrolled healthy participants. Every trial enrolled people with a specific
  disease.
- The largest and most rigorous human trial did not meet its prespecified primary endpoint.
- The peer-reviewed literature documents substantive theoretical safety concerns (host cell toxicity
  in cultured cells at concentrations near the antimicrobial range, and an autoantigen and type I
  interferon mechanism) that are absent from promotional framing.

## 8. What remains to be searched by a human reviewer

These are open and must be closed before publication. None of them may be filled by inference.

1. FDA compounding status. The FDA 2027 advisory committee meeting materials page, the Section 503A
   bulk drug substances page, and the Category 2 significant safety risks page all returned HTTP 404,
   and the Federal Register notice redirected to a block page. The reported February 2027 review of
   cathelicidin LL-37 rests only on secondary legal and trade sources and must be checked against the
   FDA advisory committee calendar directly.
2. WADA Prohibited List status. Not retrievable this session. Must be checked against the current
   list directly. Note that WADA category S0 concerns substances without current approval for human
   therapeutic use, which a reviewer should evaluate rather than assume.
3. FDA warning letters, import alerts, and safety communications mentioning LL-37 or cathelicidin.
   Not searched exhaustively.
4. Product quality, purity, and adulteration data from acceptable sources only, meaning FDA warning
   letters, FDA import alerts, or peer-reviewed analytical chemistry literature.
5. Full text of the diabetic foot ulcer randomized trial, to confirm enrollment, randomization
   detail, and the adverse event section, none of which were verified from the abstract.
6. Whether trial registration NCT04098562 corresponds to that diabetic foot ulcer publication. The
   linkage is plausible but was not confirmed.
7. The full posted efficacy outcome tables for the melanoma trial NCT02225366.
8. The preclinical article reporting that LL-37 promotes growth of a pulmonary fungal pathogen. It
   was surfaced by title only. If accurate it is a directionally important counter-finding, which is
   why it is flagged rather than dropped. It must be retrieved and read before any use.
9. Non-US regulators, meaning EMA, MHRA, TGA, and Health Canada. None were searched. No statement
   about those jurisdictions may appear in the Guide.
10. Whether a systematic review or meta-analysis of LL-37 human trials exists. None was retrieved. It
    is plausible that none exists given the small number of interventional studies, but this was not
    confirmed.

## 9. Standing rule for this Guide

Where a claim cannot be supported by a source retrieved and read this session, the claim is dropped
and logged as a gap. Omitting a claim is always preferable to supporting it with a reconstructed
identifier or a vendor page. An honest statement that evidence is absent is a correct result.
