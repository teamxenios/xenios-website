---
title: Guide Content Schema
type: content-schema
status: canonical
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# Guide Content Schema

This document defines the nine-file Guide packet and the internal structure of a Guide document for
Xenios Research.

A Guide is member-only editorial content. It explains what is known, what is claimed, what is
contested, and what is unknown about a topic, and it stops there. It is not a protocol, not an
instruction set, and not a sales asset.

Guides live under `content/research-guides/individual/` for a single ingredient or compound, and
under `content/research-guides/blends/` for a combined formulation.

## 1. What a Guide is and is not

A Guide is:

- a documented reading of the available evidence, claim by claim
- an honest map of contradiction and uncertainty
- a set of questions a member can take to a qualified professional

A Guide is not:

- a dosing reference
- a protocol, regimen, schedule, or stack
- a safety clearance
- a purchase recommendation
- a substitute for a clinician

Guide completion is not a commerce prerequisite, and commerce authorization is not a Guide
prerequisite. The two states are independent. See `PRODUCT_CONTENT_SCHEMA.md` section 6.

An AI agent may draft any file in the packet. No AI draft publishes automatically. Samuel Boadu is
the founder reviewer and publisher.

## 2. Absolute content rules for every Guide file

These rules apply to all nine files, including working files that are never shown to a member. They
override completeness, readability, and helpfulness.

### 2.1 No dosing, ever

No amounts, mg, mcg, IU, mL, units, concentrations, frequency, timing, cycle length, titration,
loading, stacking, reconstitution, injection technique, or route of administration.

This holds even when a retrieved study states a dose. The study is cited. The dose is not
reproduced. In `CLAIM_TABLE.md` and in `GUIDE_DRAFT.md`, where a dose would otherwise appear, write
exactly:

```
dosing information is intentionally excluded
```

A study whose only meaningful content is a dose response is cited for its existence and its
population, and its numeric findings are described qualitatively without amounts.

### 2.2 No directions or protocols

Nothing a reader could follow as instructions. No sequences, no schedules, no "start with", no
"combine with", no cycling language.

### 2.3 No guaranteed outcomes

"Will", "proven to", "restores", "cures", "eliminates", and "reverses" do not describe effects.
Use "has been studied for", "reported in", "investigated as", "associated with in the cited study".

### 2.4 No unsupported safety claims

"Safe", "well tolerated", and "no side effects" are never stated as general facts. The safety
section names categories of consideration and routes the member to a qualified professional.

### 2.5 No preclinical to human leaps

If a finding is from an animal model or in vitro work, the species or model appears in the same
sentence as the finding. Preclinical and human evidence occupy separate, clearly labeled sections in
`GUIDE_DRAFT.md`, and a preclinical finding is never summarized in the human evidence section.

Correct: "In a rat model, the compound was reported to alter marker X."
Not acceptable: "The compound alters marker X." with the species disclosed elsewhere.

### 2.6 The research use only framing is prohibited

"Research use only" may not be used to imply human benefit. If a label or supplier document uses the
phrase, `REGULATORY_STATUS.md` may record that the label carries it, as a dated and sourced fact
about the label, without repeating it as a benefit signal anywhere else.

### 2.7 Regulatory statements carry a date, a jurisdiction, and a source URL

```
As of <YYYY-MM-DD>, in <jurisdiction>, <statement>. Source: <exact retrieved URL>
```

Missing any element means the statement is not written. It becomes an open item in
`REGULATORY_STATUS.md`.

### 2.8 No advice

No medical, legal, financial, or clinical advice. No diagnosis. No self-treatment framing.

### 2.9 Citation integrity

Only sources actually retrieved during the drafting session may be cited. Nothing is reconstructed
from memory. A PMID, NCT number, DOI, author name, year, journal, or URL is never inferred,
guessed, or "reasonably" completed. A plausible looking fabricated citation is a worse failure than
no citation at all.

If a source cannot be retrieved, the claim is omitted and logged in the gaps list of
`SOURCE_PLAN.md`.

Every retrieved source is marked in `SOURCE_REGISTRY.md` as:

```
VERIFIED 2026-07-19 | <exact retrieved URL>
```

with the verification date being the date it was actually retrieved.

Any line that rests on general background knowledge rather than a retrieved source is labeled
exactly:

```
[UNVERIFIED - background knowledge, requires human source check]
```

### 2.10 Original wording only

No competitor, retailer, manufacturer, or supplier marketing text is copied or lightly paraphrased.
Scientific sources are summarized in original wording. Direct quotation is limited to a short quoted
phrase with attribution where the exact wording is load bearing.

### 2.11 Never invent a product fact

Composition, ratios, concentration, fill volume, shelf life, storage temperature, sterility, purity,
certificate of analysis content, supplier identity, price, or inventory are never invented. Unknown
facts use the exact string:

```
NOT CONFIRMED - see open supplier questions
```

## 3. The nine-file Guide packet

Every Guide is a directory containing exactly these nine files. All nine exist before a Guide can
reach `Guide In Review`. Files 1 through 4 and 9 are internal working files. Files 5 through 8 hold
the content that becomes member-facing after review.

Directory: `content/research-guides/<individual|blends>/<topic-slug>/`

| # | File | Audience | Purpose |
|---|------|----------|---------|
| 1 | `SOURCE_PLAN.md` | Internal | What will be searched, what counts as an acceptable source, and what is deliberately out of scope. Holds the gaps list. |
| 2 | `SOURCE_REGISTRY.md` | Internal | Every source actually retrieved, with verification date and exact URL. The only legal source of citations for the packet. |
| 3 | `CLAIM_TABLE.md` | Internal | Every individual claim, graded per `CLAIM_EVIDENCE_SCHEMA.md`, with evidence pointers into the registry. |
| 4 | `CONTRADICTIONS.md` | Internal | Where the sources disagree, and how the disagreement is presented rather than resolved. |
| 5 | `GUIDE_DRAFT.md` | Member-facing after review | The Guide itself, in the eighteen-section structure in section 4. |
| 6 | `FAQ_DRAFT.md` | Member-facing after review | Questions members actually ask, answered within these rules. |
| 7 | `QUALITY_AND_DOCUMENTATION.md` | Member-facing after review | What documentation exists, what does not, and what has been requested. No numeric results. |
| 8 | `REGULATORY_STATUS.md` | Member-facing after review | Dated, jurisdiction specific, sourced status. Nothing else. |
| 9 | `EDITORIAL_REVIEW_CHECKLIST.md` | Internal | The completed reviewer checklist with reviewer name, date, and decision. |

Every file in the packet begins with frontmatter:

```yaml
---
title: <Topic> <File purpose>
type: research-guide-<file-role>
status: <draft | in-review | published>
owner: Samuel Boadu
last_reviewed: 2026-07-19
---
```

### 3.1 SOURCE_PLAN.md

Written before any drafting. Contents:

- **Topic and scope.** What this Guide covers and what it explicitly does not.
- **Question list.** The specific questions the Guide sets out to answer.
- **Acceptable source tiers.** In descending preference: systematic reviews and meta-analyses of
  human trials, randomized controlled human trials, other human studies, registered trial records,
  regulatory and government publications, preclinical primary literature, professional body
  statements. Supplier and manufacturer documents are recorded as supplier reported and never
  promoted above that.
- **Excluded sources.** Competitor marketing, retailer copy, supplement vendor blogs, undated pages,
  content farms, and any source that cannot be retrieved and linked.
- **Search plan.** The searches to run, in order.
- **Gaps list.** Every question that could not be answered from a retrieved source. Each entry
  states the question, what was searched, and what would resolve it. A claim that cannot be sourced
  is dropped from the Guide and lands here. The gaps list is expected to be long and is never
  trimmed for appearance.

### 3.2 SOURCE_REGISTRY.md

The single legal citation source for the packet. Nothing may be cited in any other file unless it
appears here.

One entry per source:

| Field | Requirement |
|-------|-------------|
| Source id | `S-001`, `S-002`, and so on. Stable across the packet. |
| Type | systematic review, meta-analysis, randomized human trial, other human study, trial registry record, regulatory publication, preclinical study, professional body statement, supplier document |
| Title | As retrieved. |
| Identifier | PMID, DOI, or NCT number, only if it appeared in the retrieved page. Otherwise `not present in retrieved source`. |
| Exact retrieved URL | The URL actually fetched. |
| Verification | `VERIFIED <YYYY-MM-DD>` |
| Population | Human, and if human then the described population, or the animal species, or the in vitro model. Required. |
| What it supports | Which claim ids in `CLAIM_TABLE.md` point to it. |
| Limitations noted | Sample size described qualitatively, funding or conflict statements if present, design limitations. |

An entry with no exact retrieved URL is not a valid entry and its claims are dropped.

### 3.3 CLAIM_TABLE.md

Every claim in the Guide, one row each, graded individually. The shape of a claim record, the grade
set, the conservative default, and the blend rule are defined in `CLAIM_EVIDENCE_SCHEMA.md`. The
claim table is that schema applied to this topic.

Rules specific to the packet:

- A sentence in `GUIDE_DRAFT.md` that asserts anything about effect, mechanism, safety, quality, or
  legal status corresponds to a claim id in this table. If it has no claim id, it does not go in the
  Guide.
- Each claim points to source ids from `SOURCE_REGISTRY.md`.
- Claims graded `PROHIBITED` are also mirrored into the linked product record's
  `Prohibited claims` section.
- Grades attach to claims. A grade is never assigned to the topic or the product as a whole.

### 3.4 CONTRADICTIONS.md

Where retrieved sources disagree. One entry per disagreement:

- The claim id in dispute.
- What source A reports, with its population and design.
- What source B reports, with its population and design.
- Plausible reasons for the difference, stated as possibilities rather than conclusions, for example
  different populations, different endpoints, different study durations, different measurement
  methods.
- How the Guide presents it.

The Guide presents disagreement as disagreement. It does not pick a winner to make the topic read
cleanly. If the literature is split, the Guide says the literature is split and the affected claim
grade reflects that.

### 3.5 GUIDE_DRAFT.md

The Guide document. Structure defined in section 4.

### 3.6 FAQ_DRAFT.md

Real member questions with answers that obey every rule in section 2.

- Dosing questions are answered with the exact excluded-dosing line plus a referral to a qualified
  professional. They are never partially answered.
- Safety questions are answered by naming categories of consideration and referring the member to a
  qualified professional, never by stating that something is safe.
- Comparison questions are answered only where a retrieved human comparative study exists. Otherwise
  the answer states that no retrieved comparative human evidence is on file.
- Legal status questions point to `REGULATORY_STATUS.md`.
- Every factual answer carries its claim id.

### 3.7 QUALITY_AND_DOCUMENTATION.md

What documentation exists for the item and what does not.

- Which document types are on file, requested, or unavailable, by name and date.
- Who holds each document.
- What identity and purity testing means in general terms, and what an absence of documentation
  means for a member's confidence.
- No numeric assay values, purity percentages, or certificate of analysis figures are reproduced.
- Statements about a specific supplier's practices are graded `E` (manufacturer or supplier
  reported) unless independently verified, and are labeled as supplier reported in the text.
- Unknowns use the exact string `NOT CONFIRMED - see open supplier questions`.

### 3.8 REGULATORY_STATUS.md

Only dated, jurisdiction specific, sourced statements, in the format from section 2.7. Each carries
its claim id and its source id.

- Each jurisdiction is a separate subsection. A statement about one jurisdiction is never generalized
  to another.
- A review date is set for every statement, because status changes.
- Where status could not be established from a retrieved source, the section says so plainly and
  lists it as an open item. It does not approximate.
- "Research use only" is never used here as a benefit signal. If a label carries the phrase, that is
  recorded as a dated, sourced fact about the label and nothing more.

### 3.9 EDITORIAL_REVIEW_CHECKLIST.md

Completed by a human reviewer before publication. Contents: the checklist in section 5, each item
marked pass or fail, the reviewer name, the review date, the decision (publish, revise, hold), and
notes for any failed item.

An AI agent may prepare the file. Only a human reviewer marks items and signs. Samuel Boadu is the
founder reviewer and publisher.

## 4. GUIDE_DRAFT.md structure

Eighteen sections, in this exact order, with these headings. A section with nothing to report still
appears and states plainly that nothing is on file.

| # | Section | What belongs in it |
|---|---------|--------------------|
| 1 | One-minute summary | Six to ten sentences. What the topic is, why members ask about it, the honest state of the evidence, and the largest unknown. No effect claim appears here that is not graded elsewhere in the Guide. No dosing. No recommendation. |
| 2 | What it is | Plain description of the substance or intervention category. Chemical or biological class in general terms. No composition figures, no concentrations. |
| 3 | Why interest exists | The reason members and the wider field pay attention, described as interest rather than as established benefit. Historical or cultural interest is labeled as such and graded `F`. |
| 4 | Terminology | Alternate names, abbreviations, supplier names, and any term the member will encounter, each glossed in plain English on first use. Marketing coinages are identified as marketing coinages. |
| 5 | Proposed mechanism | How it is hypothesized to work, framed as hypothesis. Every mechanism sentence names its evidence base and the species or model. A mechanism is never presented as an outcome, and a plausible mechanism is never used to imply an effect. |
| 6 | Human evidence | Only findings from human studies. Each with study type, population, what was measured, what was reported, and limitations. Claim ids inline. Effect sizes described qualitatively without doses. If there is no retrieved human evidence, the section says exactly that. |
| 7 | Preclinical evidence | Animal and in vitro findings only, each naming the species or model in the same sentence as the finding. This section opens with a line stating that preclinical findings do not establish human effects. |
| 8 | Contradictions | The member-facing summary of `CONTRADICTIONS.md`. Where the evidence disagrees, and what that means for confidence. |
| 9 | Limitations | The shape of the evidence base as a whole. Study sizes, durations, endpoints, populations studied and not studied, funding and conflict issues where disclosed, and publication bias considerations where relevant. |
| 10 | Quality and identity | The member-facing summary of `QUALITY_AND_DOCUMENTATION.md`. What documentation exists for this item, what does not, and why that matters. Supplier reported content labeled as supplier reported. |
| 11 | Safety categories | Named categories of consideration that appear in the literature, for example cardiovascular, hepatic, renal, endocrine, pregnancy and lactation, immune, psychiatric. Each names its evidence base and population. This section never states that anything is safe, well tolerated, or free of side effects, and it never describes what to do about a category. |
| 12 | Interactions | Categories of substance or condition where interaction has been discussed in retrieved sources, with the evidence base for each. No management advice, no avoidance instructions. The section directs the member to a qualified professional who knows their full medication and history. |
| 13 | Dated regulatory status | The member-facing summary of `REGULATORY_STATUS.md`, in the date, jurisdiction, source URL format, with the review date. |
| 14 | Unknowns | What is genuinely not known. Drawn from the gaps list in `SOURCE_PLAN.md`. This section is expected to be substantial and is never trimmed for appearance. |
| 15 | Questions for a qualified professional | Specific questions a member can take to a clinician, written so that the member asks and the professional answers. Never phrased so the Guide implies its own answer. |
| 16 | Related content | Links to related Guides, product records, goals, and Systems inside Xenios Research. A link is an editorial relationship, never a recommendation and never a claim. |
| 17 | References | Rendered from `SOURCE_REGISTRY.md`. Every entry carries its exact retrieved URL and its verification date. Nothing appears here that is not in the registry. |
| 18 | Correction history | Dated log of every substantive change since first publication: what changed, why, which claim ids and source ids moved, and who approved it. Corrections supersede earlier statements without erasing the record of them. |

### 4.1 Section rules that are easy to get wrong

- **Section 1 is the highest risk section in the packet.** Summaries compress, and compression is how
  a graded `D` preclinical finding turns into an implied human benefit. Every sentence in the summary
  carries the same grade discipline as the section it summarizes.
- **Sections 6 and 7 never merge.** A blended evidence section is a schema violation regardless of
  how carefully it is worded.
- **Section 11 describes categories, not management.** Naming a category is documentation. Saying
  what to do about it is advice.
- **Section 14 grows over time.** A shrinking unknowns section usually means claims were quietly
  upgraded, not that knowledge improved. That pattern is a review flag.

## 5. Editorial review checklist

Every item is marked by a human reviewer. A single fail blocks publication.

**Citation integrity**

- [ ] Every citation in the packet appears in `SOURCE_REGISTRY.md`.
- [ ] Every registry entry has an exact retrieved URL and a verification date.
- [ ] No PMID, NCT number, DOI, author, year, or journal was reconstructed from memory.
- [ ] Every background-knowledge line carries the exact `[UNVERIFIED - background knowledge, requires human source check]` label.
- [ ] Every claim that could not be sourced was dropped and logged in the gaps list.

**Dosing and directions**

- [ ] No amount, unit, concentration, frequency, timing, cycle, titration, reconstitution, technique, or route appears in any of the nine files.
- [ ] Every point where a dose would be expected carries the exact excluded-dosing line.
- [ ] Nothing in the packet can be followed as instructions.

**Evidence discipline**

- [ ] Every claim in `GUIDE_DRAFT.md` has a claim id in `CLAIM_TABLE.md`.
- [ ] Every claim is graded individually. No grade is attached to the product or topic as a whole.
- [ ] Grades default to `G` or `D` unless a specific retrieved human study supports better.
- [ ] Human evidence and preclinical evidence are in separate sections.
- [ ] Every preclinical finding names its species or model in the same sentence.
- [ ] For a blend, the blend rule in `CLAIM_EVIDENCE_SCHEMA.md` has been applied and per-ingredient evidence is not presented as evidence for the combination.

**Language**

- [ ] No "will", "proven to", "restores", "cures", "eliminates", or "reverses" describing an effect.
- [ ] No general "safe", "well tolerated", or "no side effects".
- [ ] No "research use only" framing used to imply human benefit.
- [ ] No medical, legal, financial, or clinical advice, and no diagnosis.
- [ ] No competitor, retailer, or manufacturer marketing text copied or lightly paraphrased.
- [ ] Zero em dashes in every file.
- [ ] Calm, plain, direct English. No hype, no sales language, no flattery, no exclamation marks.
- [ ] "Xenios Research" used in member-facing copy, lowercase "xenios" in internal prose.

**Regulatory**

- [ ] Every regulatory statement carries a date, a jurisdiction, and a source URL.
- [ ] Each jurisdiction is handled separately, with no generalization across jurisdictions.
- [ ] A review date is set for each statement.

**Product facts**

- [ ] No composition, ratio, concentration, volume, shelf life, storage temperature, sterility, purity, certificate content, supplier identity, price, or inventory was invented.
- [ ] Every unknown uses the exact string `NOT CONFIRMED - see open supplier questions`.
- [ ] No statement that xenios is authorized to resell, distribute, or sell anything without a referenced written authorization document.

**Packet completeness**

- [ ] All nine files exist with valid frontmatter.
- [ ] `GUIDE_DRAFT.md` has all eighteen sections in order.
- [ ] `CONTRADICTIONS.md` presents disagreement without resolving it artificially.
- [ ] The gaps list and the unknowns section are consistent with each other.
- [ ] Correction history is current.

**Sign off**

- [ ] Reviewer name recorded.
- [ ] Review date recorded.
- [ ] Decision recorded: publish, revise, or hold.
- [ ] Samuel Boadu has approved publication. No AI draft published automatically.

## 6. Guide lifecycle and state mapping

Guide state on the linked product record moves as follows:

| Packet condition | Guide state |
|------------------|-------------|
| No work started, Guide intended | Guide Coming Soon |
| Packet started, one or more files incomplete | Guide In Development |
| All nine files complete, checklist not yet signed | Guide In Review |
| Checklist signed, published by Samuel Boadu | Guide Published |
| Published Guide revised, rechecked, and republished | Guide Updated |

A Guide is republished, never silently edited. Any substantive change to a published Guide requires a
new correction history entry and a re-signed checklist.

Guides are member-only. Guide state does not gate commerce, and commerce state does not gate a Guide.

## 7. Blends

A blend Guide lives under `content/research-guides/blends/` and follows the same nine-file packet and
the same eighteen sections, with three additions:

1. Section 6 (human evidence) covers evidence for the **combination**. Evidence for an individual
   ingredient does not belong here. It belongs in the individual ingredient's own Guide and is linked
   from section 16.
2. `CLAIM_TABLE.md` states, for every claim, whether it is a combination claim or an ingredient
   claim. An ingredient claim may not be written so that it reads as a combination claim.
3. Section 14 (unknowns) explicitly states what is not known about the combination, including
   whether the ingredients have been studied together in humans at all.

The blend rule in `CLAIM_EVIDENCE_SCHEMA.md` is binding: evidence for individual ingredients does not
automatically establish evidence for a combined formulation.

## 8. Sources and verification

No external sources were retrieved while writing this document, and therefore none are cited. This
schema is a xenios internal editorial contract, not a factual account of any external body of
evidence.

Statements here about source tiering and evidence practice are xenios editorial policy rather than
restatements of any specific external standards body.
[UNVERIFIED - background knowledge, requires human source check]

Any Guide written against this schema must retrieve its own sources and register each with an exact
URL and a verification date, per section 2.9.
