---
title: "Semax + Selank + DSIP: Contradictions and Divergences"
type: research-guide-contradictions
compound: semax-selank-dsip
status: draft
workflow_state: draft
owner: Samuel Boadu
last_reviewed: 2026-07-21
---

# Semax + Selank + DSIP Contradictions and Divergences

Where the sources disagree, and what the Guide says when they do. Source ids refer to
SOURCE_REGISTRY.md. Claim ids refer to CLAIM_TABLE.md.

Dosing and administration information is intentionally excluded from Xenios Research Guides.

There are eight entries here. Two of them (C-01 and C-02) concern claims a member is very
likely to encounter before ever reading this Guide. One (C-03) is an unresolved conflict
between two of the supplied research records themselves, and it is recorded rather than
papered over.

## C-01. Whether any evidence exists for the combination

**Position A.** The presentation of a blend product implies that its components were selected
to work together, and a reader encountering three named compounds with published literature
behind each reasonably infers that the product is better evidenced than any one of them. A
study exists (PMID 32342318) whose title names both Selank and Semax, and it would be easy to
cite it as combination evidence.

**Position B.** No study of Semax with Selank with DSIP as one preparation exists in anything
retrieved (X01). No two-component mixture of them has been studied either (X02). PMID 32342318
examined Selank and Semax as separate agents in one experiment and explicitly distinguished
their effects from one another. DSIP does not appear in it.

**Assessment.** Position B, decisively, and Position A rests on a reasoning error rather than
on a source. Two compounds compared side by side is the opposite of two compounds combined:
the study design exists precisely to tell them apart. More fundamentally, evidence attaches to
what was actually administered. A combination is a distinct pharmacological object with its own
interaction profile and its own unknowns, and only a study of the actual mixture can speak to
it. Unless a study tested this combination, there is no combination evidence. Not weak
evidence. None.

**What the Guide says.** No combination evidence exists, stated in the first screen. See
CX-01, CX-02, CX-03, CX-04, and the prohibitions at X-01 and X-02.

## C-02. Whether Semax and Selank are currently approved medicines in Russia

**Position A.** Essentially every vendor, clinic, and peptide-encyclopedia page retrieved
across the two component searches states that Semax and Selank are currently approved
prescription medicines in the Russian Federation, commonly citing a 2009 Ministry of Health
approval for Selank under a brand name, and for Semax a place on the Russian List of Vital and
Essential Drugs.

**Position B.** Two independent Russian pharmaceutical trade outlets report that on 20 to 21
January 2026 the Russian Ministry of Health cancelled the marketing registration of 71
medicinal products and excluded 14 pharmaceutical substances from the State Register of
Medicines. The nootropic products Semax and Selank from Peptogen are named among the cancelled
registrations, and selank is named among the substances excluded. The reported reason is not a
safety withdrawal: all entries were removed at the request of the registration certificate
holders and authorized legal entities (SL14, SL15).

**Assessment.** Position B should be preferred and the vendor claim treated as stale. Two
independent outlets name the same company, the same two products, and the same stated reason,
which is a specific, falsifiable, corroborated detail. The vendor claim is generic, uncited,
and copied across pages. Note the direction of evidence quality here: the Semax research record
carries the Russian registration claim as `verified: false` from a tertiary source, while the
cancellation is `verified: true` from two independent outlets. The better-sourced fact is the
cancellation.

Two cautions attach. First, the reported reason is a holder request, and no safety rationale
was reported, so the Guide must not speculate that a safety problem drove it. Second, neither
the original registration particulars nor the cancellation was confirmed at the Russian state
register itself, which could not be retrieved. A human must close this.

**What the Guide says.** Neither compound is described as a currently approved medicine
anywhere. The accurate framing is prior registration in Russia, reported cancelled in January
2026 at the holder's request. See R-05 and the prohibition at X-04.

## C-03. Whether Selank was nominated to the United States 503A bulks list

This is a conflict between two of the supplied research records, and it is unresolved.

**Position A.** The Selank research record states, from a domain-restricted search summary of
FDA warning letters, that Selank and Semax were **not** nominated for inclusion on the 503A
bulk drug substances list (SL17). That record marks the statement `verified: false`, because
every direct fetch to www.fda.gov returned HTTP 404 and the verbatim FDA text was never read.

**Position B.** The Semax research record quotes the retrieved full text of a Federal Register
notice published 2026-04-16 (Docket FDA-2025-N-6895) recording that "Semax (free base)" and
"Semax acetate" appear on the list of bulk drug substances nominated for possible inclusion on
the section 503A list, with nominated uses of cerebral ischemia, migraine, and trigeminal
neuralgia (SX08). That record marks the statement `verified: true`, and the Federal Register
full text was successfully retrieved and read.

**Assessment.** For Semax, Position B wins outright. A retrieved primary regulatory document
beats a search summary of a document that was never read, and the Semax nomination should be
treated as established. Position A is very likely a stale statement, describing an earlier
period, that the search summary carried forward without a date.

For **Selank specifically, the question is genuinely open.** Position B says nothing about
Selank one way or the other: the retrieved Federal Register text is quoted in the research
record only for its Semax entries. So the Guide can neither assert that Selank was nominated
nor assert that it was not.

**What the Guide says.** The Semax nomination is stated as a fact with its nomination framing
intact (R-02). **No statement is made about Selank's 503A status in either direction.** A human
reviewer must read the Federal Register notice in full and check the substance list for Selank
and for emideltide. This is a named open item in SOURCE_PLAN.md section 7.

## C-04. What the United States 503A activity means

**Position A.** Vendor and peptide-marketing pages frame the July 2026 Pharmacy Compounding
Advisory Committee consideration as these peptides being "under FDA review" and heading toward
legitimacy.

**Position B.** The primary Federal Register notice records only that certain substances were
**nominated** by outside parties for possible inclusion on a list governing which raw
substances a pharmacist or physician may use in compounding, and that a committee would meet on
23 to 24 July 2026 (SX08).

**Assessment.** The primary source wins decisively. Nomination by an outside party, and
discussion by an advisory committee, are not FDA review of a drug application and are not
approval. The 503A bulks list is a compounding-eligibility mechanism, not a drug approval
pathway. As of 2026-07-21 the meeting had not occurred and no outcome exists. Separately,
secondary reporting suggests FDA proposed that emideltide (DSIP) **not** be added, citing
studies that were small, uncontrolled, or contradictory, but all four FDA source URLs failed to
retrieve, so that is not stated as a fact anywhere in this folder either.

Note the shape of the error in both directions: an unretrieved document is being used to
support a positive story on vendor pages and a negative story in trade reporting. Neither is
publishable until the document is read.

**What the Guide says.** The nomination is stated as a fact with its framing intact. No outcome
is asserted, and no momentum is implied. See R-02, R-04, X-06, and X-07.

## C-05. Whether the 2018 Semax neuroimaging study was randomized

**Position A.** The fetched PubMed record summary characterized PMID 30225715 as a randomized
controlled trial with 14 Semax and 10 placebo participants.

**Position B.** The retrieved abstract text does not itself describe a randomization method,
allocation concealment, or blinding, and an unequal 14 versus 10 allocation is atypical for
randomization. A search summary in the same session described the best-powered recent Semax
study as non-randomized and not placebo-controlled.

**Assessment.** Part of this is a conflation: the "non-randomized, 110 patients" description
belongs to the separate stroke study PMID 29798983, not to the imaging study. But the
randomization status of PMID 30225715 remains genuinely unconfirmed from the abstract alone.

**What the Guide says.** PMID 30225715 is described as a small placebo-comparison imaging study
in healthy volunteers, never as a randomized controlled trial, pending full-text verification.
See H-SX-04.

## C-06. Whether Selank matches benzodiazepines without their drawbacks

**Position A.** Vendor pages state Selank produces benzodiazepine-equivalent calm without
sedation, cognitive blunting, dependence, or withdrawal, citing head-to-head trials, and assert
that across roughly 192 Russian trial subjects there were zero cases of dependence or
withdrawal and no rebound anxiety, insomnia, or autonomic instability (SL20).

**Position B.** The retrieved primary abstracts support a much narrower reading. PMID 18454096
reports the anxiolytic effects of selank and medazepam were "similar" in 62 patients. PMID
26356395 tested selank as an **add-on** to phenazepam and reported reduced phenazepam side
effects, which is a benzodiazepine-sparing result and not standalone equivalence. No
placebo-controlled trial was retrieved. None of the four human records yielded adverse-event
tables, dropout counts, laboratory monitoring, or long-term follow-up in the abstracts
obtained.

**Assessment.** Prefer the primary abstracts. "Reported similar to medazepam in one 62-patient
Russian study by non-independent investigators, with the full text unread" is defensible.
"Benzodiazepine-equivalent without dependence or withdrawal" is not, because it converts one
small non-independent comparison plus an **absence of reported adverse events** into a positive
blanket safety and efficacy claim. A blanket safety claim of that shape is not supportable from
three small abstract-only trials, and a literature this size could not detect such signals even
if they existed.

**What the Guide says.** See H-SL-02, H-SL-04, H-SL-05, and the prohibitions at X-09 and X-10.

## C-07. Whether DSIP improves sleep

**Position A.** Kaeser 1984 (DS03) reported sleep normalized in all but one of 7 patients with
severe insomnia over follow-up periods of three to seven months, with reported improvement in
daytime mood and performance.

**Position B.** Monti et al 1987 (DS01) concluded sleep improvement was of little clinical
significance, with no significant differences against either baseline or placebo on the primary
comparisons. Bes et al 1992 (DS02, n=16) concluded short-term treatment of chronic insomnia is
not likely to be of major therapeutic benefit, described their own significant effects as weak
and possibly attributable to an incidental change in the placebo group, and found subjective
sleep quality unchanged.

**Assessment.** This is not a genuine evidential standoff and must not be presented as one. The
positive result comes from an open, uncontrolled, unblinded study of 7 people. The negative
results come from the two double-blind controlled studies. When a striking open-label result
fails to survive blinding and placebo control, the standard inference is that the original
result reflected placebo response and expectancy rather than drug effect. The controlled
studies get decisive weight.

**What the Guide says.** The controlled studies are given decisive weight and the picture is
not described as "mixed". See H-DS-02, H-DS-03, H-DS-04, and the prohibition at X-13.

## C-08. Whether DSIP promotes delta sleep, the property it is named for

**Position A.** The 1974 discovery work and the 1984 review (DS06) describe delta-sleep
induction in rabbits, rats, and mice, and the compound is named for this effect.

**Position B.** In the double-blind human crossover study, slow wave sleep was **not** modified,
and the increase in total sleep was driven by lighter stage 2 sleep instead (DS01). The 2006
critical review reports that DSIP itself did not show clear effects in animal work while some
structural analogues did, and proposes that a DSIP-like peptide rather than DSIP may account
for reported results (DS05).

**Assessment.** The human controlled data do not support the specific claim embedded in the
compound's own name. This is significant and easy to miss: the name asserts a mechanism that
the best available human measurement did not find. Marketing that leans on "delta sleep" as a
mechanism is leaning on the name, not on the data. Underneath this sits a deeper problem, that
no DSIP gene, precursor, or receptor has ever been identified in any species, so the compound's
status as a genuine endogenous signalling molecule was never established at all.

**What the Guide says.** DSIP is described as a hypothesized factor whose endogenous status was
never confirmed, and the delta-sleep claim is stated as unsupported by the human measurement.
See ID-04, H-DS-05, and the prohibition at X-12.

## C-09. A note on the integrity of the regulatory record

This is not a disagreement between sources, but it is a weakness in the chain and belongs on
the record rather than buried in a gaps list.

Across all three component searches, **exactly one primary regulatory document was successfully
retrieved**: the Federal Register full text for document 2026-07361 (SX08). Everything else
failed. Every fetch to www.fda.gov returned HTTP 404. Drugs@FDA returned 404. The EMA search
endpoint returned HTTP 401. The WADA Prohibited List returned empty content on every attempt in
all three searches. The Russian State Register was never successfully queried, and a mirror
record rendered nothing. The FDA substance registry records for Selank existed but rendered no
usable content.

The honest reading is that this packet's regulatory section is one verified document and a
series of declared gaps. That is stated in REGULATORY_STATUS.md rather than smoothed into
confident prose, and a human reviewer must open each source directly before publication.

One reassurance about the retrieval path itself, which is worth recording alongside the
failures: all three component searches ran an adversarial control, querying a deliberately
fabricated identifier. In each case the fabricated record failed rather than returning content,
while genuine records returned full records. The retrieval path was real and did not confabulate.
</content>
