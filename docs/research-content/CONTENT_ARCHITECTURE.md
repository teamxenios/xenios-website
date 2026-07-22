---
title: Xenios Research Content Architecture
type: canonical-specification
status: approved-for-internal-use
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# Xenios Research Content Architecture

This document is the contract every content file in this repository conforms to. If another
document, brief, ticket, or model output conflicts with this file, this file wins until Samuel
Boadu approves a revision.

Xenios Research is a private, approved-member health, performance, and research membership
founded by Samuel Boadu. Nothing in this repository is public marketing. Nothing in this
repository authorizes commerce.

House form of the name: "xenios" is lowercase in internal prose. "Xenios Research" is the
member-facing brand form.

---

## 1. What this document governs

It governs:

- the four content trees and what belongs in each
- naming, identifier, and slug conventions
- how a product record links to Guides, goals, and Systems
- the member-facing navigation terminology rule
- the separation of catalog state from commerce state
- the access model (shared Research password versus active membership)
- the full content inventory and its identifier register
- the claim evidence grading scale applied to individual claims
- the content safety rules that bind every authored file

It does not govern:

- runtime code, schema, routing, or deployment (owned by the engineering surface, not here)
- pricing, margin, inventory, or supplier commercial terms
- legal or regulatory position statements (those require counsel and dated sources)

### 1.1 File writing boundary

Content authors and agents write only inside these four trees:

```text
content/research-products/**
content/research-guides/**
content/research-goals/**
docs/research-content/**
```

No content work touches `client/`, `server/`, `shared/`, `supabase/`, `package.json`, any
`.env*` file, or any other runtime file. Content is data. Content is never a code change.

---

## 2. The four content trees

The architecture has exactly four trees. A file that does not clearly belong to one of them
does not get written, it gets raised as an open question.

### 2.1 `content/research-products/` (the catalog record tree)

**What it is.** One file per catalogued item. The product record is a factual register, not a
piece of persuasion. It holds identity, classification, state, evidence pointers, links, and
the honest record of what is not yet confirmed.

**What belongs here.**

- the product identifier, canonical name, and slug
- the category lane (peptides, supplements, quantum)
- catalog state (see section 7)
- commerce approval state (see section 7)
- fulfillment owner
- links to the individual Guide, blend Guides, goal pages, and Systems
- claim rows, each graded individually (see section 9)
- an explicit list of open supplier questions

**What must never appear here.**

- dosing of any kind (see section 10)
- composition, ingredient ratios, concentration, fill volume, vial size, shelf life, storage
  temperature, sterility, purity, COA content, supplier identity, price, margin, or inventory,
  unless written evidence exists and is cited in the record
- any statement that Xenios is authorized to resell, distribute, or sell anything, unless
  written evidence exists and is cited in the record
- outcome promises, safety assurances, or persuasion language of any kind

Where a fact is unknown, the record uses this exact string:

```text
NOT CONFIRMED - see open supplier questions
```

Nothing is guessed to fill a field. An empty field is a known state. A guessed field is a
defect, and it is treated as a defect in review.

### 2.2 `content/research-guides/` (the member education tree)

**What it is.** The member-only educational layer. A Guide explains what a compound or
category has been studied for, what the evidence quality actually is, what remains unknown,
and what a member should discuss with a qualified clinician.

Two subtypes live here, and they are structurally different:

- **Individual Guides** (`content/research-guides/individual/`). One subject, one Guide. The
  subject is a single compound or single item.
- **Blend Guides** (`content/research-guides/blend/`). A Guide covering a combination as a
  combination. A blend Guide is not a stack instruction and must never read as one. It
  explains what has been studied about the components and states plainly where combination
  evidence does not exist.

**What belongs here.** Mechanism as studied, research history, evidence grading per claim,
population and model context (human, animal, in vitro, always named in the same sentence as
the finding), limitations, unknowns, questions a member could raise with a clinician, and
citations to sources actually retrieved and verified.

**What must never appear here.** Dosing. Protocols. Regimens. Cycles. Timing. Titration.
Loading. Stacking. Reconstitution. Injection technique. Route of administration. Anything a
reader could follow as instructions. Any of those turns a Guide into a treatment direction,
which is prohibited without exception, including when the source states it.

Every Guide carries this line, verbatim, in its safety block:

```text
Dosing information is intentionally excluded.
```

**Guide completion is not a commerce prerequisite.** A Guide is education. It is never a step
in a purchase funnel, never a gate a member must clear to buy, and never framed as one.

### 2.3 `content/research-goals/` (the member-facing navigation tree)

**What it is.** The plain-language entry points a member uses to find their way into the
material. A goal page is a directory of relevant Guides and catalogued records, written in the
member's own words rather than in clinical or physiological vocabulary.

**What belongs here.** The goal's plain-language framing, what the area covers, which Guides
are relevant, which catalogued records touch it, and honest boundaries about what the material
does and does not address.

**What must never appear here.** A goal page never becomes an implied recommendation, never
implies that an outcome follows from a purchase, and never carries dosing or protocol content.
A goal page organizes reading. It does not prescribe a path.

### 2.4 `docs/research-content/` (the governance tree)

**What it is.** The rules that bind the other three trees. This document and
`EDITORIAL_WORKFLOW.md` live here, along with any future content policy, template, or register
that Samuel Boadu approves.

**What belongs here.** Architecture, workflow, templates, terminology registers, evidence
grade definitions, and the record of open questions. Nothing member-facing is published from
this tree. It is internal.

---

## 3. Naming, identifier, and slug conventions

### 3.1 Slugs

Every slug is lowercase, hyphen separated, ASCII only, and stable for the life of the record.

```text
allowed:      a-z 0-9 -
not allowed:  uppercase, underscores, spaces, punctuation, accents, trailing hyphens
```

A slug is an identity, not a label. Once a slug is published it does not change. If the
member-facing name changes, the title changes and the slug stays. If a slug genuinely must be
retired, it is retired through the `withdrawn` state in `EDITORIAL_WORKFLOW.md` with a
redirect note, never by silent edit.

### 3.2 File paths

```text
content/research-products/<product-slug>.md
content/research-guides/individual/<subject-slug>.md
content/research-guides/blend/<blend-slug>.md
content/research-goals/<goal-slug>.md
docs/research-content/<DOCUMENT_NAME>.md
```

Content filenames match the slug exactly. Governance filenames in `docs/research-content/` use
uppercase snake case, matching this file and `EDITORIAL_WORKFLOW.md`.

### 3.3 Stable identifiers

Every record carries an identifier that never changes, even if the slug is retired. The
identifier is what cross-references resolve against, so a rename never breaks a link.

| Tree | Prefix | Format | Range in this inventory |
| --- | --- | --- | --- |
| Products | `PRD` | `PRD-NN` | `PRD-01` to `PRD-15` |
| Individual Guides | `GDI` | `GDI-NN` | `GDI-01` to `GDI-20` |
| Blend Guides | `GDB` | `GDB-NN` | `GDB-01` to `GDB-06` |
| Goal pages | `GOA` | `GOA-NN` | `GOA-01` to `GOA-11` |
| Systems | `SYS` | `SYS-NN` | assigned when Systems records are authored |
| Claims | `CLM` | `<parent-id>-CLM-NN` | scoped to the parent record |

### 3.4 Frontmatter contract

Every file in every tree begins with YAML frontmatter. These five keys are required
everywhere, with no exceptions:

```yaml
---
title: <human readable title>
type: <record type>
status: <lifecycle state>
owner: <accountable named human>
last_reviewed: <YYYY-MM-DD>
---
```

`owner` is always a named human. It is never "the team", never "content", and never "AI".
Named human accountability is a requirement at every point of real stakes.

Product records add:

```yaml
id: PRD-NN
slug: <product-slug>
category_lane: peptides | supplements | quantum
catalog_state: <see section 7>
commerce_approval_state: <see section 7>
fulfillment_owner: <named party>
linked_guides: [GDI-NN, GDB-NN]
linked_goals: [GOA-NN]
linked_systems: [SYS-NN]
```

Guide records add:

```yaml
id: GDI-NN | GDB-NN
slug: <subject-slug>
guide_subtype: individual | blend
access: member-only
linked_products: [PRD-NN]
linked_goals: [GOA-NN]
evidence_last_searched: <YYYY-MM-DD>
```

Goal records add:

```yaml
id: GOA-NN
slug: <goal-slug>
member_facing_label: <approved label from section 6>
linked_guides: [GDI-NN, GDB-NN]
linked_products: [PRD-NN]
```

---

## 4. How a product record links to Guides, goals, and Systems

Links are declared in frontmatter as arrays of stable identifiers, never as prose references
and never as raw file paths. Prose can rot silently. Identifier arrays can be validated.

### 4.1 The link shape

```text
Product (PRD-NN)
  ├── linked_guides   → the individual Guide for its subject, plus any blend Guide that covers it
  ├── linked_goals    → every goal page whose subject area the record touches
  └── linked_systems  → every System that references the record
```

### 4.2 Link rules

1. **Links are bidirectional and must agree.** If `PRD-04` lists `GDI-07`, then `GDI-07` lists
   `PRD-04`. A one-way link is a defect caught in quality review.
2. **A link is a relationship, not a recommendation.** Linking a product to a goal states that
   the material is relevant to that area. It never states that the product produces the
   outcome the goal names.
3. **A product may have exactly one individual Guide.** One subject, one canonical explanation.
   If two products share a subject, they link to the same individual Guide.
4. **A product may appear in several blend Guides**, and a blend Guide references every
   component product it covers.
5. **A product may link to several goals.** Multi-area relevance is normal and is not a claim
   of multi-area efficacy.
6. **Systems reference products, not the reverse in authoring order.** A System is a composed
   arrangement authored after its component records exist. A product record's `linked_systems`
   is maintained as Systems are authored.
7. **A link never crosses the access boundary in a way that leaks gated content.** A goal page
   sitting in the entrance layer may name that a Guide exists. It never reproduces the Guide's
   member-only body. See section 8.
8. **Broken identifiers block publication.** Any link pointing at an identifier that does not
   resolve fails quality review, and the record does not leave that gate.

---

## 5. Member-facing navigation terminology rule

Member-facing navigation uses plain human language, not clinical or physiological vocabulary.
A member arrives with a plain-language concern. The navigation meets them in that language.

This rule is absolute in every member-facing surface: navigation, goal page titles, link text,
section headers, and any label a member reads.

| Use this (member-facing) | Never use this (member-facing) |
| --- | --- |
| Think Sharper | Cognitive Function |
| Everyday Health | Foundational Health |
| Intimacy and Vitality | Hormone Support |

Notes on application:

- The prohibited forms may appear in internal documents and in the body of a Guide where a
  study is being described accurately in its own scientific terms. The prohibition governs
  member-facing navigation and labels, not the accurate description of a cited study.
- The approved label goes in `member_facing_label` in goal frontmatter, and that field is the
  single source for navigation rendering.
- Any new member-facing label follows the same principle (plain, calm, human, not clinical) and
  is added to this table only with Samuel Boadu's approval.

---

## 6. Content inventory

The counts below are fixed. The identifier slots are fixed. The names are recorded only where
confirmed, because a product or Guide name is a product fact, and product facts are never
invented to fill a table.

### 6.1 Products (15)

| ID | Name | Category lane | Catalog state | Commerce approval state | Fulfillment owner (first ~60 days) |
| --- | --- | --- | --- | --- | --- |
| PRD-01 | NOT CONFIRMED - see open supplier questions | NOT CONFIRMED - see open supplier questions | draft | blocked | see 6.5 |
| PRD-02 | NOT CONFIRMED - see open supplier questions | NOT CONFIRMED - see open supplier questions | draft | blocked | see 6.5 |
| PRD-03 | NOT CONFIRMED - see open supplier questions | NOT CONFIRMED - see open supplier questions | draft | blocked | see 6.5 |
| PRD-04 | NOT CONFIRMED - see open supplier questions | NOT CONFIRMED - see open supplier questions | draft | blocked | see 6.5 |
| PRD-05 | NOT CONFIRMED - see open supplier questions | NOT CONFIRMED - see open supplier questions | draft | blocked | see 6.5 |
| PRD-06 | NOT CONFIRMED - see open supplier questions | NOT CONFIRMED - see open supplier questions | draft | blocked | see 6.5 |
| PRD-07 | NOT CONFIRMED - see open supplier questions | NOT CONFIRMED - see open supplier questions | draft | blocked | see 6.5 |
| PRD-08 | NOT CONFIRMED - see open supplier questions | NOT CONFIRMED - see open supplier questions | draft | blocked | see 6.5 |
| PRD-09 | NOT CONFIRMED - see open supplier questions | NOT CONFIRMED - see open supplier questions | draft | blocked | see 6.5 |
| PRD-10 | NOT CONFIRMED - see open supplier questions | NOT CONFIRMED - see open supplier questions | draft | blocked | see 6.5 |
| PRD-11 | NOT CONFIRMED - see open supplier questions | NOT CONFIRMED - see open supplier questions | draft | blocked | see 6.5 |
| PRD-12 | NOT CONFIRMED - see open supplier questions | NOT CONFIRMED - see open supplier questions | draft | blocked | see 6.5 |
| PRD-13 | NOT CONFIRMED - see open supplier questions | NOT CONFIRMED - see open supplier questions | draft | blocked | see 6.5 |
| PRD-14 | NOT CONFIRMED - see open supplier questions | NOT CONFIRMED - see open supplier questions | draft | blocked | see 6.5 |
| PRD-15 | NOT CONFIRMED - see open supplier questions | NOT CONFIRMED - see open supplier questions | draft | blocked | see 6.5 |

Why the name column reads as it does: this document fixes the shape and the count of the
catalog. Assigning a compound name, a category lane, or a supplier to a slot is a product fact.
Those are filled in from written source material, one record at a time, under the workflow in
`EDITORIAL_WORKFLOW.md`. A plausible-looking guess here would propagate into fifteen records,
their Guides, and their goal pages, so the slots stay honest until the source exists.

### 6.2 Individual Guides (20)

Slots `GDI-01` through `GDI-20`. One subject each. Each Guide's subject is
`NOT CONFIRMED - see open supplier questions` until the corresponding source material is
confirmed and the Guide enters `researching` under the editorial workflow.

Every individual Guide, once authored, must contain:

- the subject's plain-language description
- what it has been studied for, with species and model named in the same sentence as any
  preclinical finding
- per-claim evidence grades (section 9)
- an explicit unknowns section
- the verbatim line `Dosing information is intentionally excluded.`
- citations to sources actually retrieved and verified, with retrieval dates

### 6.3 Blend Guides (6)

Slots `GDB-01` through `GDB-06`. Subjects `NOT CONFIRMED - see open supplier questions`.

Additional requirement specific to blend Guides: a blend Guide must state plainly whether
combination evidence exists for the combination as a combination. Where it does not, the Guide
says so directly. Component evidence is never presented as combination evidence, and a blend
Guide never reads as a stacking instruction.

### 6.4 Goal pages (11)

| ID | Member-facing label | Slug | Status |
| --- | --- | --- | --- |
| GOA-01 | Think Sharper | `think-sharper` | label confirmed (section 5) |
| GOA-02 | Everyday Health | `everyday-health` | label confirmed (section 5) |
| GOA-03 | Intimacy and Vitality | `intimacy-and-vitality` | label confirmed (section 5) |
| GOA-04 | NOT CONFIRMED - awaiting approved member-facing label | NOT CONFIRMED | slot reserved |
| GOA-05 | NOT CONFIRMED - awaiting approved member-facing label | NOT CONFIRMED | slot reserved |
| GOA-06 | NOT CONFIRMED - awaiting approved member-facing label | NOT CONFIRMED | slot reserved |
| GOA-07 | NOT CONFIRMED - awaiting approved member-facing label | NOT CONFIRMED | slot reserved |
| GOA-08 | NOT CONFIRMED - awaiting approved member-facing label | NOT CONFIRMED | slot reserved |
| GOA-09 | NOT CONFIRMED - awaiting approved member-facing label | NOT CONFIRMED | slot reserved |
| GOA-10 | NOT CONFIRMED - awaiting approved member-facing label | NOT CONFIRMED | slot reserved |
| GOA-11 | NOT CONFIRMED - awaiting approved member-facing label | NOT CONFIRMED | slot reserved |

The three confirmed labels are the ones fixed by the terminology rule in section 5. The
remaining eight are reserved slots. A member-facing label is a naming decision Samuel Boadu
approves, so the slots stay reserved rather than being filled with invented labels.

### 6.5 Inventory totals

| Tree | Count |
| --- | --- |
| Product records | 15 |
| Individual Guides | 20 |
| Blend Guides | 6 |
| Guides total | 26 |
| Goal pages | 11 |
| Content records total | 52 |

---

## 7. Catalog state is separate from commerce state

This separation is structural, not a convention. Two independent fields, changed by different
people, for different reasons.

**Catalog state** answers: does a record exist, and how complete is it?

```text
draft → in_review → catalogued → archived
```

**Commerce approval state** answers: is Xenios authorized to transact this?

```text
blocked → pending_written_approval → approved
```

### 7.1 The rule

A record can be fully catalogued, fully written, fully reviewed, and fully published to
members while commerce stays disabled. Catalog completeness never implies, unlocks, or
argues for commerce authorization. Moving a record to `catalogued` changes nothing about
whether anything can be sold.

Commerce approval moves off `blocked` only on written approval, recorded in the record with
the date, the approving party, and a pointer to the written evidence. Model output does not
authorize it. A verbal statement does not authorize it. A brief does not authorize it.

### 7.2 Current commerce reality (founder canon)

As of `last_reviewed` on this document:

| Lane | Commerce approval state |
| --- | --- |
| Peptides | blocked, commerce is not authorized |
| Quantum | blocked, commerce is not authorized |
| Supplement reseller activity | blocked, commerce is not authorized |

Every commerce approval state in every record reads as `blocked` or
`pending_written_approval`. No record carries `approved` at this time.

### 7.3 Fulfillment ownership (first approximately 60 days)

| Lane | Fulfillment owner |
| --- | --- |
| Peptides | Mitch |
| Quantum | Mitch |
| Supplements | Xenios |

Fulfillment ownership is an operational fact about who handles an item. It is not a commerce
authorization, and recording it does not move any commerce approval state.

### 7.4 What may never be written

No content file states, implies, or is worded so that a reader could conclude, that Xenios is
authorized to resell, distribute, or sell anything, unless written evidence exists and is cited
in the record. Absent that evidence the record reads `NOT CONFIRMED - see open supplier
questions`.

---

## 8. Access model: the entrance layer versus member-only content

Two different mechanisms, doing two different jobs. Conflating them is the failure this
section exists to prevent.

### 8.1 The shared Research password

The shared Research password unlocks the **entrance layer only**. That is: the private
gateway, the ability to apply for membership, and the ability to sign in. It is a doorway
control, not membership authentication.

The shared password never unlocks:

- Guide bodies (individual or blend)
- the full catalog
- member pricing
- carts, orders, subscriptions, referrals, or credits
- any private member data

The shared password is known to more people than it should be assumed to protect against.
Content architecture treats it as a low-trust control and places nothing sensitive behind it
alone.

### 8.2 Active membership

Member-only Guide content is gated behind **active membership**. The gate condition is an
active membership, checked at the time of access, not a password, not a session cookie set at
the gateway, and not a one-time application step.

```text
Shared Research password  →  entrance layer only
Active membership         →  Guide bodies and member surfaces
```

### 8.3 The content author's obligation

Every Guide file is `access: member-only` in frontmatter. Every goal page and every catalog
record is authored on the assumption that its content may be reachable at the entrance layer,
so no goal page or product record reproduces a Guide's member-only body. A goal page may name
that a Guide exists and describe its subject area. It may not carry the Guide's substance.

If a piece of content would be harmful, misleading, or commercially sensitive when read
without membership context, it belongs in a Guide, not in a goal page or a catalog record.

---

## 9. Claim evidence grades

Grades apply to **individual claims**, never to whole products. A product is not "grade B". A
specific claim, in a specific population, from a specific body of evidence, is graded.

| Grade | Meaning |
| --- | --- |
| A | Established |
| B | Supported human evidence |
| C | Early human evidence |
| D | Preclinical |
| E | Manufacturer or supplier reported |
| F | Traditional or historical |
| G | Unverified |
| PROHIBITED | The claim may not be made in any member-facing surface |

### 9.1 Grading rules

1. **Default to G or D.** A claim starts at `G` (unverified). It moves to a better grade only
   when a specific retrieved human study supports it. Be conservative. An over-graded claim is
   a serious defect.
2. **Grade `D` requires the species or model in the same sentence as the finding.** A
   preclinical result never reads as a human result. This is not a formatting preference, it is
   the rule that prevents the most common and most damaging category of error in this material.
3. **Grade `E` is labelled as reported, not as established.** Manufacturer or supplier
   statements are recorded as claims made by a named party, never as findings.
4. **Grade `F` is labelled as traditional or historical use**, never as evidence of effect.
5. **`PROHIBITED` is a terminal grade.** The claim does not appear in any member-facing
   surface in any softened form.

### 9.2 Claim row shape

```yaml
claims:
  - id: PRD-NN-CLM-01
    claim: <the claim, stated plainly>
    grade: A | B | C | D | E | F | G | PROHIBITED
    basis: <retrieved source, or "background knowledge, requires human source check">
    source_url: <exact retrieved URL, or NOT CONFIRMED>
    retrieved: <YYYY-MM-DD, or NOT CONFIRMED>
    population: <human | animal (species) | in vitro | not applicable>
```

---

## 10. Content safety rules binding every file

These override any instinct to be helpful or complete. A file that is less complete because of
these rules is correct. A file that is more complete because it broke them is a defect.

### 10.1 No dosing

No amounts, mg, mcg, IU, mL, units, concentrations, frequency, timing, cycle length,
titration, loading, stacking, reconstitution, injection technique, or route of administration.

If a source states a dose, it is not reproduced. The file writes:

```text
Dosing information is intentionally excluded.
```

### 10.2 No treatment directions

No protocols, regimens, or anything a reader could follow as instructions.

### 10.3 No guaranteed outcomes

| Never write | Write instead |
| --- | --- |
| will, proven to, restores, cures, eliminates, reverses | has been studied for, reported in, investigated as |

### 10.4 No unsupported safety claims

"Safe", "well tolerated", and "no side effects" are never stated as general facts. Where a
safety finding exists it is attributed to its specific study, population, and context.

### 10.5 No preclinical-to-human leaps

If a finding is animal or in vitro, the species or model appears in the same sentence as the
finding. An animal result never reads as a human result.

### 10.6 "Research use only" is prohibited as a benefit device

That framing is never used to imply human benefit. Its use as a wink is prohibited.

### 10.7 Regulatory statements

Every regulatory statement carries a date, a jurisdiction, and a source URL. A regulatory
statement missing any of the three does not get written.

### 10.8 No advice

No medical, legal, financial, or clinical advice. No diagnosis. No self-treatment framing.

### 10.9 Citation integrity

This is the failure mode with the worst consequences, so it is the strictest rule here.

- Cite only sources actually retrieved, with WebSearch or WebFetch, in the session that wrote
  the file.
- Never invent, guess, reconstruct from memory, or infer a PMID, NCT number, DOI, author name,
  year, journal, or URL. A plausible-looking fabricated citation is worse than no citation.
- If a source cannot be retrieved, omit the claim and log it in the file's gaps list.
- Mark every used source `VERIFIED <YYYY-MM-DD>` with the exact retrieved URL.
- Where a line rests on general background knowledge rather than a retrieved source, label it
  exactly:

```text
[UNVERIFIED - background knowledge, requires human source check]
```

### 10.10 Original wording only

Never copy or lightly paraphrase competitor, retailer, or manufacturer marketing text. Every
sentence is written for xenios.

### 10.11 House style

Plain, direct English. Zero em dashes anywhere in any file, use commas, periods, or
parentheses. Calm and premium. No hype, no sales language, no flattery, no exclamation marks.

---

## 11. Cross-reference integrity

Checked before any record leaves quality review in `EDITORIAL_WORKFLOW.md`:

1. Every identifier in every `linked_*` array resolves to an existing record.
2. Every link is reciprocated by the target record.
3. Every product has at most one individual Guide.
4. Every blend Guide lists every component product it covers.
5. Every goal page uses its approved `member_facing_label` from section 5, and no member-facing
   surface uses a prohibited label form.
6. No goal page or product record reproduces a member-only Guide body.
7. Every claim row carries a grade, and every grade above `G` names a retrieved source with a
   retrieval date.
8. Every unknown field reads exactly `NOT CONFIRMED - see open supplier questions`.
9. No commerce approval state reads `approved` without cited written evidence.
10. No file contains an em dash.

---

## 12. Open questions

These are recorded rather than resolved by assumption. Each one blocks specific content until
answered with written source material.

1. Product names, category lane assignment, and supplier identity for `PRD-01` through
   `PRD-15`. Blocks: all 15 product records.
2. Subjects for individual Guides `GDI-01` through `GDI-20`. Blocks: all 20 individual Guides.
3. Subjects and component composition for blend Guides `GDB-01` through `GDB-06`. Blocks: all 6
   blend Guides.
4. Approved member-facing labels for goal pages `GOA-04` through `GOA-11`. Blocks: 8 goal pages.
5. Written evidence of authorization to resell or distribute, per lane. Blocks: any movement of
   commerce approval state off `blocked`.
6. The Systems register and its `SYS-NN` assignments. Blocks: population of `linked_systems`.
7. Whether the qualitative goal areas require a distinct page template from the rest.

---

## 13. Change control

This document changes only with Samuel Boadu's approval, recorded by updating `last_reviewed`
and noting the change below. Content files conform to this document as it stands on the day
they enter `founder_review`.

| Date | Change | Approved by |
| --- | --- | --- |
| 2026-07-19 | Initial canonical version. | Samuel Boadu (pending founder review) |
