---
title: Dihexa Contradictions and Divergences
type: research-guide-contradictions
compound: dihexa
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# Dihexa Contradictions and Divergences

Where the sources disagree, and what the Guide should say when they do. Source ids refer to
SOURCE_REGISTRY.md. Claim ids refer to CLAIM_TABLE.md.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

There are genuine contradictions here. The first one is the most consequential single issue in this
compound's Guide, because it concerns the identity of the molecule that the human trials belong to.

## C-01. Whether dihexa has been tested in humans

**Position A.** Popular and vendor-adjacent content sometimes implies that dihexa has clinical trial
support, usually by pointing at Athira Pharma's Alzheimer's programme.

**Position B.** Dihexa itself has zero ClinicalTrials.gov registrations (S01) and zero PubMed
records with a clinical trial publication type (S06). The trials belong to fosgonimeton, also known
as ATH-1017 and formerly NDX-1017, which is a distinct brain-penetrant HGF and MET activating
clinical candidate developed by Athira Pharma, formerly M3 Biotechnology, which had commercialised
dihexa. ALZFORUM describes fosgonimeton only as one that may be related to dihexa and does not
assert chemical identity (S12).

**Assessment.** Position B is correct, and this distinction must be stated explicitly in the Guide.
The registered fosgonimeton studies retrieved this session are NCT04488419 (Phase 2/3, completed),
NCT04491006 (Phase 2, completed), NCT04886063 (Phase 2/3, terminated), NCT04831281 (Phase 2,
Parkinson's disease dementia and Lewy body dementia, terminated), and NCT05511558 (Phase 1 ADME,
completed) (S02).

There is a second layer to this. Per ALZFORUM, the ACT-AD Phase 2 trial failed its primary endpoint
and the LIFT-AD Phase 2/3 trial failed both its primary and key secondary endpoints (S12). So even
the nearest clinical relative of dihexa did not demonstrate efficacy. Any Guide text that borrows
credibility from those trials for dihexa would therefore be misleading twice over: once by
attributing another compound's programme to dihexa, and again by implying a favourable clinical
signal that the programme did not produce.

**What the Guide says.** No human trial of dihexa has been conducted. Fosgonimeton is named as a
separate compound, its trial identifiers and outcomes are stated as fosgonimeton's, and no result is
transferred. See DIH-H-01, DIH-I-04, DIH-S-07, and the prohibitions at DIH-X-02 and DIH-X-03.

## C-02. Potency framing

**Position A.** A widely repeated claim holds that dihexa is seven orders of magnitude more potent
than brain-derived neurotrophic factor in a neurotrophic assay. This phrasing appeared in a
search snippet sourced to Wikipedia this session.

**Position B.** That is an in-vitro relative-potency figure from a specific assay, not a clinical
effect size, and the primary source for the specific claim was not retrieved or verified this
session.

**Assessment.** Do not publish the potency multiplier. It is an assay-specific number that reads to
a lay member as a claim of superhuman efficacy, and it is exactly the kind of precise-sounding
figure that survives being copied while its qualifications fall away. If it is used at all, a human
must verify it against the primary paper first, and it must then be framed as an in-vitro assay
comparison in a non-human system. The founder review should decide whether it belongs in
member-facing content at all.

**What the Guide says.** Nothing. The multiplier does not appear in GUIDE_DRAFT.md or
FAQ_DRAFT.md. It is named in CLAIM_TABLE.md at DIH-X-04 so that it cannot re-enter without a
reviewer noticing.

## C-03. Where the preclinical record disagrees with itself

This is a real divergence inside the primary literature, and it is the most useful one for a member
to understand.

- **Positive.** In male Sprague-Dawley rats tested in the Morris water maze, dihexa and its parent
  compound produced a procognitive effect, blocked by an HGF antagonist delivered into the rat
  brain, and in rat hippocampal neurons and rat slice cultures it induced spinogenesis and
  synaptogenesis, blocked by an HGF antagonist and by short hairpin RNA against c-Met (S07).
- **Negative.** In male Wistar rats given 3-nitropropionic acid to model Huntington's-disease-like
  symptoms, PNB-0408 (dihexa) did not protect against the induced deficits, despite the compound's
  reported activity in other rodent neurodegeneration models (S08).

**Assessment.** These are not in conflict as science. They are different rat models, different rat
strains, and different insults, and a compound can act in one and not another. They are in conflict
as *impressions*. Content that reports only the 2014 findings leaves a reader with a picture of a
reliably neuroprotective compound that the 2024 result does not support.

**What the Guide says.** Both results appear, with their rat strains and models named, and the
negative result is given equal prominence rather than being placed as a footnote after the positive
one. See DIH-P-01, DIH-P-02, and the prohibition at DIH-X-11, which forbids the omission.

## C-04. Where the mechanism is also the risk

This is not a disagreement between sources. It is a tension inside a single, well-established body
of biology, and it is the most important thing about this compound.

- Dihexa's proposed mechanism is potentiation of HGF signalling at c-Met (S07). That is the reason
  anyone is interested in it.
- c-MET is the product of a proto-oncogene, and HGF and Met signalling contributes to oncogenesis
  and tumour progression, promoting proliferation, angiogenesis, invasion, epithelial-mesenchymal
  transition, and metastasis across multiple tumour types. It is an active target for
  cancer-inhibiting drugs (S10, S11).

So a compound designed to amplify a pathway is being discussed as a nootropic while the
pharmaceutical industry spends its effort designing drugs to block that same pathway. Both of those
statements come from peer-reviewed sources and neither is disputed.

**Assessment.** The correct treatment is neither dismissal nor alarm. The concern is theoretical in
the precise sense that no adverse event has been observed in a human, because no human has been
systematically studied. It is not theoretical in the sense of being speculative: it follows directly
from the compound's own proposed mechanism and from two independent oncology reviews. The word
"theoretical" must not be allowed to function as reassurance.

**What the Guide says.** The mechanism section and the safety section are explicitly linked, and
the concern is stated early rather than at the end. No human carcinogenicity data for dihexa is
cited, because none exists. See DIH-M-05, DIH-S-02, DIH-S-04, and DIH-U-02.

## C-05. Where the surrounding literature is not evidence about this compound

The 2018 systematic review of angiotensin IV and cognition screened 450 articles down to 32
experimental studies and reported beneficial effects on avoidance and object recognition tasks in
normal animals, and improved spatial working memory in cognitive-deficit models (S09). It included
no human studies at all, and it is explicitly a review of the broader angiotensin IV literature
rather than of dihexa.

**Assessment.** This is the literature that surrounds dihexa and explains why researchers found the
class interesting. It is not evidence about dihexa. Presenting it as such is a category error, and
it is a particularly easy one to make because the review is genuine, peer-reviewed, and favourable
in tone.

**What the Guide says.** The review is cited as context for interest, labelled as non-human
throughout, and never as a dihexa result. See DIH-P-03 and the prohibition at DIH-X-10.

## C-06. Where the regulatory record could not be established at all

There is no conflict between regulators here, because no regulator statement was retrieved.

- Secondary and vendor-adjacent pages claim dihexa was placed on, and later affected by changes to,
  the FDA 503A bulk drug substances Category 2 list. Two attempts to retrieve the relevant FDA.gov
  compounding page returned HTTP 404 to the fetch tool (S14). No FDA-sourced statement about dihexa
  was obtained, and none appears anywhere in this folder.
- Aggregator pages assert that dihexa falls under the WADA S0 non-approved substances catch-all
  because it lacks regulatory approval for human therapeutic use. The official WADA page returned
  empty content and two mirror PDFs returned HTTP 403 and unparseable binary (S15). Dihexa is not
  known to be named explicitly on the Prohibited List, and the S0 characterisation is unconfirmed.

**Assessment.** A failed retrieval is a gap, never a finding, and it is never a licence to repeat
what secondary pages say the unreachable document contains. Both of these are flagged for human
verification and both are prohibited from member-facing text in the meantime (DIH-X-07, DIH-X-08).

**What the Guide says.** The Guide states what was checked, on what date, at what URL, and that the
retrieval failed. It states no FDA position and no anti-doping status. Athletes are directed to
their own anti-doping authority. See REGULATORY_STATUS.md.

## C-07. Where a reputable source could not be read properly

The Alzheimer's Drug Discovery Foundation Cognitive Vitality report on dihexa is the one independent
expert review of this compound located this session, and it is the sort of source a Guide would
normally lean on. It was retrieved successfully, but the PDF could not be parsed to raw text in this
environment, so its content is known only through a model-generated summary (S13).

**Assessment.** The source is reputable and the summary is consistent with everything else in the
record, reporting no human clinical trials and flagging HGF and c-Met implication in tumour
progression and metastasis. But a summary of a document is not the document. The honest position is
to use it as paraphrase, to say plainly that it is paraphrase, and to publish no wording from it as
a quotation.

**What the Guide says.** The report is cited as an independent expert review whose evidence
characterisation matches the primary record, with the parsing caveat attached in the same place. See
DIH-S-03 and the prohibition on quotation at DIH-X-09.

## C-08. Jurisdictional differences

No genuine conflict between jurisdictions was found, because no jurisdiction produced a retrievable
compound-specific statement. The United States position could not be established because FDA pages
returned HTTP 404. The anti-doping position could not be established because the Prohibited List
could not be read. No other national regulator was consulted.

The absence of a conflict here reflects the absence of retrievable information, not agreement among
regulators, and certainly not an absence of regulation.

## C-09. A note on the integrity of the search itself

One methodological point belongs on this page rather than buried in the source plan. An empty human
evidence table is a strong claim, and a search that returns nothing looks identical to a search that
is broken. This one was tested in both directions in the same session and against the same API: a
deliberately fake identifier returned HTTP 404 (S03), and a positive control query returned 744 real
studies (S04).

That is why the Guide states the absence of human evidence as a finding rather than as a failure to
find. A reviewer re-running the check should re-run both controls alongside it, and should treat a
bare zero without controls as unverified.
