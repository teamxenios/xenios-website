---
title: Claim Evidence Schema
type: content-schema
status: canonical
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# Claim Evidence Schema

This document defines how Xenios Research grades evidence.

The unit of grading is a single claim. Not a product. Not an ingredient. Not a category. Not a Guide.
One sentence that asserts one thing, graded on the evidence that actually supports that exact
sentence.

Every assertion that reaches a member-facing surface has a claim id, a grade, an evidence pointer, a
population, a reviewer, and a date. An assertion without those is not published.

## 1. The hard rule: grades attach to claims, never to products

A grade is a property of a claim. It is never a property of a product, an ingredient, a blend, a
category, a supplier, or a Guide.

This is prohibited in every form:

- "This product is grade B."
- "Grade A supplement."
- "Evidence grade: B" printed on a product record or a product card.
- "A-rated ingredient."
- A star rating, an evidence score, a confidence percentage, or any composite number derived from
  claim grades.

The reason is not stylistic. A product supports many claims at once, and they almost never share a
grade. The same item can carry a `B` claim about one measured outcome, a `D` claim about a mechanism
observed only in a mouse model, an `E` claim about supplier purity, and a `PROHIBITED` claim about a
disease. Collapsing those into one product-level grade takes the strongest claim and lets it speak
for the weakest. That is exactly the failure this schema exists to prevent.

There is deliberately no composite scoring method in this schema, and none may be added. A product
record that displays an aggregate evidence grade is a schema violation regardless of how the
aggregate was computed.

## 2. The grade set

Exactly eight values. No sub-grades, no plus or minus modifiers, no intermediate values.

| Grade | Name | Meaning | What is required to assign it |
|-------|------|---------|-------------------------------|
| A | Established | The claim is supported by a consistent body of human evidence, and a reader can reasonably treat it as settled. | Multiple retrieved human studies pointing the same way, ideally including a systematic review or meta-analysis, with no substantial retrieved contradiction. Rare in this catalog. |
| B | Supported human evidence | The claim is supported by human evidence of reasonable quality, though the body of work is not settled. | At least one retrieved randomized controlled human trial, or several consistent retrieved human studies, in a population relevant to the claim. |
| C | Early human evidence | Some human evidence exists and it is preliminary. | Retrieved human studies that are small, short, uncontrolled, single-site, pilot, or observational, or a body of work with meaningful retrieved contradiction. |
| D | Preclinical | The finding comes from animal or in vitro work. It does not establish a human effect. | Retrieved preclinical primary literature. The species or model must be named in the claim text itself. |
| E | Manufacturer or supplier reported | The claim comes from a supplier, manufacturer, or vendor document and has not been independently verified. | A supplier document that xenios actually holds. The claim text says it is supplier reported. |
| F | Traditional or historical | The claim reflects traditional, historical, or cultural use. It is a statement about use, not about effect. | A retrieved source documenting the tradition or history. The claim describes use, never outcome. |
| G | Unverified | No adequate retrieved source supports the claim at any level. | This is the default. No evidence is required to assign it, because it is the absence of evidence. |
| PROHIBITED | Claim may not be made | The claim may not appear on any member-facing surface, at any grade, regardless of the evidence behind it. | See section 6. |

### 2.1 The conservative default

**Default to `G`. Where the only support is preclinical, default to `D`. Move above that only when a
specific retrieved human study supports the exact claim as written.**

"Specific" and "as written" both matter. A retrieved human trial supports the claim it actually
tested, in the population it actually enrolled, on the endpoint it actually measured. It does not
support a broader restatement, a different population, a different endpoint, or a mechanism inferred
from the result.

When a grader is uncertain between two grades, the lower grade is assigned. Uncertainty is itself
evidence that the higher grade is not supported.

### 2.2 What each grade does not mean

- `A` does not mean "true for you". It means the human evidence base is consistent.
- `B` does not mean recommended, effective for a member, or worth purchasing.
- `D` never implies a human effect. A `D` claim that has been reworded to read as a human claim is a
  `PROHIBITED` claim, not a `D` claim.
- `E` is a statement about what a supplier said. It is never upgraded by repetition, by the
  supplier's reputation, or by the document looking official. Independent verification is the only
  route out of `E`.
- `F` is a statement about historical use. It is never evidence of effect. "Used traditionally for X"
  is `F`. "Helps with X, as used traditionally" is not `F`, it is a `G` effect claim wearing an `F`
  costume.
- `G` does not mean false. It means unverified. Some `G` claims are almost certainly true and simply
  have no retrieved source on file. They still stay `G` until one exists.

## 3. The claim record shape

Every claim is a row in a Guide packet's `CLAIM_TABLE.md`. Nine fields, all required.

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| Claim id | string | Yes | `C-<topic-slug>-<NNN>`. Unique and stable. Once assigned, an id is never reused, even if the claim is retired. Retired claims stay in the table marked retired, with a correction history entry. |
| Claim text | string | Yes | The exact sentence as it appears, or would appear, in member-facing content. One assertion per claim. If a sentence asserts two things, it is two claims. Preclinical claims name the species or model inside this text. Supplier claims say they are supplier reported inside this text. No dosing appears in this text, ever. |
| Grade | enum | Yes | One of `A`, `B`, `C`, `D`, `E`, `F`, `G`, `PROHIBITED`. Default `G`, or `D` where support is preclinical only. |
| Evidence pointers | list | Yes | Source ids from the packet's `SOURCE_REGISTRY.md`, for example `S-004, S-011`. Each pointed source has an exact retrieved URL and a verification date. A pointer to a source not in the registry invalidates the claim. Grade `G` carries `none` and that is why it is `G`. |
| Population | string | Yes | Who or what the evidence was drawn from. For human evidence: the described population, including relevant characteristics such as age range, sex, and health status where the source states them. For preclinical: the species, strain, or in vitro model. For `E`: `supplier document, no study population`. For `F`: `historical use, no study population`. For `G`: `none`. This field may never be blank and may never say "general population" unless the source itself does. |
| Jurisdictional note | string | Yes | Whether the claim is permissible to make, and where. Format: `As of <YYYY-MM-DD>, in <jurisdiction>, <note>. Source: <exact retrieved URL>`. If no dated, jurisdiction specific, sourced determination exists, this field reads `Not established. Logged as an open regulatory item.` and the claim is not member-facing allowed. |
| Reviewer | string | Yes | The named human who assigned or confirmed the grade. Never "the system", never an AI agent name, never a team name. An AI agent may propose a grade. A named human assigns it. |
| Date | date | Yes | `YYYY-MM-DD`. When the named reviewer assigned or last confirmed the grade. A claim whose date is older than its review interval is treated as stale and is not member-facing allowed until reconfirmed. |
| Member-facing allowed | boolean | Yes | `yes` or `no`. Governed by section 5. Defaults to `no`. |

### 3.1 Row format

`CLAIM_TABLE.md` uses this column order:

```
| Claim id | Claim text | Grade | Evidence pointers | Population | Jurisdictional note | Reviewer | Date | Member-facing allowed |
```

Long jurisdictional notes may be footnoted below the table by claim id to keep the table readable.
The content is not abbreviated, only relocated.

## 4. Worked claim records

The examples below show the shape, the discipline, and the common failure modes. They are structural
illustrations. The evidence pointers, populations, and sources shown as `S-0xx` are placeholders for
entries that a real packet would carry with exact retrieved URLs, and the grades shown are examples
of grading logic rather than findings about any real substance.

### 4.1 A correctly graded preclinical claim

| Field | Value |
|-------|-------|
| Claim id | `C-example-014` |
| Claim text | In a mouse model, the compound was reported to alter marker X in liver tissue. |
| Grade | D |
| Evidence pointers | `S-022` |
| Population | Male C57BL/6 mice, as described in the source |
| Jurisdictional note | Not established. Logged as an open regulatory item. |
| Reviewer | Samuel Boadu |
| Date | 2026-07-19 |
| Member-facing allowed | yes, in the preclinical evidence section only |

The species is inside the claim text, not in a footnote and not in a nearby sentence. The claim
describes what was reported, not what the compound does. It is allowed in section 7 of the Guide and
nowhere else.

### 4.2 The same finding, graded wrong

| Field | Value |
|-------|-------|
| Claim text | The compound improves liver marker X. |
| Correct grade | PROHIBITED |

This is the single most common failure in this catalog. The species has been dropped, "was reported
to alter" has become "improves", and a mouse result now reads as a human benefit. This is not a
weaker version of the `D` claim. It is a different claim, and it is prohibited. The fix is to restore
the original wording, not to lower the grade.

### 4.3 A supplier reported claim

| Field | Value |
|-------|-------|
| Claim id | `C-example-031` |
| Claim text | The supplier's specification document states an identity test was performed. Supplier reported, not independently verified by Xenios Research. |
| Grade | E |
| Evidence pointers | `S-040` (supplier document held by xenios) |
| Population | supplier document, no study population |
| Jurisdictional note | Not applicable. This is a statement about a document, not about an effect. |
| Reviewer | Samuel Boadu |
| Date | 2026-07-19 |
| Member-facing allowed | yes, in the quality and identity section only |

Note what is absent. No numeric result. No purity figure. No assertion that the item is pure or
identified. The claim is about the existence of a document and says so.

### 4.4 A traditional use claim

| Field | Value |
|-------|-------|
| Claim id | `C-example-007` |
| Claim text | The plant has a documented history of traditional use in the region described by the source. This is a statement about historical use and not about effect. |
| Grade | F |
| Evidence pointers | `S-009` |
| Population | historical use, no study population |
| Jurisdictional note | Not established. Logged as an open regulatory item. |
| Reviewer | Samuel Boadu |
| Date | 2026-07-19 |
| Member-facing allowed | yes, in the why interest exists section only |

The disclaimer sits inside the claim text so it travels with the sentence if the sentence is moved.

### 4.5 A default unverified claim

| Field | Value |
|-------|-------|
| Claim id | `C-example-052` |
| Claim text | The compound has been discussed in connection with recovery outcomes. |
| Grade | G |
| Evidence pointers | none |
| Population | none |
| Jurisdictional note | Not established. Logged as an open regulatory item. |
| Reviewer | Samuel Boadu |
| Date | 2026-07-19 |
| Member-facing allowed | no |

No retrieved source was found. The claim stays in the table as a record of what was considered and
rejected, and the underlying question goes into the gaps list in `SOURCE_PLAN.md`. It does not
appear in the Guide.

### 4.6 A prohibited claim

| Field | Value |
|-------|-------|
| Claim id | `C-example-063` |
| Claim text | Restores hormonal balance and reverses age related decline. |
| Grade | PROHIBITED |
| Evidence pointers | none |
| Population | none |
| Jurisdictional note | Prohibited regardless of jurisdiction. |
| Reviewer | Samuel Boadu |
| Date | 2026-07-19 |
| Member-facing allowed | no |

Prohibited claims are kept in the table, not deleted. Keeping them is what stops the same phrasing
from reappearing in the next draft, and the entry is mirrored into the linked product record's
`Prohibited claims` section.

## 5. Member-facing allowed

`Member-facing allowed` defaults to `no`. It becomes `yes` only when every condition below holds.

1. Grade is `A`, `B`, `C`, `D`, `E`, or `F`. Grade `G` is never member-facing. Grade `PROHIBITED` is
   never member-facing.
2. Every evidence pointer resolves to a `SOURCE_REGISTRY.md` entry with an exact retrieved URL and a
   verification date.
3. `Population` is filled and matches what the sources actually describe.
4. The claim text contains no dose, amount, unit, concentration, frequency, timing, cycle, titration,
   reconstitution, technique, or route.
5. The claim text contains no guaranteed outcome language: no "will", "proven to", "restores",
   "cures", "eliminates", "reverses" describing an effect.
6. The claim text contains no general safety assertion: no "safe", "well tolerated", "no side
   effects".
7. If the grade is `D`, the species or model is named inside the claim text, and the claim is placed
   only in the preclinical evidence section.
8. If the grade is `E`, the claim text says it is supplier reported and is placed only in the quality
   and identity section.
9. If the grade is `F`, the claim text describes use rather than effect and is placed only in the why
   interest exists or terminology sections.
10. `Jurisdictional note` carries a dated, jurisdiction specific, sourced determination, or the claim
    makes no regulatory assertion at all.
11. The claim carries no "research use only" framing used to imply human benefit.
12. The claim is not copied or lightly paraphrased from competitor, retailer, or manufacturer
    marketing text.
13. `Reviewer` names a human and `Date` is within the review interval in section 8.
14. Samuel Boadu has approved the containing content for publication.

A claim that fails any condition is `no`. There is no partial allowance and no "allowed with a
disclaimer" state. If a disclaimer is what makes a sentence acceptable, the disclaimer belongs inside
the claim text, and the claim is regraded with it included.

### 5.1 Placement is part of the grade

Grades `D`, `E`, and `F` carry placement restrictions, listed above. A `D` claim moved into the
one-minute summary or the human evidence section is a violation even though the sentence itself never
changed. Placement is checked at editorial review, not just wording.

## 6. PROHIBITED claims

`PROHIBITED` is assigned to the claim, not to the evidence. A claim can be prohibited even when a
retrieved study supports it, because the issue is what xenios may state to members rather than what
is true.

A claim is `PROHIBITED` when it does any of the following:

1. States or implies that the item treats, cures, prevents, diagnoses, mitigates, reverses, or
   eliminates a disease or condition.
2. Contains a dose, amount, unit, concentration, frequency, timing, cycle, titration, loading,
   stacking, reconstitution, injection technique, or route.
3. Constitutes a direction, protocol, regimen, or anything a reader could follow as instructions.
4. Guarantees an outcome, a timeline, or a magnitude of result.
5. States generally that the item is safe, well tolerated, or free of side effects.
6. Presents an animal or in vitro finding as a human finding, or drops the species or model.
7. Uses "research use only" framing to imply human benefit.
8. Positions the item as a substitute for, or as superior to, a prescribed therapy.
9. Makes a regulatory assertion without a date, a jurisdiction, and a source URL.
10. Asserts that xenios is authorized to resell, distribute, or sell an item where no written
    authorization document exists and is referenced.
11. Is copied or lightly paraphrased from competitor, retailer, or manufacturer marketing text.
12. Attaches a grade to a product, ingredient, blend, or supplier as a whole rather than to a claim.

Prohibited claims are retained in `CLAIM_TABLE.md` with grade `PROHIBITED` and mirrored into the
linked product record. They are never silently deleted.

## 7. The blend rule

**Evidence for individual ingredients does not automatically establish evidence for a combined
formulation.**

A combination is its own subject. Its evidence is the evidence for the combination as tested. Grades
earned by ingredients studied on their own do not transfer to the blend, and they do not average,
sum, or carry over in any form.

Applied to grading:

1. A claim about a blend requires evidence about that blend. Without retrieved human evidence on the
   combination, a blend effect claim is `G`, no matter how well studied the individual ingredients
   are.
2. Every blend claim is labeled in `CLAIM_TABLE.md` as a combination claim or an ingredient claim.
   The two are never presented so that one reads as the other.
3. An ingredient claim inside a blend Guide keeps the ingredient's own grade, its own evidence
   pointers, and its own population, and it is written so a member can see it is about the
   ingredient. It is placed with the ingredient discussion and linked to that ingredient's Guide, not
   folded into the blend's evidence section.
4. Composition proportions are not stated (they are dosing adjacent and are excluded), so a member
   cannot verify whether an ingredient's studied conditions are met in the blend at all. This is
   itself a reason the transfer is invalid, and blend Guides say so in the unknowns section.
5. Interaction between ingredients is a real unknown, not a neutral one. A blend Guide's unknowns
   section states plainly whether the ingredients have been studied together in humans, and where
   they have not, it says so.
6. The strongest ingredient claim never speaks for the blend. Selecting the best-supported ingredient
   and describing the blend in its terms is a prohibited construction under section 6 item 1 or item
   12, depending on how it is phrased.

The rule runs in the other direction too. A blend result does not establish anything about an
individual ingredient, because the observed result cannot be attributed to one component of an
untested-apart mixture.

## 8. Review intervals and staleness

Grades are dated because evidence and regulation both move.

| Grade | Review interval |
|-------|-----------------|
| A | 24 months |
| B | 18 months |
| C | 12 months |
| D | 24 months |
| E | 12 months, or immediately when the supplier or document changes |
| F | 36 months |
| G | Reviewed whenever the topic is next worked, since a `G` may become gradable |
| PROHIBITED | Reviewed only on a documented policy or regulatory change |

Any claim carrying a jurisdictional determination is reviewed at 12 months regardless of grade,
because regulatory status changes independently of evidence.

A claim past its interval is stale. Stale claims are not member-facing allowed until a named human
reconfirms them and updates the date.

## 9. Regrading and correction

Grades move in both directions.

- **Upgrade** requires a new retrieved source that supports the exact claim as written, added to
  `SOURCE_REGISTRY.md` with an exact URL and verification date, plus a named human reviewer and a new
  date. A claim is never upgraded because it "seems well established" or because a similar claim
  elsewhere is graded higher.
- **Downgrade** requires only a reviewer's judgment that the support is weaker than recorded. It
  needs no new evidence, because the conservative direction is always available.
- **Retirement** marks a claim retired rather than deleting it. The id is never reused.

Every regrade writes a correction history entry in the Guide: the claim id, the old grade, the new
grade, the reason, the sources involved, the reviewer, and the date. Corrections supersede earlier
statements without erasing the record that the earlier statement was made.

If a published claim is found to violate section 6, it is removed from member-facing surfaces first
and the correction record is written second. Removal does not wait on process.

## 10. Grading procedure

For each candidate sentence:

1. Split it until it asserts exactly one thing. Assign an id to each part.
2. Start at `G`.
3. Ask what was actually retrieved that supports this exact sentence, in this exact population, on
   this exact endpoint.
4. If the only support is preclinical, set `D` and rewrite the claim text to name the species or
   model inside the sentence.
5. If the only support is a supplier document, set `E` and rewrite the claim text to say it is
   supplier reported.
6. If the support is documentation of historical use, set `F` and rewrite the claim to describe use
   rather than effect.
7. If retrieved human evidence supports it, choose `C`, `B`, or `A` on the strength and consistency
   of the retrieved human body of work. When between two, take the lower.
8. Check the sentence against section 6. A single match makes it `PROHIBITED`, whatever step 7
   produced.
9. Fill population, jurisdictional note, reviewer, and date.
10. Evaluate `Member-facing allowed` against all fourteen conditions in section 5.
11. For a blend, apply section 7 before finalizing.

An AI agent may run steps 1 through 7 and propose the record. Steps 8 through 11, and the reviewer
field, require a named human. AI proposals never publish automatically. Samuel Boadu is the founder
reviewer and publisher.

## 11. Sources and verification

No external sources were retrieved while writing this document, and therefore none are cited. The
source ids and populations in the worked examples in section 4 are structural placeholders, clearly
labeled as such, and are not references to real studies. They must never be copied into a real claim
table.

The grade set, the default rule, the placement restrictions, the blend rule, and the review intervals
are xenios editorial policy set by the founder. They are not restatements of any external grading
framework or regulatory standard.
[UNVERIFIED - background knowledge, requires human source check]

Every real claim graded against this schema must point to sources retrieved during that drafting
session, each recorded with an exact retrieved URL and a verification date.
